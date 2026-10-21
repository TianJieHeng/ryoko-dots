import { randomUUID } from 'node:crypto';
import { CodexAdapter } from './hub/codex.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  readRuntimeManifest,
  enrollHermes,
  runtimeManifest as runtimeManifestSchema,
} from './hub/config.js';
import { realpathSync } from 'node:fs';
import { DotHub } from './hub/service.js';
import { HermesAdapter } from './hub/hermes.js';
import { ApiCredentials } from './hub/credentials.js';
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
const hub = new DotHub(database);
const apiCredentials = new ApiCredentials(database);
if (launch)
  hub.register(
    {
      id: launch.dotId,
      name: workspace.dot(launch.dotId)?.name ?? 'Ryoko',
      kind: 'hermes',
      runtime: 'ryoko-primary',
    },
    new HermesAdapter(platform, launch.dotId),
    true,
  );
const runtimeManifest = readRuntimeManifest(process.env.DOTS_RUNTIMES_PATH);
const runtimeHomes = new Set(launch ? [realpathSync(launch.home)] : []);
for (const entry of runtimeManifest.runtimes) {
  if (entry.kind === 'hermes')
    enrollHermes(hub, entry, database, authConfig.ownerId, runtimeHomes);
  else {
    const directory = join(dirname(database), 'runtimes', entry.id);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    hub.register(
      { id: entry.id, name: entry.name, kind: 'codex', runtime: entry.id },
      new CodexAdapter(entry, join(directory, 'codex.sqlite')),
    );
  }
}
hub.db.exec(
  'CREATE TABLE IF NOT EXISTS hub_enrollments(id TEXT PRIMARY KEY,config TEXT NOT NULL)',
);
const codexTemplates = runtimeManifest.runtimes.filter(
  (entry) => entry.kind === 'codex',
);
hub.templates = codexTemplates.map((entry) => ({
  id: entry.id,
  kind: entry.kind,
  name: entry.name,
}));
function enrollCodex(entry: (typeof codexTemplates)[number]) {
  const directory = join(dirname(database), 'runtimes', entry.id);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  hub.register(
    { id: entry.id, name: entry.name, kind: 'codex', runtime: entry.id },
    new CodexAdapter(entry, join(directory, 'codex.sqlite')),
  );
  return hub.dot(entry.id);
}
for (const row of hub.db.prepare('SELECT config FROM hub_enrollments').all()) {
  const parsed = readRuntimeEntry(String(row.config));
  enrollCodex(parsed);
}
function readRuntimeEntry(value: string) {
  const parsed = runtimeManifestSchema.parse({
    version: 1,
    runtimes: [JSON.parse(value)],
  }).runtimes[0];
  if (parsed.kind !== 'codex')
    throw Error('Invalid persisted runtime enrollment.');
  return parsed;
}
hub.enroll = (templateId, name) => {
  const template = codexTemplates.find((t) => t.id === templateId);
  if (!template) throw Error('Select an owner-configured runtime template.');
  if (
    (hub.db.prepare('SELECT COUNT(*) AS n FROM hub_dots').get()!.n as number) >=
    500
  )
    throw Error('Configured Dot limit reached.');
  const entry = { ...template, id: 'codex-' + randomUUID(), name };
  hub.db
    .prepare('INSERT INTO hub_enrollments VALUES(?,?)')
    .run(entry.id, JSON.stringify(entry));
  return enrollCodex(entry);
};
hub.startRecovery();
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
  hub,
  apiCredentials,
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
      await hub.stop();
      await slack?.stop();
    } finally {
      await platform.stop();
    }
  },
  closeStorage: async () => {
    history?.close();
    diagnosticsDb.close();
    apiCredentials.close();
    auth.close();
    workspace.close();
    store.close();
  },
  exit: (code) => process.exit(code),
});
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
