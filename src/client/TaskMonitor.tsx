import { useEffect, useState } from 'react';
import { api } from './api';
import type { ChildRun } from '../shared/hub/types';
export function TaskMonitor({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<ChildRun[]>([]),
    [error, setError] = useState(''),
    [at, setAt] = useState<number>();
  useEffect(() => {
    if (!open) return;
    let active = true;
    const refresh = async () => {
      try {
        const r = await api<{ items: ChildRun[] }>(
          `/runtime/conversations/${encodeURIComponent(conversationId)}/children`,
        );
        if (active) {
          setItems(r.items);
          setError('');
          setAt(Date.now());
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : 'Monitoring unavailable.');
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
  }, [open, conversationId]);
  return (
    <details
      className="task-monitor"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Delegated work</summary>
      <p>Read-only activity. Subagent configuration is unchanged.</p>
      {error && (
        <p role="status">
          {error} {at ? 'Previously loaded results may be stale.' : ''}
        </p>
      )}
      {!error && !items.length && (
        <p>
          {at ? 'No durable child tasks reported.' : 'Loading delegated work…'}
        </p>
      )}
      {items.map((item) => (
        <article key={item.id}>
          <strong>{item.state}</strong>
          <p>{item.task}</p>
          {item.updatedAt && (
            <small>
              Last recorded update: {new Date(item.updatedAt).toLocaleString()}
            </small>
          )}
          {item.result && <p>{item.result}</p>}
          <details>
            <summary>Task details</summary>
            <code>{item.id}</code>
            <p>Parent: {item.parentId}</p>
          </details>
        </article>
      ))}
    </details>
  );
}
