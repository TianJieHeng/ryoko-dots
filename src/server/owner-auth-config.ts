import { ownerTokenFromEnvironment } from './operations/operator-secrets.js';

/** Resolve trusted startup configuration only. Never consume forwarded headers. */
export function ownerAuthConfig(env: NodeJS.ProcessEnv) {
  const host = env.HOST ?? '127.0.0.1';
  const port = Number(env.PORT ?? 4310);
  const ownerToken = ownerTokenFromEnvironment(env);
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(host);
  const development = env.NODE_ENV === 'development';
  const listenerOrigin = `${env.TLS_CERT_PATH ? 'https' : 'http'}://${host === '::1' ? '[::1]' : host}:${port}`;
  const origin =
    env.APP_ORIGIN ?? (development ? 'http://127.0.0.1:5173' : listenerOrigin);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer from 1 to 65535.');
  if (!!env.TLS_CERT_PATH !== !!env.TLS_KEY_PATH)
    throw new Error(
      'TLS_CERT_PATH and TLS_KEY_PATH must be configured together.',
    );
  if (
    !loopback &&
    (!ownerToken || !origin.startsWith('https://') || !env.TLS_CERT_PATH)
  )
    throw new Error(
      'External binding requires OWNER_TOKEN, an exact HTTPS APP_ORIGIN, and native TLS certificate/key paths. Use loopback for a TLS reverse proxy.',
    );
  if (
    origin.startsWith('https:') &&
    !env.TLS_CERT_PATH &&
    (!loopback || env.TLS_PROXY !== '1')
  )
    throw new Error(
      'HTTPS proxy mode requires TLS_PROXY=1 and a loopback listener; forwarded headers are never trusted.',
    );
  if (env.TLS_CERT_PATH && !origin.startsWith('https:'))
    throw new Error('Native TLS requires an HTTPS APP_ORIGIN.');
  return {
    host,
    port,
    origin,
    ownerToken,
    ownerId: env.OWNER_ID ?? 'opendots-owner',
    allowLoopbackTlsProxy: loopback && env.TLS_PROXY === '1',
    ...(development ? { developmentApiOrigin: listenerOrigin } : {}),
  };
}
