import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http, { createServer, type Server } from 'node:http';
import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';
import { readResource } from '../src/browser/transport.js';
// DNS validation is replaced only in this test. Real sockets always target an
// explicit numeric loopback fixture; the Node24 custom-lookup callback is tested
// separately without a socket so environment proxies cannot redirect a fake host.
vi.mock('../src/browser/security.js', () => ({
  validateUrl: async (input: string) => ({
    url: new URL(input),
    address: '127.0.0.1',
    family: 4,
  }),
}));
let server: Server;
let base: string;
let privateHits: number;
beforeEach(async () => {
  privateHits = 0;
  server = createServer((request, response) => {
    if (request.url === '/redirect') {
      response.writeHead(302, { Location: `${base}/private` });
      response.end();
    } else if (request.url === '/private') {
      privateHits++;
      response.end('secret');
    } else if (request.url === '/slow') {
      request.on('close', () => response.destroy());
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<h1>Public fixture</h1><p>${request.headers.host}</p>`);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
describe('DNS-pinned transport', () => {
  it('reads an actual controlled numeric-loopback HTTP connection', async () => {
    const response = await readResource(base);
    expect(response.status).toBe(200);
    expect(response.body.toString()).toContain('Public fixture');
    expect(response.body.toString()).toContain('127.0.0.1');
  });
  it('supports both Node24 custom-lookup callback shapes without a network request', async () => {
    const all = vi.fn(),
      single = vi.fn();
    const request = Object.assign(new EventEmitter(), {
      setTimeout: vi.fn(),
      destroy: vi.fn(),
      end() {
        queueMicrotask(() => {
          const response = Object.assign(new EventEmitter(), {
            statusCode: 200,
            headers: {},
            resume() {},
            destroy() {},
          });
          callback(response as never);
          response.emit('data', Buffer.from('lookup fixture'));
          response.emit('end');
        });
      },
    });
    let callback: (response: never) => void;
    vi.spyOn(http, 'request').mockImplementation(((
      url: unknown,
      options: {
        lookup: (
          host: string,
          options: { all: boolean },
          callback: (...args: unknown[]) => void,
        ) => void;
      },
      onResponse: (response: never) => void,
    ) => {
      expect(String(url)).toBe(`${base}/`);
      options.lookup('fixture.invalid', { all: true }, all);
      options.lookup('fixture.invalid', { all: false }, single);
      callback = onResponse;
      return request;
    }) as unknown as typeof http.request);
    expect((await readResource(base)).body.toString()).toBe('lookup fixture');
    expect(all).toHaveBeenCalledWith(null, [
      { address: '127.0.0.1', family: 4 },
    ]);
    expect(single).toHaveBeenCalledWith(null, '127.0.0.1', 4);
  });
  it('rejects redirects before returning them to a browser or contacting the destination', async () => {
    await expect(readResource(`${base}/redirect`)).rejects.toThrow(
      'Redirects are blocked',
    );
    expect(privateHits).toBe(0);
  });
  it('aborts in-flight transport when the browser client disconnects', async () => {
    const controller = new AbortController();
    const pending = readResource(`${base}/slow`, controller.signal);
    const rejected = expect(pending).rejects.toThrow();
    controller.abort();
    await rejected;
  });
});
