import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function ownerSession(csrfToken = 'session-csrf') {
  return {
    authenticated: true,
    csrfToken,
    expiresAt: Date.now() + 60_000,
  };
}
function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('owner cookie sessions', () => {
  it('removes the legacy credential without reading or saving browser credentials', async () => {
    const storage = {
      getItem: vi.fn(() => 'legacy-owner-secret'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal('sessionStorage', storage);
    const fetcher = vi.fn(async () => Response.json(ownerSession()));
    vi.stubGlobal('fetch', fetcher);
    const { bootstrapSession, unlockSession, authHeaders } =
      await import('../src/client/api');
    expect(storage.removeItem).toHaveBeenCalledWith('opendots-token');
    await bootstrapSession();
    await unlockSession('new-owner-secret');
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(authHeaders()).toEqual({});
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      '/api/auth/session',
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerToken: 'new-owner-secret' }),
      }),
    );
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('Bearer');
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('legacy-owner');
  });

  it('does not depend on access to sessionStorage', async () => {
    vi.stubGlobal('sessionStorage', {
      removeItem: () => {
        throw new DOMException('Storage unavailable', 'SecurityError');
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(ownerSession())),
    );
    const { bootstrapSession, isAuthenticated } =
      await import('../src/client/api');
    await bootstrapSession();
    expect(isAuthenticated()).toBe(true);
  });

  it('keeps CSRF in memory and sends it for every protected mutation only', async () => {
    const fetcher = vi.fn(async () => Response.json(ownerSession()));
    vi.stubGlobal('fetch', fetcher);
    const { bootstrapSession, api } = await import('../src/client/api');
    await bootstrapSession();
    fetcher.mockClear();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      await api('/example', method, { change: true });
      expect(fetcher).toHaveBeenLastCalledWith(
        '/api/example',
        expect.objectContaining({
          credentials: 'same-origin',
          method,
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'session-csrf',
          },
          body: JSON.stringify({ change: true }),
        }),
      );
    }
    await api('/example');
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/example',
      expect.objectContaining({ method: 'GET', headers: {} }),
    );
  });

  it('does not issue mutations before session bootstrap succeeds', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { api, isAuthenticated } = await import('../src/client/api');
    await expect(api('/example', 'POST', {})).rejects.toMatchObject({
      status: 401,
    });
    expect(isAuthenticated()).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('treats a missing cookie as signed out and rejects malformed sessions', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: 'Session required' }, { status: 401 }),
    );
    vi.stubGlobal('fetch', fetcher);
    const { bootstrapSession, isAuthenticated } =
      await import('../src/client/api');
    await expect(bootstrapSession()).resolves.toBeUndefined();
    expect(isAuthenticated()).toBe(false);
    for (const value of [
      {},
      { ...ownerSession(), authenticated: false },
      { ...ownerSession(), csrfToken: '' },
      { ...ownerSession(), expiresAt: 'later' },
      { ...ownerSession(), expiresAt: 0 },
    ]) {
      fetcher.mockImplementationOnce(async () => Response.json(value));
      await expect(bootstrapSession()).rejects.toMatchObject({ status: 502 });
      expect(isAuthenticated()).toBe(false);
    }
  });

  it('fails closed when owner authentication is not configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: 'Owner access is not configured.' },
          { status: 503 },
        ),
      ),
    );
    const { unlockSession, isAuthenticated } =
      await import('../src/client/api');
    await expect(
      unlockSession('untrusted-client-secret'),
    ).rejects.toMatchObject({
      status: 503,
    });
    expect(isAuthenticated()).toBe(false);
  });

  it('locks immediately and revokes the cookie using the current CSRF token', async () => {
    const fetcher = vi.fn(async () => Response.json(ownerSession()));
    vi.stubGlobal('fetch', fetcher);
    const { bootstrapSession, logoutSession, isAuthenticated, api } =
      await import('../src/client/api');
    await bootstrapSession();
    const logout = logoutSession();
    expect(isAuthenticated()).toBe(false);
    await logout;
    expect(fetcher).toHaveBeenLastCalledWith('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'session-csrf',
      },
      body: '{}',
    });
    await expect(api('/example', 'POST', {})).rejects.toMatchObject({
      status: 401,
    });
  });

  it('does not resurrect a session when logout happens during login', async () => {
    const login = deferredResponse();
    const fetcher = vi.fn(async (path: string) =>
      path === '/api/auth/login'
        ? login.promise
        : path === '/api/auth/session'
          ? Response.json(ownerSession('late-login-csrf'))
          : Response.json({ authenticated: false }),
    );
    vi.stubGlobal('fetch', fetcher);
    const { unlockSession, logoutSession, isAuthenticated } =
      await import('../src/client/api');
    const unlocking = unlockSession('owner-secret');
    const rejected = expect(unlocking).rejects.toMatchObject({ status: 409 });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const logout = logoutSession();
    expect(isAuthenticated()).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    login.resolve(Response.json(ownerSession('late-login-csrf')));
    await rejected;
    await logout;
    expect(isAuthenticated()).toBe(false);
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'late-login-csrf',
        },
      }),
    );
  });

  it('serializes repeated unlocks so stale cookies cannot replace the new session', async () => {
    const first = deferredResponse();
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async () => Response.json(ownerSession('new-csrf')));
    vi.stubGlobal('fetch', fetcher);
    const { unlockSession, api } = await import('../src/client/api');
    const old = unlockSession('first-owner');
    const rejected = expect(old).rejects.toMatchObject({ status: 409 });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const current = unlockSession('second-owner');
    expect(fetcher).toHaveBeenCalledTimes(1);
    first.resolve(Response.json(ownerSession('old-csrf')));
    await rejected;
    await current;
    await api('/example', 'POST', {});
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/example',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'new-csrf',
        },
      }),
    );
  });

  it('fences stale bootstrap success when a newer unlock starts', async () => {
    const bootstrap = deferredResponse();
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => bootstrap.promise)
      .mockImplementation(async () => Response.json(ownerSession('new-csrf')));
    vi.stubGlobal('fetch', fetcher);
    const { bootstrapSession, unlockSession, isAuthenticated } =
      await import('../src/client/api');
    const old = bootstrapSession();
    const rejected = expect(old).rejects.toMatchObject({ status: 409 });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const current = unlockSession('owner');
    bootstrap.resolve(Response.json(ownerSession('old-csrf')));
    await rejected;
    await current;
    expect(isAuthenticated()).toBe(true);
  });

  it('ignores stale unauthorized responses after the next session is established', async () => {
    const stale = deferredResponse();
    const fetcher = vi.fn(async (path: string) =>
      path === '/api/state' ? stale.promise : Response.json(ownerSession()),
    );
    vi.stubGlobal('fetch', fetcher);
    const { bootstrapSession, unlockSession, api, isAuthenticated } =
      await import('../src/client/api');
    await bootstrapSession();
    const request = api('/state');
    const rejected = expect(request).rejects.toMatchObject({ status: 409 });
    await unlockSession('owner');
    stale.resolve(
      Response.json({ error: 'Old session expired' }, { status: 401 }),
    );
    await rejected;
    expect(isAuthenticated()).toBe(true);
  });

  it('completes logout before a newer bootstrap can restore protected state', async () => {
    let cookie = true;
    const fetcher = vi.fn(async (path: string) => {
      if (path === '/api/auth/logout') {
        cookie = false;
        return Response.json({ authenticated: false });
      }
      return cookie
        ? Response.json(ownerSession())
        : Response.json({ error: 'Signed out' }, { status: 401 });
    });
    vi.stubGlobal('fetch', fetcher);
    const { bootstrapSession, logoutSession, isAuthenticated } =
      await import('../src/client/api');
    await bootstrapSession();
    const logout = logoutSession();
    const rejected = expect(logout).rejects.toMatchObject({ status: 409 });
    const next = bootstrapSession();
    await rejected;
    await expect(next).resolves.toBeUndefined();
    expect(cookie).toBe(false);
    expect(isAuthenticated()).toBe(false);
  });

  it('stays locally locked and supports retry when server logout fails', async () => {
    const fetcher = vi.fn(async () => Response.json(ownerSession()));
    vi.stubGlobal('fetch', fetcher);
    const { bootstrapSession, logoutSession, isAuthenticated } =
      await import('../src/client/api');
    await bootstrapSession();
    fetcher.mockRejectedValueOnce(new Error('Connection interrupted'));
    await expect(logoutSession()).rejects.toThrow('Connection interrupted');
    expect(isAuthenticated()).toBe(false);
    await logoutSession();
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('fences stale bootstrap errors without clearing a newer login', async () => {
    const bootstrap = deferredResponse();
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => bootstrap.promise)
      .mockImplementation(async () => Response.json(ownerSession('new-csrf')));
    vi.stubGlobal('fetch', fetcher);
    const { bootstrapSession, unlockSession, isAuthenticated } =
      await import('../src/client/api');
    const old = bootstrapSession();
    const rejected = expect(old).rejects.toMatchObject({ status: 409 });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const current = unlockSession('owner');
    bootstrap.resolve(Response.json({ error: 'Unavailable' }, { status: 503 }));
    await rejected;
    await current;
    expect(isAuthenticated()).toBe(true);
  });

  it('skips an unlock superseded before its request starts', async () => {
    const fetcher = vi.fn(async () => Response.json(ownerSession()));
    vi.stubGlobal('fetch', fetcher);
    const { unlockSession, isAuthenticated } =
      await import('../src/client/api');
    const old = unlockSession('superseded-owner');
    const rejected = expect(old).rejects.toMatchObject({ status: 409 });
    const current = unlockSession('current-owner');
    await rejected;
    await current;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        body: JSON.stringify({ ownerToken: 'current-owner' }),
      }),
    );
    expect(isAuthenticated()).toBe(true);
  });

  it('can revoke a cookie even when the login response was lost', async () => {
    const fetcher = vi.fn(async (path: string) => {
      if (path === '/api/auth/login') throw new Error('Response lost');
      return Response.json(ownerSession('recovered-csrf'));
    });
    vi.stubGlobal('fetch', fetcher);
    const { unlockSession, logoutSession, isAuthenticated } =
      await import('../src/client/api');
    await expect(unlockSession('owner')).rejects.toThrow('Response lost');
    await logoutSession();
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      '/api/auth/login',
      '/api/auth/session',
      '/api/auth/logout',
    ]);
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'recovered-csrf',
        },
      }),
    );
    expect(isAuthenticated()).toBe(false);
  });

  it('discovers fresh CSRF when another tab rotated the cookie before logout', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(async () =>
        Response.json(ownerSession('old-csrf')),
      )
      .mockImplementation(async () =>
        Response.json(ownerSession('rotated-csrf')),
      );
    vi.stubGlobal('fetch', fetcher);
    const { bootstrapSession, logoutSession } =
      await import('../src/client/api');
    await bootstrapSession();
    await logoutSession();
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'rotated-csrf',
        },
      }),
    );
  });

  it('finishes a delayed logout before a newer login can set its cookie', async () => {
    const logoutResponse = deferredResponse();
    const fetcher = vi.fn(async (path: string) =>
      path === '/api/auth/logout'
        ? logoutResponse.promise
        : Response.json(ownerSession()),
    );
    vi.stubGlobal('fetch', fetcher);
    const { bootstrapSession, unlockSession, logoutSession, isAuthenticated } =
      await import('../src/client/api');
    await bootstrapSession();
    const logout = logoutSession();
    const rejected = expect(logout).rejects.toMatchObject({ status: 409 });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    const login = unlockSession('new-owner');
    expect(
      fetcher.mock.calls.some(([path]) => path === '/api/auth/login'),
    ).toBe(false);
    logoutResponse.resolve(Response.json({ authenticated: false }));
    await rejected;
    await login;
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/auth/login',
      expect.anything(),
    );
    expect(isAuthenticated()).toBe(true);
  });
});
