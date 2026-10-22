import { afterAll, beforeAll, expect, test } from 'vitest';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { createApiEdge } from '../scripts/dots-api-edge.mjs';
const token = 'dots_' + 'a'.repeat(43);
let upstream, edge, port;
const seen = [];
beforeAll(async () => {
  upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    seen.push({ headers: req.headers, body, path: req.url });
    if (req.url === '/api/v1/dots/html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<html>must never escape</html>');
    }
    res.writeHead(req.headers.authorization === `Bearer ${token}` ? 200 : 401, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'owner=must-not-escape',
    });
    res.end(JSON.stringify({ ok: true }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  edge = createApiEdge({
    upstream: `http://127.0.0.1:${upstream.address().port}`,
    allowedOrigins: ['https://mobile.ryoko.okinawa'],
    maxBodyBytes: 128,
  });
  edge.listen(0, '127.0.0.1');
  await once(edge, 'listening');
  port = edge.address().port;
});
afterAll(async () => {
  await Promise.all(
    [edge, upstream].map(
      (server) => new Promise((resolve) => server.close(resolve)),
    ),
  );
});
function call(path, { method = 'GET', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: { host: 'dots.ryoko.okinawa', ...headers },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, text }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}
const auth = { authorization: `Bearer ${token}` };
test('only documented chat routes are exposed, never UI, owner login, or admin', async () => {
  const before = seen.length;
  for (const path of [
    '/',
    '/index.html',
    '/assets/app.js',
    '/api/auth/login',
    '/api/runtime/setup',
    '/api/v1/credentials',
    '/api/v1/runtime-templates',
    '/api/v1/dots/../credentials',
    '/api/v1/%2e%2e/auth/login',
    '/api/v1//dots',
    '/api/v1/dots%2fsecret',
    '/api/v1/openapiXjson',
  ]) {
    expect((await call(path, { headers: auth })).status, path).toBe(404);
  }
  expect(
    (await call('/api/v1/dots', { method: 'POST', headers: auth })).status,
  ).toBe(404);
  expect(seen).toHaveLength(before);
});
test('requires a bearer key; cookies cannot become owner authority', async () => {
  expect((await call('/api/v1/dots')).status).toBe(401);
  expect(
    (await call('/api/v1/dots', { headers: { cookie: 'owner=anything' } }))
      .status,
  ).toBe(401);
  expect(
    (
      await call('/api/v1/dots', {
        headers: {
          authorization: 'Bearer dots_' + 'b'.repeat(43),
          cookie: 'owner=anything',
        },
      })
    ).status,
  ).toBe(401);
});
test('forwards native app requests with only bearer/JSON headers and local host', async () => {
  const result = await call('/api/v1/dots?cursor=test', {
    headers: {
      ...auth,
      cookie: 'owner=secret',
      'x-forwarded-host': 'evil.example',
    },
  });
  expect(result.status).toBe(200);
  expect(result.headers['set-cookie']).toBeUndefined();
  expect(result.headers['cache-control']).toBe('no-store');
  expect(seen.at(-1).headers.host).toBe(`127.0.0.1:${upstream.address().port}`);
  expect(seen.at(-1).headers.cookie).toBeUndefined();
  expect(seen.at(-1).headers['x-forwarded-host']).toBeUndefined();
  expect(seen.at(-1).path).toBe('/api/v1/dots?cursor=test');
});
test('rejects foreign host/origin and supports only configured browser preflight', async () => {
  expect(
    (await call('/api/v1/dots', { headers: { ...auth, host: 'evil.example' } }))
      .status,
  ).toBe(404);
  expect(
    (
      await call('/api/v1/dots', {
        headers: { ...auth, origin: 'https://evil.example' },
      })
    ).status,
  ).toBe(403);
  const result = await call('/api/v1/dots', {
    method: 'OPTIONS',
    headers: {
      origin: 'https://mobile.ryoko.okinawa',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization',
    },
  });
  expect(result.status).toBe(204);
  expect(result.headers['access-control-allow-origin']).toBe(
    'https://mobile.ryoko.okinawa',
  );
  expect(result.headers['access-control-allow-credentials']).toBeUndefined();
});
test('preserves JSON message input and bounds body size', async () => {
  const path = '/api/v1/conversations/thread/messages';
  expect((await call(path, { method: 'POST', headers: auth })).status).toBe(
    415,
  );
  const body = JSON.stringify({ operationId: 'stable-id', text: 'hello' });
  expect(
    (
      await call(path, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body,
      })
    ).status,
  ).toBe(200);
  expect(seen.at(-1).body).toBe(body);
  expect(
    (
      await call(path, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: 'x'.repeat(256),
      })
    ).status,
  ).toBe(413);
});
test('never relays an HTML page even if the upstream misroutes', async () => {
  const result = await call('/api/v1/dots/html', { headers: auth });
  expect(result.status).toBe(502);
  expect(result.text).not.toContain('<html>');
});
test('refuses a remote or credential-bearing upstream', () => {
  for (const upstream of [
    'https://example.com',
    'http://localhost:4310',
    'http://127.0.0.1:4310/private',
    'http://owner:secret@127.0.0.1:4310',
  ])
    expect(() => createApiEdge({ upstream })).toThrow();
});
