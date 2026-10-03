import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import Ajv, { type ValidateFunction } from 'ajv';
import { producerSchema } from '../../shared/runtime/producer/schema.generated.js';
import type {
  DotsDispatchRequest,
  DotsEffectIdentity,
  DotsEffectReceipt,
  DotsInspectRequest,
  DotsPageProposal,
  DotsPageReadRequest,
  DotsPageReadResult,
} from '../../shared/runtime/producer/wire.generated.js';
import {
  artifactSchema,
  type RuntimeArtifact,
} from '../../shared/runtime/artifacts.js';

type PageScope = Omit<DotsPageProposal, 'document'>;
type Mode = 'dispatch' | 'inspect' | 'read';
export class PageEffectError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503 = 400,
  ) {
    super(message);
  }
}
const sha256 = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
/** Producer _canonical: sorted keys, compact separators, ensure_ascii=True. */
export function nativePageCanonical(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, child]) => [key, sort(child)]),
      );
    if (typeof item === 'number' && !Number.isSafeInteger(item))
      throw new PageEffectError('Native page integers must be safe.');
    if (
      item === undefined ||
      typeof item === 'bigint' ||
      typeof item === 'function'
    )
      throw new PageEffectError('Invalid native page JSON.');
    return item;
  };
  return JSON.stringify(sort(value)).replace(
    /[\u007f-\uffff]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
const digest = (value: unknown) => sha256(nativePageCanonical(value));
const validators = new Map<string, ValidateFunction>();
function validate(name: string, value: unknown) {
  let validator = validators.get(name);
  if (!validator) {
    const schemas = producerSchema.components.schemas as Record<
      string,
      unknown
    >;
    if (!schemas[name])
      throw new PageEffectError(
        `Pinned producer schema ${name} is unavailable.`,
        503,
      );
    validator = new Ajv({
      allErrors: false,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
    }).compile({
      components: producerSchema.components,
      $ref: `#/components/schemas/${name}`,
    });
    validators.set(name, validator);
  }
  if (!validator(value)) throw new PageEffectError(`Invalid ${name}.`);
}
function document(
  title: string,
  content: string,
  parent: string | null,
  archived: boolean,
) {
  return { title, content, parent_id: parent, archived };
}
/** Install on EVERY connection that can write pages, including the owner editor.
 * The page table must already exist. No async work may occur in its transactions.
 */
export function initializeNativePageStore(db: DatabaseSync) {
  db.function(
    'dots_page_document',
    { deterministic: true },
    (title, content, parent, archived) =>
      nativePageCanonical(
        document(
          String(title),
          String(content),
          parent === null ? null : String(parent),
          !!archived,
        ),
      ),
  );
  db.function('dots_page_sha256', { deterministic: true }, (value) =>
    sha256(String(value)),
  );
  db.exec(`CREATE TABLE IF NOT EXISTS runtime_page_flags(pageId TEXT PRIMARY KEY, archived INTEGER NOT NULL CHECK(archived IN (0,1)));
    CREATE TABLE IF NOT EXISTS runtime_page_versions(pageId TEXT NOT NULL, revision INTEGER NOT NULL, spaceId TEXT NOT NULL, contentJson TEXT NOT NULL, sha256 TEXT NOT NULL, createdAt INTEGER NOT NULL, PRIMARY KEY(pageId,revision));
    CREATE TABLE IF NOT EXISTS runtime_page_effects(effectId TEXT PRIMARY KEY, operationId TEXT NOT NULL UNIQUE, approvalId TEXT NOT NULL UNIQUE, identity TEXT NOT NULL, proposalDigest TEXT NOT NULL, receipt TEXT, receivedAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS runtime_page_lineage(pageId TEXT NOT NULL, revision INTEGER NOT NULL, effectId TEXT NOT NULL UNIQUE, sourceThreadId TEXT NOT NULL, PRIMARY KEY(pageId,revision));
    CREATE TABLE IF NOT EXISTS runtime_page_review_effects(threadId TEXT NOT NULL, toolCallId TEXT NOT NULL, effectId TEXT NOT NULL UNIQUE, PRIMARY KEY(threadId,toolCallId));
    CREATE TRIGGER IF NOT EXISTS runtime_page_versions_immutable_update BEFORE UPDATE ON runtime_page_versions BEGIN SELECT RAISE(ABORT,'Page versions are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS runtime_page_versions_immutable_delete BEFORE DELETE ON runtime_page_versions BEGIN SELECT RAISE(ABORT,'Page versions are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS runtime_page_space_immutable BEFORE UPDATE ON pages WHEN NEW.id != OLD.id OR NEW.spaceId != OLD.spaceId OR NEW.revision != OLD.revision+1 BEGIN SELECT RAISE(ABORT,'Page identity is immutable and revision must advance once'); END;
    CREATE TRIGGER IF NOT EXISTS runtime_page_snapshot_insert AFTER INSERT ON pages BEGIN
      INSERT INTO runtime_page_versions VALUES(NEW.id,NEW.revision,NEW.spaceId,dots_page_document(NEW.title,NEW.content,NEW.parentId,coalesce((SELECT archived FROM runtime_page_flags WHERE pageId=NEW.id),0)),dots_page_sha256(dots_page_document(NEW.title,NEW.content,NEW.parentId,coalesce((SELECT archived FROM runtime_page_flags WHERE pageId=NEW.id),0))),NEW.updatedAt);
    END;
    CREATE TRIGGER IF NOT EXISTS runtime_page_snapshot_update AFTER UPDATE ON pages BEGIN
      INSERT INTO runtime_page_versions VALUES(NEW.id,NEW.revision,NEW.spaceId,dots_page_document(NEW.title,NEW.content,NEW.parentId,coalesce((SELECT archived FROM runtime_page_flags WHERE pageId=NEW.id),0)),dots_page_sha256(dots_page_document(NEW.title,NEW.content,NEW.parentId,coalesce((SELECT archived FROM runtime_page_flags WHERE pageId=NEW.id),0))),NEW.updatedAt);
    END;
    INSERT OR IGNORE INTO runtime_page_versions SELECT id,revision,spaceId,dots_page_document(title,content,parentId,coalesce((SELECT archived FROM runtime_page_flags WHERE pageId=pages.id),0)),dots_page_sha256(dots_page_document(title,content,parentId,coalesce((SELECT archived FROM runtime_page_flags WHERE pageId=pages.id),0))),updatedAt FROM pages;`);
}
/** Created by the owned stdio transport/binder, NEVER from browser JSON.
 * assertCurrent must fence process/epoch/session loss. canAccess must synchronously
 * re-read mapped Space/project and current grants using this workspace database.
 * generation is the producer lease generation, not the UI transport generation.
 */
export interface NativePagePeer {
  sessionId: string;
  principalId: string;
  profileId: string;
  agentId: string;
  runtimeSessionId: string;
  conversationId: string;
  policyDigest: string;
  generation: number;
  grantRevision: number;
  assertCurrent(): void;
  canAccess(
    scope: { project_id: string; space_id: string },
    mode: Mode,
  ): boolean;
}
interface StoredEffect {
  identity: string;
  proposalDigest: string;
  receipt: string | null;
}
export class PageEffectService {
  constructor(
    private db: DatabaseSync,
    readonly ownerId: string,
    readonly adapterId: string,
  ) {
    const owner = db
      .prepare('SELECT ownerId FROM workspace_owner WHERE singleton=1')
      .get();
    if (!owner || owner.ownerId !== ownerId)
      throw new PageEffectError('Page store owner mismatch.', 403);
    initializeNativePageStore(db);
  }
  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private checkPeer(
    session: string,
    identity: DotsEffectIdentity | DotsPageReadRequest['authority'],
    peer: NativePagePeer,
    mode: Mode,
  ) {
    peer.assertCurrent();
    if (
      session !== peer.sessionId ||
      identity.principal_id !== peer.principalId ||
      identity.profile_id !== peer.profileId ||
      identity.agent_id !== peer.agentId ||
      identity.runtime_session_id !== peer.runtimeSessionId ||
      (mode !== 'inspect' &&
        (identity.policy_digest !== peer.policyDigest ||
          identity.generation !== peer.generation))
    )
      throw new PageEffectError(
        'Native page request has foreign or stale authority.',
        403,
      );
  }
  private scope(identity: DotsEffectIdentity): PageScope {
    if (
      identity.schema_version !== 1 ||
      identity.adapter_kind !== 'page' ||
      identity.adapter_id !== this.adapterId
    )
      throw new PageEffectError('Native page adapter identity mismatch.', 403);
    let scope: PageScope;
    try {
      scope = JSON.parse(identity.scope_json) as PageScope;
    } catch {
      throw new PageEffectError('Invalid native page scope.');
    }
    // A strict producer proposal schema validates all scope fields without a new wire shape.
    validate('DotsPageProposal', {
      ...scope,
      document: document('scope', '', null, false),
    });
    if (
      Object.hasOwn(scope, 'document') ||
      scope.kind !== 'page' ||
      scope.store_id !== this.adapterId ||
      scope.expected_grant_revision !== identity.grant_revision ||
      nativePageCanonical(scope) !== identity.scope_json
    )
      throw new PageEffectError('Native page scope mismatch.', 403);
    return scope;
  }
  private stored(identity: DotsEffectIdentity): StoredEffect | undefined {
    const row = this.db
      .prepare(
        'SELECT identity,proposalDigest,receipt FROM runtime_page_effects WHERE effectId=?',
      )
      .get(identity.effect_id) as unknown as StoredEffect | undefined;
    if (row && row.identity !== nativePageCanonical(identity))
      throw new PageEffectError(
        'Effect identity already belongs to another request.',
        409,
      );
    return row;
  }
  private unknown(identity: DotsEffectIdentity): DotsEffectReceipt {
    return {
      identity,
      state: 'outcome_unknown',
      receipt_id: null,
      content_sha256: null,
      version: null,
      result_sha256: null,
      reason: 'unknown',
    };
  }
  private receipt(
    row: StoredEffect,
    identity: DotsEffectIdentity,
  ): DotsEffectReceipt {
    if (!row.receipt) return this.unknown(identity);
    const value = JSON.parse(row.receipt) as DotsEffectReceipt;
    validate('DotsEffectReceipt', value);
    if (nativePageCanonical(value.identity) !== nativePageCanonical(identity))
      throw new PageEffectError('Stored receipt identity mismatch.', 503);
    if (!value.receipt_id || value.state === 'outcome_unknown')
      throw new PageEffectError('Stored receipt is not terminal proof.', 503);
    if (value.state === 'committed') {
      const scope = this.scope(identity);
      const version = scope.expected_head_version + 1;
      const snapshot = this.version(scope.space_id, scope.page_id, version);
      if (
        value.reason !== 'committed' ||
        value.version !== version ||
        value.content_sha256 !== identity.content_sha256 ||
        snapshot.sha256 !== identity.content_sha256 ||
        value.result_sha256 !==
          digest({
            page_id: scope.page_id,
            space_id: scope.space_id,
            version,
            content_sha256: identity.content_sha256,
            reason: 'committed',
          })
      )
        throw new PageEffectError(
          'Stored receipt does not prove the exact page commit.',
          503,
        );
    } else if (value.reason === 'committed' || value.reason === 'unknown')
      throw new PageEffectError('Stored rejection is not terminal proof.', 503);
    return value;
  }
  private deadline(value: number) {
    if (!Number.isFinite(value) || value <= Date.now() / 1000)
      throw new PageEffectError('Native page request expired.', 409);
  }
  dispatch(raw: unknown, peer: NativePagePeer): DotsEffectReceipt {
    validate('DotsDispatchRequest', raw);
    const request = raw as DotsDispatchRequest;
    const { identity, content_json: bytes } = request;
    this.checkPeer(request.session_id, identity, peer, 'dispatch');
    const scope = this.scope(identity);
    const proposal = request.proposal;
    if (proposal.kind !== 'page')
      throw new PageEffectError('Only page effects are accepted.');
    const { document: doc, ...suppliedScope } = proposal;
    const inputDigest = digest(proposal);
    const actionDigest = digest({
      name: 'runtime.dots.page.publish',
      arguments: proposal,
      operation_class: 'dots_page_publish',
      resource_roots: [],
      destination: `dots:${digest(scope)}`,
      destination_purpose: 'dots_page',
      contract_digest: digest({ schema_version: 1, kind: 'page', scope }),
    });
    if (
      nativePageCanonical(suppliedScope) !== identity.scope_json ||
      nativePageCanonical(doc) !== bytes ||
      sha256(bytes) !== identity.content_sha256 ||
      Buffer.byteLength(bytes, 'utf8') !== identity.content_size ||
      inputDigest !== identity.input_digest ||
      actionDigest !== identity.action_digest
    )
      throw new PageEffectError(
        'Native page approval bytes or action changed.',
        409,
      );
    this.deadline(request.deadline_at);
    // Durable acceptance precedes the mutation transaction. A crashed admission is
    // permanently inspection-only, even if the local mutation never began.
    const existing = this.transaction(() => {
      this.checkPeer(request.session_id, identity, peer, 'dispatch');
      const old = this.stored(identity);
      if (old) {
        if (!peer.canAccess(scope, 'inspect'))
          throw new PageEffectError('Page receipt access revoked.', 403);
        if (old.proposalDigest !== inputDigest)
          throw new PageEffectError('Effect proposal changed.', 409);
        return this.receipt(old, identity);
      }
      const collision = this.db
        .prepare(
          'SELECT effectId FROM runtime_page_effects WHERE operationId=? OR approvalId=?',
        )
        .get(identity.operation_id, identity.approval_id);
      if (collision)
        throw new PageEffectError(
          'Operation or approval was already accepted.',
          409,
        );
      this.db
        .prepare('INSERT INTO runtime_page_effects VALUES(?,?,?,?,?,NULL,?)')
        .run(
          identity.effect_id,
          identity.operation_id,
          identity.approval_id,
          nativePageCanonical(identity),
          inputDigest,
          Date.now(),
        );
      return undefined;
    });
    if (existing) return existing;
    return this.transaction(() => {
      this.checkPeer(request.session_id, identity, peer, 'dispatch');
      const finish = (
        reason: DotsEffectReceipt['reason'],
        version: number | null = null,
      ): DotsEffectReceipt => {
        const committed = reason === 'committed';
        const result: DotsEffectReceipt = {
          identity,
          state: committed ? 'committed' : 'not_applied',
          receipt_id: randomUUID(),
          content_sha256: identity.content_sha256,
          version,
          result_sha256: digest({
            page_id: scope.page_id,
            space_id: scope.space_id,
            version,
            content_sha256: identity.content_sha256,
            reason,
          }),
          reason,
        };
        validate('DotsEffectReceipt', result);
        this.db
          .prepare(
            'UPDATE runtime_page_effects SET receipt=? WHERE effectId=? AND receipt IS NULL',
          )
          .run(nativePageCanonical(result), identity.effect_id);
        return result;
      };
      if (request.deadline_at <= Date.now() / 1000)
        return finish('unavailable');
      if (
        identity.grant_revision !== peer.grantRevision ||
        !peer.canAccess(scope, 'dispatch')
      )
        return finish('grant_revoked');
      if (
        !this.db.prepare('SELECT id FROM spaces WHERE id=?').get(scope.space_id)
      )
        return finish('grant_revoked');
      // Do not truncate, normalize or silently change approved native document bytes.
      if (!doc.title.trim() || doc.title.length > 160)
        return finish('unavailable');
      const head = this.db
        .prepare('SELECT * FROM pages WHERE id=?')
        .get(scope.page_id);
      if (
        (head && head.spaceId !== scope.space_id) ||
        Number(head?.revision ?? 0) !== scope.expected_head_version
      )
        return finish('conflict');
      if (
        head &&
        this.db
          .prepare('SELECT archived FROM runtime_page_flags WHERE pageId=?')
          .get(scope.page_id)?.archived
      )
        return finish('grant_revoked');
      const seen = new Set([scope.page_id]);
      let parent = doc.parent_id;
      while (parent !== null) {
        if (seen.has(parent)) return finish('conflict');
        seen.add(parent);
        const row = this.db
          .prepare('SELECT parentId FROM pages WHERE id=? AND spaceId=?')
          .get(parent, scope.space_id);
        if (!row) return finish('conflict');
        parent = row.parentId === null ? null : String(row.parentId);
      }
      this.db
        .prepare(
          'INSERT INTO runtime_page_flags VALUES(?,?) ON CONFLICT(pageId) DO UPDATE SET archived=excluded.archived',
        )
        .run(scope.page_id, Number(doc.archived));
      const now = Date.now();
      if (head) {
        const changed = this.db
          .prepare(
            'UPDATE pages SET title=?,content=?,parentId=?,revision=revision+1,updatedAt=? WHERE id=? AND spaceId=? AND revision=?',
          )
          .run(
            doc.title,
            doc.content,
            doc.parent_id,
            now,
            scope.page_id,
            scope.space_id,
            scope.expected_head_version,
          );
        if (changed.changes !== 1)
          throw new PageEffectError('Page CAS lost.', 409);
      } else
        this.db
          .prepare(
            'INSERT INTO pages(id,spaceId,parentId,title,content,revision,createdAt,updatedAt,sourceThreadId) VALUES(?,?,?,?,?,1,?,?,?)',
          )
          .run(
            scope.page_id,
            scope.space_id,
            doc.parent_id,
            doc.title,
            doc.content,
            now,
            now,
            peer.conversationId,
          );
      const version = scope.expected_head_version + 1;
      const snapshot = this.version(scope.space_id, scope.page_id, version);
      if (
        snapshot.contentJson !== bytes ||
        snapshot.sha256 !== identity.content_sha256
      )
        throw new PageEffectError(
          'Committed native snapshot differs from approval.',
          503,
        );
      this.db
        .prepare('INSERT INTO runtime_page_lineage VALUES(?,?,?,?)')
        .run(scope.page_id, version, identity.effect_id, peer.conversationId);
      return finish('committed', version);
    });
  }
  inspect(raw: unknown, peer: NativePagePeer): DotsEffectReceipt {
    validate('DotsInspectRequest', raw);
    const request = raw as DotsInspectRequest;
    this.checkPeer(request.session_id, request.identity, peer, 'inspect');
    this.deadline(request.deadline_at);
    const scope = this.scope(request.identity);
    if (!peer.canAccess(scope, 'inspect'))
      throw new PageEffectError('Page receipt access revoked.', 403);
    const row = this.stored(request.identity);
    return row
      ? this.receipt(row, request.identity)
      : this.unknown(request.identity);
  }
  private version(spaceId: string, pageId: string, revision: number) {
    const row = this.db
      .prepare(
        'SELECT contentJson,sha256 FROM runtime_page_versions WHERE spaceId=? AND pageId=? AND revision=?',
      )
      .get(spaceId, pageId, revision);
    if (!row) throw new PageEffectError('Page version is unavailable.', 404);
    const contentJson = String(row.contentJson),
      hash = String(row.sha256);
    if (sha256(contentJson) !== hash)
      throw new PageEffectError('Page version digest mismatch.', 503);
    return { contentJson, sha256: hash };
  }
  read(raw: unknown, peer: NativePagePeer): DotsPageReadResult {
    validate('DotsPageReadRequest', raw);
    const request = raw as DotsPageReadRequest;
    this.checkPeer(request.session_id, request.authority, peer, 'read');
    this.deadline(request.deadline_at);
    if (
      request.scope.store_id !== this.adapterId ||
      request.scope.expected_grant_revision !== peer.grantRevision ||
      !peer.canAccess(request.scope, 'read')
    )
      throw new PageEffectError('Page read access revoked.', 403);
    const head = this.db
      .prepare('SELECT revision FROM pages WHERE id=? AND spaceId=?')
      .get(request.scope.page_id, request.scope.space_id);
    if (!head)
      throw new PageEffectError('Page is unavailable in this Space.', 404);
    const version = request.scope.version ?? Number(head.revision);
    const snapshot = this.version(
      request.scope.space_id,
      request.scope.page_id,
      version,
    );
    const result: DotsPageReadResult = {
      authority: request.authority,
      scope: request.scope,
      version,
      content_json: snapshot.contentJson,
      content_sha256: snapshot.sha256,
    };
    // Legacy manual pages can exceed the producer's bounded read envelope.
    validate('DotsPageReadResult', result);
    return result;
  }
  /** Owner HTTP paths must supply their current auth + Space guard, never raw IDs alone. */
  artifact(
    spaceId: string,
    pageId: string,
    revision: number,
    guard: () => void,
  ): { metadata: RuntimeArtifact; bytes: Buffer } {
    guard();
    if (!Number.isSafeInteger(revision) || revision < 1)
      throw new PageEffectError('Invalid page version.');
    const snapshot = this.version(spaceId, pageId, revision);
    const bytes = Buffer.from(snapshot.contentJson, 'utf8');
    const metadata = artifactSchema.parse({
      id: pageId,
      version: String(revision),
      filename: `page-${sha256(pageId).slice(0, 16)}.json`,
      mime: 'application/vnd.ryoko.dots.page+json',
      size: bytes.length,
      sha256: snapshot.sha256,
      authority: 'dots-native',
      status: 'committed',
      authorized: true,
    });
    guard();
    return { metadata, bytes };
  }
  /** Corroborate a producer-confirmed result with this store's durable receipt. */
  verifyReceipt(value: unknown): void {
    validate('DotsEffectReceipt', value);
    const receipt = value as DotsEffectReceipt;
    const row = this.stored(receipt.identity);
    if (
      !row ||
      nativePageCanonical(this.receipt(row, receipt.identity)) !==
        nativePageCanonical(receipt)
    )
      throw new PageEffectError(
        'Producer receipt is not corroborated by the native page store.',
        503,
      );
  }
  /** Server-only exact operation mapping; never authorizes a second save. */
  linkReview(
    identity: DotsEffectIdentity,
    threadId: string,
    toolCallId: string,
  ) {
    validate('DotsEffectIdentity', identity);
    if (
      !threadId ||
      threadId.length > 256 ||
      !toolCallId ||
      toolCallId.length > 200
    )
      throw new PageEffectError('Invalid page review correlation.');
    return this.transaction(() => {
      const row = this.stored(identity);
      if (!row || this.receipt(row, identity).state !== 'committed')
        throw new PageEffectError('No committed page receipt.', 409);
      const scope = this.scope(identity);
      const lineage = this.db
        .prepare(
          'SELECT sourceThreadId FROM runtime_page_lineage WHERE effectId=?',
        )
        .get(identity.effect_id);
      if (!lineage || lineage.sourceThreadId !== threadId)
        throw new PageEffectError(
          'Review conversation does not own this page effect.',
          403,
        );
      const old = this.db
        .prepare(
          'SELECT pageId,spaceId FROM page_reviews WHERE threadId=? AND toolCallId=?',
        )
        .get(threadId, toolCallId);
      const mapped = this.db
        .prepare(
          'SELECT effectId FROM runtime_page_review_effects WHERE threadId=? AND toolCallId=?',
        )
        .get(threadId, toolCallId);
      if (
        (old &&
          (old.pageId !== scope.page_id || old.spaceId !== scope.space_id)) ||
        (mapped && mapped.effectId !== identity.effect_id)
      )
        throw new PageEffectError(
          'Review already belongs to another page save.',
          409,
        );
      this.db
        .prepare('INSERT OR IGNORE INTO page_reviews VALUES(?,?,?,?)')
        .run(threadId, toolCallId, scope.page_id, scope.space_id);
      this.db
        .prepare(
          'INSERT OR IGNORE INTO runtime_page_review_effects VALUES(?,?,?)',
        )
        .run(threadId, toolCallId, identity.effect_id);
      return {
        pageId: scope.page_id,
        spaceId: scope.space_id,
        operationId: identity.operation_id,
        effectId: identity.effect_id,
      };
    });
  }
}
