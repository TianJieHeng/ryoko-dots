import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/client/api', () => ({ api: request }));
import {
  admitVoice,
  pendingVoiceAdmission,
  voiceCompute,
} from '../src/client/runtime/voice-client';
const scope = {
  owner: 'o',
  gateway: 'g',
  agent: 'a',
  project: null,
  generation: 1,
};
beforeEach(() => {
  const data = new Map<string, string>();
  request.mockReset();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
it('retains unknown media admission identity and inspects rather than replaying an SDP', async () => {
  request.mockRejectedValue(new Error('disconnected'));
  await expect(admitVoice(scope, 'c', 'test-offer')).rejects.toThrow();
  const id = pendingVoiceAdmission(scope, 'c');
  expect(id).toBeTruthy();
  request.mockClear();
  await expect(admitVoice(scope, 'c', 'different-offer')).rejects.toThrow();
  expect(request.mock.calls[0][0]).toBe(`/runtime/voice/operations/${id}`);
  expect(request.mock.calls[0][1]).toBe('GET');
  expect(request.mock.calls[0][2]).toBeUndefined();
});
it('keeps accepted voice compute identity after lost response and rejects changed provider request bytes', async () => {
  request.mockRejectedValue(new Error('lost'));
  await expect(
    voiceCompute(scope, 'call', 'tool', 'Do work'),
  ).rejects.toThrow();
  request.mockClear();
  await expect(
    voiceCompute(scope, 'call', 'tool', 'Do work'),
  ).rejects.toThrow();
  expect(request.mock.calls[0][0]).toMatch(/\/compute\/operations\//);
  expect(request.mock.calls[0][1]).toBe('GET');
  request.mockClear();
  await expect(
    voiceCompute(scope, 'call', 'tool', 'Changed work'),
  ).rejects.toThrow('immutable');
  expect(request).not.toHaveBeenCalled();
});
