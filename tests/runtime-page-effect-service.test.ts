import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Pages } from '../src/server/pages.js';
import {
  initializeNativePageStore,
  nativePageCanonical,
  PageEffectService,
  type NativePagePeer,
} from '../src/server/runtime/page-effect-service.js';
import type {
  DotsDispatchRequest,
  DotsPageProposal,
} from '../src/shared/runtime/producer/wire.generated.js';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const digest = (value: unknown) => hash(nativePageCanonical(value));
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'dots-native-pages-'));
  const path = join(directory, 'workspace.db');
  const connections: DatabaseSync[] = [];
  const open = () => {
    const db = new DatabaseSync(path);
    connections.push(db);
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
      CREATE TABLE IF NOT EXISTS workspace_owner(singleton INTEGER PRIMARY KEY,ownerId TEXT);
      INSERT OR IGNORE INTO workspace_owner VALUES(1,'owner');
      CREATE TABLE IF NOT EXISTS spaces(id TEXT PRIMARY KEY);
      INSERT OR IGNORE INTO spaces VALUES('space'),('other');`);
    const pages = new Pages(
      db,
      (id) => !!db.prepare('SELECT id FROM spaces WHERE id=?').get(id),
    );
    initializeNativePageStore(db);
    return {
      db,
      pages,
      service: new PageEffectService(db, 'owner', 'native-pages'),
    };
  };
  cleanups.push(() => {
    for (const db of connections) db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  let allowed = true;
  const peer: NativePagePeer = {
    sessionId: 'live',
    principalId: 'principal',
    profileId: 'profile',
    agentId: 'agent',
    runtimeSessionId: 'durable',
    conversationId: 'conversation',
    policyDigest: 'b'.repeat(64),
    generation: 3,
    grantRevision: 1,
    assertCurrent() {},
    canAccess(scope) {
      return (
        allowed && scope.project_id === 'project' && scope.space_id === 'space'
      );
    },
  };
  return {
    ...open(),
    path,
    open,
    peer,
    revoke: () => {
      allowed = false;
    },
  };
}
function request(
  overrides: Partial<DotsPageProposal> = {},
  suffix = 'one',
): DotsDispatchRequest {
  const proposal: DotsPageProposal = {
    kind: 'page',
    store_id: 'native-pages',
    project_id: 'project',
    space_id: 'space',
    page_id: 'page',
    expected_head_version: 0,
    expected_grant_revision: 1,
    document: {
      title: 'Native page',
      content: '# Exact café 🦊',
      parent_id: null,
      archived: false,
    },
    ...overrides,
  };
  const { document, ...scope } = proposal;
  const content_json = nativePageCanonical(document);
  return {
    session_id: 'live',
    proposal,
    content_json,
    deadline_at: Date.now() / 1000 + 60,
    identity: {
      schema_version: 1,
      principal_id: 'principal',
      profile_id: 'profile',
      agent_id: 'agent',
      runtime_session_id: 'durable',
      run_id: `run-${suffix}`,
      operation_id: `operation-${suffix}`,
      effect_id: `effect-${suffix}`,
      approval_id: `approval-${suffix}`,
      approval_digest: 'a'.repeat(64),
      action_digest: digest({
        name: 'runtime.dots.page.publish',
        arguments: proposal,
        operation_class: 'dots_page_publish',
        resource_roots: [],
        destination: `dots:${digest(scope)}`,
        destination_purpose: 'dots_page',
        contract_digest: digest({ schema_version: 1, kind: 'page', scope }),
      }),
      input_digest: digest(proposal),
      policy_digest: 'b'.repeat(64),
      policy_version: '1',
      generation: 3,
      adapter_id: 'native-pages',
      adapter_kind: 'page',
      grant_revision: 1,
      scope_json: nativePageCanonical(scope),
      content_sha256: hash(content_json),
      content_size: Buffer.byteLength(content_json),
    },
  };
}
const inspection = (req: DotsDispatchRequest) => ({
  session_id: req.session_id,
  identity: req.identity,
  deadline_at: Date.now() / 1000 + 60,
});
const readRequest = (
  req: DotsDispatchRequest,
  version: number | null = null,
) => ({
  session_id: 'live',
  authority: {
    principal_id: 'principal',
    profile_id: 'profile',
    agent_id: 'agent',
    runtime_session_id: 'durable',
    run_id: req.identity.run_id,
    policy_digest: 'b'.repeat(64),
    generation: 3,
  },
  scope: {
    store_id: 'native-pages',
    project_id: 'project',
    space_id: 'space',
    page_id: (req.proposal as DotsPageProposal).page_id,
    expected_grant_revision: 1,
    version,
  },
  deadline_at: Date.now() / 1000 + 60,
});

describe('producer-native page authority and durable receipts', () => {
  it('uses the producer ASCII canonical bytes and commits exact content once', () => {
    const { service, pages, peer, db } = fixture();
    const req = request();
    expect(req.content_json).toBe(
      '{"archived":false,"content":"# Exact caf\\u00e9 \\ud83e\\udd8a","parent_id":null,"title":"Native page"}',
    );
    // Computed using real pinned 9c39b3c dots_action/content_bytes, not this adapter.
    expect(req.identity).toMatchObject({
      action_digest:
        'cc7f9c156d1a8fe928165ca0c5502301851d4a3e27950318768acf313bd395c8',
      input_digest:
        '3db8572576b9bed058e26631096920306773d9a8615d7ca1e0338ec528ddaaa7',
      content_sha256:
        'd83033fbcd2371d25e884c264d561de73eafd1fc64419f58ce6efb30c253e7e5',
      content_size: 100,
    });
    const done = service.dispatch(req, peer);
    expect(done).toMatchObject({
      state: 'committed',
      version: 1,
      reason: 'committed',
      content_sha256: hash(req.content_json),
      identity: req.identity,
    });
    expect(service.dispatch(req, peer)).toEqual(done);
    expect(service.inspect(inspection(req), peer)).toEqual(done);
    expect(pages.get('space', 'page')).toMatchObject({
      content: '# Exact café 🦊',
      revision: 1,
      sourceThreadId: 'conversation',
    });
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM runtime_page_versions').get()
        ?.count,
    ).toBe(1);
    expect(service.read(readRequest(req), peer).content_json).toBe(
      req.content_json,
    );
  });
  it('does not substitute an HTTP success or an identity-only assertion for approved bytes', () => {
    const { service, peer, db } = fixture();
    for (const change of [
      (req: DotsDispatchRequest) => {
        req.content_json += ' ';
      },
      (req: DotsDispatchRequest) => {
        req.identity.input_digest = 'c'.repeat(64);
      },
      (req: DotsDispatchRequest) => {
        req.identity.action_digest = 'c'.repeat(64);
      },
      (req: DotsDispatchRequest) => {
        req.identity.content_size += 1;
      },
      (req: DotsDispatchRequest) => {
        req.identity.scope_json = req.identity.scope_json.replace(
          '"space"',
          '"other"',
        );
      },
    ]) {
      const req = request();
      change(req);
      expect(() => service.dispatch(req, peer)).toThrow();
    }
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM runtime_page_effects').get()
        ?.count,
    ).toBe(0);
  });
  it('rejects foreign peers, stale leases, unknown fields, wrong owner and expired callbacks', () => {
    const { service, peer, db } = fixture();
    for (const field of [
      'principal_id',
      'profile_id',
      'agent_id',
      'runtime_session_id',
      'policy_digest',
    ] as const) {
      const req = request();
      req.identity[field] =
        field === 'policy_digest' ? 'c'.repeat(64) : 'foreign';
      expect(() => service.dispatch(req, peer)).toThrow(/authority/);
    }
    const req = request();
    req.identity.generation = 2;
    expect(() => service.dispatch(req, peer)).toThrow(/authority/);
    expect(() =>
      service.dispatch({ ...request(), session_id: 'other-live' }, peer),
    ).toThrow(/authority/);
    expect(() =>
      service.dispatch({ ...request(), surprise: true }, peer),
    ).toThrow(/Invalid/);
    expect(() =>
      service.dispatch({ ...request(), deadline_at: 1 }, peer),
    ).toThrow(/expired/);
    expect(
      () => new PageEffectService(db, 'other-owner', 'native-pages'),
    ).toThrow(/owner/);
  });
  it('serializes owner edits and native CAS without overwriting the owner draft', () => {
    const f = fixture();
    const page = f.pages.create('space', {
      title: 'Owner page',
      content: 'initial owner draft',
    });
    const stale = request({ page_id: page.id, expected_head_version: 1 });
    f.pages.update('space', page.id, {
      expectedRevision: 1,
      content: 'manual edits',
    });
    expect(f.service.dispatch(stale, f.peer)).toMatchObject({
      state: 'not_applied',
      reason: 'conflict',
    });
    expect(f.pages.get('space', page.id).content).toBe('manual edits');
    expect(
      f.service.artifact('space', page.id, 1, () => {}).bytes.toString(),
    ).toContain('initial owner draft');
    expect(
      f.service.artifact('space', page.id, 2, () => {}).bytes.toString(),
    ).toContain('manual edits');
    const next = request(
      { page_id: page.id, expected_head_version: 2 },
      'fresh',
    );
    expect(f.service.dispatch(next, f.peer)).toMatchObject({
      state: 'committed',
      version: 3,
    });
    expect(f.pages.get('space', page.id).revision).toBe(3);
    expect(() =>
      f.pages.update('space', page.id, {
        expectedRevision: 2,
        content: 'stale tab',
      }),
    ).toThrow(/changed/);
  });
  it('fences two store connections creating the same requested page', () => {
    const f = fixture(),
      second = f.open();
    const first = request(),
      duplicate = request({}, 'second');
    expect(f.service.dispatch(first, f.peer).state).toBe('committed');
    expect(second.service.dispatch(duplicate, f.peer)).toMatchObject({
      state: 'not_applied',
      reason: 'conflict',
    });
    expect(second.pages.list('space')).toHaveLength(1);
  });
  it('keeps receipt recovery independent of a later manual edit and restart', () => {
    const f = fixture();
    const req = request();
    const original = f.service.dispatch(req, f.peer); // Simulate response lost after commit.
    f.pages.update('space', 'page', {
      expectedRevision: 1,
      content: 'manual continuation',
    });
    const reopened = f.open();
    expect(reopened.service.inspect(inspection(req), f.peer)).toEqual(original);
    expect(reopened.service.dispatch(req, f.peer)).toEqual(original);
    expect(reopened.pages.get('space', 'page')).toMatchObject({
      content: 'manual continuation',
      revision: 2,
    });
    expect(
      reopened.service.read(readRequest(req, 1), f.peer).content_json,
    ).toBe(req.content_json);
  });
  it('never retries a durable accepted request whose mutation outcome is unresolved', () => {
    const f = fixture(),
      req = request();
    let checks = 0;
    f.peer.assertCurrent = () => {
      if (++checks === 3) throw new Error('simulated process fence');
    };
    expect(() => f.service.dispatch(req, f.peer)).toThrow(/process fence/);
    f.peer.assertCurrent = () => {};
    const recovered = f.open();
    expect(recovered.service.inspect(inspection(req), f.peer).state).toBe(
      'outcome_unknown',
    );
    expect(recovered.service.dispatch(req, f.peer).state).toBe(
      'outcome_unknown',
    );
    expect(recovered.pages.list('space')).toHaveLength(0);
    expect(
      recovered.db.prepare('SELECT receipt FROM runtime_page_effects').get()
        ?.receipt,
    ).toBeNull();
  });
  it('rolls back page, flag, snapshot and receipt together if the local transaction fails', () => {
    const f = fixture(),
      req = request();
    f.db.exec(
      "CREATE TRIGGER fail_lineage BEFORE INSERT ON runtime_page_lineage BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END;",
    );
    expect(() => f.service.dispatch(req, f.peer)).toThrow(/storage failure/);
    for (const table of [
      'pages',
      'runtime_page_flags',
      'runtime_page_versions',
      'runtime_page_lineage',
    ])
      expect(
        f.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count,
      ).toBe(0);
    f.db.exec('DROP TRIGGER fail_lineage');
    expect(f.service.dispatch(req, f.peer).state).toBe('outcome_unknown');
  });
  it.each(['after-commit', 'after-admission'])(
    'recovers a real native process death %s without replay',
    (boundary) => {
      const f = fixture(),
        req = request();
      const module = new URL(
        '../src/server/runtime/page-effect-service.ts',
        import.meta.url,
      ).href;
      const script = `
      import { DatabaseSync } from 'node:sqlite';
      import { PageEffectService } from ${JSON.stringify(module)};
      const request = JSON.parse(process.argv[1]);
      const db = new DatabaseSync(process.argv[2]);
      const service = new PageEffectService(db, 'owner', 'native-pages');
      let checks = 0;
      const peer = { sessionId:'live',principalId:'principal',profileId:'profile',agentId:'agent',runtimeSessionId:'durable',conversationId:'conversation',policyDigest:'b'.repeat(64),generation:3,grantRevision:1,canAccess:()=>true,assertCurrent:()=>{if (++checks===3 && process.argv[3]==='after-admission') process.exit(78);} };
      service.dispatch(request, peer);
      process.exit(77);
    `;
      const child = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          script,
          JSON.stringify(req),
          f.path,
          boundary,
        ],
        { encoding: 'utf8', timeout: 15000 },
      );
      expect(child.status, child.stderr).toBe(
        boundary === 'after-commit' ? 77 : 78,
      );
      const reopened = f.open();
      const state =
        boundary === 'after-commit' ? 'committed' : 'outcome_unknown';
      expect(reopened.service.inspect(inspection(req), f.peer).state).toBe(
        state,
      );
      expect(reopened.service.dispatch(req, f.peer).state).toBe(state);
      expect(reopened.pages.list('space')).toHaveLength(
        boundary === 'after-commit' ? 1 : 0,
      );
      expect(
        reopened.db
          .prepare('SELECT COUNT(*) AS count FROM runtime_page_effects')
          .get()?.count,
      ).toBe(1);
    },
  );
  it('does not authorize changed identity, another operation effect, or another approval effect', () => {
    const f = fixture(),
      req = request();
    f.service.dispatch(req, f.peer);
    const changed = structuredClone(req);
    changed.identity.approval_digest = 'c'.repeat(64);
    expect(() => f.service.dispatch(changed, f.peer)).toThrow(/identity/);
    const operationCollision = structuredClone(req);
    operationCollision.identity.effect_id = 'other-effect';
    expect(() => f.service.dispatch(operationCollision, f.peer)).toThrow(
      /already accepted/,
    );
    const approvalCollision = structuredClone(req);
    approvalCollision.identity.effect_id = 'third-effect';
    approvalCollision.identity.operation_id = 'third-operation';
    expect(() => f.service.dispatch(approvalCollision, f.peer)).toThrow(
      /already accepted/,
    );
    expect(f.pages.get('space', 'page').revision).toBe(1);
  });
  it('rechecks revocation at the mutation boundary and terminally refuses once', () => {
    const f = fixture(),
      req = request();
    let checks = 0;
    f.peer.assertCurrent = () => {
      if (++checks === 3) f.revoke();
    };
    expect(f.service.dispatch(req, f.peer)).toMatchObject({
      state: 'not_applied',
      reason: 'grant_revoked',
    });
    expect(f.pages.list('space')).toHaveLength(0);
    expect(() => f.service.inspect(inspection(req), f.peer)).toThrow(/revoked/);
  });
  it('permits inspection of historical generations without permitting mutation replay', () => {
    const f = fixture(),
      req = request(),
      receipt = f.service.dispatch(req, f.peer);
    f.peer.generation = 4;
    f.peer.grantRevision = 2;
    f.peer.policyDigest = 'c'.repeat(64);
    expect(f.service.inspect(inspection(req), f.peer)).toEqual(receipt);
    expect(() => f.service.dispatch(req, f.peer)).toThrow(/stale authority/);
    expect(
      f.service.inspect(inspection(request({}, 'unknown')), f.peer).state,
    ).toBe('outcome_unknown');
  });
  it('checks parent graph, cross-Space targets and archived document content atomically', () => {
    const f = fixture();
    const foreign = f.pages.create('other', { title: 'Foreign' });
    const req = request();
    expect(
      f.service.dispatch(
        request({
          document: {
            ...(req.proposal as DotsPageProposal).document,
            parent_id: foreign.id,
          },
        }),
        f.peer,
      ),
    ).toMatchObject({ reason: 'conflict' });
    expect(
      f.service.dispatch(
        request(
          {
            document: {
              ...(req.proposal as DotsPageProposal).document,
              parent_id: 'page',
            },
          },
          'cycle',
        ),
        f.peer,
      ),
    ).toMatchObject({ reason: 'conflict' });
    expect(
      f.service.dispatch(request({ page_id: foreign.id }, 'foreign'), f.peer),
    ).toMatchObject({ reason: 'conflict' });
    const archived = request(
      {
        document: {
          ...(req.proposal as DotsPageProposal).document,
          archived: true,
        },
      },
      'archive',
    );
    expect(f.service.dispatch(archived, f.peer).state).toBe('committed');
    expect(
      JSON.parse(f.service.read(readRequest(archived), f.peer).content_json)
        .archived,
    ).toBe(true);
  });
  it('does not truncate native title bounds or manual legacy pages to fit producer reads', () => {
    const f = fixture(),
      req = request();
    const tooLong = request({
      document: {
        ...(req.proposal as DotsPageProposal).document,
        title: 'x'.repeat(161),
      },
    });
    expect(f.service.dispatch(tooLong, f.peer)).toMatchObject({
      state: 'not_applied',
      reason: 'unavailable',
    });
    const manual = f.pages.create('space', {
      title: 'Long owner page',
      content: 'x'.repeat(100000),
    });
    const manualRead = request({ page_id: manual.id }, 'manual');
    expect(() => f.service.read(readRequest(manualRead), f.peer)).toThrow(
      /Invalid DotsPageReadResult/,
    );
    expect(f.pages.get('space', manual.id).content).toHaveLength(100000);
    expect(
      f.service.artifact('space', manual.id, 1, () => {}).bytes.length,
    ).toBeGreaterThan(100000);
  });
  it('returns safe immutable artifact bytes, enforces guards, and detects damaged snapshots', () => {
    const f = fixture(),
      req = request({ page_id: '../../unsafe\r\nname' });
    f.service.dispatch(req, f.peer);
    const pageId = (req.proposal as DotsPageProposal).page_id;
    const artifact = f.service.artifact('space', pageId, 1, () => {});
    expect(artifact.metadata.filename).toMatch(/^page-[a-f0-9]{16}\.json$/);
    expect(hash(artifact.bytes.toString())).toBe(artifact.metadata.sha256);
    expect(() => f.service.artifact('other', pageId, 1, () => {})).toThrow(
      /unavailable/,
    );
    expect(() =>
      f.service.artifact('space', pageId, 1, () => {
        throw new Error('revoked');
      }),
    ).toThrow(/revoked/);
    expect(() =>
      f.db.prepare('UPDATE runtime_page_versions SET contentJson=?').run('{}'),
    ).toThrow(/immutable/);
    f.db.exec('DROP TRIGGER runtime_page_versions_immutable_update');
    f.db.prepare('UPDATE runtime_page_versions SET contentJson=?').run('{}');
    expect(() => f.service.artifact('space', pageId, 1, () => {})).toThrow(
      /digest mismatch/,
    );
  });
  it('maps old review receipt identity without saving another page or overwriting another review', () => {
    const f = fixture(),
      req = request();
    f.service.dispatch(req, f.peer);
    expect(
      f.service.linkReview(req.identity, 'conversation', 'tool'),
    ).toMatchObject({ pageId: 'page', operationId: 'operation-one' });
    expect(
      f.service.linkReview(req.identity, 'conversation', 'tool').effectId,
    ).toBe('effect-one');
    expect(f.pages.reviewReceipt('conversation', 'tool')).toEqual({
      pageId: 'page',
      spaceId: 'space',
    });
    expect(f.pages.list('space')).toHaveLength(1);
    expect(() =>
      f.service.linkReview(req.identity, 'other-thread', 'tool'),
    ).toThrow(/does not own/);
    const another = request({ page_id: 'another' }, 'another');
    f.service.dispatch(another, f.peer);
    expect(() =>
      f.service.linkReview(another.identity, 'conversation', 'tool'),
    ).toThrow(/already belongs/);
    expect(f.pages.reviewReceipt('conversation', 'tool')?.pageId).toBe('page');
  });
});
