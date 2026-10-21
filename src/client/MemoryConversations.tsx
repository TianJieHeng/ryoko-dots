import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, RefreshCw } from 'lucide-react';
import { api } from './api';
import type { RuntimeMemoryListResult } from '../shared/runtime/producer/wire.generated';

export function MemoryConversations({
  dotId,
  onOpen,
}: {
  dotId: string;
  onOpen: (id: string) => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<RuntimeMemoryListResult>();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setCatalog(
        await api<RuntimeMemoryListResult>(
          `/runtime/memory-conversations?dotId=${encodeURIComponent(dotId)}`,
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not load conversations.',
      );
    } finally {
      setBusy(false);
    }
  }, [dotId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function open(source: string, sessionId: string) {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ conversation: { id: string } }>(
        '/runtime/memory-conversations/open',
        'POST',
        { dotId, source, sessionId },
      );
      await onOpen(result.conversation.id);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not resume this conversation.',
      );
    } finally {
      setBusy(false);
    }
  }
  const rows =
    catalog?.conversations.filter((row) =>
      `${row.title} ${row.session_id}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) ?? [];
  return (
    <section className="memory-conversations">
      <header>
        <div>
          <h1>Memory conversations</h1>
          <p>Pick up a conversation from your other devices.</p>
        </div>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </header>
      <p className="memory-sync-note">
        {catalog?.notice ?? 'Reading your memory harness…'}
      </p>
      <input
        aria-label="Search memory conversations"
        placeholder="Search conversations"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {busy && <p role="status">Syncing conversation history…</p>}
      {!busy && catalog && !rows.length && <p>No matching conversations.</p>}
      <div className="memory-conversation-list">
        {rows.map((row) => (
          <button
            key={`${row.source}:${row.session_id}`}
            className="memory-conversation-row"
            disabled={busy || !!row.unavailable}
            onClick={() => void open(row.source, row.session_id)}
          >
            <MessageSquare size={20} />
            <span>
              <strong>{row.title}</strong>
              <small>{row.session_id}</small>
              <small>
                {row.unavailable ||
                  `${row.turns ?? '?'} messages · ${row.updated_at ? new Date(row.updated_at * 1000).toLocaleString() : row.source}`}
              </small>
            </span>
            <span className="memory-resume-label">Resume</span>
          </button>
        ))}
      </div>
    </section>
  );
}
