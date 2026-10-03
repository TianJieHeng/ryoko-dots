import { describe, expect, it } from 'vitest';
import { contractVersion } from '../src/shared/runtime/contracts';
import {
  canStartRealtime,
  computeReceiptSchema,
  computeTextToSpeak,
  voiceAdmissionSchema,
  voiceCallSchema,
  voiceProfileSchema,
  type RuntimeComputeReceipt,
  type RuntimeVoiceProfile,
} from '../src/shared/runtime/voice';

const scope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'agent',
  project: null,
  generation: 2,
};
const profile: RuntimeVoiceProfile = {
  version: contractVersion,
  scope,
  mode: 'realtime_webrtc',
  provider: 'openai',
  qualified: true,
  signalProtocol: 'openai_realtime_v1',
  computeAllowed: true,
  maxCallSeconds: 600,
};
const admission = {
  version: contractVersion,
  scope,
  operationId: 'aeeb787b-a57d-45fb-b44f-3b9090fe9fc3',
  callId: 'call',
  sdp: null,
  expiresAt: 100000,
  status: 'unknown',
};
const call = {
  version: contractVersion,
  scope,
  id: 'call',
  threadId: 'thread',
  anchorMessageId: null,
  startedAt: 10000,
  endedAt: null,
  status: 'unknown',
  transcript: '',
  error: null,
};
const compute: RuntimeComputeReceipt = {
  version: contractVersion,
  scope,
  toolCallId: 'tool-call',
  callId: 'call',
  operationId: admission.operationId,
  status: 'accepted',
  text: 'Work is still running',
  missionId: 'mission',
};

describe('runtime voice contracts', () => {
  it('keeps finite local speech separate from qualified realtime media', () => {
    expect(canStartRealtime(profile, scope)).toBe(true);
    expect(canStartRealtime({ ...profile, mode: 'finite_local' }, scope)).toBe(
      false,
    );
    expect(canStartRealtime({ ...profile, mode: 'unavailable' }, scope)).toBe(
      false,
    );
  });

  it('fails closed on unqualified, stale-scope or unsupported media', () => {
    expect(canStartRealtime({ ...profile, qualified: false }, scope)).toBe(
      false,
    );
    expect(
      canStartRealtime({ ...profile, signalProtocol: 'none' }, scope),
    ).toBe(false);
    for (const field of ['owner', 'gateway', 'agent', 'project'] as const) {
      expect(canStartRealtime(profile, { ...scope, [field]: 'other' })).toBe(
        false,
      );
    }
    expect(canStartRealtime(profile, { ...scope, generation: 3 })).toBe(false);
    expect(canStartRealtime(profile, null)).toBe(false);
    expect(canStartRealtime(null, scope)).toBe(false);
  });

  it('retains unknown media outcomes for inspection without inventing admission', () => {
    expect(voiceAdmissionSchema.parse(admission).status).toBe('unknown');
    expect(voiceCallSchema.parse(call).status).toBe('unknown');
    expect(
      voiceAdmissionSchema.safeParse({ ...admission, status: 'admitted' })
        .success,
    ).toBe(false);
    expect(
      voiceAdmissionSchema.safeParse({
        ...admission,
        status: 'admitted',
        sdp: 'v=0\r\n',
      }).success,
    ).toBe(true);
  });

  it('rejects secret fields and invalid payload bounds at the browser boundary', () => {
    for (const [schema, value] of [
      [voiceProfileSchema, profile],
      [voiceAdmissionSchema, admission],
      [voiceCallSchema, call],
      [computeReceiptSchema, compute],
    ] as const) {
      expect(schema.safeParse({ ...value, apiKey: 'secret' }).success).toBe(
        false,
      );
      expect(
        schema.safeParse({ ...value, scope: { ...scope, token: 'secret' } })
          .success,
      ).toBe(false);
    }
    for (const maxCallSeconds of [29, 3601, 30.5]) {
      expect(
        voiceProfileSchema.safeParse({ ...profile, maxCallSeconds }).success,
      ).toBe(false);
    }
    expect(
      voiceAdmissionSchema.safeParse({ ...admission, sdp: 'x'.repeat(100001) })
        .success,
    ).toBe(false);
    expect(
      voiceAdmissionSchema.safeParse({ ...admission, operationId: 'invalid' })
        .success,
    ).toBe(false);
    expect(
      voiceCallSchema.safeParse({ ...call, transcript: 'x'.repeat(20001) })
        .success,
    ).toBe(false);
    expect(
      computeReceiptSchema.safeParse({ ...compute, text: 'x'.repeat(20001) })
        .success,
    ).toBe(false);
  });

  it('speaks only late completed compute, preserving accepted and unknown work', () => {
    for (const status of ['accepted', 'unknown', 'rejected'] as const) {
      expect(computeTextToSpeak({ ...compute, status })).toBeNull();
    }
    expect(computeTextToSpeak({ ...compute, status: 'completed' })).toBe(
      compute.text,
    );
    expect(
      computeTextToSpeak({ ...compute, status: 'completed', text: null }),
    ).toBeNull();
    expect(
      computeTextToSpeak({ ...compute, status: 'completed', text: '   ' }),
    ).toBeNull();
    expect(
      computeReceiptSchema.safeParse({ ...compute, status: 'failed' }).success,
    ).toBe(false);
    expect(computeReceiptSchema.parse(compute).missionId).toBe('mission');
  });
});
