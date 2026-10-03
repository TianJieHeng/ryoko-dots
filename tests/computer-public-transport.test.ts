import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import http, { createServer, type Server } from 'node:http';
import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';
import { publicBrowserRequest } from '../src/computer/public-transport.js';
// This fixture replaces DNS validation only. Production always uses the shared
// public-address validator; test sockets target explicit numeric loopback.
vi.mock('../src/computer/public-security.js', () => ({
  validateUrl: async (input: string) => ({
    url: new URL(input),
    address: '127.0.0.1',
    family: 4,
  }),
}));
let server: Server,
  base: string,
  hits = 0;
beforeEach(async () => {
  hits = 0;
  server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: base + '/private' });
      res.end();
    } else if (req.url === '/private') {
      hits++;
      res.end('private');
    } else if (req.url === '/large') {
      res.end('x'.repeat(5_000_001));
    } else {
      res.writeHead(200, {
        'content-type': 'text/plain',
        'set-cookie': 'fixture=value; HttpOnly',
        refresh: '0;url=' + base + '/private',
        'alt-svc': 'h3="private:443"',
      });
      res.end(
        req.method +
          ' ' +
          req.headers.host +
          ' ' +
          (req.headers['proxy-authorization'] ?? 'none'),
      );
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
afterEach(async () => {
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});
const request = (path = '', method = 'GET') =>
  publicBrowserRequest({
    url: base + path,
    method,
    headers: { host: 'forged.invalid', 'proxy-authorization': 'secret' },
    body: null,
  });
it('pins the socket destination and strips forged host, proxy and redirect headers', async () => {
  const result = await request('', 'POST');
  expect(result.body.toString()).toBe('POST ' + new URL(base).host + ' none');
  expect(result.headers['set-cookie']).toBe('fixture=value; HttpOnly');
  expect(result.headers.refresh).toBeUndefined();
  expect(result.headers['alt-svc']).toBeUndefined();
});
it('blocks redirect before the private destination and bounds streamed result bytes', async () => {
  await expect(request('/redirect')).rejects.toThrow('Redirect blocked');
  expect(hits).toBe(0);
  await expect(request('/large')).rejects.toThrow('Response too large');
});
it('pins both Node custom lookup shapes instead of asking DNS again at connect time', async () => {
  const one = vi.fn(),
    all = vi.fn();
  let callback: (response: never) => void;
  const req = Object.assign(new EventEmitter(), {
    setTimeout: vi.fn(),
    destroy: vi.fn(),
    end() {
      queueMicrotask(() => {
        const res = Object.assign(new EventEmitter(), {
          statusCode: 200,
          headers: {},
          destroy() {},
        });
        callback(res as never);
        res.emit('data', Buffer.from('pinned'));
        res.emit('end');
      });
    },
  });
  vi.spyOn(http, 'request').mockImplementation(((
    _url: unknown,
    options: {
      lookup: (
        host: string,
        opts: { all: boolean },
        callback: (...args: unknown[]) => void,
      ) => void;
    },
    cb: (response: never) => void,
  ) => {
    options.lookup('untrusted.invalid', { all: false }, one);
    options.lookup('untrusted.invalid', { all: true }, all);
    callback = cb;
    return req;
  }) as unknown as typeof http.request);
  expect((await request()).body.toString()).toBe('pinned');
  expect(one).toHaveBeenCalledWith(null, '127.0.0.1', 4);
  expect(all).toHaveBeenCalledWith(null, [{ address: '127.0.0.1', family: 4 }]);
});
