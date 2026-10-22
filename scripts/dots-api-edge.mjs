#!/usr/bin/env node
// API-only loopback origin for cloudflared. Never serves files or browser login.
import { createServer, request } from 'node:http';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { URL, pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const identifier = '[A-Za-z0-9_-]{1,256}';
const routes = [
  ['GET', '/dots'],
  ['GET', `/dots/${identifier}`],
  ['GET', `/dots/${identifier}/conversations`],
  ['POST', `/dots/${identifier}/conversations`],
  ['GET', `/conversations/${identifier}`],
  ['GET', `/conversations/${identifier}/messages`],
  ['POST', `/conversations/${identifier}/messages`],
  ['GET', `/conversations/${identifier}/runs`],
  ['GET', '/runs'],
  ['GET', `/runs/${identifier}`],
  ['GET', `/runs/${identifier}/events`],
  ['GET', `/runs/${identifier}/children`],
  ['POST', `/runs/${identifier}/cancel`],
  ['GET', '/openapi.json'],
].map(([method, path]) => [
  method,
  new RegExp(`^/api/v1${path.replace('openapi.json', 'openapi\\.json')}$`),
]);
const routeAllowed = (method, path) =>
  routes.some(([m, re]) => m === method && re.test(path));

export function createApiEdge({
  upstream = 'http://127.0.0.1:4310',
  hostname = 'dots.ryoko.okinawa',
  allowedOrigins = [],
  maxBodyBytes = 262144,
  upstreamTimeoutMs = 90000,
} = {}) {
  const target = new URL(upstream);
  if (
    target.protocol !== 'http:' ||
    target.hostname !== '127.0.0.1' ||
    target.pathname !== '/' ||
    target.search ||
    target.hash ||
    target.username ||
    target.password
  )
    throw Error('API edge requires a loopback HTTP upstream origin.');
  if (!/^[a-z0-9.-]+$/.test(hostname)) throw Error('Invalid public hostname.');
  for (const origin of allowedOrigins) {
    const url = new URL(origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol))
      throw Error('CORS origins must be exact HTTP(S) origins.');
  }
  const origins = new Set(allowedOrigins);
  return createServer(
    { maxHeaderSize: 16384, requestTimeout: 30000, headersTimeout: 15000 },
    async (req, res) => {
      const reply = (status, error) => {
        if (res.destroyed || res.writableEnded) return;
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
        });
        res.end(JSON.stringify({ error }));
      };
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Vary', 'Origin');
      const path = (req.url ?? '').split('?')[0];
      const method =
        req.method === 'OPTIONS'
          ? req.headers['access-control-request-method']
          : req.method;
      if (
        req.headers.host !== hostname ||
        (req.url?.length ?? 0) > 8192 ||
        !/^[\x21-\x7e]+$/.test(req.url ?? '') ||
        !routeAllowed(method, path)
      )
        return reply(404, 'Not found.');
      const origin = req.headers.origin;
      if (origin && !origins.has(origin))
        return reply(403, 'App origin is not allowed.');
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      if (req.method === 'OPTIONS') {
        const headers = String(
          req.headers['access-control-request-headers'] ?? '',
        )
          .toLowerCase()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (
          !origin ||
          headers.some((h) => !['authorization', 'content-type'].includes(h))
        )
          return reply(403, 'Preflight is not allowed.');
        res.writeHead(204, {
          'Access-Control-Allow-Methods': method,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '600',
        });
        return res.end();
      }
      const duplicates = ['authorization', 'host'].some(
        (name) =>
          req.rawHeaders.filter(
            (h, i) => i % 2 === 0 && h.toLowerCase() === name,
          ).length !== 1,
      );
      const bearer = req.headers.authorization;
      if (duplicates || !/^Bearer dots_[A-Za-z0-9_-]{43}$/.test(bearer ?? ''))
        return reply(401, 'A Dots app API key is required.');
      if (
        req.method === 'POST' &&
        req.headers['content-type']?.split(';')[0].trim() !== 'application/json'
      )
        return reply(415, 'Use application/json.');
      if (Number(req.headers['content-length'] ?? 0) > maxBodyBytes)
        return reply(413, 'Request body is too large.');
      let bytes = 0;
      const chunks = [];
      try {
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > maxBodyBytes)
            return reply(413, 'Request body is too large.');
          chunks.push(chunk);
        }
      } catch {
        return reply(400, 'Incomplete request.');
      }
      if (req.method === 'GET' && bytes)
        return reply(400, 'GET requests cannot contain a body.');
      const body = Buffer.concat(chunks);
      // Forward only the app credential and JSON protocol headers. Never cookies,
      // browser Origin, forwarded authority headers, redirects or arbitrary hosts.
      const remote = request(
        {
          hostname: target.hostname,
          port: target.port || 80,
          method: req.method,
          path: req.url,
          headers: {
            host: target.host,
            authorization: bearer,
            accept: 'application/json',
            ...(req.method === 'POST'
              ? {
                  'content-type': 'application/json',
                  'content-length': body.length,
                }
              : {}),
          },
        },
        (response) => {
          if (
            !response.headers['content-type']?.startsWith('application/json')
          ) {
            response.resume();
            return reply(502, 'API upstream returned an unexpected response.');
          }
          res.writeHead(response.statusCode ?? 502, {
            'Content-Type': 'application/json; charset=utf-8',
          });
          response.on('error', () => res.destroy());
          response.pipe(res);
        },
      );
      remote.setTimeout(upstreamTimeoutMs, () =>
        remote.destroy(Error('timeout')),
      );
      remote.on('error', () => {
        if (res.headersSent) res.destroy();
        else reply(502, 'Dots API is unavailable.');
      });
      res.on('close', () => remote.destroy());
      remote.end(body);
    },
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const file = process.env.DOTS_API_EDGE_CONFIG;
  if (!file)
    throw Error('Set DOTS_API_EDGE_CONFIG to the private edge configuration.');
  const config = JSON.parse(readFileSync(file, 'utf8'));
  const { port = 4313, ...options } = config;
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error('Invalid edge port.');
  const server = createApiEdge(options);
  server.listen(port, '127.0.0.1', () =>
    console.log(
      `Dots API edge listening on 127.0.0.1:${port}; no tunnel started.`,
    ),
  );
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
