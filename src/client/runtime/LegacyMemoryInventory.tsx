import { useState } from 'react';
import { legacyMemoryInventorySchema } from '../../shared/runtime/identity';
import { useResource } from './use-resource';
import type { RuntimeConnection } from './use-runtime';

export function LegacyMemoryInventory({
  connection,
  dotId,
}: {
  connection: RuntimeConnection;
  dotId: string;
}) {
  const [offset, setOffset] = useState(0);
  const data = useResource(
    `/runtime/identity/legacy-memory?dotId=${encodeURIComponent(dotId)}&offset=${offset}`,
    legacyMemoryInventorySchema,
    connection,
    'specialists',
    !!dotId,
  );
  return (
    <details>
      <summary>Review legacy global memory inventory</summary>
      <p>
        These original records are read-only migration evidence. No global
        preference injection, automatic import or cross-agent distribution is
        enabled. The personal harness is not a supported migration destination.
      </p>
      {data.error && <p role="alert">{data.error}</p>}
      {data.data && (
        <p>
          {data.data.sourceCount} original records · inventory{' '}
          {data.data.inventoryComplete ? 'complete' : 'incomplete'}
        </p>
      )}
      {data.data?.records.map((row) => (
        <article className="memory-card" key={row.id}>
          <p>
            {row.sourceRef} · {row.byteCount} bytes · SHA-256{' '}
            {row.contentDigest}
          </p>
          {row.content !== null ? (
            <pre className="identity-json">{row.content}</pre>
          ) : (
            <p>Original content unavailable: {row.unavailableReason}</p>
          )}
          <p>
            Read-only · destination review required · enrollment not authorized
          </p>
        </article>
      ))}
      <button
        disabled={data.loading || offset === 0}
        onClick={() => setOffset(Math.max(0, offset - 20))}
      >
        Previous legacy records
      </button>
      <button
        disabled={
          data.loading || !data.data?.hasMore || data.data.nextOffset === null
        }
        onClick={() => setOffset(data.data?.nextOffset ?? offset)}
      >
        Next legacy records
      </button>
    </details>
  );
}
