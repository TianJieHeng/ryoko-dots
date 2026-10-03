import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  archivedHistoryLink,
  archivedHistoryLocation,
  historySourcesSchema,
  historyListSchema,
  historyDetailSchema,
  type HistoryDetail,
} from '../../shared/runtime/legacy-history';
import type { z } from 'zod';

export function ArchivedTranscript({ detail }: { detail: HistoryDetail }) {
  return (
    <article aria-label="Imported historical conversation">
      <h2>{detail.conversation.title}</h2>
      <p>
        Imported archive · Read-only · Source completeness has not been
        certified
      </p>
      <p>
        Original source: {detail.conversation.source}
        <br />
        Original conversation ID: {detail.conversation.legacyId}
      </p>
      <a
        href={archivedHistoryLink(
          detail.conversation.source,
          detail.conversation.legacyId,
        )}
      >
        Original conversation link
      </a>
      <p>
        Historical text is untrusted. Tools, approvals and tasks are never
        replayed.
      </p>
      {detail.messages.map((message) => (
        <section
          key={message.id}
          aria-label={`${message.role} historical message`}
        >
          <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {message.text}
          </p>
        </section>
      ))}
      {detail.omittedNonDisplayRecords > 0 && (
        <p>
          {detail.omittedNonDisplayRecords} non-display records retained as
          inert archive evidence
        </p>
      )}
    </article>
  );
}

export function ImportedHistory() {
  const [hash, setHash] = useState(location.hash);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    sources?: z.infer<typeof historySourcesSchema>;
    list?: z.infer<typeof historyListSchema>;
    detail?: HistoryDetail;
    error?: string;
  }>();
  useEffect(() => {
    const navigate = () => {
      setHash(location.hash);
      setOffset(0);
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  const selected = archivedHistoryLocation(hash) ?? {};
  const key = JSON.stringify([selected.source, selected.legacyId, offset]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const path = '/ops/legacy-history';
        const value = !selected.source
          ? {
              sources: historySourcesSchema.parse(
                await api<unknown>(`${path}/sources`),
              ),
            }
          : selected.legacyId
            ? {
                detail: historyDetailSchema.parse(
                  await api<unknown>(
                    `${path}/${encodeURIComponent(selected.legacyId)}?${new URLSearchParams({ source: selected.source, offset: String(offset) })}`,
                  ),
                ),
              }
            : {
                list: historyListSchema.parse(
                  await api<unknown>(
                    `${path}?${new URLSearchParams({ source: selected.source, offset: String(offset) })}`,
                  ),
                ),
              };
        if (active) setResult({ key, ...value });
      } catch (cause) {
        if (active)
          setResult({
            key,
            error:
              cause instanceof Error
                ? cause.message
                : 'Imported history is unavailable.',
          });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [key, selected.source, selected.legacyId, offset]);
  const current = result?.key === key ? result : undefined;
  const next = current?.detail?.nextOffset ?? current?.list?.nextOffset;
  return (
    <main
      className="imported-history"
      style={{ overflow: 'auto', padding: '1.5rem', maxWidth: '100%' }}
    >
      <h1>Imported history</h1>
      <p>
        Read-only records from an operator-supplied archive. This is separate
        from your active conversations.
      </p>
      <nav aria-label="Imported history navigation">
        <a href="#/history">All sources</a>
        {selected.source && (
          <>
            {' '}
            ·{' '}
            <a href={archivedHistoryLink(selected.source)}>{selected.source}</a>
          </>
        )}
      </nav>
      {!current && <p role="status">Loading imported history…</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {current?.sources && (
        <>
          <ul>
            {current.sources.sources.map((source) => (
              <li key={source}>
                <a href={archivedHistoryLink(source)}>{source}</a>
              </li>
            ))}
          </ul>
          {!current.sources.sources.length && (
            <p>No imported conversations are available.</p>
          )}
          {current.sources.truncated && (
            <p>
              Only the first 100 sources are shown. Use a source-qualified
              original link for additional sources.
            </p>
          )}
        </>
      )}
      {current?.list && (
        <>
          <ul>
            {current.list.conversations.map((conversation) => (
              <li key={conversation.id}>
                <a
                  href={archivedHistoryLink(
                    conversation.source,
                    conversation.legacyId,
                  )}
                >
                  {conversation.title || conversation.legacyId}
                </a>
              </li>
            ))}
          </ul>
          {!current.list.conversations.length && (
            <p>No imported conversations are available for this source.</p>
          )}
        </>
      )}
      {current?.detail && <ArchivedTranscript detail={current.detail} />}
      {offset > 0 && (
        <button onClick={() => setOffset(Math.max(0, offset - 100))}>
          Previous page
        </button>
      )}
      {next !== undefined && next !== null && (
        <button onClick={() => setOffset(next)}>Next page</button>
      )}
    </main>
  );
}
