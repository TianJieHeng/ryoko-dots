import {
  SlackFailure,
  object,
  timestamp,
  type SendPayload,
  type SlackApi,
} from './slack-types.js';

/** Official Slack Web API; intentionally no SDK automatic retry machinery. */
export class SlackWebApi implements SlackApi {
  constructor(
    private token: () => string,
    private options: {
      fetch?: typeof fetch;
      recoveryToken?: () => string;
      /** Explicit loopback transport for deterministic integration tests only. */
      loopbackTestOrigin?: string;
    } = {},
  ) {
    if (options.loopbackTestOrigin) {
      const url = new URL(options.loopbackTestOrigin);
      if (
        url.protocol !== 'http:' ||
        url.hostname !== '127.0.0.1' ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        throw new SlackFailure('invalid');
    }
  }
  private async call(
    method: 'auth.test' | 'chat.postMessage' | 'conversations.replies',
    payload: object,
    read = false,
  ) {
    const token = read
      ? (this.options.recoveryToken?.() ?? this.token())
      : this.token();
    if (!token || /[\r\n]/.test(token)) throw new SlackFailure('unavailable');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const origin = this.options.loopbackTestOrigin ?? 'https://slack.com';
      const url = new URL(`/api/${method}`, origin);
      if (read)
        for (const [key, value] of Object.entries(payload))
          url.searchParams.set(key, String(value));
      const response = await (this.options.fetch ?? fetch)(url, {
        method: read ? 'GET' : 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        ...(read ? {} : { body: JSON.stringify(payload) }),
      });
      if (response.status === 429) {
        const seconds = Number(response.headers.get('retry-after'));
        // An extreme Retry-After is held for operator inspection, never shortened.
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400)
          throw new SlackFailure('unavailable');
        throw new SlackFailure('throttled', Math.ceil(seconds * 1000));
      }
      if (!response.ok) throw new SlackFailure('unknown');
      const reader = response.body?.getReader();
      if (!reader) throw new SlackFailure('unknown');
      const parts: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 512 * 1024) {
          await reader.cancel();
          throw new SlackFailure('unknown');
        }
        parts.push(part.value);
      }
      const data = object(
        JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            Buffer.concat(parts),
          ),
        ),
      );
      if (data.ok !== true) {
        if (
          [
            'invalid_auth',
            'token_revoked',
            'token_expired',
            'account_inactive',
            'not_authed',
            'missing_scope',
            'not_in_channel',
            'channel_not_found',
            'no_permission',
            'is_archived',
            'restricted_action',
          ].includes(String(data.error))
        )
          throw new SlackFailure('denied');
        // Internal errors/timeouts can be post-acceptance: no speculative retry.
        throw new SlackFailure('unknown');
      }
      return data;
    } catch (error) {
      if (error instanceof SlackFailure) throw error;
      throw new SlackFailure('unknown');
    } finally {
      clearTimeout(timer);
    }
  }
  async verifyIdentity(teamId: string, botUserId: string) {
    const data = await this.call('auth.test', {});
    if (
      data.team_id !== teamId ||
      data.user_id !== botUserId ||
      typeof data.bot_id !== 'string'
    )
      throw new SlackFailure('denied');
    if (this.options.recoveryToken) {
      const readIdentity = await this.call('auth.test', {}, true);
      if (readIdentity.team_id !== teamId) throw new SlackFailure('denied');
    }
  }
  async post(payload: SendPayload) {
    const data = await this.call('chat.postMessage', payload);
    if (data.channel !== payload.channel || !timestamp(data.ts))
      throw new SlackFailure('unknown');
    return { channel: data.channel, ts: data.ts };
  }
  async inspect(
    payload: SendPayload,
    botUserId: string,
    cursor: string | null,
  ) {
    const data = await this.call(
      'conversations.replies',
      {
        channel: payload.channel,
        ts: payload.thread_ts,
        limit: 15,
        ...(cursor ? { cursor } : {}),
      },
      true,
    );
    if (!Array.isArray(data.messages) || data.messages.length > 15)
      throw new SlackFailure('unknown');
    const matches = data.messages.map(object).filter(
      (message) =>
        message.user === botUserId &&
        message.thread_ts === payload.thread_ts &&
        message.text === payload.text &&
        message.edited === undefined &&
        message.subtype === undefined &&
        timestamp(message.ts) &&
        Array.isArray(message.blocks) &&
        message.blocks.length === payload.blocks.length &&
        payload.blocks.every((expected, index) => {
          const raw = (message.blocks as unknown[])[index];
          const block = object(raw);
          const text = object(block.text);
          return (
            block.type === 'section' &&
            block.block_id === expected.block_id &&
            text.type === 'plain_text' &&
            text.text === expected.text.text
          );
        }),
    );
    if (matches.length > 1) throw new SlackFailure('conflict');
    const next = object(data.response_metadata).next_cursor;
    if (next !== undefined && (typeof next !== 'string' || next.length > 2048))
      throw new SlackFailure('unknown');
    if (data.has_more === true && !next) throw new SlackFailure('unknown');
    return {
      found: matches.length === 1 ? String(matches[0].ts) : null,
      cursor: typeof next === 'string' && next ? next : null,
    };
  }
}
