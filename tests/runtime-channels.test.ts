import { describe, expect, it } from 'vitest';
import { contractVersion } from '../src/shared/runtime/contracts';
import {
  canRetryDelivery,
  channelStatusSchema,
  deliveriesSchema,
  provenanceSchema,
  verifiedSlackOrigin,
  type RuntimeChannelStatus,
  type RuntimeChannelOrigin,
  type RuntimeDelivery,
} from '../src/shared/runtime/channels';

const scope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'agent',
  project: null,
  generation: 1,
};
const status: RuntimeChannelStatus = {
  version: contractVersion,
  scope,
  provider: 'slack',
  transport: 'self_hosted',
  state: 'ready',
  qualified: true,
  teamId: 'T1',
  allowedHumanUserIds: ['U1'],
  allowedChannelIds: ['C1'],
  createdMessagesOnly: true,
  ignoreBots: true,
  ingressDeduplicated: true,
};
const origin: RuntimeChannelOrigin = {
  surface: 'slack',
  actorId: 'U1',
  teamId: 'T1',
  channelId: 'C1',
  providerEventId: 'Ev1',
  providerThreadId: '1700000000.123456',
  verified: true,
  permalink: 'https://workspace.slack.com/archives/C1/p1700000000123456',
};
const provenance = {
  version: contractVersion,
  scope,
  conversationId: 'conversation',
  origins: [origin],
  reviewPath: '/#/missions/mission/reviews/review',
};
const delivery: RuntimeDelivery = {
  id: 'delivery',
  revision: 1,
  conversationId: 'conversation',
  missionId: 'mission',
  outputVersion: 'v1',
  destination: 'slack:C1',
  state: 'failed',
  providerReceipt: null,
  reviewPath: provenance.reviewPath,
  allowedActions: ['retry_delivery', 'inspect'],
};

describe('runtime channel contracts', () => {
  it('verifies only qualified self-hosted, deduplicated Slack ingress', () => {
    expect(verifiedSlackOrigin(origin, status)).toBe(true);
    for (const patch of [
      { qualified: false },
      { state: 'degraded' },
      { ingressDeduplicated: false },
      { teamId: null },
      { allowedChannelIds: [] },
      { transport: 'managed' },
    ]) {
      expect(verifiedSlackOrigin(origin, { ...status, ...patch })).toBe(false);
    }
    expect(
      channelStatusSchema.safeParse({ ...status, transport: 'managed' })
        .success,
    ).toBe(false);
  });

  it('rejects foreign actors, bots without an allowed human ID, and revoked mappings', () => {
    for (const patch of [
      { actorId: 'U2' },
      { actorId: 'B1' },
      { actorId: null },
      { teamId: 'T2' },
      { channelId: 'C2' },
      { providerEventId: null },
      { verified: false },
      { surface: 'web' },
    ]) {
      expect(verifiedSlackOrigin({ ...origin, ...patch }, status)).toBe(false);
    }
    expect(
      verifiedSlackOrigin({ ...origin, displayName: 'owner' }, status),
    ).toBe(false);
    expect(
      verifiedSlackOrigin(origin, { ...status, allowedHumanUserIds: [] }),
    ).toBe(false);
  });

  it('does not enable bot or changed-message ingress', () => {
    expect(
      channelStatusSchema.safeParse({ ...status, createdMessagesOnly: false })
        .success,
    ).toBe(false);
    expect(
      channelStatusSchema.safeParse({ ...status, ignoreBots: false }).success,
    ).toBe(false);
  });

  it('preserves duplicate event identity and provider thread continuity', () => {
    const parsed = provenanceSchema.parse({
      ...provenance,
      origins: [origin, origin],
    });
    expect(parsed.origins.map((value) => value.providerEventId)).toEqual([
      'Ev1',
      'Ev1',
    ]);
    expect(parsed.origins[0]?.providerThreadId).toBe(origin.providerThreadId);
    expect(
      provenanceSchema.parse({
        ...provenance,
        origins: [{ ...origin, permalink: null }],
      }).origins[0]?.permalink,
    ).toBeNull();
  });

  it('rejects unsafe review links and unsafe Slack permalinks', () => {
    for (const reviewPath of [
      'https://evil.test/',
      '//evil.test',
      '/#/missions/../reviews/r',
      '/#/missions/m/reviews/r?next=evil',
      '/#/missions/%2f/reviews/r',
      '/#/missions/m/reviews/r/extra',
      '/#/missions/m/reviews/r#x',
    ]) {
      expect(
        provenanceSchema.safeParse({ ...provenance, reviewPath }).success,
      ).toBe(false);
      expect(canRetryDelivery({ ...delivery, reviewPath })).toBe(false);
    }
    for (const permalink of [
      'http://workspace.slack.com/archives/C1/p1',
      'https://slack.com.evil.test/archives/C1/p1',
      'https://user:secret@workspace.slack.com/archives/C1/p1',
      'javascript:alert(1)',
      'https://workspace.slack.com/other',
      'https://workspace.slack.com/archives/C1/p1?token=secret',
    ]) {
      expect(
        provenanceSchema.safeParse({
          ...provenance,
          origins: [{ ...origin, permalink }],
        }).success,
      ).toBe(false);
    }
  });

  it('offers delivery-only repair for failed sends and inspects unknown acknowledgments', () => {
    expect(canRetryDelivery(delivery)).toBe(true);
    for (const state of ['held', 'queued', 'delivered', 'unknown']) {
      expect(canRetryDelivery({ ...delivery, state })).toBe(false);
    }
    expect(canRetryDelivery({ ...delivery, allowedActions: ['inspect'] })).toBe(
      false,
    );
    expect(canRetryDelivery({ ...delivery, allowedActions: ['new_run'] })).toBe(
      false,
    );
    const parsed = deliveriesSchema.parse({
      version: contractVersion,
      scope,
      deliveries: [
        { ...delivery, state: 'unknown', allowedActions: ['inspect'] },
      ],
    });
    expect(parsed.deliveries[0]?.outputVersion).toBe('v1');
    expect(parsed.deliveries[0]?.missionId).toBe('mission');
  });

  it('rejects secrets and invalid contract versions at every boundary', () => {
    for (const [schema, value] of [
      [channelStatusSchema, status],
      [provenanceSchema, provenance],
      [
        deliveriesSchema,
        { version: contractVersion, scope, deliveries: [delivery] },
      ],
    ] as const) {
      expect(schema.safeParse({ ...value, token: 'secret' }).success).toBe(
        false,
      );
      expect(schema.safeParse({ ...value, version: 'future' }).success).toBe(
        false,
      );
      expect(
        schema.safeParse({ ...value, scope: { ...scope, token: 'secret' } })
          .success,
      ).toBe(false);
    }
    expect(
      deliveriesSchema.safeParse({
        version: contractVersion,
        scope,
        deliveries: [{ ...delivery, secret: 'secret' }],
      }).success,
    ).toBe(false);
    expect(verifiedSlackOrigin(null, null)).toBe(false);
    expect(canRetryDelivery(null)).toBe(false);
  });
});
