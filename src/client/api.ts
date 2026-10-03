export type OwnerSession = Readonly<{
  authenticated: true;
  csrfToken: string;
  expiresAt: number;
}>;

let session: OwnerSession | undefined;
let authenticationGeneration = 0;
let authenticationRejected = false;
let authenticationQueue: Promise<unknown> = Promise.resolve();
const authenticationListeners = new Set<() => void>();

function removeLegacyToken() {
  try {
    globalThis.sessionStorage?.removeItem('opendots-token');
  } catch {
    // Storage can be disabled. Cookie authentication never depends on it.
  }
}
removeLegacyToken();

export function subscribeAuthentication(listener: () => void) {
  authenticationListeners.add(listener);
  return () => {
    authenticationListeners.delete(listener);
  };
}
export function getAuthenticationGeneration() {
  return authenticationGeneration;
}
export function isAuthenticated() {
  return session !== undefined;
}
function notifyAuthentication() {
  authenticationListeners.forEach((listener) => listener());
}
function beginAuthenticationChange() {
  session = undefined;
  authenticationRejected = false;
  authenticationGeneration++;
  removeLegacyToken();
  notifyAuthentication();
  return authenticationGeneration;
}
function checkGeneration(generation: number) {
  if (generation !== authenticationGeneration)
    throw new ApiError(
      'Authentication changed while the request was in flight.',
      409,
    );
}
function rejectAuthentication() {
  if (authenticationRejected) return;
  authenticationRejected = true;
  session = undefined;
  authenticationGeneration++;
  removeLegacyToken();
  notifyAuthentication();
}
function enqueueAuthentication<T>(operation: () => Promise<T>): Promise<T> {
  // Serialize cookie-setting requests: an older login must finish before a
  // newer logout or login can overwrite its cookie, regardless of UI state.
  const pending = authenticationQueue.then(operation);
  authenticationQueue = pending.catch(() => {});
  return pending;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function readResponse(response: Response): Promise<unknown> {
  return response
    .json()
    .catch(() => ({ error: 'Server returned an unreadable response.' }));
}
function responseError(response: Response, data: unknown) {
  const error =
    data && typeof data === 'object' && 'error' in data
      ? data.error
      : undefined;
  return new ApiError(
    typeof error === 'string' ? error : `Request failed (${response.status}).`,
    response.status,
  );
}
function parseSession(data: unknown): OwnerSession {
  if (
    !data ||
    typeof data !== 'object' ||
    !('authenticated' in data) ||
    data.authenticated !== true ||
    !('csrfToken' in data) ||
    typeof data.csrfToken !== 'string' ||
    !data.csrfToken ||
    !('expiresAt' in data) ||
    typeof data.expiresAt !== 'number' ||
    !Number.isFinite(data.expiresAt) ||
    data.expiresAt <= 0
  )
    throw new ApiError('Server returned an invalid session.', 502);
  return Object.freeze({
    authenticated: true,
    csrfToken: data.csrfToken,
    expiresAt: data.expiresAt,
  });
}
async function requestSession(
  path: '/auth/session' | '/auth/login',
  ownerToken?: string,
): Promise<OwnerSession | undefined> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    method: ownerToken === undefined ? 'GET' : 'POST',
    ...(ownerToken === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerToken }),
        }),
  });
  const data = await readResponse(response);
  if (response.status === 401 && path === '/auth/session') {
    return undefined;
  }
  if (!response.ok) throw responseError(response, data);
  return parseSession(data);
}
function adoptSession(next: OwnerSession | undefined, generation: number) {
  checkGeneration(generation);
  session = next;
  authenticationRejected = next === undefined;
  notifyAuthentication();
  return next;
}
export function bootstrapSession(): Promise<OwnerSession | undefined> {
  const generation = beginAuthenticationChange();
  return enqueueAuthentication(async () => {
    checkGeneration(generation);
    try {
      const next = await requestSession('/auth/session');
      return adoptSession(next, generation);
    } catch (cause) {
      checkGeneration(generation);
      throw cause;
    }
  });
}
export function unlockSession(ownerToken: string): Promise<OwnerSession> {
  const generation = beginAuthenticationChange();
  return enqueueAuthentication(async () => {
    checkGeneration(generation);
    try {
      const next = await requestSession('/auth/login', ownerToken);
      // Login responses must contain the session; only bootstrap can be anonymous.
      if (!next) throw new ApiError('Access token was not accepted.', 401);
      adoptSession(next, generation);
      return next;
    } catch (cause) {
      checkGeneration(generation);
      throw cause;
    }
  });
}
export function logoutSession(): Promise<void> {
  const generation = beginAuthenticationChange();
  return enqueueAuthentication(async () => {
    // Logout must still revoke the preceding cookie if a later bootstrap or
    // login supersedes its UI result. The queue protects that later cookie.
    // A pending login may have created the cookie after logout was requested.
    // Read the current cookie's CSRF value, also covering a lost login response
    // or a cookie rotated by another tab. Never reuse stale session metadata.
    const previous = await requestSession('/auth/session');
    if (previous) {
      const response = await fetch('/api/auth/logout', {
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': previous.csrfToken,
        },
        body: '{}',
      });
      const data = await readResponse(response);
      if (!response.ok && response.status !== 401)
        throw responseError(response, data);
    }
    adoptSession(undefined, generation);
  });
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const generation = authenticationGeneration;
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  if (mutation && !session)
    throw new ApiError('Unlock your owner session before making changes.', 401);
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    method,
    signal,
    headers: mutation
      ? {
          'Content-Type': 'application/json',
          'X-CSRF-Token': session!.csrfToken,
        }
      : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await readResponse(response);
  checkGeneration(generation);
  if (response.status === 401) rejectAuthentication();
  if (!response.ok) throw responseError(response, data);
  return data as T;
}
// Kept for binary artifact reads, which authenticate through same-origin cookies.
export function authHeaders(): Record<string, string> {
  return {};
}
