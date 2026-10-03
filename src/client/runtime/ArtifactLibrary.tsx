import { useEffect, useRef, useState } from 'react';
import {
  artifactsSchema,
  type RuntimeArtifact,
} from '../../shared/runtime/artifacts';
import { fetchArtifact } from './artifacts';
import { useResource } from './use-resource';
import { RuntimeStatus } from './RuntimeStatus';
import type { RuntimeConnection } from './use-runtime';
export function ArtifactLibrary({
  connection,
}: {
  connection: RuntimeConnection;
}) {
  const data = useResource(
    '/runtime/artifacts',
    artifactsSchema,
    connection,
    'artifacts',
  );
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [verified, setVerified] = useState('');
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);
  const key = JSON.stringify(connection.setup?.scope);
  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    setSelected(undefined);
    setPreview('');
    setVerified('');
    setError('');
    return () => {
      generation.current++;
      controller.current?.abort();
    };
  }, [key]);
  const retrieve = async (artifact: RuntimeArtifact, download: boolean) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const current = ++generation.current;
    setSelected(`${artifact.id}:${artifact.version}`);
    setBusy(true);
    setError('');
    setVerified('');
    setPreview('');
    try {
      const blob = await fetchArtifact(artifact, abort.signal);
      if (abort.signal.aborted || generation.current !== current) return;
      setVerified(
        `Complete bytes verified · ${artifact.size} bytes · ${artifact.sha256}`,
      );
      if (download) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = artifact.filename.slice(0, 160) || 'artifact';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (
        artifact.mime.startsWith('text/') ||
        artifact.mime === 'application/json'
      ) {
        const text = await blob.text();
        if (generation.current === current) setPreview(text.slice(0, 200000));
      } else
        setPreview(
          'Verified binary file. Download it to inspect with a suitable application.',
        );
    } catch (cause) {
      if (generation.current === current && !abort.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Artifact verification failed.',
        );
    } finally {
      if (generation.current === current) setBusy(false);
    }
  };
  return (
    <section className="result-content" aria-label="Verified artifacts">
      <h2>Artifacts</h2>
      <p>
        Native pages retain one byte authority. Publication and sharing require
        separate approval.
      </p>
      {!connection.available('artifacts') && (
        <RuntimeStatus connection={connection} compact />
      )}
      {(data.error || error) && (
        <p role="alert" className="chat-error">
          {data.error || error}
        </p>
      )}
      {data.data?.truncated && (
        <p className="notice">Only part of the artifact index is shown.</p>
      )}
      {data.data?.artifacts.map((artifact) => (
        <article
          className="source-card"
          key={`${artifact.id}:${artifact.version}`}
        >
          <h3>{artifact.filename}</h3>
          <p>
            {artifact.mime} · {artifact.size} bytes · {artifact.authority} ·{' '}
            {artifact.status}
          </p>
          <small>Version {artifact.version}</small>
          <div>
            <button
              disabled={
                busy || !artifact.authorized || artifact.status !== 'committed'
              }
              onClick={() => void retrieve(artifact, false)}
            >
              Verify and preview source
            </button>
            <button
              disabled={
                busy || !artifact.authorized || artifact.status !== 'committed'
              }
              onClick={() => void retrieve(artifact, true)}
            >
              Verify and download
            </button>
          </div>
        </article>
      ))}
      {selected && (
        <section aria-label="Artifact verification">
          <p role="status">
            {busy ? 'Retrieving and verifying complete bytes…' : verified}
          </p>
          {preview && (
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {preview}
            </pre>
          )}
        </section>
      )}
    </section>
  );
}
