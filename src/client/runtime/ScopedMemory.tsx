import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { RuntimeScope } from '../../shared/runtime/contracts';
import {
  canUseIdentityMemory,
  memoryStatusSchema,
  memoryListSchema,
  memoryRecordSchema,
  type AgentSession,
  type IdentityMemoryRecord,
  type IdentityReceipt,
  type IdentityAction,
} from '../../shared/runtime/identity';
import {
  exportIdentityMemory,
  readIdentity,
  requireAccepted,
} from './identity-client';
import { useIdentityResource } from './use-identity-resource';

export type IdentityRun = (
  action: IdentityAction,
  payload: Record<string, unknown>,
  scope: RuntimeScope,
  inspectOnly?: boolean,
) => Promise<IdentityReceipt>;
export function ScopedMemory({
  scope,
  conversationId,
  session,
  ready,
  busy,
  run,
}: {
  scope: RuntimeScope;
  conversationId: string;
  session?: AgentSession;
  ready: boolean;
  busy: boolean;
  run: IdentityRun;
}) {
  const alive = useRef(true);
  const localAbort = useRef(new AbortController());
  useEffect(() => {
    alive.current = true;
    localAbort.current = new AbortController();
    return () => {
      alive.current = false;
      localAbort.current.abort();
    };
  }, []);
  const status = useIdentityResource(
    { ...scope, project: null },
    conversationId,
    'memory.status',
    {},
    memoryStatusSchema,
    ready,
  );
  const canRead = canUseIdentityMemory(session, status.data, 'recall');
  const [offset, setOffset] = useState(0);
  const records = useIdentityResource(
    scope,
    conversationId,
    'memory.list',
    { project_id: scope.project, include_deleted: false, offset, limit: 50 },
    memoryListSchema.refine(
      (value) =>
        value.records.every(
          (row) =>
            row.owner_agent_id === scope.agent &&
            (row.scope === 'individual' ||
              (scope.project !== null &&
                row.scope === `project:${scope.project}`)),
        ),
      'Memory record owner or project does not match selection',
    ),
    ready && canRead,
  );
  const [editing, setEditing] = useState<IdentityMemoryRecord>();
  const [recordId, setRecordId] = useState('');
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const [inspected, setInspected] = useState<IdentityMemoryRecord>();
  const writable = ready && canUseIdentityMemory(session, status.data, 'write');
  const disabled = busy || localBusy;
  const mutate = async (
    action: 'memory.write' | 'memory.delete',
    record?: IdentityMemoryRecord,
  ) => {
    setNote('');
    try {
      const payload =
        action === 'memory.delete'
          ? { record_id: record!.record_id, expected_version: record!.version }
          : {
              record_id: editing?.record_id ?? recordId,
              expected_version: editing?.version ?? 0,
              content,
              target: editing?.target ?? 'memory',
              kind: editing?.kind ?? 'stated_fact',
              source_ref: editing?.source_ref ?? 'owner:explicit',
              scope:
                editing?.scope ??
                (scope.project ? `project:${scope.project}` : 'individual'),
            };
      const receipt = await run(action, payload, scope);
      const result = z
        .object({
          outcome: z.union([
            z.object({
              success: z.literal(true),
              record: memoryRecordSchema,
              acknowledged_version: z.number().int(),
              revision: z.number().int(),
            }),
            z.object({
              success: z.literal(false),
              code: z.literal('version_conflict'),
              expected_version: z.number().int(),
              current_version: z.number().int(),
            }),
          ]),
        })
        .parse(requireAccepted(receipt));
      if (!result.outcome.success) {
        setNote(
          `Version conflict: expected ${result.outcome.expected_version}, current ${result.outcome.current_version}. Refresh and review before editing again.`,
        );
        return;
      }
      if (result.outcome.record.owner_agent_id !== scope.agent)
        throw new Error('Memory mutation returned another owner.');
      setNote(
        `Recorded version ${result.outcome.acknowledged_version}. ${action === 'memory.delete' ? 'Deletion is a tombstone, not physical erasure.' : ''}`,
      );
      setEditing(undefined);
      setContent('');
      setRecordId('');
      await records.reload();
    } catch (cause) {
      setNote(
        cause instanceof Error
          ? cause.message
          : 'Memory operation unavailable.',
      );
    }
  };
  return (
    <section aria-label="Assigned memory backend">
      <h2>
        {session?.role === 'primary'
          ? 'Primary personal memory'
          : 'Isolated specialist memory'}
      </h2>
      <p>
        Agent {scope.agent} · project {scope.project ?? 'individual'} · backend{' '}
        {status.data?.health.backend ??
          session?.memory_backend ??
          'unavailable'}
      </p>
      <p role="status">
        {status.data?.health.status ?? 'unavailable'}
        {status.data?.health.reason_code
          ? ` · ${status.data.health.reason_code}`
          : ''}
      </p>
      <p>
        Harness outages never redirect reads or writes to another store. Sharing
        a project does not share an agent’s private memory.
      </p>
      {session?.role === 'primary' && (
        <p className="notice">
          The personal harness has no supported owner record mutation, delete or
          export route in this contract. Configure the actual harness to use it;
          built-in controls cannot certify personal-memory erasure.
        </p>
      )}
      {(status.error || records.error) && (
        <p role="alert">{status.error || records.error}</p>
      )}
      <button
        disabled={!ready || disabled}
        onClick={() => void Promise.all([status.reload(), records.reload()])}
      >
        Refresh memory status
      </button>
      {records.data && (
        <p>
          Snapshot revision {records.data.revision} · {records.data.total}{' '}
          records · page starting at {records.data.offset}
        </p>
      )}
      <div className="memory-grid">
        {records.data?.records.map((record) => (
          <article
            className="memory-card"
            key={`${record.record_id}:${record.version}`}
          >
            <p>{record.content}</p>
            <small>
              {record.record_id} · version {record.version} · {record.kind} ·{' '}
              {record.validity}
            </small>
            <p>
              Owner {record.owner_agent_id} · namespace {record.namespace_id} ·{' '}
              {record.scope}
            </p>
            <button
              disabled={disabled}
              onClick={() => {
                setLocalBusy(true);
                setNote('');
                void readIdentity(
                  scope,
                  conversationId,
                  'memory.get',
                  { record_id: record.record_id, version: record.version },
                  z.strictObject({ record: memoryRecordSchema }),
                  localAbort.current.signal,
                )
                  .then((result) => {
                    if (
                      result.record.owner_agent_id !== scope.agent ||
                      result.record.record_id !== record.record_id ||
                      result.record.version !== record.version
                    )
                      throw new Error(
                        'Memory detail differs from the selected owner or version.',
                      );
                    if (alive.current) setInspected(result.record);
                  })
                  .catch((cause) => setNote(String(cause.message ?? cause)))
                  .finally(() => setLocalBusy(false));
              }}
            >
              Inspect this version
            </button>
            {writable && status.data?.capabilities.supersede && (
              <button
                disabled={disabled}
                onClick={() => {
                  setEditing(record);
                  setContent(record.content ?? '');
                  setRecordId(record.record_id);
                }}
              >
                Edit exact version
              </button>
            )}
            {canUseIdentityMemory(session, status.data, 'delete') && (
              <button
                disabled={disabled}
                onClick={() => {
                  if (
                    window.confirm(
                      `Tombstone ${record.record_id} version ${record.version} in this specialist’s backend? This is not physical erasure.`,
                    )
                  )
                    void mutate('memory.delete', record);
                }}
              >
                Delete exact version
              </button>
            )}
          </article>
        ))}
      </div>
      {records.data && (
        <div>
          <button
            disabled={disabled || offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Previous memory page
          </button>
          <button
            disabled={disabled || !records.data.has_more}
            onClick={() => setOffset(records.data!.next_offset)}
          >
            Next memory page
          </button>
        </div>
      )}
      {inspected && (
        <details open>
          <summary>Recorded provenance and version</summary>
          <pre className="identity-json">
            {JSON.stringify(inspected, null, 2)}
          </pre>
        </details>
      )}
      {writable && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void mutate('memory.write');
          }}
        >
          <label className="field-label">
            Record ID
            <input
              value={recordId}
              disabled={!!editing}
              required
              maxLength={256}
              onChange={(event) => setRecordId(event.target.value)}
            />
          </label>
          <label className="field-label">
            {editing
              ? `Correction of version ${editing.version}`
              : 'Explicit memory'}
            <textarea
              value={content}
              required
              maxLength={20000}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>
          <button disabled={disabled || !content.trim() || !recordId.trim()}>
            Save to this specialist’s backend
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(undefined);
                setContent('');
                setRecordId('');
              }}
            >
              Cancel correction
            </button>
          )}
        </form>
      )}
      {canUseIdentityMemory(session, status.data, 'export') && (
        <button
          disabled={disabled}
          onClick={() => {
            setLocalBusy(true);
            setNote('');
            void exportIdentityMemory(
              scope,
              conversationId,
              localAbort.current.signal,
            )
              .then((result) => {
                if (!alive.current) return;
                const url = URL.createObjectURL(result.blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `memory-${scope.agent}.json`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setNote(
                  `Complete export verified · revision ${result.revision} · SHA-256 ${result.sha256}. Deletions remain tombstones.`,
                );
              })
              .catch((cause) => setNote(String(cause.message ?? cause)))
              .finally(() => setLocalBusy(false));
          }}
        >
          Download verified scoped export
        </button>
      )}
      {note && <p role="status">{note}</p>}
    </section>
  );
}
