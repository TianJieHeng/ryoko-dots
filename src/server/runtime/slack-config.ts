import { readFileSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import {
  configurationDigest,
  SlackFailure,
  validateConfig,
} from './slack-types.js';

const id = z.string().min(1).max(256);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const replyAuthority = z.strictObject({
  ownerId: id,
  grantId: id,
  expiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sourcePairs: z
    .array(z.strictObject({ channelId: id, humanUserId: id }))
    .min(1)
    .max(1000),
  dataScope: z.literal('primary_context_original_command_results'),
  deliveryScope: z.literal('original_slack_thread'),
  runtimeIdentity: z.strictObject({
    principal_id: id,
    profile_id: id,
    agent_id: id,
    policy_digest: digest,
    config_digest: digest,
  }),
  projectIds: z.array(id).max(100),
});
export const slackConfigSchema = z.strictObject({
  enabled: z.boolean().default(false),
  authority: z.literal('dots_signed_events'),
  exclusiveIngressConfirmed: z.literal(true),
  ownerId: id,
  dotId: id,
  teamId: id,
  appId: id,
  botUserId: id,
  allowedChannelIds: z.array(id).min(1).max(1000),
  allowedHumanUserIds: z.array(id).min(1).max(1000),
  appOrigin: z.string().max(2048),
  replyAuthority: replyAuthority.nullable().default(null),
  qualification: z
    .strictObject({ configurationDigest: digest, evidenceId: id })
    .nullable()
    .default(null),
});
/** This server-owned file is never writable through the browser. Credentials are separate getters. */
export function loadSlackConfig(path: string | undefined) {
  if (!path) return undefined;
  try {
    if (!isAbsolute(path) || statSync(path).size > 65536)
      throw new SlackFailure('invalid');
    const value = slackConfigSchema.parse(
      JSON.parse(readFileSync(path, 'utf8')),
    );
    validateConfig(value);
    return value;
  } catch {
    throw new SlackFailure('invalid');
  }
}
/** Changing or removing the authority file fences running workers before their next boundary. */
export function currentSlackPolicy(
  path: string,
  expected: NonNullable<ReturnType<typeof loadSlackConfig>>,
) {
  const original = JSON.stringify(expected);
  return () => {
    const current = loadSlackConfig(path);
    if (
      !current ||
      !current.enabled ||
      JSON.stringify(current) !== original ||
      configurationDigest(current) !== configurationDigest(expected)
    )
      throw new SlackFailure('denied');
  };
}
