import { z } from 'zod';
import { api } from '../api';
import { sameScope, type RuntimeScope } from '../../shared/runtime/contracts';
import {
  computeReceiptSchema,
  voiceAdmissionSchema,
} from '../../shared/runtime/voice';
const admissionKey = (scope: RuntimeScope, threadId: string) =>
  `ryoko-voice-admission:${JSON.stringify(scope)}:${threadId}`;
export function pendingVoiceAdmission(scope: RuntimeScope, threadId: string) {
  return sessionStorage.getItem(admissionKey(scope, threadId));
}
export async function admitVoice(
  scope: RuntimeScope,
  threadId: string,
  sdp: string,
  anchorMessageId?: string,
) {
  const key = admissionKey(scope, threadId);
  const existing = sessionStorage.getItem(key);
  const operationId = existing ? z.uuid().parse(existing) : crypto.randomUUID();
  if (!existing) sessionStorage.setItem(key, operationId);
  const response = voiceAdmissionSchema.parse(
    await api<unknown>(
      existing
        ? `/runtime/voice/operations/${encodeURIComponent(operationId)}`
        : '/runtime/voice/calls',
      existing ? 'GET' : 'POST',
      existing
        ? undefined
        : {
            operationId,
            threadId,
            sdp,
            anchorMessageId,
            expectedGeneration: scope.generation,
          },
    ),
  );
  if (!sameScope(scope, response.scope) || response.operationId !== operationId)
    throw new Error('Media admission does not match this binding.');
  if (response.status === 'rejected') {
    sessionStorage.removeItem(key);
    throw new Error('Media admission was rejected. No new call was created.');
  }
  if (response.status !== 'admitted' || !response.sdp)
    throw new Error(
      'Media admission is unknown. Inspect the original operation; do not start another call.',
    );
  if (existing)
    throw new Error(
      `Existing media call ${response.callId} requires recovery. End or inspect that call before creating another.`,
    );
  sessionStorage.removeItem(key);
  return response;
}
export async function inspectVoiceAdmission(
  scope: RuntimeScope,
  threadId: string,
) {
  const id = pendingVoiceAdmission(scope, threadId);
  if (!id) return null;
  const response = voiceAdmissionSchema.parse(
    await api(`/runtime/voice/operations/${encodeURIComponent(id)}`),
  );
  if (!sameScope(scope, response.scope) || response.operationId !== id)
    throw new Error('Media receipt scope changed.');
  if (response.status === 'rejected')
    sessionStorage.removeItem(admissionKey(scope, threadId));
  return response;
}
export function clearVoiceAdmission(scope: RuntimeScope, threadId: string) {
  sessionStorage.removeItem(admissionKey(scope, threadId));
}
export async function voiceCompute(
  scope: RuntimeScope,
  callId: string,
  toolCallId: string,
  request: string,
) {
  if (!request.trim() || request.length > 16000 || toolCallId.length > 256)
    throw new Error('Invalid bounded compute request.');
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(request)),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  const key = `ryoko-voice-compute:${JSON.stringify(scope)}:${callId}:${toolCallId}`;
  const stored = sessionStorage.getItem(key);
  const previous = stored
    ? z
        .strictObject({ operationId: z.uuid(), digest: z.string() })
        .parse(JSON.parse(stored))
    : undefined;
  if (previous && previous.digest !== digest)
    throw new Error('Provider compute ID changed its immutable request.');
  const operationId = previous?.operationId ?? crypto.randomUUID();
  if (!previous)
    sessionStorage.setItem(key, JSON.stringify({ operationId, digest }));
  const response = computeReceiptSchema.parse(
    await api(
      previous
        ? `/runtime/voice/compute/operations/${encodeURIComponent(operationId)}`
        : `/runtime/voice/calls/${encodeURIComponent(callId)}/compute`,
      previous ? 'GET' : 'POST',
      previous
        ? undefined
        : {
            operationId,
            toolCallId,
            request,
            intentDigest: digest,
            expectedGeneration: scope.generation,
          },
    ),
  );
  if (
    !sameScope(scope, response.scope) ||
    response.operationId !== operationId ||
    response.callId !== callId ||
    response.toolCallId !== toolCallId
  )
    throw new Error('Compute receipt does not match the call.');
  return response;
}
