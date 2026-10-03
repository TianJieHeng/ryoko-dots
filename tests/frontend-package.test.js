import { afterEach, expect, it } from 'vitest';
import {
  createFrontendServer,
  frontendCsp,
} from '../scripts/serve-frontend.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const cleanup = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
it('starts frontend assets without runtime credentials or a hosted transport', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dots-frontend-'));
  await writeFile(join(root, 'index.html'), '<h1>Frontend inspection</h1>');
  const server = createFrontendServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await globalThis.fetch(url);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('Frontend inspection');
  expect(response.headers.get('content-security-policy')).toBe(frontendCsp);
  const unavailable = await globalThis.fetch(`${url}/api/runtime/setup`);
  expect(unavailable.status).toBe(503);
  expect((await unavailable.json()).error).toContain(
    'No legacy runtime fallback',
  );
  expect(frontendCsp).not.toMatch(/copilotkit|intelligence|wss:\/\//i);
  const write = await globalThis.fetch(`${url}/index.html`, { method: 'POST' });
  expect(write.status).toBe(405);
  const missing = await globalThis.fetch(`${url}/missing.env`);
  expect(missing.status).toBe(404);
});
