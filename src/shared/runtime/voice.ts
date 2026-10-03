import { z } from 'zod';
import {
  contractVersion,
  sameScope,
  scopeSchema,
  type RuntimeScope,
} from './contracts';

const id = z.string().min(1).max(256);
const timestamp = z.number().int().nonnegative().max(8640000000000000);
const text = z.string().max(20000);

/** Public capability information only; provider credentials never enter the browser. */
export const voiceProfileSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  mode: z.enum(['realtime_webrtc', 'finite_local', 'unavailable']),
  provider: z.string().min(1).max(256),
  qualified: z.boolean(),
  signalProtocol: z.enum(['openai_realtime_v1', 'none']),
  computeAllowed: z.boolean(),
  maxCallSeconds: z.number().int().min(30).max(3600),
});
export type RuntimeVoiceProfile = z.infer<typeof voiceProfileSchema>;

/** Finite speech and configuration alone cannot authorize a realtime call. */
export function canStartRealtime(
  profile: unknown,
  scope: RuntimeScope | null,
): boolean {
  const parsed = voiceProfileSchema.safeParse(profile);
  const parsedScope = scopeSchema.safeParse(scope);
  return (
    parsed.success &&
    parsedScope.success &&
    sameScope(parsed.data.scope, parsedScope.data) &&
    parsed.data.qualified &&
    parsed.data.mode === 'realtime_webrtc' &&
    parsed.data.signalProtocol === 'openai_realtime_v1'
  );
}

/** Unknown admission is an inspect-only receipt, never permission to replay media. */
export const voiceAdmissionSchema = z
  .strictObject({
    version: z.literal(contractVersion),
    scope: scopeSchema,
    operationId: z.uuid(),
    callId: id,
    sdp: z.string().min(1).max(100000).nullable(),
    expiresAt: timestamp,
    status: z.enum(['admitted', 'unknown', 'rejected']),
  })
  .refine(
    (value) => value.status !== 'admitted' || value.sdp !== null,
    'Admitted media requires an SDP answer',
  );
export type RuntimeVoiceAdmission = z.infer<typeof voiceAdmissionSchema>;

export const voiceCallSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  id,
  threadId: id,
  anchorMessageId: id.nullable(),
  startedAt: timestamp,
  endedAt: timestamp.nullable(),
  status: z.enum(['connecting', 'active', 'ended', 'failed', 'unknown']),
  transcript: text,
  error: z.string().max(2000).nullable(),
});
export type RuntimeVoiceCall = z.infer<typeof voiceCallSchema>;

/** Accepted compute survives media teardown; it is not yet completed output. */
export const computeReceiptSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  toolCallId: id,
  callId: id,
  operationId: z.uuid(),
  status: z.enum(['accepted', 'completed', 'unknown', 'rejected']),
  text: text.nullable(),
  missionId: id.nullable(),
});
export type RuntimeComputeReceipt = z.infer<typeof computeReceiptSchema>;

/** Only authoritative completed output may be handed to the speech provider. */
export function computeTextToSpeak(receipt: unknown): string | null {
  const parsed = computeReceiptSchema.safeParse(receipt);
  return parsed.success &&
    parsed.data.status === 'completed' &&
    parsed.data.text?.trim()
    ? parsed.data.text
    : null;
}

export const voiceCallsSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  calls: z.array(voiceCallSchema).max(500),
});
