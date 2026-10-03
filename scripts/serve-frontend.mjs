/** Frontend-only, loopback inspection server. No runtime, model, scheduler or proxy. */
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
export const frontendCsp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};
export function createFrontendServer(directory = resolve('dist/client')) {
  const root = resolve(directory);
  return createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', frontendCsp);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    try {
      const path = decodeURIComponent(
        new URL(request.url ?? '/', 'http://127.0.0.1').pathname,
      );
      if (path.startsWith('/api/') || path === '/api') {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            error:
              'Frontend-only preview: the qualified Ryoko backend is not attached. No legacy runtime fallback is available.',
          }),
        );
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) {
        response.writeHead(405);
        response.end();
        return;
      }
      const candidate = resolve(
        root,
        `.${path === '/' ? '/index.html' : path}`,
      );
      if (!candidate.startsWith(`${root}${sep}`)) {
        response.writeHead(404);
        response.end();
        return;
      }
      const file = await realpath(candidate);
      const actualRoot = await realpath(root);
      if (!file.startsWith(`${actualRoot}${sep}`)) {
        response.writeHead(404);
        response.end();
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Content-Length': body.length,
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404);
      response.end('Not found.');
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.FRONTEND_PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('FRONTEND_PORT must be a valid TCP port.');
  const server = createFrontendServer();
  server.listen(port, '127.0.0.1', () =>
    console.log(
      `Frontend-only preview at http://127.0.0.1:${port}; runtime integration unavailable.`,
    ),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => server.close());
}
