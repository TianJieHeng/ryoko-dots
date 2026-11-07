const { readFileSync, statSync } = require('node:fs');

// Only the desktop main process reads the private credential. The renderer gets
// the existing HttpOnly session cookie, never the owner's password.
async function openLocalSession({ origin, passwordFile, cookies }) {
  const url = new URL(origin);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname)
  )
    throw Error('Automatic desktop sign-in requires a loopback origin.');
  const saved = await cookies.get({ url: origin });
  if (saved.length) {
    const existing = await fetch(origin + '/api/auth/session', {
      headers: { Cookie: saved.map((c) => `${c.name}=${c.value}`).join('; ') },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (existing.ok) return;
  }
  const info = statSync(passwordFile);
  if (!info.isFile() || info.mode & 0o077 || info.uid !== process.getuid())
    throw Error(
      'Desktop password file must be owned by this user and private.',
    );
  const response = await fetch(origin + '/api/auth/login', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerToken: readFileSync(passwordFile, 'utf8').trim(),
    }),
  });
  if (!response.ok) throw Error('Automatic desktop sign-in failed.');
  const session = await response.json();
  const raw = response.headers.get('set-cookie');
  const pair = raw?.split(';')[0];
  const split = pair?.indexOf('=') ?? -1;
  if (
    split < 1 ||
    !session.authenticated ||
    !Number.isFinite(session.expiresAt)
  )
    throw Error('Invalid desktop sign-in response.');
  await cookies.set({
    url: origin,
    name: pair.slice(0, split),
    value: pair.slice(split + 1),
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
    expirationDate: session.expiresAt / 1000,
  });
}
module.exports = { openLocalSession };
