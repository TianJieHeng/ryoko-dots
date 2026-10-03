import type { Hono } from 'hono';
export const testOwnerToken = 'synthetic-owner-token-for-tests-only';
export async function loginHeaders(app: Hono, ownerToken = testOwnerToken) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerToken }),
  });
  if (response.status !== 200)
    throw new Error(`Test login failed: ${response.status}`);
  const data = await response.json();
  return {
    Cookie: response.headers.get('set-cookie')!.split(';')[0],
    'X-CSRF-Token': data.csrfToken as string,
    Origin: 'http://localhost',
  };
}
/** Tests still go through production cookie/CSRF authentication; no server bypass. */
export function authenticatedRequests(app: Hono) {
  let headers: Promise<Record<string, string>> | undefined;
  return {
    request: async (path: string, init?: RequestInit) => {
      headers ??= loginHeaders(app);
      const merged = new Headers(await headers);
      new Headers(init?.headers).forEach((value, key) =>
        merged.set(key, value),
      );
      return app.request(path, { ...init, headers: merged });
    },
  };
}
