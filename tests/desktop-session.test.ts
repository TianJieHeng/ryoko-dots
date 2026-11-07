import { afterEach, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { openLocalSession } = createRequire(import.meta.url)(
  '../desktop/local-session.cjs',
);
const directories: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dots-desktop-session-'));
  directories.push(root);
  const passwordFile = join(root, 'password');
  writeFileSync(passwordFile, 'fixture-password', { mode: 0o600 });
  return {
    origin: 'http://127.0.0.1:4310',
    passwordFile,
    cookies: { set: vi.fn() },
  };
}
it('refuses automatic authentication to remote origins before reading credentials', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(
    openLocalSession({ ...fixture(), origin: 'https://example.com' }),
  ).rejects.toThrow('loopback');
  expect(fetch).not.toHaveBeenCalled();
});
it('refuses publicly readable password files', async () => {
  const input = fixture();
  chmodSync(input.passwordFile, 0o644);
  await expect(openLocalSession(input)).rejects.toThrow('private');
});
it('installs an HttpOnly session cookie without passing the password to the renderer', async () => {
  const input = fixture();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ authenticated: true, expiresAt: 2000000000000 }),
          {
            headers: {
              'set-cookie':
                'dots_session=test-session; Path=/; HttpOnly; SameSite=Strict',
            },
          },
        ),
      ),
  );
  await openLocalSession(input);
  expect(input.cookies.set).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'dots_session',
      value: 'test-session',
      httpOnly: true,
      sameSite: 'strict',
    }),
  );
  expect(JSON.stringify(input.cookies.set.mock.calls)).not.toContain(
    'fixture-password',
  );
});
