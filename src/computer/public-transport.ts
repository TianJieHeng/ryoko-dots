import http from 'node:http';
import https from 'node:https';
import { validateUrl } from './public-security.js';
/** Each intercepted browser request is DNS-pinned; never follow redirects or
 * forward proxy/transport credentials. Existing canonical reader is unchanged. */
export async function publicBrowserRequest(
  input: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: Buffer | null;
  },
  signal?: AbortSignal,
) {
  if (
    !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(
      input.method,
    ) ||
    (input.body?.length ?? 0) > 1_000_000
  )
    throw new Error('Request unavailable.');
  const { url, address, family } = await validateUrl(input.url);
  const headers = Object.fromEntries(
    Object.entries(input.headers).filter(
      ([k]) =>
        ![
          'host',
          'connection',
          'proxy-authorization',
          'proxy-connection',
          'transfer-encoding',
          'content-length',
          'accept-encoding',
          'upgrade',
        ].includes(k.toLowerCase()),
    ),
  );
  headers['accept-encoding'] = 'identity';
  return new Promise<{
    status: number;
    headers: Record<string, string>;
    body: Buffer;
  }>((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(
      url,
      {
        method: input.method,
        headers,
        signal,
        lookup: (_host, options, callback) => {
          if (options.all) callback(null, [{ address, family }]);
          else callback(null, address, family);
        },
      },
      (res) => {
        if ((res.statusCode ?? 500) >= 300 && (res.statusCode ?? 500) < 400) {
          res.destroy();
          reject(new Error('Redirect blocked; use canonical URL.'));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 5_000_000) res.destroy(new Error('Response too large.'));
          else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => {
          const safe: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers))
            if (
              v &&
              ![
                'connection',
                'transfer-encoding',
                'content-length',
                'content-encoding',
                'location',
                'refresh',
                'alt-svc',
              ].includes(k)
            )
              safe[k] = Array.isArray(v) ? v.join('\n') : v;
          resolve({
            status: res.statusCode ?? 502,
            headers: safe,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.setTimeout(10000, () => req.destroy(new Error('Request timed out.')));
    req.on('error', reject);
    req.end(input.body ?? undefined);
  });
}
