import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Context, MiddlewareHandler } from 'hono';
import { z } from 'zod';

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(hash(a), 'hex'), Buffer.from(hash(b), 'hex'));
const secret = () => randomBytes(32).toString('base64url');
const safeMethods = new Set(['GET', 'HEAD']);
const loginSchema = z.strictObject({ ownerToken: z.string().min(1).max(4096) });
export interface OwnerAuthOptions {
  ownerId: string;
  ownerToken?: string;
  /** Exact browser origin. Never derived from Host or forwarded headers. */
  origin: string;
  /** Extra exact request authority for the loopback Vite development proxy. */
  developmentApiOrigin?: string;
  /** Only for an explicitly configured TLS proxy on a loopback HTTP listener. */
  allowLoopbackTlsProxy?: boolean;
  sessionLifetimeMs?: number;
  idleTimeoutMs?: number;
  now?: () => number;
}
interface Session {
  idHash: string;
  csrfToken: string;
  expiresAt: number;
  touchedAt: number;
  revision: number;
}
export class OwnerAuth {
  private readonly db: DatabaseSync;
  private readonly now: () => number;
  private readonly fingerprint: string;
  readonly origin: string;
  readonly cookieName: string;
  private readonly authorities: Set<string>;
  private readonly lifetime: number;
  private readonly idle: number;
  constructor(
    path: string,
    private readonly options: OwnerAuthOptions,
  ) {
    const origin = new URL(options.origin);
    if (
      origin.origin !== options.origin ||
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      (origin.protocol !== 'https:' &&
        !['127.0.0.1', '[::1]', 'localhost'].includes(origin.hostname))
    )
      throw new Error(
        'Owner authentication requires an exact HTTPS origin or loopback HTTP origin.',
      );
    if (!options.ownerId || options.ownerId.length > 256)
      throw new Error('A bounded owner identity is required.');
    if (
      options.ownerToken !== undefined &&
      (options.ownerToken.length < 24 || options.ownerToken.length > 4096)
    )
      throw new Error('OWNER_TOKEN must contain 24 to 4096 characters.');
    this.origin = origin.origin;
    this.cookieName =
      origin.protocol === 'https:' ? '__Host-dots-session' : 'dots-session';
    this.authorities = new Set([origin.host]);
    if (options.developmentApiOrigin) {
      const dev = new URL(options.developmentApiOrigin);
      if (
        dev.origin !== options.developmentApiOrigin ||
        dev.protocol !== 'http:' ||
        !['127.0.0.1', '[::1]', 'localhost'].includes(dev.hostname) ||
        origin.protocol !== 'http:' ||
        !['127.0.0.1', '[::1]', 'localhost'].includes(origin.hostname)
      )
        throw new Error('Development API origin must be exact loopback HTTP.');
      this.authorities.add(dev.host);
    }
    this.now = options.now ?? Date.now;
    this.fingerprint = hash(options.ownerToken ?? 'disabled');
    this.lifetime = options.sessionLifetimeMs ?? 8 * 60 * 60 * 1000;
    this.idle = options.idleTimeoutMs ?? 30 * 60 * 1000;
    if (
      this.lifetime <= 0 ||
      this.lifetime > 24 * 60 * 60 * 1000 ||
      this.idle <= 0 ||
      this.idle > this.lifetime
    )
      throw new Error('Invalid browser session lifetime.');
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS browser_owner(singleton INTEGER PRIMARY KEY CHECK(singleton=1), ownerId TEXT NOT NULL, fingerprint TEXT NOT NULL, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS browser_sessions(idHash TEXT PRIMARY KEY, csrfToken TEXT NOT NULL, expiresAt INTEGER NOT NULL, touchedAt INTEGER NOT NULL, revision INTEGER NOT NULL, rateWindow INTEGER NOT NULL, reads INTEGER NOT NULL, writes INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS browser_login_rate(singleton INTEGER PRIMARY KEY CHECK(singleton=1), window INTEGER NOT NULL, attempts INTEGER NOT NULL);`);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.db
        .prepare('SELECT * FROM browser_owner WHERE singleton=1')
        .get();
      if (previous && previous.ownerId !== options.ownerId)
        throw new Error(
          'This authentication database belongs to a different owner.',
        );
      if (!previous)
        this.db
          .prepare('INSERT INTO browser_owner VALUES (1, ?, ?, 1)')
          .run(options.ownerId, this.fingerprint);
      else if (previous.fingerprint !== this.fingerprint) {
        this.db
          .prepare(
            'UPDATE browser_owner SET fingerprint=?, revision=revision+1 WHERE singleton=1',
          )
          .run(this.fingerprint);
        this.db.exec(
          'DELETE FROM browser_sessions; DELETE FROM browser_login_rate;',
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      this.db.close();
      throw error;
    }
  }
  close() {
    this.db.close();
  }
  private revision(): number | null {
    const owner = this.db
      .prepare('SELECT * FROM browser_owner WHERE singleton=1')
      .get();
    return this.options.ownerToken && owner?.fingerprint === this.fingerprint
      ? Number(owner.revision)
      : null;
  }
  private cookie(c: Context, value: string, maxAge: number) {
    c.header(
      'Set-Cookie',
      `${this.cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${this.origin.startsWith('https:') ? '; Secure' : ''}`,
    );
  }
  private session(c: Context): Session | null {
    const values = (c.req.header('cookie') ?? '')
      .split(';')
      .map((v) => v.trim())
      .filter((v) => v.startsWith(`${this.cookieName}=`));
    if (values.length !== 1) return null;
    const token = values[0].slice(this.cookieName.length + 1);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = this.db
      .prepare('SELECT * FROM browser_sessions WHERE idHash=?')
      .get(hash(token)) as unknown as Session | undefined;
    if (!row) return null;
    if (
      row.revision !== this.revision() ||
      row.expiresAt <= this.now() ||
      row.touchedAt + this.idle <= this.now()
    ) {
      this.db
        .prepare('DELETE FROM browser_sessions WHERE idHash=?')
        .run(row.idHash);
      return null;
    }
    return row;
  }
  /** Revoke all browser sessions without creating/replacing owner credentials. */
  revokeAll() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(
        'UPDATE browser_owner SET revision=revision+1 WHERE singleton=1; DELETE FROM browser_sessions; COMMIT;',
      );
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private limited(session: Session, mutation: boolean): boolean {
    const now = this.now();
    this.db
      .prepare(
        'UPDATE browser_sessions SET reads=CASE WHEN rateWindow+60000<=? THEN 0 ELSE reads END, writes=CASE WHEN rateWindow+60000<=? THEN 0 ELSE writes END, rateWindow=CASE WHEN rateWindow+60000<=? THEN ? ELSE rateWindow END WHERE idHash=?',
      )
      .run(now, now, now, now, session.idHash);
    const row = this.db
      .prepare(
        `UPDATE browser_sessions SET ${mutation ? 'writes=writes+1' : 'reads=reads+1'}, touchedAt=? WHERE idHash=? RETURNING reads, writes`,
      )
      .get(now, session.idHash);
    return Number(row?.reads ?? 0) > 600 || Number(row?.writes ?? 0) > 60;
  }
  private loginLimited(): boolean {
    const now = this.now();
    const row = this.db
      .prepare(
        `INSERT INTO browser_login_rate VALUES(1, ?, 1) ON CONFLICT(singleton) DO UPDATE SET attempts=CASE WHEN window+900000<=excluded.window THEN 1 ELSE attempts+1 END, window=CASE WHEN window+900000<=excluded.window THEN excluded.window ELSE window END RETURNING attempts`,
      )
      .get(now);
    return Number(row?.attempts) > 10;
  }
  middleware(): MiddlewareHandler {
    return async (c, next) => {
      c.header('Cache-Control', 'no-store');
      c.header('X-Content-Type-Options', 'nosniff');
      c.header('Referrer-Policy', 'no-referrer');
      const url = new URL(c.req.url);
      const host = c.req.header('host');
      if (
        !this.authorities.has(url.host) ||
        (host !== undefined &&
          (host !== url.host || !this.authorities.has(host)))
      )
        return c.json({ error: 'Unrecognized host.' }, 403);
      if (
        url.protocol !== new URL(this.origin).protocol &&
        !(
          this.options.allowLoopbackTlsProxy &&
          this.origin.startsWith('https:') &&
          url.protocol === 'http:'
        )
      )
        return c.json({ error: 'Secure transport is required.' }, 403);
      // No proxy header is an authority. Strip nothing into a trusted origin.
      if (c.req.header('origin') && c.req.header('origin') !== this.origin)
        return c.json({ error: 'Cross-origin requests are not allowed.' }, 403);
      if (
        ['cross-site', 'same-site'].includes(
          c.req.header('sec-fetch-site') ?? '',
        )
      )
        return c.json({ error: 'Cross-origin requests are not allowed.' }, 403);
      if (c.req.header('upgrade')?.toLowerCase() === 'websocket')
        return c.json(
          { error: 'Browser WebSocket tickets are not available.' },
          403,
        );
      const mutation = !safeMethods.has(c.req.method);
      if (
        mutation &&
        c.req.header('content-type')?.split(';')[0].trim().toLowerCase() !==
          'application/json'
      )
        return c.json({ error: 'Use application/json.' }, 415);
      if (mutation && c.req.header('origin') !== this.origin)
        return c.json(
          { error: 'An exact same-origin request is required.' },
          403,
        );
      if (c.req.path === '/api/auth/login' && c.req.method === 'POST') {
        if (!this.revision())
          return c.json({ error: 'Owner login is not configured.' }, 503);
        if (this.loginLimited()) {
          c.header('Retry-After', '900');
          return c.json(
            { error: 'Too many unlock attempts. Try again later.' },
            429,
          );
        }
        const body = loginSchema.safeParse(
          await c.req.json().catch(() => null),
        );
        if (!body.success)
          return c.json({ error: 'Provide only an owner access token.' }, 400);
        if (!equal(body.data.ownerToken, this.options.ownerToken!))
          return c.json({ error: 'Owner access token was not accepted.' }, 401);
        const previous = this.session(c);
        const token = secret();
        const csrfToken = secret();
        const expiresAt = this.now() + this.lifetime;
        this.db.exec('BEGIN IMMEDIATE');
        try {
          if (previous)
            this.db
              .prepare('DELETE FROM browser_sessions WHERE idHash=?')
              .run(previous.idHash);
          this.db
            .prepare(
              'DELETE FROM browser_sessions WHERE expiresAt<=? OR touchedAt<=?',
            )
            .run(this.now(), this.now() - this.idle);
          // Bounded single-owner sessions; successful unlock rotates its own session.
          this.db.exec(
            'DELETE FROM browser_sessions WHERE idHash IN (SELECT idHash FROM browser_sessions ORDER BY touchedAt DESC LIMIT -1 OFFSET 15)',
          );
          this.db
            .prepare(
              'INSERT INTO browser_sessions VALUES (?, ?, ?, ?, ?, ?, 0, 0)',
            )
            .run(
              hash(token),
              csrfToken,
              expiresAt,
              this.now(),
              this.revision()!,
              this.now(),
            );
          this.db.exec('COMMIT');
        } catch (error) {
          this.db.exec('ROLLBACK');
          throw error;
        }
        this.cookie(c, token, Math.floor(this.lifetime / 1000));
        return c.json({ authenticated: true, csrfToken, expiresAt });
      }
      if (!this.revision())
        return c.json(
          {
            error:
              'Owner login is not configured or its credential has been rotated.',
          },
          503,
        );
      const session = this.session(c);
      if (!session) {
        // A late 401 must not erase a newer login cookie set by another response.
        return c.json(
          { error: 'Enter your owner access token to unlock Dots.' },
          401,
        );
      }
      if (
        mutation &&
        !equal(c.req.header('x-csrf-token') ?? '', session.csrfToken)
      )
        return c.json({ error: 'Invalid session CSRF token.' }, 403);
      if (this.limited(session, mutation)) {
        c.header('Retry-After', '60');
        return c.json({ error: 'Too many requests. Try again later.' }, 429);
      }
      if (c.req.path === '/api/auth/session' && c.req.method === 'GET')
        return c.json({
          authenticated: true,
          csrfToken: session.csrfToken,
          expiresAt: session.expiresAt,
        });
      if (
        ['/api/auth/logout', '/api/auth/revoke'].includes(c.req.path) &&
        c.req.method === 'POST'
      ) {
        const body = z
          .strictObject({})
          .safeParse(await c.req.json().catch(() => null));
        if (!body.success)
          return c.json({ error: 'Expected an empty session action.' }, 400);
        if (c.req.path === '/api/auth/revoke') this.revokeAll();
        else
          this.db
            .prepare('DELETE FROM browser_sessions WHERE idHash=?')
            .run(session.idHash);
        this.cookie(c, '', 0);
        return c.json({ ok: true });
      }
      if (c.req.path.startsWith('/api/auth/'))
        return c.json({ error: 'Not found.' }, 404);
      const assertCurrent = () => {
        if (!this.session(c))
          throw new Error('Browser authentication expired or was revoked.');
      };
      c.set(
        'ownerPrincipal',
        Object.freeze({
          ownerId: this.options.ownerId,
          authSessionId: hash('computer-owner:' + session.idHash),
          authRevision: session.revision,
          assertCurrent,
        }),
      );
      await next();
      // Fence delayed finite reads; streaming adapters must check assertCurrent per chunk.
      if (!this.session(c)) {
        // Hono preserves prior response headers on replacement; remove protected
        // metadata and cookie/length headers before emitting the denial.
        for (const name of [...c.res.headers.keys()]) c.header(name, undefined);
        c.header('Cache-Control', 'no-store');
        c.header('X-Content-Type-Options', 'nosniff');
        c.header('Referrer-Policy', 'no-referrer');
        c.res = c.json(
          { error: 'Browser authentication expired or was revoked.' },
          401,
        );
      }
    };
  }
}

export function requireOwner(c: Context): {
  ownerId: string;
  authSessionId: string;
  authRevision: number;
  assertCurrent: () => void;
} {
  const principal = c.get('ownerPrincipal') as
    | {
        ownerId: string;
        authSessionId: string;
        authRevision: number;
        assertCurrent: () => void;
      }
    | undefined;
  if (!principal) throw new Error('Authenticated owner context is required.');
  principal.assertCurrent();
  return principal;
}
