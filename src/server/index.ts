import { stateGateDescriptor } from './operations/state-gate.js';
import { loadVoiceMedia } from './runtime/voice-config.js';
import { ComputerService } from './computer-service.js';
import { loadComputerHostQualification } from './runtime/computer-http-edge.js';
import { ownerAuthConfig } from './owner-auth-config.js';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { OwnerAuth } from './owner-auth.js';
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import {
  RuntimeOperations,
  createOperationalShutdown,
  storageDiagnostic,
} from './operations/runtime-operations.js';
import { stateMetrics } from './operations/state-metrics.js';
import { LegacyHistoryReader } from './operations/history-archive.js';
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
import { browserScope } from './self-hosted-platform.js';
import {
  createSlackRuntime,
  startSlackRuntime,
} from './runtime/slack-runtime.js';
if (stateGateDescriptor() === undefined)
  throw new Error(
    'Self-hosted startup requires the supervised lifetime state gate. Use npm start or the documented service launcher.',
  );
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
  {
    service: computerService,
    qualification: computerQualification,
    voiceMedia: loadVoiceMedia(process.env.RYOKO_VOICE_CONFIG_PATH),
    locallyPaused: () => store.settings().paused,
  },
);
const slack = createSlackRuntime({
  database,
  auth,
  platform,
  env: process.env,
  locallyPaused: () => store.settings().paused,
});
const diagnosticsDb = new DatabaseSync(database, { readOnly: true });
const requiredTables = [
  'workspace_owner',
  'spaces',
  'pages',
  'browser_owner',
  'canonical_conversations',
];
const history = process.env.LEGACY_HISTORY_ARCHIVE_PATH
  ? new LegacyHistoryReader(
      process.env.LEGACY_HISTORY_ARCHIVE_PATH,
      workspace.ownerId,
    )
  : undefined;
const operations = new RuntimeOperations(
  {
    storage: () => storageDiagnostic(diagnosticsDb, requiredTables).state,
    conversations: () =>
      !platform.transport
        ? 'unconfigured'
        : platform.transport.connected
          ? 'ready'
          : 'unavailable',
    commands: () =>
      !platform.commands
        ? 'unconfigured'
        : platform.commands.ready()
          ? 'ready'
          : 'unavailable',
    artifacts: () => platform.nativePages?.operationalState() ?? 'unconfigured',
    schedules: () => platform.schedules?.operationalState() ?? 'unconfigured',
    memory: () =>
      platform.identities?.operationalState('memory') ?? 'unconfigured',
    learning: () =>
      platform.identities?.operationalState('learning') ?? 'unconfigured',
    computer: () =>
      platform.nativeComputers?.edge?.operationalState?.() ?? 'unconfigured',
    voice: () => platform.voice?.operationalState() ?? 'unconfigured',
    slack: () => {
      if (!slack) return 'unconfigured';
      if (!platform.workspace.runtimeBindings.hasAgent(slack.config.dotId))
        return 'unavailable';
      const status = slack.status(
        browserScope(
          platform.workspace.runtimeBindings.resolveDot(slack.config.dotId),
        ),
      ).state;
      return status === 'ready'
        ? 'ready'
        : status === 'unconfigured'
          ? 'unconfigured'
          : status === 'unsupported'
            ? 'unsupported'
            : 'unavailable';
    },
  },
  (line) => console.log(line),
  500,
  () => stateMetrics(diagnosticsDb, dirname(database)),
);
console.log(
  JSON.stringify({
    event: 'storage_diagnostic',
    ...storageDiagnostic(diagnosticsDb, requiredTables),
  }),
);
const app = createSelfHostedApp({
  store,
  auth,
  platform,
  slack,
  operations,
  history,
});
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
      .then(() => startSlackRuntime(slack))
      .catch(() =>
        console.error(
          'Ryoko unavailable; consult authenticated capability status.',
        ),
      );
  },
);
const shutdown = createOperationalShutdown({
  operations,
  closeHttp: () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
  stopAdapters: async () => {
    try {
      await slack?.stop();
    } finally {
      await platform.stop();
    }
  },
  closeStorage: () => {
    history?.close();
    diagnosticsDb.close();
    auth.close();
    workspace.close();
    store.close();
  },
  exit: (code) => process.exit(code),
});
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
