import {
  artifactSchema,
  MAX_ARTIFACT_BYTES,
  type RuntimeArtifact,
} from '../../shared/runtime/artifacts';
import { authHeaders, getAuthenticationGeneration } from '../api';

function availableArtifact(meta: RuntimeArtifact): RuntimeArtifact {
  const artifact = artifactSchema.parse(meta);
  if (!artifact.authorized || artifact.status !== 'committed')
    throw new Error('Artifact is not authorized or available.');
  return artifact;
}

/** Never expose partial or unverified bytes to preview/download code. */
export async function verifyArtifactBytes(
  meta: RuntimeArtifact,
  bytes: Uint8Array,
  responseMime: string,
): Promise<Blob> {
  const artifact = availableArtifact(meta);
  if (
    bytes.byteLength !== artifact.size ||
    bytes.byteLength > MAX_ARTIFACT_BYTES
  )
    throw new Error('Artifact size mismatch.');
  const mime = responseMime.split(';', 1)[0].trim().toLowerCase();
  if (mime !== artifact.mime.toLowerCase())
    throw new Error('Artifact MIME mismatch.');
  // Copy before asynchronous hashing so callers cannot mutate verified bytes.
  const completeBytes = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', completeBytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (hex !== artifact.sha256) throw new Error('Artifact digest mismatch.');
  return new Blob([completeBytes], { type: artifact.mime });
}

export async function fetchArtifact(
  meta: RuntimeArtifact,
  signal?: AbortSignal,
  dotId?: string,
): Promise<Blob> {
  const artifact = availableArtifact(meta);
  const generation = getAuthenticationGeneration();
  const checkCurrent = () => {
    if (signal?.aborted)
      throw new DOMException('Artifact request aborted.', 'AbortError');
    if (generation !== getAuthenticationGeneration())
      throw new Error('Authentication changed while loading artifact.');
  };
  checkCurrent();
  const response = await fetch(
    `/api/runtime/artifacts/${encodeURIComponent(artifact.id)}/versions/${encodeURIComponent(artifact.version)}/content${dotId ? `?dotId=${encodeURIComponent(dotId)}` : ''}`,
    {
      credentials: 'same-origin',
      headers: authHeaders(),
      redirect: 'error',
      signal,
    },
  );
  const reader = response.body?.getReader();
  try {
    checkCurrent();
    if (
      !response.ok ||
      response.redirected ||
      response.type === 'opaqueredirect'
    )
      throw new Error('Artifact response is unavailable or redirected.');
    const declaredSize = response.headers.get('content-length');
    if (
      declaredSize !== null &&
      (!/^\d+$/.test(declaredSize) || Number(declaredSize) !== artifact.size)
    )
      throw new Error('Artifact size mismatch.');
    if (!reader) throw new Error('Artifact response has no byte stream.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      checkCurrent();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > artifact.size || size > MAX_ARTIFACT_BYTES)
        throw new Error('Artifact size exceeds its verified limit.');
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const result = await verifyArtifactBytes(
      artifact,
      bytes,
      response.headers.get('content-type') ?? '',
    );
    checkCurrent();
    return result;
  } catch (error) {
    await reader?.cancel().catch(() => {});
    throw error;
  } finally {
    reader?.releaseLock();
  }
}
