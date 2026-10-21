import { useEffect, useState } from 'react';
import { api } from './api';
import type { HubRun } from '../shared/hub/types';
type Entry = HubRun & { dotId: string; dotName: string };
export function AgentActivity() {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<Entry[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let active = true;
    const refresh = async () => {
      try {
        const r = await api<{ items: Entry[]; nextCursor: string | null }>(
          '/v1/runs',
        );
        if (active) {
          setItems(r.items);
          setCursor(r.nextCursor);
          setError('');
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : 'Activity unavailable.');
      }
    };
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [open]);
  return (
    <details
      className="agent-activity"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Recent work across Dots</summary>
      {error && <p role="status">{error}</p>}
      <ul>
        {items.map((r) => (
          <li key={r.id}>
            <strong>{r.dotName}</strong> · {r.state.replaceAll('_', ' ')}
            <p>{r.text}</p>
            <small>{new Date(r.updatedAt).toLocaleString()}</small>
          </li>
        ))}
      </ul>
      {!items.length && !error && (
        <p>No tasks reported through the multi-Dot workspace yet.</p>
      )}
      {cursor && (
        <button
          onClick={() => {
            void api<{ items: Entry[]; nextCursor: string | null }>(
              '/v1/runs?cursor=' + encodeURIComponent(cursor),
            )
              .then((r) => {
                setItems((old) => [...old, ...r.items]);
                setCursor(r.nextCursor);
              })
              .catch((e) => setError(e.message));
          }}
        >
          Older work
        </button>
      )}
    </details>
  );
}
