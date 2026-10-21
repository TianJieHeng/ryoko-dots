import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { HTTPException } from 'hono/http-exception';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
interface Credential {
  id: string;
  name: string;
  digest: string;
  dots: string;
  writeAccess: number;
  createdAt: number;
  expiresAt: number;
  revoked: number;
}
export class ApiCredentials {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS hub_api_credentials(id TEXT PRIMARY KEY,name TEXT NOT NULL,digest TEXT UNIQUE NOT NULL,dots TEXT NOT NULL,writeAccess INTEGER NOT NULL,createdAt INTEGER NOT NULL,expiresAt INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0)',
    );
  }
  create(name: string, dots: string[], write: boolean, lifetimeDays: number) {
    const token = 'dots_' + randomBytes(32).toString('base64url');
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO hub_api_credentials VALUES(?,?,?,?,?,?,?,0)')
      .run(
        id,
        name,
        hash(token),
        JSON.stringify(dots),
        Number(write),
        Date.now(),
        Date.now() + lifetimeDays * 86400000,
      );
    return { id, token };
  }
  list() {
    return this.db
      .prepare(
        'SELECT id,name,dots,writeAccess,createdAt,expiresAt,revoked FROM hub_api_credentials ORDER BY createdAt DESC',
      )
      .all()
      .map((r) => ({ ...r, dots: JSON.parse(String(r.dots)) }));
  }
  revoke(id: string) {
    this.db
      .prepare('UPDATE hub_api_credentials SET revoked=1 WHERE id=?')
      .run(id);
  }
  authenticate(token: string) {
    const row = this.db
      .prepare('SELECT * FROM hub_api_credentials WHERE digest=?')
      .get(hash(token)) as unknown as Credential | undefined;
    if (!row || row.revoked || row.expiresAt <= Date.now())
      throw new HTTPException(401, {
        message: 'API credential is invalid or expired.',
      });
    const assertCurrent = () => {
      const current = this.db
        .prepare('SELECT revoked,expiresAt FROM hub_api_credentials WHERE id=?')
        .get(row.id);
      if (
        !current ||
        current.revoked ||
        Number(current.expiresAt) <= Date.now()
      )
        throw new HTTPException(401, {
          message: 'API credential was revoked or expired.',
        });
    };
    return {
      id: row.id,
      dots: JSON.parse(row.dots) as string[],
      write: !!row.writeAccess,
      assertCurrent,
    };
  }
  close() {
    this.db.close();
  }
}
