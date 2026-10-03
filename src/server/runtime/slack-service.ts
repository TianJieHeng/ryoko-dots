import type { RuntimeChannelStatus } from '../../shared/runtime/channels.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  contractVersion,
  type RuntimeScope,
} from '../../shared/runtime/contracts.js';
import { SlackLedger } from './slack-ledger.js';
import {
  SlackFailure,
  assertReplyAuthority,
  configurationDigest,
  hash,
  identifier,
  object,
  qualified,
  timestamp,
  validateConfig,
  type SlackApi,
  type SlackBridge,
  type SlackConfig,
  type SlackEvent,
  type EventRecord,
  type ImmutableOutput,
  type SendPayload,
  type OutboxRecord,
} from './slack-types.js';

export function verifySlackSignature(
  raw: Uint8Array,
  headers: Headers,
  secret: string,
  now = Date.now(),
) {
  const time = headers.get('x-slack-request-timestamp');
  const signature = headers.get('x-slack-signature');
  if (
    !secret ||
    !time ||
    !/^\d{10,12}$/.test(time) ||
    !signature ||
    !/^v0=[a-f0-9]{64}$/.test(signature) ||
    Math.abs(now / 1000 - Number(time)) > 300
  )
    return false;
  const expected = createHmac('sha256', secret)
    .update(`v0:${time}:`)
    .update(raw)
    .digest('hex');
  return timingSafeEqual(Buffer.from(`v0=${expected}`), Buffer.from(signature));
}
/** Signed public endpoint + durable worker. Only the injected CommandService bridge owns inference. */
export class SelfHostedSlack {
  readonly ledger: SlackLedger;
  readonly config: SlackConfig;
  private connected = false;
  private permissionDenied = false;
  private working = false;
  private closed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private worker?: Promise<void>;
  private connecting?: Promise<void>;
  private starting?: Promise<void>;
  private stopping?: Promise<void>;
  private ledgerClosed = false;
  private inspections = new Set<Promise<OutboxRecord>>();
  constructor(
    config: SlackConfig,
    database: string,
    private signingSecret: () => string,
    private bridge: SlackBridge,
    private api: SlackApi,
    private now: () => number = Date.now,
    competingIngressEnabled = false,
  ) {
    validateConfig(config);
    if (competingIngressEnabled) throw new SlackFailure('conflict');
    this.config = structuredClone(config);
    this.ledger = new SlackLedger(database, this.config, now);
    try {
      this.ledger.acquire();
    } catch (error) {
      this.ledger.close();
      throw error;
    }
  }
  connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    const operation = async () => {
      if (
        this.closed ||
        !this.config.enabled ||
        !qualified(this.config) ||
        !this.bridge.ready()
      )
        throw new SlackFailure('unavailable');
      this.connected = false;
      this.ledger.fence();
      assertReplyAuthority(this.config, undefined, this.now());
      this.bridge.authorize();
      await this.api.verifyIdentity(this.config.teamId, this.config.botUserId);
      // Shutdown can begin while Slack identity verification is in flight.
      if (this.closed) throw new SlackFailure('unavailable');
      this.ledger.fence();
      assertReplyAuthority(this.config, undefined, this.now());
      this.bridge.authorize();
      this.connected = true;
      this.permissionDenied = false;
    };
    this.connecting = operation().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }
  /** Server lifecycle only; never start from a GET request or a browser session. */
  start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      if (this.worker || this.timer) return;
      await this.connect();
      if (this.closed) throw new SlackFailure('unavailable');
      const run = () => {
        if (this.closed) return;
        this.worker = this.tick()
          .catch(() => {
            /* Status stays inspectable; no unsafe retry. */
          })
          .finally(() => {
            this.worker = undefined;
            if (!this.closed) {
              this.timer = setTimeout(run, 2500);
              this.timer.unref();
            }
          });
      };
      run();
    })().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }
  stop(): Promise<void> {
    return (this.stopping ??= (async () => {
      this.closed = true;
      this.connected = false;
      clearTimeout(this.timer);
      await Promise.allSettled(
        [
          this.connecting,
          this.starting,
          this.worker,
          ...this.inspections,
        ].filter(
          (value): value is Promise<void> | Promise<OutboxRecord> => !!value,
        ),
      );
      if (!this.ledgerClosed) {
        this.ledger.close();
        this.ledgerClosed = true;
      }
    })());
  }
  /** Synchronous close is for an idle adapter; production shutdown awaits stop(). */
  close() {
    if (
      this.working ||
      this.connecting ||
      this.starting ||
      this.inspections.size
    )
      throw new SlackFailure('conflict');
    this.closed = true;
    this.connected = false;
    clearTimeout(this.timer);
    if (!this.ledgerClosed) {
      this.ledger.close();
      this.ledgerClosed = true;
    }
  }
  private active() {
    if (
      this.closed ||
      !this.connected ||
      !this.config.enabled ||
      !qualified(this.config) ||
      !this.bridge.ready()
    )
      throw new SlackFailure('unavailable');
    this.ledger.fence();
    assertReplyAuthority(this.config, undefined, this.now());
    this.bridge.authorize();
  }
  private authorize(event: SlackEvent & { conversationId?: string | null }) {
    this.active();
    assertReplyAuthority(this.config, event, this.now());
    if (
      event.teamId !== this.config.teamId ||
      !this.config.allowedChannelIds.includes(event.channelId) ||
      !this.config.allowedHumanUserIds.includes(event.actorId)
    )
      throw new SlackFailure('denied');
    this.bridge.authorize(event.conversationId ?? undefined);
  }
  status(scope: RuntimeScope): RuntimeChannelStatus {
    let allowed = true;
    try {
      assertReplyAuthority(this.config, undefined, this.now());
      this.bridge.authorize();
    } catch {
      allowed = false;
    }
    return {
      version: contractVersion,
      scope,
      provider: 'slack',
      transport: 'self_hosted',
      state:
        this.permissionDenied || (this.config.enabled && !allowed)
          ? 'permission_denied'
          : !this.config.enabled
            ? 'unconfigured'
            : !qualified(this.config)
              ? 'unsupported'
              : this.connected && this.bridge.ready()
                ? 'ready'
                : 'disconnected',
      qualified: qualified(this.config),
      teamId: this.config.teamId,
      allowedHumanUserIds: [...this.config.allowedHumanUserIds],
      allowedChannelIds: [...this.config.allowedChannelIds],
      createdMessagesOnly: true,
      ignoreBots: true,
      ingressDeduplicated: true,
    };
  }
  provenance(conversationId: string, scope: RuntimeScope) {
    this.bridge.authorize(conversationId);
    return {
      version: contractVersion,
      scope,
      conversationId,
      origins: this.ledger.origins(conversationId).map((row) => ({
        surface: 'slack',
        actorId: row.actorId,
        teamId: row.teamId,
        channelId: row.channelId,
        providerEventId: row.eventId,
        providerThreadId: row.threadTs,
        verified: true,
        permalink: null,
      })),
      reviewPath: null,
    };
  }
  deliveries(conversationId: string | undefined, scope: RuntimeScope) {
    this.bridge.authorize(conversationId);
    for (const row of this.ledger.deliveries(conversationId))
      this.bridge.authorize(row.conversationId);
    return {
      version: contractVersion,
      scope,
      deliveries: this.ledger.deliveries(conversationId).map((row) => ({
        id: row.id,
        revision: row.revision,
        conversationId: row.conversationId,
        // FE10 requires missionId but producer commands do not expose one here. Do not invent it.
        missionId: null,
        outputVersion: `${row.artifactId}:${row.outputVersion}`,
        destination: `${this.config.teamId}/${row.channelId}/${row.threadTs}`,
        state: row.state === 'sending' ? 'unknown' : row.state,
        providerReceipt: row.providerReceipt,
        reviewPath: row.reviewPath,
        allowedActions: ['inspect'],
      })),
    };
  }
  /** Call only on the exact /slack/events endpoint, outside owner-cookie auth. */
  async handle(request: Request): Promise<Response> {
    try {
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          request.headers.get('content-type') ?? '',
        ) ||
        (request.headers.get('content-encoding') &&
          request.headers.get('content-encoding') !== 'identity')
      )
        return new Response(null, { status: 415 });
      const reader = request.body?.getReader();
      if (!reader) return new Response(null, { status: 400 });
      const parts: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 65536) {
          await reader.cancel();
          return new Response(null, { status: 413 });
        }
        parts.push(part.value);
      }
      const raw = Buffer.concat(parts);
      if (
        !verifySlackSignature(
          raw,
          request.headers,
          this.signingSecret(),
          this.now(),
        )
      )
        return new Response(null, { status: 401 });
      const envelope = object(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)),
      );
      if (envelope.type === 'url_verification') {
        if (
          typeof envelope.challenge !== 'string' ||
          envelope.challenge.length > 256 ||
          !/^[A-Za-z0-9_-]+$/.test(envelope.challenge)
        )
          return new Response(null, { status: 400 });
        return Response.json({ challenge: envelope.challenge });
      }
      this.active();
      if (
        envelope.team_id !== this.config.teamId ||
        envelope.api_app_id !== this.config.appId ||
        (envelope.context_team_id !== undefined &&
          envelope.context_team_id !== this.config.teamId) ||
        envelope.is_ext_shared_channel === true
      )
        return new Response(null, { status: 403 });
      if (envelope.type !== 'event_callback')
        return Response.json({ ignored: true });
      const event = object(envelope.event);
      if (
        !['app_mention', 'message'].includes(String(event.type)) ||
        event.subtype !== undefined ||
        event.bot_id !== undefined ||
        event.bot_profile !== undefined ||
        event.hidden === true ||
        event.edited !== undefined ||
        event.deleted_ts !== undefined ||
        event.message !== undefined ||
        event.user === this.config.botUserId
      )
        return Response.json({ ignored: true });
      if (
        !identifier(envelope.event_id) ||
        !identifier(event.user) ||
        !identifier(event.channel) ||
        !timestamp(event.ts) ||
        (event.thread_ts !== undefined && !timestamp(event.thread_ts)) ||
        typeof event.text !== 'string' ||
        !event.text.trim() ||
        event.text.length > 16000
      )
        return new Response(null, { status: 400 });
      if (
        (event.team !== undefined && event.team !== this.config.teamId) ||
        (event.user_team !== undefined &&
          event.user_team !== this.config.teamId)
      )
        return new Response(null, { status: 403 });
      const message: SlackEvent = {
        eventId: envelope.event_id,
        teamId: this.config.teamId,
        actorId: event.user,
        channelId: event.channel,
        messageTs: event.ts,
        threadTs:
          typeof event.thread_ts === 'string' ? event.thread_ts : event.ts,
        text: event.text,
        kind: event.type as SlackEvent['kind'],
      };
      this.authorize(message);
      const key = hash(
        JSON.stringify([message.teamId, message.channelId, message.threadTs]),
      );
      // Mentions establish a thread. Plain messages only continue it (or an explicitly allowed DM).
      if (
        message.kind === 'message' &&
        !message.channelId.startsWith('D') &&
        !this.ledger.thread(key)
      )
        return Response.json({ ignored: true });
      const admitted = this.ledger.receive(message);
      // Receipt is durable before the 2xx; this route never waits for inference/network.
      return Response.json({ accepted: true, duplicate: admitted.duplicate });
    } catch (error) {
      const code = error instanceof SlackFailure ? error.code : 'invalid';
      return Response.json(
        { error: `Slack event ${code}.` },
        {
          status:
            code === 'denied'
              ? 403
              : code === 'conflict'
                ? 409
                : code === 'unavailable'
                  ? 503
                  : 400,
        },
      );
    }
  }
  private async process(event: EventRecord) {
    try {
      this.authorize(event);
      if (this.ledger.earlierPending(event)) return;
      this.ledger.settleEvent(event.operationId, 'preparing');
      const thread = this.ledger.thread(event.threadKey)!;
      const conversationId =
        thread.conversationId ?? (await this.bridge.ensureConversation(thread));
      if (!identifier(conversationId)) throw new SlackFailure('denied');
      this.authorize({ ...event, conversationId });
      this.ledger.map(event.threadKey, conversationId);
      const current = this.ledger.byOperation(event.operationId)!;
      this.ledger.settleEvent(event.operationId, 'dispatching');
      const result = await this.bridge.admit(current);
      this.authorize(current);
      this.ledger.settleEvent(event.operationId, result);
    } catch (error) {
      const state = this.ledger.byOperation(event.operationId)?.state;
      if (state === 'dispatching')
        this.ledger.settleEvent(event.operationId, 'unknown');
      else
        this.ledger.settleEvent(
          event.operationId,
          error instanceof SlackFailure && error.code === 'denied'
            ? 'rejected'
            : 'queued',
        );
    }
  }
  /** Durable queued receipt may be drained after HTTP acknowledgment, including after restart. */
  async tick() {
    if (this.working || this.closed) return;
    this.active();
    this.working = true;
    try {
      for (const event of this.ledger.events(['queued']))
        await this.process(event);
      for (const event of this.ledger.events(['unknown'])) {
        try {
          this.authorize(event);
          const result = await this.bridge.inspect(event);
          this.authorize(event);
          this.ledger.settleEvent(event.operationId, result);
        } catch {
          /* Inspection never admits missing input. */
        }
      }
      for (const event of this.ledger.events(['accepted'])) {
        try {
          this.authorize(event);
          await this.bridge.verifySource(event);
          this.authorize(event);
          const output = await this.bridge.output(event);
          this.authorize(event);
          if (output) {
            this.queueOutput(event.eventId, output);
            if (!output.reviewPath)
              this.ledger.settleEvent(event.operationId, 'complete');
          }
        } catch {
          /* Wait for committed immutable output, preserving accepted ingress. */
        }
      }
      for (const row of this.ledger.due()) {
        if (
          this.ledger.throttle('workspace') > this.now() ||
          this.ledger.throttle(row.channelId) > this.now()
        )
          continue;
        const event = this.ledger.byOperation(row.operationId)!;
        let attempted = false;
        try {
          this.authorize(event);
          await this.bridge.verifySource(event);
          this.authorize(event);
          if (hash(row.payload) !== row.digest)
            throw new SlackFailure('conflict');
          const payload = JSON.parse(row.payload) as SendPayload;
          if (
            row.conversationId !== event.conversationId ||
            row.channelId !== event.channelId ||
            row.threadTs !== event.threadTs ||
            payload.channel !== event.channelId ||
            payload.thread_ts !== event.threadTs
          )
            throw new SlackFailure('denied');
          const claim = this.ledger.claimSend(row.id);
          attempted = true;
          const receipt = await this.api.post(
            JSON.parse(claim.payload) as SendPayload,
          );
          // Preserve the actual provider receipt even if user/channel access changed during send.
          this.ledger.fence();
          if (receipt.channel !== row.channelId || !timestamp(receipt.ts))
            throw new SlackFailure('unknown');
          this.ledger.settleSend(
            row.id,
            'delivered',
            `${receipt.channel}:${receipt.ts}`,
          );
        } catch (error) {
          if (
            attempted &&
            error instanceof SlackFailure &&
            error.code === 'throttled'
          ) {
            const attempts = this.ledger.outbox(row.id)!.attempts;
            const next =
              this.now() +
              Math.max(
                error.retryAfterMs,
                Math.min(60000, 1000 * 2 ** attempts),
              );
            this.ledger.delay('workspace', next);
            this.ledger.settleSend(
              row.id,
              attempts < 5 ? 'queued' : 'failed',
              null,
              next,
            );
          } else {
            const denied =
              error instanceof SlackFailure && error.code === 'denied';
            if (denied) {
              this.permissionDenied = true;
              this.connected = false;
            }
            this.ledger.settleSend(
              row.id,
              attempted ? (denied ? 'failed' : 'unknown') : 'held',
            );
          }
        }
      }
    } finally {
      this.working = false;
    }
  }
  /** Server-only. Caller obtains bytes from the verified immutable producer result, never browser input. */
  queueOutput(eventId: string, output: ImmutableOutput) {
    const event = this.ledger.event(eventId);
    if (
      !event ||
      !['accepted', 'complete'].includes(event.state) ||
      !event.conversationId
    )
      throw new SlackFailure('denied');
    this.authorize(event);
    if (
      !identifier(output.artifactId) ||
      !Number.isSafeInteger(output.version) ||
      output.version < 1 ||
      !/^[a-f0-9]{64}$/.test(output.sha256) ||
      typeof output.text !== 'string' ||
      !output.text.trim() ||
      output.text.length > 8 * 1024 * 1024 ||
      (output.reviewPath !== undefined &&
        !/^\/#\/missions\/[A-Za-z0-9_-]+\/reviews\/[A-Za-z0-9_-]+$/.test(
          output.reviewPath,
        ))
    )
      throw new SlackFailure('invalid');
    const resultUrl = `${this.config.appOrigin}/api/runtime/conversations/${encodeURIComponent(event.conversationId)}/results/${encodeURIComponent(event.operationId)}`;
    let text = output.text;
    if (text.length > 3000)
      text = `${text.slice(0, 2800)}\n\nFull authenticated result: ${resultUrl}`;
    if (output.reviewPath)
      text += `\n\nReview the exact action in Dots: ${this.config.appOrigin}${output.reviewPath}`;
    if (text.length > 4000) throw new SlackFailure('invalid');
    return this.ledger.queue(event, output, (id) => ({
      channel: event.channelId,
      thread_ts: event.threadTs,
      text,
      mrkdwn: false,
      parse: 'none',
      link_names: false,
      unfurl_links: false,
      unfurl_media: false,
      reply_broadcast: false,
      blocks: Array.from(
        { length: Math.ceil(text.length / 2800) },
        (_, index) => ({
          type: 'section',
          block_id: `dots_${id}_${hash(text)}_${index}`,
          text: {
            type: 'plain_text',
            text: text.slice(index * 2800, (index + 1) * 2800),
            emoji: false,
          },
        }),
      ),
    }));
  }
  /** One bounded, read-only page per call, cursor persisted. Absence never makes unknown retryable. */
  inspectDelivery(id: string): Promise<OutboxRecord> {
    const pending = this.inspectDeliveryOnce(id).finally(() =>
      this.inspections.delete(pending),
    );
    this.inspections.add(pending);
    return pending;
  }
  private async inspectDeliveryOnce(id: string) {
    this.active();
    const row = this.ledger.outbox(id);
    if (!row) throw new SlackFailure('invalid');
    this.authorize(this.ledger.byOperation(row.operationId)!);
    if (row.state !== 'unknown') return row;
    await this.bridge.verifySource(this.ledger.byOperation(row.operationId)!);
    this.authorize(this.ledger.byOperation(row.operationId)!);
    const previous = this.ledger.inspection(id);
    if (
      previous.nextAt > this.now() ||
      this.ledger.throttle('inspection') > this.now()
    )
      return row;
    this.ledger.delay('inspection', this.now() + 60000);
    try {
      const result = await this.api.inspect(
        JSON.parse(row.payload) as SendPayload,
        this.config.botUserId,
        previous.cursor,
      );
      this.ledger.fence();
      if (result.found && timestamp(result.found))
        this.ledger.settleSend(
          id,
          'delivered',
          `${row.channelId}:${result.found}`,
        );
      this.ledger.inspected(id, result.cursor, this.now() + 60000);
    } catch (error) {
      if (error instanceof SlackFailure && error.code === 'throttled')
        this.ledger.delay('inspection', this.now() + error.retryAfterMs);
    }
    return this.ledger.outbox(id)!;
  }
  get configurationDigest() {
    return configurationDigest(this.config);
  }
}
