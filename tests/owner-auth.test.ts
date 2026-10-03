import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { OwnerAuth, requireOwner } from '../src/server/owner-auth.js';
import { ownerAuthConfig } from '../src/server/owner-auth-config.js';
import { testOwnerToken } from './helpers/owner-auth.js';
const cleanup: (() => void)[] = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn()),
);
function fixture(
  options: {
    path?: string;
    origin?: string;
    now?: () => number;
    ownerToken?: string;
    allowLoopbackTlsProxy?: boolean;
  } = {},
) {
  const origin = options.origin ?? 'http://localhost';
  const auth = new OwnerAuth(options.path ?? ':memory:', {
    ownerId: 'owner',
    ownerToken: testOwnerToken,
    ...options,
    origin,
  });
  cleanup.push(() => auth.close());
  const app = new Hono();
  app.use('/api/*', auth.middleware());
  app.get('/api/private', (c) => c.json({ owner: requireOwner(c).ownerId }));
  app.post('/api/private', (c) => c.json({ ok: true }));
  async function login(
    token = testOwnerToken,
    extra: Record<string, string> = {},
  ) {
    const response = await app.request(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify({ ownerToken: token }),
    });
    const data = await response.json();
    const headers = {
      Cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '',
      Origin: origin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': data.csrfToken ?? '',
    };
    return { response, data, headers };
  }
  return { auth, app, login, origin };
}
describe('single-owner cookie sessions', () => {
  it('has no owner-token bearer bypass, does not disclose secrets, and sets secure cookie policy', async () => {
    const f = fixture({ origin: 'https://dots.example' });
    expect(
      (
        await f.app.request(`${f.origin}/api/private`, {
          headers: { Authorization: `Bearer ${testOwnerToken}` },
        })
      ).status,
    ).toBe(401);
    const login = await f.login();
    expect(login.response.status).toBe(200);
    expect(login.response.headers.get('set-cookie')).toMatch(
      /^__Host-dots-session=[\w-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure$/,
    );
    expect(JSON.stringify(login.data)).not.toContain(testOwnerToken);
    const result = await f.app.request(`${f.origin}/api/private`, {
      headers: login.headers,
    });
    expect(await result.json()).toEqual({ owner: 'owner' });
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(
      (
        await f.app.request('http://dots.example/api/auth/login', {
          method: 'POST',
          headers: login.headers,
          body: JSON.stringify({ ownerToken: testOwnerToken }),
        })
      ).status,
    ).toBe(403);
  });
  it('requires exact host, origin, and CSRF even with valid cookies and spoofed proxy headers', async () => {
    const f = fixture();
    const { headers } = await f.login();
    for (const extra of [
      { Origin: 'http://evil.example' },
      { Host: 'evil.example' },
      { Origin: 'http://localhost:444' },
      { 'X-CSRF-Token': 'wrong' },
      { 'Sec-Fetch-Site': 'same-site' },
    ] as Record<string, string>[]) {
      expect(
        (
          await f.app.request('/api/private', {
            method: 'POST',
            headers: { ...headers, ...extra },
            body: '{}',
          })
        ).status,
      ).toBe(403);
    }
    expect(
      (
        await f.app.request('/api/private', {
          method: 'POST',
          headers: {
            Cookie: headers.Cookie,
            'Content-Type': 'application/json',
            'X-CSRF-Token': headers['X-CSRF-Token'],
          },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await f.app.request('http://evil.example/api/private', {
          headers: {
            ...headers,
            'X-Forwarded-Host': 'localhost',
            'X-Forwarded-Proto': 'https',
          },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await f.app.request('/api/private', {
          method: 'POST',
          headers,
          body: '{}',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await f.app.request('/api/private', {
          headers: { Cookie: `${headers.Cookie}; ${headers.Cookie}` },
        })
      ).status,
    ).toBe(401);
  });
  it('rejects login CSRF and forged authority fields', async () => {
    const f = fixture();
    expect(
      (await f.login(testOwnerToken, { Origin: 'https://evil.example' }))
        .response.status,
    ).toBe(403);
    expect(
      (
        await f.app.request('/api/auth/login', {
          method: 'POST',
          headers: { Origin: f.origin, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerToken: testOwnerToken,
            principalId: 'other',
          }),
        })
      ).status,
    ).toBe(400);
  });
  it('bootstraps CSRF only behind authentication, rotates on unlock, and revokes logout across reuse', async () => {
    const f = fixture();
    const first = await f.login();
    const bootstrap = await f.app.request('/api/auth/session', {
      headers: first.headers,
    });
    expect((await bootstrap.json()).csrfToken).toBe(first.data.csrfToken);
    const second = await f.login(testOwnerToken, {
      Cookie: first.headers.Cookie,
    });
    expect(second.headers.Cookie).not.toBe(first.headers.Cookie);
    expect(
      (await f.app.request('/api/private', { headers: first.headers })).status,
    ).toBe(401);
    expect(
      (
        await f.app.request('/api/auth/logout', {
          method: 'POST',
          headers: second.headers,
          body: '{}',
        })
      ).status,
    ).toBe(200);
    expect(
      (await f.app.request('/api/private', { headers: second.headers })).status,
    ).toBe(401);
  });
  it('expires idle and absolute sessions and revokes every browser on owner request', async () => {
    let now = 1_000;
    const f = fixture({ now: () => now });
    const a = await f.login();
    const b = await f.login();
    expect(
      (
        await f.app.request('/api/auth/revoke', {
          method: 'POST',
          headers: a.headers,
          body: '{}',
        })
      ).status,
    ).toBe(200);
    expect(
      (await f.app.request('/api/private', { headers: b.headers })).status,
    ).toBe(401);
    const idle = await f.login();
    now += 30 * 60_000;
    expect(
      (await f.app.request('/api/private', { headers: idle.headers })).status,
    ).toBe(401);
    const expired = await f.login();
    now += 8 * 60 * 60_000;
    expect(
      (await f.app.request('/api/private', { headers: expired.headers }))
        .status,
    ).toBe(401);
  });
  it('persists bounded session hashes through restart and rejects old sessions on owner-token rotation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dots-auth-'));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'auth.sqlite');
    const first = fixture({ path });
    const a = await first.login();
    const restarted = fixture({ path });
    expect(
      (await restarted.app.request('/api/private', { headers: a.headers }))
        .status,
    ).toBe(200);
    const read = new DatabaseSync(path);
    expect(
      JSON.stringify(read.prepare('SELECT * FROM browser_sessions').all()),
    ).not.toContain(a.headers.Cookie.split('=')[1]);
    read.close();
    const rotated = fixture({
      path,
      ownerToken: 'rotated-synthetic-owner-token-only',
    });
    expect(
      (await rotated.app.request('/api/private', { headers: a.headers }))
        .status,
    ).toBe(401);
    expect((await first.login()).response.status).toBe(503);
    expect(
      (await rotated.login('rotated-synthetic-owner-token-only')).response
        .status,
    ).toBe(200);
  });
  it('bounds login attempts and rate limits authenticated writes without trusting client IP headers', async () => {
    const f = fixture();
    for (let n = 0; n < 10; n++)
      expect(
        (await f.login('wrong', { 'X-Forwarded-For': `10.0.0.${n}` })).response
          .status,
      ).toBe(401);
    expect((await f.login()).response.status).toBe(429);
    const other = fixture();
    const { headers } = await other.login();
    for (let n = 0; n < 60; n++)
      expect(
        (
          await other.app.request('/api/private', {
            method: 'POST',
            headers,
            body: '{}',
          })
        ).status,
      ).toBe(200);
    expect(
      (
        await other.app.request('/api/private', {
          method: 'POST',
          headers,
          body: '{}',
        })
      ).status,
    ).toBe(429);
  });
  it('clearly fails closed without an owner token and refuses insecure remote origin', async () => {
    const f = fixture({ ownerToken: undefined });
    expect((await f.login()).response.status).toBe(503);
    expect((await f.app.request('/api/auth/session')).status).toBe(503);
    expect(() => fixture({ origin: 'http://dots.example' })).toThrow('HTTPS');
    expect(() => fixture({ ownerToken: 'weak' })).toThrow('24');
  });
  it('fences a delayed read after session revocation', async () => {
    const f = fixture();
    let release!: () => void;
    f.app.get('/api/delayed', async (c) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      c.header(
        'Content-Disposition',
        'attachment; filename=private-report.txt',
      );
      return c.json({ private: true });
    });
    const { headers } = await f.login();
    const pending = f.app.request('/api/delayed', { headers });
    await new Promise((resolve) => setTimeout(resolve, 0));
    f.auth.revokeAll();
    release();
    const denied = await pending;
    expect(denied.status).toBe(401);
    expect(denied.headers.get('content-disposition')).toBeNull();
    expect(denied.headers.get('set-cookie')).toBeNull();
  });
});

it('rejects remote startup without native TLS and requires explicit loopback proxy configuration', () => {
  expect(() =>
    ownerAuthConfig({ HOST: '0.0.0.0', OWNER_TOKEN: testOwnerToken }),
  ).toThrow('External');
  expect(() =>
    ownerAuthConfig({
      HOST: '0.0.0.0',
      OWNER_TOKEN: testOwnerToken,
      APP_ORIGIN: 'https://dots.example',
      TLS_PROXY: '1',
    }),
  ).toThrow('External');
  expect(() => ownerAuthConfig({ APP_ORIGIN: 'https://dots.example' })).toThrow(
    'TLS_PROXY',
  );
  expect(
    ownerAuthConfig({ APP_ORIGIN: 'https://dots.example', TLS_PROXY: '1' })
      .allowLoopbackTlsProxy,
  ).toBe(true);
  expect(
    ownerAuthConfig({
      HOST: '0.0.0.0',
      OWNER_TOKEN: testOwnerToken,
      APP_ORIGIN: 'https://dots.example',
      TLS_CERT_PATH: '/fixture/cert',
      TLS_KEY_PATH: '/fixture/key',
    }).origin,
  ).toBe('https://dots.example');
});
