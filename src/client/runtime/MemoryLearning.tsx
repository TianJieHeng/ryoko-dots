import { useRef, useState } from 'react';
import {
  canApplyWorkflowAction,
  canMutateMemory,
  learningSchema,
  memorySchema,
} from '../../shared/runtime/agents';
import { useResource } from './use-resource';
import { runtimeAction } from './actions';
import { RuntimeStatus } from './RuntimeStatus';
import type { RuntimeConnection } from './use-runtime';
export function MemoryLearning({
  connection,
}: {
  connection: RuntimeConnection;
}) {
  const memory = useResource(
    '/runtime/memory',
    memorySchema,
    connection,
    'memory',
  );
  const learning = useResource(
    '/runtime/learning',
    learningSchema,
    connection,
    'learning',
  );
  const [tab, setTab] = useState<'memory' | 'learning'>('memory');
  const [text, setText] = useState('');
  const [edit, setEdit] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const scope = connection.setup?.scope;
  const act = async (
    path: string,
    action: string,
    payload: Record<string, unknown>,
    revision: number,
  ) => {
    if (!scope || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await runtimeAction(scope, path, action, payload, revision);
      await Promise.all([memory.reload(), learning.reload()]);
      setText('');
      setEdit(undefined);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Outcome unknown; inspect the original operation.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section aria-label="Scoped memory and Learning">
      <div className="pane-tabs">
        <button onClick={() => setTab('memory')}>Memory</button>
        <button onClick={() => setTab('learning')}>Reviewed Learning</button>
      </div>
      <p>
        Owner {scope?.owner ?? 'unavailable'} · agent{' '}
        {scope?.agent ?? 'unavailable'} · project {scope?.project ?? 'none'}
      </p>
      {(error || memory.error || learning.error) && (
        <p role="alert" className="chat-error">
          {error || memory.error || learning.error}
        </p>
      )}
      {tab === 'memory' ? (
        <>
          {!connection.available('memory') && (
            <RuntimeStatus connection={connection} compact />
          )}
          {memory.data && (
            <>
              <h2>
                {memory.data.backend === 'personal_harness'
                  ? 'Ryoko personal memory'
                  : 'Isolated specialist memory'}
              </h2>
              <p>
                {memory.data.backend} · {memory.data.status}. Harness outage
                never redirects writes to built-in memory.
              </p>
              {memory.data.permissions.read && (
                <div className="memory-grid">
                  {memory.data.entries.map((entry) => (
                    <article className="memory-card" key={entry.id}>
                      <p>{entry.text}</p>
                      <small>Revision {entry.revision}</small>
                      <div>
                        {canMutateMemory(memory.data!, 'write') && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              setText(entry.text);
                              setEdit(entry.id);
                            }}
                          >
                            Edit
                          </button>
                        )}
                        {canMutateMemory(memory.data!, 'delete') && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  'Delete this entry from this agent’s memory backend?',
                                )
                              )
                                void act(
                                  `/runtime/memory/${encodeURIComponent(entry.id)}`,
                                  'delete',
                                  {},
                                  entry.revision,
                                );
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {canMutateMemory(memory.data, 'write') && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const entry = memory.data?.entries.find(
                      (item) => item.id === edit,
                    );
                    void act(
                      edit
                        ? `/runtime/memory/${encodeURIComponent(edit)}`
                        : '/runtime/memory',
                      edit ? 'update' : 'create',
                      { text },
                      entry?.revision ?? 0,
                    );
                  }}
                >
                  <label className="field-label">
                    {edit ? 'Edit scoped memory' : 'Add scoped memory'}
                    <textarea
                      value={text}
                      maxLength={10000}
                      onChange={(event) => setText(event.target.value)}
                      required
                    />
                  </label>
                  <button disabled={busy || !text.trim()}>
                    Save to this backend
                  </button>
                  {edit && (
                    <button
                      type="button"
                      onClick={() => {
                        setEdit(undefined);
                        setText('');
                      }}
                    >
                      Cancel edit
                    </button>
                  )}
                </form>
              )}
              {memory.data.status === 'ready' &&
                memory.data.permissions.read &&
                memory.data.permissions.export && (
                  <button
                    disabled={busy}
                    onClick={() => void act('/runtime/memory', 'export', {}, 0)}
                  >
                    Request verified export
                  </button>
                )}
            </>
          )}
        </>
      ) : (
        <>
          {!connection.available('learning') && (
            <RuntimeStatus connection={connection} compact />
          )}
          <p>
            Legacy enrollment stays frozen until evidence scope is reconciled.
            Skills are separate from private memory.
          </p>
          {learning.data?.workflows.map((workflow) => (
            <article className="task-detail-card" key={workflow.id}>
              <h3>{workflow.name}</h3>
              <p>
                {workflow.stage} · {workflow.status} · version{' '}
                {workflow.version} · revision {workflow.revision}
              </p>
              <p>Immutable digest {workflow.digest}</p>
              <p>
                Publication: {workflow.publicationTarget ?? 'unavailable'} ·
                Delivery: {workflow.deliveryTarget ?? 'unavailable'}
              </p>
              <details>
                <summary>Evidence and immutable draft</summary>
                <ul>
                  {workflow.evidence.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
                <pre
                  style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                >
                  {workflow.content}
                </pre>
                <p>Evaluation: {workflow.evaluation ?? 'Not evaluated'}</p>
              </details>
              <div className="task-controls">
                {workflow.allowedActions.map((action) => (
                  <button
                    key={action}
                    disabled={busy || !canApplyWorkflowAction(workflow, action)}
                    onClick={() => {
                      if (
                        ['approve', 'publish', 'deliver', 'rollback'].includes(
                          action,
                        ) &&
                        !window.confirm(
                          `${action} the displayed immutable workflow version ${workflow.version}? Digest ${workflow.digest}`,
                        )
                      )
                        return;
                      void act(
                        `/runtime/learning/${encodeURIComponent(workflow.id)}/actions`,
                        action,
                        {
                          version: workflow.version,
                          digest: workflow.digest,
                          previousVersion: workflow.previousVersion,
                        },
                        workflow.revision,
                      );
                    }}
                  >
                    {action === 'rollback'
                      ? `Rollback to ${workflow.previousVersion ?? 'unavailable'}`
                      : action}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
