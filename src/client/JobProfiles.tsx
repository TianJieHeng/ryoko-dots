import { useEffect, useState } from 'react';
import { api } from './api';
interface Profile {
  id: string;
  dotId: string;
  name: string;
  instructions: string;
  version: number;
  archived: boolean;
}
export function JobProfiles({ dotId }: { dotId: string }) {
  const [items, setItems] = useState<Profile[]>([]),
    [selected, setSelected] = useState<Profile>(),
    [name, setName] = useState(''),
    [instructions, setInstructions] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setSelected(undefined);
    setName('');
    setInstructions('');
    api<{ items: Profile[] }>('/v1/profiles')
      .then((r) => {
        if (live) setItems(r.items);
      })
      .catch(() => {
        if (live) setError('Could not load job profiles.');
      });
    return () => {
      live = false;
    };
  }, [dotId]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      const id = selected?.id ?? crypto.randomUUID();
      const p = await api<Profile>(`/v1/profiles/${id}`, 'PUT', {
        id,
        dotId,
        name,
        instructions,
        expectedVersion: selected?.version ?? 0,
        archived: false,
      });
      setItems((old) => [...old.filter((i) => i.id !== id), p]);
      setSelected(p);
    } catch {
      setError(
        'Profile was not saved. Reload profiles if another window changed it.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Job profiles</summary>
      <p>
        Profiles reuse this Dot’s runtime, shared workspace and execution
        permissions. Existing jobs retain their original profile version.
      </p>
      <label>
        Profile
        <select
          value={selected?.id ?? ''}
          onChange={(e) => {
            const p = items.find((i) => i.id === e.target.value);
            setSelected(p);
            setName(p?.name ?? '');
            setInstructions(p?.instructions ?? '');
          }}
        >
          <option value="">New profile</option>
          {items
            .filter((p) => p.dotId === dotId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · v{p.version}
              </option>
            ))}
        </select>
      </label>
      <label>
        Profile name
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Job instructions
        <textarea
          value={instructions}
          maxLength={8000}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <p>Keep credentials in private host configuration.</p>
      <button
        disabled={busy || !name.trim() || !dotId}
        onClick={() => void save()}
      >
        Save profile
      </button>
      {selected && (
        <p>
          Profile ID: <code>{selected.id}</code>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
