import { afterEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ generation: 0 }));
vi.mock('../src/client/api', () => ({
  getAuthenticationGeneration: () => auth.generation,
  authHeaders: () => ({}),
}));
import {
  fetchArtifact,
  verifyArtifactBytes,
} from '../src/client/runtime/artifacts';
import {
  artifactSchema,
  artifactsSchema,
  MAX_ARTIFACT_BYTES,
  type RuntimeArtifact,
} from '../src/shared/runtime/artifacts';
import { contractVersion } from '../src/shared/runtime/contracts';
const bytes = new TextEncoder().encode('hello');
const artifact: RuntimeArtifact = {
  id: 'artifact-1',
  version: 'immutable-v1',
  filename: 'hello.txt',
  mime: 'text/plain',
  size: 5,
  sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  authority: 'runtime-registered',
  status: 'committed',
  authorized: true,
};
afterEach(() => {
  vi.unstubAllGlobals();
  auth.generation = 0;
});

it('accepts complete verified bytes and fixes the resulting Blob bytes', async () => {
  const mutable = new Uint8Array(bytes);
  const promise = verifyArtifactBytes(
    artifact,
    mutable,
    'text/plain; charset=utf-8',
  );
  mutable.fill(0);
  const blob = await promise;
  expect(blob.type).toBe('text/plain');
  expect(await blob.text()).toBe('hello');
});
it('rejects incorrect size, MIME and digest', async () => {
  await expect(
    verifyArtifactBytes(artifact, bytes.subarray(1), 'text/plain'),
  ).rejects.toThrow('size');
  await expect(
    verifyArtifactBytes(artifact, bytes, 'text/html'),
  ).rejects.toThrow('MIME');
  await expect(
    verifyArtifactBytes(
      { ...artifact, sha256: '0'.repeat(64) },
      bytes,
      'text/plain',
    ),
  ).rejects.toThrow('digest');
});
it('rejects unavailable, validating and unauthorized artifacts before fetching', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  for (const meta of [
    { ...artifact, authorized: false },
    { ...artifact, status: 'unavailable' as const },
    { ...artifact, status: 'validating' as const },
  ])
    await expect(fetchArtifact(meta)).rejects.toThrow(
      'authorized or available',
    );
  expect(fetcher).not.toHaveBeenCalled();
});
it('strictly bounds metadata and its scope-bound list', () => {
  expect(Object.isFrozen(artifactSchema.parse(artifact))).toBe(true);
  for (const meta of [
    { ...artifact, url: 'https://evil.test' },
    { ...artifact, size: MAX_ARTIFACT_BYTES + 1 },
    { ...artifact, size: -1 },
    { ...artifact, sha256: artifact.sha256.toUpperCase() },
    { ...artifact, id: '..' },
  ])
    expect(artifactSchema.safeParse(meta).success).toBe(false);
  const envelope = {
    version: contractVersion,
    scope: {
      owner: 'o',
      gateway: 'g',
      agent: 'a',
      project: null,
      generation: 1,
    },
    artifacts: [artifact],
    truncated: false,
  };
  expect(artifactsSchema.safeParse(envelope).success).toBe(true);
  expect(
    artifactsSchema.safeParse({
      ...envelope,
      artifacts: Array(101).fill(artifact),
    }).success,
  ).toBe(false);
  expect(
    artifactsSchema.safeParse({
      ...envelope,
      scope: { ...envelope.scope, secret: true },
    }).success,
  ).toBe(false);
});
it('uses an authenticated immutable same-origin path and rejects revoked or aborted reads', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(bytes, { headers: { 'content-type': 'text/plain' } }),
  );
  vi.stubGlobal('fetch', fetcher);
  expect(await (await fetchArtifact(artifact)).text()).toBe('hello');
  expect(fetcher).toHaveBeenCalledWith(
    '/api/runtime/artifacts/artifact-1/versions/immutable-v1/content',
    expect.objectContaining({
      credentials: 'same-origin',
      redirect: 'error',
      headers: {},
    }),
  );
  fetcher.mockImplementation(async () => {
    auth.generation++;
    return new Response(bytes);
  });
  await expect(fetchArtifact(artifact)).rejects.toThrow(
    'Authentication changed',
  );
  const controller = new AbortController();
  controller.abort();
  await expect(fetchArtifact(artifact, controller.signal)).rejects.toThrow(
    'aborted',
  );
});
it('rejects oversized streams, non-OK and redirected responses', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array(6))),
  );
  await expect(fetchArtifact(artifact)).rejects.toThrow('exceeds');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 403 })),
  );
  await expect(fetchArtifact(artifact)).rejects.toThrow('unavailable');
  const redirected = new Response(bytes);
  Object.defineProperty(redirected, 'redirected', { value: true });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => redirected),
  );
  await expect(fetchArtifact(artifact)).rejects.toThrow('redirected');
});

it('rejects authentication revocation during the byte stream', async () => {
  let part = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (part++ === 0) controller.enqueue(bytes.subarray(0, 2));
      else {
        auth.generation++;
        controller.enqueue(bytes.subarray(2));
        controller.close();
      }
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(stream, { headers: { 'content-type': 'text/plain' } }),
    ),
  );
  await expect(fetchArtifact(artifact)).rejects.toThrow(
    'Authentication changed',
  );
});

it('carries the selected Dot into the authenticated immutable content read', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(bytes, {
        headers: {
          'content-type': artifact.mime,
          'content-length': String(bytes.length),
        },
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  expect(
    await (await fetchArtifact(artifact, undefined, 'dot / selected')).text(),
  ).toBe('hello');
  expect(fetcher).toHaveBeenCalledWith(
    '/api/runtime/artifacts/artifact-1/versions/immutable-v1/content?dotId=dot%20%2F%20selected',
    expect.objectContaining({ credentials: 'same-origin', redirect: 'error' }),
  );
});
