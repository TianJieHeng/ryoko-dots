import { createHash } from 'node:crypto';

export class SlackFailure extends Error {
  constructor(
    readonly code:
      | 'invalid'
      | 'denied'
      | 'unavailable'
      | 'conflict'
      | 'unknown'
      | 'throttled',
    readonly retryAfterMs = 0,
  ) {
    super(`Slack adapter ${code}.`);
  }
}
export const hash = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');
export const timestamp = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{10,12}\.\d{6}$/.test(value);
export const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
export const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export interface SlackConfig {
  enabled: boolean;
  /** No consumer-managed/producer Slack adapter may run alongside this authority. */
  authority: 'dots_signed_events';
  ownerId: string;
  dotId: string;
  teamId: string;
  appId: string;
  botUserId: string;
  allowedChannelIds: readonly string[];
  allowedHumanUserIds: readonly string[];
  appOrigin: string;
  /** Separately reviewed owner standing authority, not inferred from a Slack signature. */
  replyAuthority: null | {
    ownerId: string;
    grantId: string;
    expiresAt: number;
    sourcePairs: { channelId: string; humanUserId: string }[];
    dataScope: 'primary_context_original_command_results';
    deliveryScope: 'original_slack_thread';
    runtimeIdentity: {
      principal_id: string;
      profile_id: string;
      agent_id: string;
      policy_digest: string;
      config_digest: string;
    };
    projectIds: string[];
  };
  /** Operator-owned connected-workspace qualification; secrets never count as evidence. */
  qualification: null | { configurationDigest: string; evidenceId: string };
}
export function configurationDigest(config: SlackConfig) {
  return hash(
    JSON.stringify([
      config.authority,
      config.ownerId,
      config.dotId,
      config.teamId,
      config.appId,
      config.botUserId,
      [...config.allowedChannelIds].sort(),
      [...config.allowedHumanUserIds].sort(),
      config.appOrigin,
      config.replyAuthority,
    ]),
  );
}
export function validateConfig(config: SlackConfig) {
  const origin = new URL(config.appOrigin);
  if (
    config.authority !== 'dots_signed_events' ||
    ![config.ownerId, config.dotId].every(identifier) ||
    !/^T[A-Z0-9]+$/.test(config.teamId) ||
    !/^A[A-Z0-9]+$/.test(config.appId) ||
    !/^U[A-Z0-9]+$/.test(config.botUserId) ||
    config.allowedChannelIds.length === 0 ||
    config.allowedChannelIds.length > 1000 ||
    config.allowedHumanUserIds.length === 0 ||
    config.allowedHumanUserIds.length > 1000 ||
    config.allowedChannelIds.some((id) => !/^[CGD][A-Z0-9]+$/.test(id)) ||
    config.allowedHumanUserIds.some(
      (id) => !/^[UW][A-Z0-9]+$/.test(id) || id === config.botUserId,
    ) ||
    new Set(config.allowedChannelIds).size !==
      config.allowedChannelIds.length ||
    new Set(config.allowedHumanUserIds).size !==
      config.allowedHumanUserIds.length ||
    origin.protocol !== 'https:' ||
    origin.origin !== config.appOrigin ||
    origin.username ||
    origin.password ||
    (config.replyAuthority !== null && !validReplyAuthority(config))
  )
    throw new SlackFailure('invalid');
}
export function validReplyAuthority(config: SlackConfig): boolean {
  const grant = config.replyAuthority;
  return (
    !!grant &&
    grant.ownerId === config.ownerId &&
    identifier(grant.grantId) &&
    Number.isSafeInteger(grant.expiresAt) &&
    grant.expiresAt > 0 &&
    grant.dataScope === 'primary_context_original_command_results' &&
    grant.deliveryScope === 'original_slack_thread' &&
    [
      grant.runtimeIdentity.principal_id,
      grant.runtimeIdentity.profile_id,
      grant.runtimeIdentity.agent_id,
    ].every(identifier) &&
    [
      grant.runtimeIdentity.policy_digest,
      grant.runtimeIdentity.config_digest,
    ].every((value) => /^[a-f0-9]{64}$/.test(value)) &&
    grant.projectIds.length <= 100 &&
    grant.projectIds.every(identifier) &&
    new Set(grant.projectIds).size === grant.projectIds.length &&
    grant.sourcePairs.length > 0 &&
    grant.sourcePairs.length <= 1000 &&
    grant.sourcePairs.every(
      (pair) =>
        config.allowedChannelIds.includes(pair.channelId) &&
        config.allowedHumanUserIds.includes(pair.humanUserId),
    ) &&
    new Set(
      grant.sourcePairs.map((pair) => `${pair.channelId}:${pair.humanUserId}`),
    ).size === grant.sourcePairs.length
  );
}
export function assertReplyAuthority(
  config: SlackConfig,
  event?: Pick<SlackEvent, 'teamId' | 'channelId' | 'actorId'>,
  now = Date.now(),
) {
  const grant = config.replyAuthority;
  if (
    !validReplyAuthority(config) ||
    !grant ||
    grant.expiresAt <= now ||
    (event &&
      (event.teamId !== config.teamId ||
        !grant.sourcePairs.some(
          (pair) =>
            pair.channelId === event.channelId &&
            pair.humanUserId === event.actorId,
        )))
  )
    throw new SlackFailure('denied');
}
export function qualified(config: SlackConfig) {
  return (
    validReplyAuthority(config) &&
    !!config.qualification &&
    identifier(config.qualification.evidenceId) &&
    config.qualification.configurationDigest === configurationDigest(config)
  );
}
export interface SlackEvent {
  eventId: string;
  teamId: string;
  channelId: string;
  actorId: string;
  messageTs: string;
  threadTs: string;
  text: string;
  kind: 'app_mention' | 'message';
}
export interface ThreadRecord {
  threadKey: string;
  teamId: string;
  channelId: string;
  threadTs: string;
  createOperationId: string;
  conversationId: string | null;
}
export interface EventRecord extends SlackEvent {
  threadKey: string;
  operationId: string;
  conversationId: string | null;
  sequence: number;
  state:
    | 'queued'
    | 'preparing'
    | 'dispatching'
    | 'accepted'
    | 'unknown'
    | 'rejected'
    | 'complete';
}
export interface ImmutableOutput {
  artifactId: string;
  version: number;
  sha256: string;
  text: string;
  /** Links require the existing authenticated owner UI; no signed public file URLs. */
  reviewPath?: string;
}
export interface SlackBridge {
  ready(): boolean;
  /** Every method must recheck current owner, Dot, conversation and grants. */
  authorize(conversationId?: string): void;
  /** Refresh actual producer identity and project grants immediately before private data use/send. */
  verifySource(event: EventRecord): Promise<void>;
  ensureConversation(thread: ThreadRecord): Promise<string>;
  admit(event: EventRecord): Promise<'accepted' | 'rejected' | 'unknown'>;
  inspect(event: EventRecord): Promise<'accepted' | 'rejected' | 'unknown'>;
  output(event: EventRecord): Promise<ImmutableOutput | null>;
}
export interface SendPayload {
  channel: string;
  thread_ts: string;
  text: string;
  mrkdwn: false;
  parse: 'none';
  link_names: false;
  unfurl_links: false;
  unfurl_media: false;
  reply_broadcast: false;
  blocks: {
    type: 'section';
    block_id: string;
    text: { type: 'plain_text'; text: string; emoji: false };
  }[];
}
export interface OutboxRecord {
  id: string;
  operationId: string;
  conversationId: string;
  channelId: string;
  threadTs: string;
  artifactId: string;
  outputVersion: number;
  sha256: string;
  payload: string;
  digest: string;
  state: 'queued' | 'sending' | 'delivered' | 'failed' | 'unknown' | 'held';
  attempts: number;
  nextAt: number;
  providerReceipt: string | null;
  revision: number;
  reviewPath: string | null;
}
export interface SlackApi {
  verifyIdentity(teamId: string, botUserId: string): Promise<void>;
  post(payload: SendPayload): Promise<{ channel: string; ts: string }>;
  /** A missing match proves nothing about whether a send happened. */
  inspect(
    payload: SendPayload,
    botUserId: string,
    cursor: string | null,
  ): Promise<{ found: string | null; cursor: string | null }>;
}
