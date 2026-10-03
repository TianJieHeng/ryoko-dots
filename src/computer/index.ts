import { serve } from '@hono/node-server';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { chromium } from 'playwright';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureComputerIdentity } from './build-identity.js';
import { computerHostQualificationSchema } from '../shared/computer-edge-protocol.js';
import { z } from 'zod';
import { ComputerEdgeStore } from './edge-store.js';
import { ComputerEdgeService } from './edge-service.js';
import { TargetComputerDriver } from './target-driver.js';

const dotId = process.env.COMPUTER_BOT_ID;
const token = process.env.COMPUTER_TOKEN?.trim();
if (
  !dotId ||
  !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(dotId) ||
  !token ||
  token.length < 24
)
  throw new Error('One Dot and a scoped computer credential are required.');
const executorId = process.env.COMPUTER_EXECUTOR_ID ?? `computer:${dotId}`;
const profiles = process.env.PROFILES_DIR ?? '/profiles';
const control = join(profiles, '.dots-edge');
mkdirSync(control, { recursive: true, mode: 0o700 });
const path =
  process.env.COMPUTER_QUALIFICATION_FILE ??
  join(control, 'qualification.json');
const identity = measureComputerIdentity(
  fileURLToPath(new URL('../', import.meta.url)),
  fileURLToPath(new URL('../../../package-lock.json', import.meta.url)),
  {
    dotId,
    executorId,
    workspace: process.env.WORKSPACE_DIR ?? '/workspace',
    profiles,
    browserSandbox: true,
    publicNetworkPolicy: 'dns-pinned-public-canonical-only/1',
    shellPolicy: 'bwrap-unshare-all-no-egress/1',
  },
  '/usr/bin/bwrap',
  chromium.executablePath(),
);
const qualifier = computerHostQualificationSchema.refine(
  (q) =>
    q.evidence === 'target-host' &&
    q.dotId === dotId &&
    q.executorId === executorId &&
    q.buildSha256 === identity.buildSha256 &&
    q.configurationSha256 === identity.configurationSha256,
  'Qualification does not match the actual target.',
);
// No environment toggle manufactures a host qualification. An absent operator
// receipt keeps all capabilities unavailable and never launches a browser.
if (existsSync(path) && statSync(path).size > 65536)
  throw new Error('Qualification file exceeds its bound.');
const qualification =
  process.env.COMPUTER_QUALIFICATION_FILE || existsSync(path)
    ? qualifier.parse(JSON.parse(readFileSync(path, 'utf8')))
    : null;
const db = new DatabaseSync(join(control, 'edge.sqlite'));
const store = new ComputerEdgeStore(db, dotId, executorId);
const driver = new TargetComputerDriver({
  workspace: process.env.WORKSPACE_DIR ?? '/workspace',
  profiles: join(profiles, dotId),
  qualifiedActions: qualification?.actions ?? [],
  onBrowserChange: () =>
    store.tx(() => {
      const s = store.state();
      store.save({
        ...s,
        revision: s.revision + 1,
        resumeSnapshotRequired: true,
        snapshotId: null,
        snapshotSha256: null,
        snapshotAt: null,
      });
    }),
  ...(qualification?.actions.includes('exec')
    ? { shellSandbox: '/usr/bin/bwrap' as const }
    : {}),
});
const edge = new ComputerEdgeService(store, driver, token, Date.now, identity);
const server = serve({
  fetch: (request) => edge.fetch(request),
  hostname: process.env.COMPUTER_HOST ?? '0.0.0.0',
  port: z.coerce
    .number()
    .int()
    .min(1024)
    .max(65535)
    .parse(process.env.PORT ?? 4100),
});
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close(() => {
      void driver.close().finally(() => db.close());
    });
  });
