import { AsyncLocalStorage } from 'node:async_hooks';
import { signEdge } from '../shared/computer-edge-protocol.js';
import type { ComputerProtocolTransport } from './runtime/computer-http-edge.js';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import {
  computerInputs,
  computerPermissionsSchema,
  type ComputerAction,
  type ComputerControl,
  type ComputerStatus,
} from '../shared/computer-types.js';
import type { WorkspaceStore } from './workspace.js';
import type { PlatformConfig } from './platform-config.js';
const stateSchema = z.object({
  botId: z.string(),
  container: z.string(),
  status: z.string(),
  port: z.number().int().min(1024).max(65535).optional(),
  url: z.string().optional(),
});
const controlSchema = z.object({
  holder: z.enum(['bot', 'human']),
  requested: z.boolean(),
  transitioning: z.boolean(),
  resumeSnapshotRequired: z.boolean(),
  request: z.object({ id: z.string(), status: z.string() }).optional(),
});
export type ComputerServiceConfig = Pick<
  PlatformConfig,
  | 'computerSupervisorUrl'
  | 'computerSupervisorToken'
  | 'computerToken'
  | 'computerNamespace'
>;
export class ComputerService {
  private auditDispatch = new AsyncLocalStorage<{ sent: boolean }>();
  constructor(
    private workspace: WorkspaceStore,
    private config: ComputerServiceConfig,
    private paused: () => boolean,
    private transport: typeof fetch = fetch,
    private deadlineMs = 70000,
    private governance: { executorId: (dotId: string) => string } | null = null,
  ) {}
  get configured() {
    return !!(
      this.config.computerSupervisorUrl?.trim() &&
      this.config.computerSupervisorToken?.trim() &&
      this.config.computerToken?.trim()
    );
  }
  private token(id: string) {
    return createHmac('sha256', this.config.computerToken!.trim())
      .update(`opendots-computer:${id}`)
      .digest('hex');
  }
  private requireDot(id: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id) || !this.workspace.dot(id))
      throw new Error('Dot not found.');
  }
  private allowed(
    id: string,
    kind: 'browser' | 'files' | 'shell' | undefined,
    actor: 'agent' | 'owner',
  ) {
    this.requireDot(id);
    if (!this.configured)
      throw new Error('Computer service is not configured.');
    const policy = this.workspace.computers.permissions(id);
    if (!policy.enabled || (kind && !policy[kind]))
      throw new Error('Computer permission is disabled.');
    if (actor === 'agent' && this.paused())
      throw new Error('Agents are paused.');
  }
  private async json(
    url: string,
    token: string,
    body: unknown | undefined,
    signal?: AbortSignal,
    dotId?: string,
    beforeSend?: () => void,
    redact = true,
    responseLimit = 4_000_000,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.deadlineMs);
    const combined = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    try {
      beforeSend?.();
      const audit = this.auditDispatch.getStore();
      if (audit && body !== undefined) audit.sent = true;
      const response = await this.transport(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(dotId ? { 'x-openbot-bot-id': dotId } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: combined,
      });
      if (response.status === 409)
        throw new Error(
          'Computer service returned HTTP 409: refresh the browser with computer_snapshot before retrying. If the owner has control, wait for them to release it; do not bypass takeover.',
        );
      if (!response.ok)
        throw new Error(`Computer service returned HTTP ${response.status}.`);
      if (!response.body)
        throw new Error('Computer service returned an empty response.');
      const reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > responseLimit) {
          await reader.cancel();
          throw new Error('Computer response exceeded its size limit.');
        }
        chunks.push(value);
      }
      // Infrastructure secrets must never leave the gateway even if an upstream response reflects one.
      let text = Buffer.concat(chunks).toString('utf8');
      for (const secret of [
        token,
        this.config.computerToken?.trim(),
        this.config.computerSupervisorToken?.trim(),
      ])
        if (redact && secret) text = text.split(secret).join('[redacted]');
      return JSON.parse(text);
    } catch (error) {
      if (combined.aborted)
        throw new Error('Computer request was cancelled or timed out.', {
          cause: error,
        });
      if (
        error instanceof Error &&
        /^Computer (service returned|response exceeded)/.test(error.message)
      )
        throw error;
      throw new Error(
        'Computer service is unavailable or returned an invalid response.',
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  private supervisor(path: string, body?: unknown, signal?: AbortSignal) {
    return this.json(
      `${this.config.computerSupervisorUrl!.replace(/\/$/, '')}${path}`,
      this.config.computerSupervisorToken!.trim(),
      body,
      signal,
    );
  }
  private endpoint(id: string, raw: unknown) {
    const state = stateSchema.parse(raw);
    const ns = this.config.computerNamespace ?? 'opendots';
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(ns))
      throw new Error('Invalid computer namespace.');
    const expected = `${ns}-computer-${id}`;
    if (state.botId !== id || state.container !== expected)
      throw new Error('Computer identity mismatch.');
    const url = new URL(
      state.url ??
        (state.port
          ? `http://127.0.0.1:${state.port}`
          : `http://${expected}:4100`),
    );
    const network =
      url.hostname === expected.toLowerCase() && url.port === '4100';
    const local =
      url.hostname === '127.0.0.1' &&
      !!state.port &&
      url.port === String(state.port) &&
      new URL(this.config.computerSupervisorUrl!).hostname === '127.0.0.1';
    if (
      url.protocol !== 'http:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      (!network && !local)
    )
      throw new Error('Computer endpoint is not bound to this Dot.');
    return url.origin;
  }
  private async existing(id: string, signal?: AbortSignal) {
    const listing = z
      .object({ computers: z.array(stateSchema) })
      .parse(await this.supervisor('/computers', undefined, signal));
    return listing.computers.find((c) => c.botId === id);
  }
  private async running(id: string, signal?: AbortSignal) {
    const state = await this.existing(id, signal);
    if (!state || state.status !== 'running')
      throw new Error('Start this Dot’s computer first.');
    return this.endpoint(id, state);
  }
  async status(id: string): Promise<ComputerStatus> {
    this.requireDot(id);
    if (this.governance)
      return {
        configured: this.configured,
        state: this.configured ? 'unavailable' : 'not_configured',
        permissions: this.workspace.computers.permissions(id),
        audit: this.workspace.computers.audit(id),
        error: 'Use the authenticated runtime computer status surface.',
      };
    const base = {
      configured: this.configured,
      permissions: this.workspace.computers.permissions(id),
      audit: this.workspace.computers.audit(id),
    };
    if (!this.configured) return { ...base, state: 'not_configured' };
    try {
      const state = await this.existing(id);
      if (!state || state.status !== 'running')
        return { ...base, state: 'stopped' };
      const url = this.endpoint(id, state);
      const control = controlSchema.parse(
        await this.json(
          `${url}/control`,
          this.token(id),
          undefined,
          undefined,
          id,
        ),
      );
      return { ...base, state: 'running', control };
    } catch {
      return {
        ...base,
        state: 'unavailable',
        error:
          'Computer service is unavailable. Check the supervisor configuration and connection.',
      };
    }
  }
  /** Only the server-owned adapter receives this port. No callback URL, token,
   * container name, policy or actor is read from HTTP/browser route parameters. */
  protocol(id: string): ComputerProtocolTransport {
    this.requireDot(id);
    if (!this.governance)
      throw new Error('Governed computer mode is required.');
    const executorId = this.governance.executorId(id);
    return {
      configured: () => this.configured,
      request: async (path, body, role, signal, beforeSend, expectedTarget) => {
        if (
          !this.configured ||
          ![
            '/edge/status',
            '/edge/change',
            '/edge/change-inspect',
            '/edge/execute',
            '/edge/observe',
            '/edge/screen',
            '/edge/inspect',
          ].includes(path)
        )
          throw new Error('Computer protocol unavailable.');
        this.requireDot(id);
        const url = await this.running(id, signal);
        signal.throwIfAborted();
        const envelope = signEdge(
          path,
          {
            version: 1,
            dotId: id,
            executorId,
            role,
            expiresAt: Date.now() + Math.min(65000, this.deadlineMs),
            body,
            expectedTarget: expectedTarget ?? null,
          },
          this.token(id),
        );
        return this.json(
          `${url}${path}`,
          this.token(id),
          envelope,
          signal,
          id,
          beforeSend,
          false,
          path === '/edge/screen' ? 16_100_000 : 4_000_000,
        );
      },
    };
  }
  /** Feed these only to the private receipt sanitizer; never expose via routes. */
  protocolSecrets(id: string): readonly string[] {
    this.requireDot(id);
    return [
      this.token(id),
      this.config.computerToken!.trim(),
      this.config.computerSupervisorToken!.trim(),
    ];
  }
  /** Authenticated owner lifecycle ONLY. Caller owns durable operation admission,
   * local fence-first control change, and unknown-outcome handling. Never retry
   * this call after a lost response; supervisor has no operation-bound proof. */
  async governedLifecycle(
    id: string,
    verb: 'start' | 'stop',
    authenticate: () => void,
    signal: AbortSignal,
  ) {
    this.requireDot(id);
    if (!this.governance || !this.configured)
      throw new Error('Governed supervisor unavailable.');
    const raw = await this.json(
      `${this.config.computerSupervisorUrl!.replace(/\/$/, '')}/computers/${id}/${verb === 'start' ? 'ensure' : 'stop'}`,
      this.config.computerSupervisorToken!.trim(),
      {},
      signal,
      undefined,
      () => {
        authenticate();
        signal.throwIfAborted();
      },
    );
    authenticate();
    if (verb === 'start') {
      const state = stateSchema.parse(raw);
      this.endpoint(id, state);
      if (state.status !== 'running')
        throw new Error('Supervisor has not witnessed a running target.');
      return { state: 'running' as const };
    }
    z.object({ stopped: z.literal(true) })
      .strict()
      .parse(raw);
    return { state: 'stopped' as const };
  }
  private async audited<T>(
    id: string,
    action: string,
    actor: 'owner' | 'agent',
    fn: () => Promise<T>,
  ): Promise<T> {
    this.requireDot(id);
    const receipt = this.workspace.computers.begin(id, action, actor);
    return this.auditDispatch.run({ sent: false }, async () => {
      try {
        const result = await fn();
        this.workspace.computers.finish(receipt, 'succeeded');
        return result;
      } catch (error) {
        this.workspace.computers.finish(
          receipt,
          this.auditDispatch.getStore()?.sent ? 'unknown' : 'failed',
        );
        throw error;
      }
    });
  }

  private legacyOnly() {
    if (this.governance)
      throw new Error(
        'Legacy computer dispatch is disabled; use authenticated runtime effects or owner operations.',
      );
  }
  async permissions(id: string, input: unknown) {
    this.legacyOnly();
    const patch = computerPermissionsSchema.partial().parse(input);
    await this.audited(id, 'permissions', 'owner', async () =>
      this.workspace.computers.patch(id, patch),
    );
    return this.status(id);
  }
  async start(id: string) {
    this.legacyOnly();
    await this.audited(id, 'start', 'owner', async () => {
      this.allowed(id, undefined, 'owner');
      this.endpoint(id, await this.supervisor(`/computers/${id}/ensure`, {}));
    });
    return this.status(id);
  }
  async stop(id: string) {
    this.legacyOnly();
    await this.audited(id, 'stop', 'owner', async () => {
      if (!this.configured)
        throw new Error('Computer service is not configured.');
      await this.supervisor(`/computers/${id}/stop`, {});
    });
    return this.status(id);
  }
  async control(id: string, verb: 'take' | 'release') {
    this.legacyOnly();
    await this.audited(id, verb, 'owner', async () => {
      if (!this.configured)
        throw new Error('Computer service is not configured.');
      if (verb === 'take') this.allowed(id, 'browser', 'owner');
      const url = await this.running(id);
      if (verb === 'take') this.allowed(id, 'browser', 'owner');
      let control: ComputerControl = controlSchema.parse(
        await this.json(
          `${url}/control`,
          this.token(id),
          undefined,
          undefined,
          id,
        ),
      );
      if (verb === 'take' && !control.request)
        control = controlSchema.parse(
          await this.json(
            `${url}/control/request`,
            this.token(id),
            { reason: 'Owner requested control.' },
            undefined,
            id,
          ),
        );
      if (
        verb === 'take' &&
        control.request &&
        !['waiting', 'taken'].includes(control.request.status)
      )
        control = controlSchema.parse(
          await this.json(
            `${url}/control/request`,
            this.token(id),
            { reason: 'Owner requested control.' },
            undefined,
            id,
          ),
        );
      if (!control.request)
        throw new Error('There is no active control request.');
      await this.json(
        `${url}/control/${verb}`,
        this.token(id),
        { requestId: control.request.id },
        undefined,
        id,
      );
    });
    return this.status(id);
  }
  async action(
    id: string,
    action: ComputerAction,
    input: unknown,
    actor: 'owner' | 'agent' = 'owner',
    signal?: AbortSignal,
  ): Promise<unknown> {
    this.legacyOnly();
    if (!Object.hasOwn(computerInputs, action))
      throw new Error('Unknown computer action.');
    const parsed = computerInputs[action].parse(input);
    return this.audited(id, action, actor, async () => {
      if (actor === 'agent' && action.startsWith('human_'))
        throw new Error('Human controls are owner-only.');
      const kind =
        action === 'exec'
          ? 'shell'
          : action.startsWith('files_')
            ? 'files'
            : 'browser';
      this.allowed(id, kind, actor);
      const cancellation = new AbortController();
      const activeSignal = signal
        ? AbortSignal.any([signal, cancellation.signal])
        : cancellation.signal;
      const watcher = setInterval(() => {
        try {
          this.allowed(id, kind, actor);
        } catch {
          cancellation.abort();
        }
      }, 50);
      try {
        const url = await this.running(id, activeSignal);
        this.allowed(id, kind, actor);
        activeSignal.throwIfAborted();
        const path = action
          .replace(/^files_/, 'files/')
          .replace(/^human_/, 'human/');
        const result = await this.json(
          `${url}/${path}`,
          this.token(id),
          ['read', 'screenshot'].includes(action) ? undefined : parsed,
          activeSignal,
          id,
        );
        this.allowed(id, kind, actor);
        if (action === 'exec' && result && typeof result === 'object') {
          const copy = { ...result } as Record<string, unknown>;
          delete copy.command;
          return copy;
        }
        return result;
      } finally {
        clearInterval(watcher);
      }
    });
  }
}
