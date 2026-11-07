import { useEffect, useState } from 'react';
import { api } from './api';
interface Binding {
  hubOrigin: string;
  projectId: string;
  roomId: string;
  threadId: string;
  state: string;
  lastContact: string;
}
export function CoordinationLink({
  conversationId,
}: {
  conversationId?: string;
}) {
  const [binding, setBinding] = useState<Binding | null>(null);
  useEffect(() => {
    let live = true;
    setBinding(null);
    const refresh = () => {
      if (conversationId)
        api<Binding | null>(`/v1/conversations/${conversationId}/coordination`)
          .then((b) => {
            if (live) setBinding(b);
          })
          .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [conversationId]);
  if (!binding) return null;
  const stale = Date.now() - Date.parse(binding.lastContact) > 120000;
  return (
    <aside aria-label="Build coordination">
      <a
        href={`${binding.hubOrigin}/projects/${binding.projectId}/rooms/${binding.roomId}/threads/${binding.threadId}`}
        target="_blank"
        rel="noreferrer"
      >
        Open build discussion
      </a>
      <p>
        {binding.state.replaceAll('_', ' ')}
        {stale ? ' · bridge contact is stale' : ''}
      </p>
      <details>
        <summary>Coordination connection</summary>
        <p>
          Last verified contact:{' '}
          {new Date(binding.lastContact).toLocaleString()}
        </p>
        <p>
          Use the build participant page to inspect or reconnect delivery.
          Review execution approvals here in Dots.
        </p>
      </details>
    </aside>
  );
}
