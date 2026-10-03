import { ComputerService } from './computer-service.js';
import { loadComputerHostQualification } from './runtime/computer-http-edge.js';
import { ownerAuthConfig } from './owner-auth-config.js';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { OwnerAuth } from './owner-auth.js';
import { createShutdown } from './shutdown.js';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Store } from './store.js';
import { createSelfHostedApp } from './self-hosted-app.js';
import { SelfHostedPlatform } from './self-hosted-platform.js';
import {
  loadLaunchConfig,
  StdioConversationTransport,
} from './runtime/stdio.js';
import { WorkspaceStore } from './workspace.js';
const authConfig = ownerAuthConfig(process.env);
const { host, port } = authConfig;
const database = process.env.DATABASE_PATH ?? 'data/opendots.sqlite';
const workspace = new WorkspaceStore(database, authConfig.ownerId);
const auth = new OwnerAuth(database, authConfig);
const store = new Store(database);
const launch = loadLaunchConfig(process.env.RYOKO_CONFIG_PATH);
const computerBinding = launch?.nativeComputer
  ? { dotId: launch.dotId, executorId: launch.nativeComputer.executorId }
  : null;
const computerService = computerBinding
  ? new ComputerService(
      workspace,
      {
        computerSupervisorUrl: process.env.COMPUTER_SUPERVISOR_URL,
        computerSupervisorToken: process.env.COMPUTER_SUPERVISOR_TOKEN,
        computerToken: process.env.COMPUTER_TOKEN,
        computerNamespace: process.env.COMPUTER_NAMESPACE,
      },
      () => store.settings().paused,
      fetch,
      70000,
      {
        executorId: (dotId) => {
          if (dotId !== computerBinding.dotId)
            throw new Error('Computer identity mismatch.');
          return computerBinding.executorId;
        },
      },
    )
  : undefined;
const computerQualification = computerBinding
  ? loadComputerHostQualification(
      process.env.COMPUTER_QUALIFICATION_PATH,
      computerBinding,
    )
  : null;
const platform = new SelfHostedPlatform(
  workspace,
  database,
  launch ? new StdioConversationTransport(launch) : undefined,
  { service: computerService, qualification: computerQualification },
);
const app = createSelfHostedApp({ store, auth, platform });
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
  );
  await next();
});
app.get('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
app.use('/*', serveStatic({ root: './dist/client' }));
app.get('*', serveStatic({ path: './dist/client/index.html' }));
const server = serve(
  {
    fetch: app.fetch,
    hostname: host,
    port,
    ...(process.env.TLS_CERT_PATH
      ? {
          createServer,
          serverOptions: {
            cert: readFileSync(process.env.TLS_CERT_PATH),
            key: readFileSync(process.env.TLS_KEY_PATH!),
          },
        }
      : {}),
  },
  (info) => {
    console.log(
      `OpenDots template listening on ${process.env.TLS_CERT_PATH ? 'https' : 'http'}://${host}:${info.port}`,
    );
    // Startup is independent of Intelligence and never starts a legacy scheduler.
    void platform
      .start()
      .catch(() =>
        console.error(
          'Ryoko unavailable; consult authenticated capability status.',
        ),
      );
  },
);
const shutdown = createShutdown({
  stopRunner: () => {},
  stopPlatform: () => platform.stop(),
  closeServer: () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
  exit: (code) => {
    auth.close();
    workspace.close();
    store.close();
    process.exit(code);
  },
  report: (operation) => console.error(operation),
});
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
