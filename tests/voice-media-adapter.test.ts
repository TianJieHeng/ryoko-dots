import { expect, test, vi } from 'vitest';
import { OpenAIRealtimeMedia } from '../src/server/runtime/voice-media.js';
const offer = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111';
const config = {
  enabled: true,
  qualified: true,
  apiKey: 'synthetic-secret',
  model: 'synthetic-model',
};
const signal = () => new AbortController().signal;

test('optional realtime config is disabled/missing/unqualified honestly and never silently chooses another route', async () => {
  const fetcher = vi.fn<typeof fetch>();
  for (const settings of [
    {},
    { enabled: true, qualified: true },
    { enabled: true, apiKey: 'synthetic', model: 'synthetic' },
  ]) {
    const adapter = new OpenAIRealtimeMedia(settings, fetcher);
    expect(adapter.available).toBe(false);
    await expect(
      adapter.begin(offer, '', () => {}, signal()),
    ).rejects.toMatchObject({ outcome: 'rejected' });
  }
  expect(fetcher).not.toHaveBeenCalled();
});

test('real adapter wire is bounded and provider-only; durable control handle is saved before response parsing', async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(offer, {
        headers: {
          location: 'https://api.openai.com/v1/realtime/calls/rtc_wire',
        },
      }),
  );
  const adapter = new OpenAIRealtimeMedia(config, fetcher);
  const handle = vi.fn();
  expect(
    await adapter.begin(offer, 'Untrusted prior text', handle, signal()),
  ).toBe(offer);
  expect(handle).toHaveBeenCalledWith('rtc_wire');
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://api.openai.com/v1/realtime/calls');
  expect(init?.redirect).toBe('error');
  const form = init!.body as FormData;
  const session = JSON.parse(String(form.get('session')));
  expect(session.type).toBe('realtime');
  expect(session.tools.map((tool: { name: string }) => tool.name)).toEqual([
    'ask_compute',
  ]);
  expect(session.instructions).toContain('untrusted reference data');
  expect(session).not.toHaveProperty('apiKey');
  expect(session.max_output_tokens).toBeLessThanOrEqual(1024);
  await adapter.end('rtc_wire');
  expect(fetcher.mock.calls[1][0]).toBe(
    'https://api.openai.com/v1/realtime/calls/rtc_wire/hangup',
  );
});

test('invalid/oversized SDP, foreign provider URLs and aborts never turn uncertain media into a fabricated success', async () => {
  const make = (text: string, location: string) =>
    new OpenAIRealtimeMedia(
      config,
      vi.fn(async () => new Response(text, { headers: { location } })),
    );
  const callback = vi.fn();
  await expect(
    make('invalid', '/v1/realtime/calls/rtc_id').begin(
      offer,
      '',
      callback,
      signal(),
    ),
  ).rejects.toMatchObject({ outcome: 'unknown' });
  expect(callback).toHaveBeenCalledWith('rtc_id');
  await expect(
    make('x'.repeat(100001), '/v1/realtime/calls/rtc_id').begin(
      offer,
      '',
      () => {},
      signal(),
    ),
  ).rejects.toMatchObject({ outcome: 'unknown' });
  await expect(
    make(offer, 'https://foreign.example/v1/realtime/calls/rtc_id').begin(
      offer,
      '',
      () => {},
      signal(),
    ),
  ).rejects.toMatchObject({ outcome: 'unknown' });
  const fetcher = vi.fn<typeof fetch>();
  const adapter = new OpenAIRealtimeMedia(config, fetcher);
  await expect(
    adapter.begin('bad offer', '', () => {}, signal()),
  ).rejects.toMatchObject({ outcome: 'rejected' });
  const aborted = new AbortController();
  aborted.abort();
  await expect(
    adapter.begin(offer, '', () => {}, aborted.signal),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

test('provider rejections and uncertain server/hangup failures remain explicit', async () => {
  for (const [status, outcome] of [
    [429, 'rejected'],
    [500, 'unknown'],
  ] as const) {
    const adapter = new OpenAIRealtimeMedia(
      config,
      vi.fn(
        async () =>
          new Response('reflected synthetic secret must not be returned', {
            status,
          }),
      ),
    );
    await expect(
      adapter.begin(offer, '', () => {}, signal()),
    ).rejects.toMatchObject({
      outcome,
      message: expect.stringContaining(String(status)),
    });
  }
  const adapter = new OpenAIRealtimeMedia(
    config,
    vi.fn(async () => new Response(null, { status: 404 })),
  );
  await expect(adapter.end('rtc_missing')).rejects.toMatchObject({
    outcome: 'unknown',
  });
});
