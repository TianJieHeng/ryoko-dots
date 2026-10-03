import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { RuntimeScope } from '../../shared/runtime/contracts';
import {
  evidenceListSchema,
  identityWorkflowsSchema,
  identityWorkflowSchema,
  identityDeliveriesSchema,
  specialistCatalogSchema,
  identityMethods,
  type IdentityWorkflow,
  type IdentityReview,
  type IdentityAction,
} from '../../shared/runtime/identity';
import {
  canonicalIdentity,
  readIdentity,
  presentIdentityReview,
  requireAccepted,
} from './identity-client';
import { useIdentityResource } from './use-identity-resource';
import { IdentityReviewCard } from './IdentityReview';
import type { IdentityRun } from './ScopedMemory';

export function draftDefinition(projectId: string) {
  return {
    workflow_id: 'new-workflow',
    version: 1,
    project_id: projectId,
    input_schema: {
      type: 'object',
      properties: { topic: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['topic'],
      additionalProperties: false,
    },
    steps: [
      {
        step_id: 'render',
        kind: 'render_markdown',
        depends_on: [],
        parameters: { template: '# Summary\n${input.topic}\n' },
      },
    ],
    output_schema: { required_sections: ['Summary'], min_bytes: 1 },
    capability_requirements: ['artifact_read', 'artifact_write'],
    environment_manifest: { adapter: 'local_deterministic_v1' },
    provenance: { kind: 'manual', source_refs: [], private_derived: false },
    predecessor: null,
    template_ref: null,
  };
}
export function parseWorkflowDefinition(input: string, projectId: string) {
  const value = z
    .object({
      project_id: z.literal(projectId),
      workflow_id: z.string().min(1),
      version: z.number().int().positive(),
      input_schema: z.record(z.string(), z.unknown()),
      steps: z
        .array(z.object({ kind: z.enum(['render_markdown', 'domain']) }))
        .min(1)
        .max(16),
      provenance: z.object({
        kind: z.enum(['manual', 'accepted_mission', 'demonstration']),
        source_refs: z.array(z.unknown()),
        private_derived: z.boolean(),
      }),
      environment_manifest: z.strictObject({
        adapter: z.literal('local_deterministic_v1'),
      }),
      capability_requirements: z.array(
        z.enum(['artifact_read', 'artifact_write']),
      ),
    })
    .passthrough()
    .parse(JSON.parse(input));
  // Preserve the exact finite definition; the producer performs full schema, provenance and DAG validation.
  if (new TextEncoder().encode(input).length > 128 * 1024)
    throw new Error('Finite workflow exceeds 128 KiB.');
  if (
    value.provenance.kind === 'demonstration' &&
    !('consent_ref' in JSON.parse(input).provenance)
  )
    throw new Error(
      'Demonstration requires an explicit versioned consent_ref.',
    );
  return canonicalIdentity(JSON.parse(input));
}
export function parseEvaluationCases(input: string) {
  const value = z
    .array(
      z.strictObject({
        case_id: z.string().min(1),
        split: z.enum(['tuning', 'held_out']),
        parameters: z.record(z.string(), z.unknown()),
        expected_sha256: z.string().regex(/^[a-f0-9]{64}$/),
        generalist_ref: z.strictObject({
          artifact_id: z.string().min(1),
          version: z.number().int().positive(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      }),
    )
    .min(4)
    .max(16)
    .parse(JSON.parse(input));
  if (
    value.filter((row) => row.split === 'tuning').length < 2 ||
    value.filter((row) => row.split === 'held_out').length < 2 ||
    new Set(value.map((row) => row.case_id)).size !== value.length ||
    new Set(value.map((row) => canonicalIdentity(row.parameters))).size !==
      value.length
  )
    throw new Error(
      'Use varied unique cases with at least two tuning and two held-out examples.',
    );
  return canonicalIdentity(value);
}

export function ReviewedLearning({
  scope,
  conversationId,
  ready,
  busy: parentBusy,
  run,
}: {
  scope: RuntimeScope;
  conversationId: string;
  ready: boolean;
  busy: boolean;
  run: IdentityRun;
}) {
  const [localBusy, setLocalBusy] = useState(false);
  const localLock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const busy = parentBusy || localBusy;
  const project = scope.project ?? '';
  const enabled = ready && !!project;
  const evidence = useIdentityResource(
    scope,
    conversationId,
    'evidence.list',
    { project_id: project, limit: 100 },
    evidenceListSchema.refine((value) =>
      value.evidence.every((row) => row.project_id === project),
    ),
    enabled,
  );
  const workflows = useIdentityResource(
    scope,
    conversationId,
    'workflows.list',
    { project_id: project },
    identityWorkflowsSchema.refine((value) =>
      value.workflows.every((row) => row.project_id === project),
    ),
    enabled,
  );
  const catalog = useIdentityResource(
    scope,
    conversationId,
    'specialists.catalog',
    { project_id: project },
    specialistCatalogSchema,
    enabled,
  );
  const [definition, setDefinition] = useState(() =>
    JSON.stringify(draftDefinition(project), null, 2),
  );
  const [template, setTemplate] = useState(() =>
    JSON.stringify(
      {
        template_id: 'new-template',
        version: 1,
        project_id: project,
        style: '',
        sections: ['Summary'],
        predecessor: null,
      },
      null,
      2,
    ),
  );
  const [selected, setSelected] = useState<IdentityWorkflow>();
  const [cases, setCases] = useState('[]');
  const [evaluation, setEvaluation] = useState('');
  const [feedback, setFeedback] = useState('{}');
  const [review, setReview] = useState<IdentityReview>();
  const [note, setNote] = useState('');
  const [anchorId, setAnchorId] = useState('');
  const [sourceType, setSourceType] = useState('artifact');
  const [sourceId, setSourceId] = useState('');
  const [sourceVersion, setSourceVersion] = useState('1');
  const [annotation, setAnnotation] = useState('');
  const [lookupId, setLookupId] = useState('');
  const [lookupVersion, setLookupVersion] = useState('1');
  const [target, setTarget] = useState('');
  const [mission, setMission] = useState('');
  const [missionRevision, setMissionRevision] = useState('0');
  const [parameters, setParameters] = useState('{}');
  const deliveries = useIdentityResource(
    scope,
    conversationId,
    'workflows.deliver.list',
    { project_id: project, specialist_id: target },
    identityDeliveriesSchema.refine((value) =>
      value.deliveries.every(
        (row) => row.project_id === project && row.specialist_id === target,
      ),
    ),
    enabled && !!target,
  );
  const guarded = async (work: () => Promise<void>) => {
    if (localLock.current || !alive.current) return;
    localLock.current = true;
    setLocalBusy(true);
    setNote('');
    try {
      await work();
    } catch (cause) {
      if (alive.current)
        setNote(
          cause instanceof Error
            ? cause.message
            : 'Workflow operation unavailable.',
        );
    } finally {
      localLock.current = false;
      if (alive.current) setLocalBusy(false);
    }
  };
  const prepare = async (
    action: IdentityAction,
    payload: Record<string, unknown>,
  ) => {
    const receipt = await run(action, payload, scope);
    requireAccepted(receipt);
    setReview(
      await presentIdentityReview(
        scope,
        conversationId,
        receipt,
        identityMethods[action],
      ),
    );
  };
  const pin = (workflow: IdentityWorkflow) => ({
    project_id: workflow.project_id,
    workflow_id: workflow.workflow_id,
    version: workflow.version,
    sha256: workflow.sha256,
  });
  const refresh = async () => {
    await Promise.all([
      workflows.reload(),
      evidence.reload(),
      deliveries.reload(),
    ]);
    if (selected) {
      const value = await readIdentity(
        scope,
        conversationId,
        'workflows.get',
        {
          project_id: selected.project_id,
          workflow_id: selected.workflow_id,
          version: selected.version,
        },
        z.object({ workflow: identityWorkflowSchema }),
      );
      setSelected(value.workflow);
    }
  };
  const latestDelivery = (workflowId: string) =>
    deliveries.data?.deliveries
      .filter((row) => row.workflow_id === workflowId)
      .reduce((max, row) => Math.max(max, row.delivery_revision), 0) ?? 0;
  return (
    <section aria-label="Reviewed workflow lifecycle">
      <h2>Reviewed Learning</h2>
      <p>
        Explicit project evidence → immutable finite draft → evaluated cases →
        exact decision → publication → version-pinned specialist delivery
      </p>
      <p>
        Personal memory and private transcripts are never enrolled
        automatically. Source-derived workflows need explicit provenance;
        demonstration requires versioned consent. Evidence labels grant no
        execution authority.
      </p>
      {!project && (
        <p className="notice">
          Choose an explicitly granted project to use these controls.
        </p>
      )}
      {(evidence.error ||
        workflows.error ||
        deliveries.error ||
        catalog.error) && (
        <p role="alert">
          {evidence.error ||
            workflows.error ||
            deliveries.error ||
            catalog.error}
        </p>
      )}
      <button disabled={!enabled || busy} onClick={() => void guarded(refresh)}>
        Refresh project evidence and workflows
      </button>
      <details open>
        <summary>Explicit evidence anchors</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void guarded(async () => {
              const source_ref =
                sourceType === 'artifact'
                  ? {
                      artifact_id: sourceId,
                      version: z
                        .number()
                        .int()
                        .positive()
                        .parse(Number(sourceVersion)),
                    }
                  : sourceType === 'capture'
                    ? { capture_id: sourceId }
                    : { approval_id: sourceId };
              requireAccepted(
                await run(
                  'evidence.create',
                  {
                    project_id: project,
                    anchor_id: anchorId,
                    kind:
                      sourceType === 'artifact'
                        ? 'artifact_version'
                        : sourceType === 'approval'
                          ? 'approval'
                          : 'source_id',
                    source_ref,
                    source_version: sourceVersion,
                    authority: 'observed',
                    validity: 'unverified',
                    annotation,
                  },
                  scope,
                ),
              );
              setNote(
                'Explicit evidence anchor recorded. Its validity and provenance still require review.',
              );
              await evidence.reload();
            });
          }}
        >
          <label className="field-label">
            Anchor ID
            <input
              required
              maxLength={256}
              value={anchorId}
              onChange={(e) => setAnchorId(e.target.value)}
            />
          </label>
          <label className="field-label">
            Source type
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
            >
              <option value="artifact">Versioned artifact</option>
              <option value="capture">Source capture</option>
              <option value="approval">Approval</option>
            </select>
          </label>
          <label className="field-label">
            Exact source ID
            <input
              required
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            />
          </label>
          <label className="field-label">
            Source version
            <input
              required
              value={sourceVersion}
              onChange={(e) => setSourceVersion(e.target.value)}
            />
          </label>
          <label className="field-label">
            Annotation
            <textarea
              value={annotation}
              maxLength={2000}
              onChange={(e) => setAnnotation(e.target.value)}
            />
          </label>
          <button disabled={!enabled || busy}>
            Record this explicit source
          </button>
        </form>
        {evidence.data?.evidence.map((row) => (
          <article className="source-card" key={row.anchor_id}>
            <h4>{row.anchor_id}</h4>
            <p>
              {row.authority} · {row.effective_validity} · {row.annotation}
            </p>
            <pre className="identity-json">{JSON.stringify(row, null, 2)}</pre>
          </article>
        ))}
        {evidence.data && (
          <p>Bounded evidence list; not a complete project inventory.</p>
        )}
      </details>
      <details open>
        <summary>Create an immutable finite draft</summary>
        <p>
          Only installed local deterministic steps are supported. This
          definition is data, not arbitrary executable skill text. List exact
          artifact IDs, versions and SHA-256 values in provenance.source_refs
          when using evidence.
        </p>
        <label className="field-label">
          Finite workflow definition JSON
          <textarea
            rows={14}
            maxLength={131072}
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
          />
        </label>
        <button
          disabled={!enabled || busy}
          onClick={() =>
            void guarded(async () => {
              const value = z
                .object({ workflow: identityWorkflowSchema })
                .parse(
                  requireAccepted(
                    await run(
                      'workflows.create',
                      {
                        definition_json: parseWorkflowDefinition(
                          definition,
                          project,
                        ),
                      },
                      scope,
                    ),
                  ),
                );
              setSelected(value.workflow);
              await workflows.reload();
              setNote(
                'Immutable draft recorded. Evaluation and approval are separate.',
              );
            })
          }
        >
          Create this draft version
        </button>
        <details>
          <summary>Create a reusable style template</summary>
          <label className="field-label">
            Finite template JSON
            <textarea
              rows={7}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
          </label>
          <button
            disabled={!enabled || busy}
            onClick={() =>
              void guarded(async () => {
                const value = JSON.parse(template);
                if (value.project_id !== project)
                  throw new Error('Template project differs from selection.');
                requireAccepted(
                  await run(
                    'workflows.template',
                    { definition_json: canonicalIdentity(value) },
                    scope,
                  ),
                );
                setNote(
                  'Immutable style template recorded. It has no execution authority.',
                );
              })
            }
          >
            Create template version
          </button>
        </details>
      </details>
      <h3>Immutable versions</h3>
      {workflows.data?.workflows.map((workflow) => (
        <button
          key={`${workflow.workflow_id}:${workflow.version}`}
          disabled={busy}
          onClick={() => {
            setSelected(workflow);
            setEvaluation('');
            setReview(undefined);
          }}
        >
          {workflow.workflow_id} · v{workflow.version} · {workflow.state}
        </button>
      ))}
      {workflows.data && (
        <p>
          Bounded workflow list. Inspect an exact version if it is not shown.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void guarded(async () => {
            const value = await readIdentity(
              scope,
              conversationId,
              'workflows.get',
              {
                project_id: project,
                workflow_id: lookupId,
                version: Number(lookupVersion),
              },
              z.object({ workflow: identityWorkflowSchema }),
            );
            if (
              value.workflow.workflow_id !== lookupId ||
              value.workflow.version !== Number(lookupVersion) ||
              value.workflow.project_id !== project
            )
              throw new Error('Workflow version differs from selection.');
            setSelected(value.workflow);
            setEvaluation('');
            setReview(undefined);
          });
        }}
      >
        <label>
          Workflow ID
          <input
            required
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
          />
        </label>
        <label>
          Exact version
          <input
            type="number"
            min={1}
            required
            value={lookupVersion}
            onChange={(e) => setLookupVersion(e.target.value)}
          />
        </label>
        <button disabled={!enabled || busy}>Inspect exact version</button>
      </form>
      {selected && (
        <article
          className="task-detail-card"
          aria-label="Immutable workflow version"
        >
          <h3>
            {selected.workflow_id} · version {selected.version}
          </h3>
          <p>
            {selected.state} · revision {selected.revision} · head revision{' '}
            {selected.head_revision} · active version{' '}
            {selected.active_version ?? 'none'}
          </p>
          <p>
            SHA-256 {selected.sha256} · evaluation{' '}
            {selected.evaluation_ref ?? 'not evaluated'}
          </p>
          <pre className="identity-json">{selected.definition_json}</pre>
          <details open>
            <summary>Evaluate against recorded generalist artifacts</summary>
            <p>
              Provide 4–16 varied cases, including at least two tuning and two
              held-out cases. Each needs case_id, split, parameters,
              expected_sha256, and an exact generalist_ref with artifact_id,
              version and sha256. Holdouts cannot be recycled as tuning cases.
            </p>
            <label className="field-label">
              Evaluation cases JSON
              <textarea
                rows={9}
                value={cases}
                onChange={(e) => setCases(e.target.value)}
              />
            </label>
            <button
              disabled={
                !enabled ||
                busy ||
                !['draft', 'tested'].includes(selected.state)
              }
              onClick={() =>
                void guarded(async () => {
                  const value = z
                    .object({
                      workflow: identityWorkflowSchema,
                      evaluation_json: z.string(),
                    })
                    .parse(
                      requireAccepted(
                        await run(
                          'workflows.evaluate',
                          {
                            project_id: project,
                            workflow_id: selected.workflow_id,
                            version: selected.version,
                            expected_revision: selected.revision,
                            cases_json: parseEvaluationCases(cases),
                          },
                          scope,
                        ),
                      ),
                    );
                  setSelected(value.workflow);
                  setEvaluation(value.evaluation_json);
                  await workflows.reload();
                })
              }
            >
              Evaluate exact draft
            </button>
            {evaluation && <pre className="identity-json">{evaluation}</pre>}
          </details>
          <div className="task-controls">
            {(['approve', 'deprecate', 'revoke', 'rollback'] as const).map(
              (action) => (
                <button
                  key={action}
                  disabled={
                    !enabled ||
                    busy ||
                    (action === 'approve' &&
                      (selected.state !== 'tested' ||
                        !selected.evaluation_ref)) ||
                    (action === 'rollback' && selected.state !== 'approved')
                  }
                  onClick={() =>
                    void guarded(() =>
                      prepare('workflows.review', {
                        ...pin(selected),
                        action,
                        expected_revision: selected.revision,
                        expected_head_revision: selected.head_revision,
                      }),
                    )
                  }
                >
                  Review {action === 'approve' ? 'acceptance' : action} of v
                  {selected.version}
                </button>
              ),
            )}
          </div>
          <details>
            <summary>Explicit feedback evidence</summary>
            <label className="field-label">
              Feedback evidence JSON
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </label>
            <button
              disabled={!enabled || busy}
              onClick={() =>
                void guarded(async () => {
                  const result = requireAccepted(
                    await run(
                      'workflows.feedback',
                      {
                        project_id: project,
                        workflow_id: selected.workflow_id,
                        version: selected.version,
                        evidence_json: canonicalIdentity(JSON.parse(feedback)),
                      },
                      scope,
                    ),
                  );
                  setNote(JSON.stringify(result));
                })
              }
            >
              Record explicit feedback
            </button>
          </details>
          <details>
            <summary>Prepare a pinned run for publication</summary>
            <p>
              The existing mission, its revision, immutable workflow digest and
              inputs remain pinned through review.
            </p>
            <label className="field-label">
              Mission ID
              <input
                value={mission}
                onChange={(e) => setMission(e.target.value)}
              />
            </label>
            <label className="field-label">
              Mission revision
              <input
                type="number"
                min={0}
                value={missionRevision}
                onChange={(e) => setMissionRevision(e.target.value)}
              />
            </label>
            <label className="field-label">
              Input parameters JSON
              <textarea
                value={parameters}
                onChange={(e) => setParameters(e.target.value)}
              />
            </label>
            <button
              disabled={
                !enabled || busy || selected.state !== 'approved' || !mission
              }
              onClick={() =>
                void guarded(() =>
                  prepare('workflows.prepare', {
                    ...pin(selected),
                    mission_id: mission,
                    mission_revision: Number(missionRevision),
                    parameters_json: canonicalIdentity(JSON.parse(parameters)),
                  }),
                )
              }
            >
              Prepare exact output review
            </button>
            <button
              disabled={!enabled || busy}
              onClick={() =>
                void guarded(async () => {
                  const result = await readIdentity(
                    scope,
                    conversationId,
                    'workflows.runs',
                    {
                      project_id: project,
                      workflow_id: selected.workflow_id,
                      version: selected.version,
                    },
                    z.object({
                      runs_json: z.string(),
                      complete: z.literal(false),
                    }),
                  );
                  setNote(result.runs_json);
                })
              }
            >
              Inspect recorded runs
            </button>
          </details>
          <h4>Version-pinned specialist delivery</h4>
          <label className="field-label">
            Named target specialist
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose a target</option>
              {catalog.data?.specialists.map((row) => (
                <option key={row.agent_id} value={row.agent_id}>
                  {row.agent_id} · {row.responsibility}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={
              !enabled ||
              busy ||
              selected.state !== 'approved' ||
              !target ||
              !deliveries.data
            }
            onClick={() =>
              void guarded(() =>
                prepare('workflows.deliver.review', {
                  ...pin(selected),
                  specialist_id: target,
                  expected_delivery_revision: latestDelivery(
                    selected.workflow_id,
                  ),
                  action: 'deliver',
                }),
              )
            }
          >
            Review delivery of exact approved version
          </button>
          <p>
            Delivery activates next session. Current session pins remain frozen;
            installation is not execution authority or personal-memory sharing.
          </p>
          {deliveries.data?.deliveries
            .filter((row) => row.workflow_id === selected.workflow_id)
            .map((row) => (
              <article className="source-card" key={row.delivery_id}>
                <p>
                  {row.specialist_id} · v{row.version} · delivery revision{' '}
                  {row.delivery_revision} · {row.action} · SHA-256 {row.sha256}
                </p>
                <button
                  disabled={
                    !enabled ||
                    busy ||
                    row.delivery_revision === latestDelivery(row.workflow_id)
                  }
                  onClick={() =>
                    void guarded(() =>
                      prepare('workflows.deliver.review', {
                        project_id: project,
                        workflow_id: row.workflow_id,
                        version: row.version,
                        sha256: row.sha256,
                        specialist_id: target,
                        expected_delivery_revision: latestDelivery(
                          row.workflow_id,
                        ),
                        action: 'rollback',
                      }),
                    )
                  }
                >
                  Review rollback to previously delivered v{row.version}
                </button>
              </article>
            ))}
        </article>
      )}
      {review && (
        <IdentityReviewCard
          key={`${review.reviewOperationId}:${review.reviewDigest}`}
          review={review}
          scope={scope}
          busy={busy}
          run={run}
          onComplete={() => {
            setReview(undefined);
            void guarded(refresh);
          }}
        />
      )}
      {note && (
        <pre role="status" className="identity-json">
          {note}
        </pre>
      )}
    </section>
  );
}
