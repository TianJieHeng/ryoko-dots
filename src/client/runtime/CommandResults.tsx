import { useEffect, useRef, useState } from 'react';
import type { PendingCommand } from '../../shared/runtime/contracts';
import type { RuntimeConnection } from './use-runtime';
import type { ControlAction } from './MissionDetails';
import { recoverCommandPage } from './commands';
import {
  acknowledgeRuntimeResult,
  canRetryRuntimeResult,
  hasPendingDeliveryRetry,
  retryRuntimeResult,
  readRuntimeResult,
  type VerifiedRuntimeResult,
} from './results';

export function CommandResults({
  conversationId,
  connection,
  run,
}: {
  conversationId: string;
  connection: RuntimeConnection;
  run: ControlAction;
}) {
  const [records, setRecords] = useState<PendingCommand[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(true),
    lock = useRef(false);
  const scope = connection.setup?.scope;
  const load = async (next?: string) => {
    if (!scope || lock.current || !active.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const page = await recoverCommandPage(scope, conversationId, next);
      if (!active.current) return;
      setRecords((previous) => {
        const map = new Map(
          (next ? previous : []).map((row) => [row.operationId, row]),
        );
        for (const row of page.commands) map.set(row.operationId, row);
        return [...map.values()].slice(0, 100);
      });
      setCursor(page.nextCursor);
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Saved result references are unavailable.',
        );
    } finally {
      if (active.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
    };
  }, []);
  return (
    <section aria-label="Immutable command results">
      <h3>Immutable command results</h3>
      <p>
        Read committed result bytes independently of mission completion or
        delivery acknowledgment.
      </p>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} onClick={() => void load()}>
        Refresh saved commands
      </button>
      {records
        .filter((row) => row.intent.operation === 'submit')
        .map((row) => (
          <button
            className="task-row"
            key={row.operationId}
            onClick={() => setSelected(row.operationId)}
          >
            <strong>Inspect result for command {row.operationId}</strong>
            <small>
              {row.intent.operation === 'submit'
                ? row.intent.text.slice(0, 160)
                : ''}
            </small>
          </button>
        ))}
      {cursor && records.length < 100 && (
        <button disabled={busy} onClick={() => void load(cursor)}>
          Load older saved commands
        </button>
      )}
      {cursor && records.length >= 100 && (
        <p className="notice">This view is limited to 100 saved commands.</p>
      )}
      {selected && (
        <ResultDetail
          key={selected}
          commandId={selected}
          conversationId={conversationId}
          connection={connection}
          run={run}
        />
      )}
    </section>
  );
}

export function ResultDetail({
  commandId,
  conversationId,
  connection,
  run,
}: {
  commandId: string;
  conversationId: string;
  connection: RuntimeConnection;
  run: ControlAction;
}) {
  const [result, setResult] = useState<VerifiedRuntimeResult>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [retryUnknown, setRetryUnknown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [download, setDownload] = useState('');
  const active = useRef(true),
    lock = useRef(false),
    generation = useRef(0);
  const scope = connection.setup?.scope;
  const load = async () => {
    if (!scope || lock.current || !active.current) return;
    const current = ++generation.current;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await readRuntimeResult(scope, conversationId, commandId);
      if (active.current && current === generation.current) {
        setResult(next);
        setRetryUnknown(hasPendingDeliveryRetry(next));
      }
    } catch (cause) {
      if (active.current && current === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Immutable result is unavailable.',
        );
    } finally {
      if (active.current && current === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      generation.current++;
      lock.current = false;
    };
  }, []);
  useEffect(() => {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([result.artifactBytes], { type: result.artifact.mime }),
    );
    setDownload(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);
  const acknowledge = async (inspectOnly = false) => {
    if (!result || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await acknowledgeRuntimeResult(result, inspectOnly);
      if (!active.current) return;
      const uncertain = response.status !== 'accepted';
      setUnknown(uncertain);
      if (response.delivery)
        setResult((previous) =>
          previous ? { ...previous, delivery: response.delivery } : previous,
        );
      setNotice(
        uncertain
          ? 'Client receipt outcome is unknown. Inspect this original acknowledgment before another attempt.'
          : 'Browser receipt recorded for the verified bytes and displayed text. This does not confirm human reading.',
      );
    } catch (cause) {
      if (active.current) {
        setUnknown(true);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Client receipt outcome is unknown.',
        );
      }
    } finally {
      if (active.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  const retry = async () => {
    if (
      !result ||
      (!retryUnknown && !canRetryRuntimeResult(result)) ||
      lock.current ||
      unknown
    )
      return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await retryRuntimeResult(result, run);
      if (active.current) setRetryUnknown(false);
      if (active.current)
        setNotice(
          'Delivery recovery request recorded. Backoff may delay the notification; inference was not rerun.',
        );
    } catch (cause) {
      if (active.current) setRetryUnknown(true);
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Delivery retry outcome is unknown; inspect the original operation.',
        );
    } finally {
      if (active.current) {
        lock.current = false;
        setBusy(false);
      }
    }
    if (active.current) await load();
  };
  return (
    <section
      className="task-detail-card"
      aria-label="Verified immutable result"
    >
      <h4>Command {commandId}</h4>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button disabled={busy} onClick={() => void load()}>
        Inspect immutable result
      </button>
      {result && (
        <>
          <p>
            Publication: {result.publicationState.replaceAll('_', ' ')} ·{' '}
            {result.artifact.size} verified bytes · SHA-256{' '}
            {result.artifact.sha256}
          </p>
          {result.finalResponse !== null ? (
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {result.finalResponse}
            </pre>
          ) : (
            <p>This result has no final-response text.</p>
          )}
          {download && (
            <a
              href={download}
              download={`${result.artifact.artifactId.replace(/[^A-Za-z0-9_-]/g, '_')}-v${result.artifact.version}.json`}
            >
              Download verified JSON
            </a>
          )}
          {result.delivery && (
            <>
              <p>
                Delivery {result.delivery.delivery_id} ·{' '}
                {result.delivery.state.replaceAll('_', ' ')} · Acknowledgment{' '}
                {result.delivery.acknowledgment_level.replaceAll('_', ' ')}
              </p>
              <p>
                Text {result.delivery.components.text.replaceAll('_', ' ')} ·
                Artifact{' '}
                {result.delivery.components.artifact.replaceAll('_', ' ')}
              </p>
              <p>
                Recording browser receipt confirms complete verified artifact
                bytes reached this browser
                {result.finalResponse !== null
                  ? ' and the text above was rendered'
                  : ''}
                . It does not confirm that a person read them.
              </p>
              {unknown ? (
                <button disabled={busy} onClick={() => void acknowledge(true)}>
                  Inspect original client receipt
                </button>
              ) : (
                <button
                  disabled={
                    busy ||
                    !result.browserReceiptId ||
                    (result.delivery.components.artifact ===
                      'client_received' &&
                      (result.finalResponse === null ||
                        result.delivery.components.text === 'client_received'))
                  }
                  onClick={() => void acknowledge()}
                >
                  Record browser receipt
                </button>
              )}
              {!result.browserReceiptId && (
                <p>
                  No current notification attempt is available to acknowledge.
                  Inspect or explicitly retry this same immutable delivery.
                </p>
              )}
              {(retryUnknown || canRetryRuntimeResult(result)) && (
                <button disabled={busy || unknown} onClick={() => void retry()}>
                  {retryUnknown
                    ? 'Inspect original delivery retry'
                    : 'Retry this immutable delivery only'}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
