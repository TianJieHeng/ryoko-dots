/* global setTimeout, structuredClone, document, history, window */
/** Deterministic synthetic browser QA. Never attaches a backend or a provider.
 * Run after npm run build:frontend: node scripts/qa-runtime-browser.mjs
 * Evidence and screenshots go to ignored artifacts/runtime-browser/.
 */
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { createFrontendServer } from './serve-frontend.mjs';

const fixture = JSON.parse(
  await readFile(
    new URL(
      '../tests/fixtures/runtime/browser-workspace.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const out = resolve('artifacts/runtime-browser');
await mkdir(out, { recursive: true });
const server = createFrontendServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const evidence = {
  evidenceKind: fixture.evidenceKind,
  startedAt: new Date().toISOString(),
  limits: fixture.limitations,
  origin,
  checks: [],
  requests: [],
  blockedExternalRequests: [],
  consoleErrors: [],
  pageErrors: [],
  screenshots: [],
};
// Supported fallback: serve the same synthetic contracts to an existing cloud browser.
// This does not attach Playwright/CDP or launch a browser.
if (process.argv.includes('--serve-fixtures')) {
  const staticHandler = server.listeners('request')[0];
  server.removeAllListeners('request');
  let mode = 'qualified',
    scopeLetter = 'a';
  const commands = [];
  server.on('request', async (request, response) => {
    const url = new URL(request.url, origin),
      path = url.pathname;
    if (path === '/' && url.searchParams.has('qa'))
      mode = url.searchParams.get('qa');
    if (!path.startsWith('/api/')) return staticHandler(request, response);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    const body = raw ? JSON.parse(raw) : null;
    evidence.requests.push({
      method: request.method,
      path: path + url.search,
      body,
    });
    await writeFile(
      resolve(out, 'cua-requests.json'),
      JSON.stringify(evidence.requests, null, 2) + '\n',
    );
    const reply = (value, status = 200) => {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify(value));
    };
    const envelope = (value, letter = scopeLetter) => ({
      version: fixture.version,
      scope: fixture.scopes[letter],
      ...value,
    });
    if (path === '/api/state') return reply(fixture.state);
    if (path === '/api/workspace') return reply(fixture.workspace);
    if (path === '/api/runtime/setup') {
      scopeLetter = url.searchParams.get('dotId')?.endsWith('-b') ? 'b' : 'a';
      if (mode === 'unavailable')
        return reply({ error: 'Synthetic unavailable runtime' }, 501);
      return reply(fixture.setup[scopeLetter]);
    }
    if (path === '/api/runtime/control')
      return reply(
        envelope({
          revision: 1,
          admission: 'open',
          schedules: 'paused',
          inFlight: 'continues',
        }),
      );
    if (path === '/api/runtime/conversations') {
      const letter = url.searchParams.get('dotId')?.endsWith('-b') ? 'b' : 'a',
        rows = fixture.conversations[letter];
      return reply(
        envelope(
          {
            conversations: url.searchParams.has('cursor')
              ? rows.slice(1)
              : rows.slice(0, 1),
            nextCursor:
              letter === 'a' && !url.searchParams.has('cursor')
                ? 'older-conversations'
                : null,
          },
          letter,
        ),
      );
    }
    const match = path.match(
      /^\/api\/runtime\/conversations\/([^/]+)\/(history|events|calls|provenance|commands)$/,
    );
    if (match) {
      const [, id, resource] = match,
        letter = id.startsWith('chat-b') ? 'b' : 'a';
      if (resource === 'history')
        return reply(
          envelope(
            {
              conversationId: id,
              lineageId: `lineage-${id}`,
              messages: [
                {
                  id: url.searchParams.has('cursor')
                    ? 'older-message'
                    : `message-${id}`,
                  revision: 1,
                  role: 'assistant',
                  parts: [
                    {
                      kind: 'text',
                      text: url.searchParams.has('cursor')
                        ? 'Synthetic older retained message'
                        : `Synthetic ${letter.toUpperCase()} private transcript`,
                    },
                  ],
                  internal: false,
                  committed: true,
                },
              ],
              pageContext: null,
              nextCursor:
                !url.searchParams.has('cursor') && id === 'chat-a'
                  ? 'older-history'
                  : null,
              sessionSequence: 1,
              runtimeCursor: 'cursor-1',
              truncated: false,
              interruption: null,
            },
            letter,
          ),
        );
      if (resource === 'calls') return reply(envelope({ calls: [] }, letter));
      if (resource === 'provenance')
        return reply(
          envelope(
            { conversationId: id, origins: [], reviewPath: null },
            letter,
          ),
        );
      if (resource === 'events')
        return reply(envelope({ conversationId: id, events: [] }, letter));
      if (resource === 'commands') {
        commands.push(body);
        return reply({ error: 'Synthetic lost receipt' }, 503);
      }
    }
    if (path.startsWith('/api/runtime/commands/')) {
      const command = commands.find((command) =>
        path.endsWith(command.operationId),
      );
      if (command)
        return reply(
          envelope({
            operationId: command.operationId,
            intentDigest: command.intentDigest,
            status: 'accepted',
            missionId: 'mission-a',
            messageId: 'synthetic-message',
            reason: '',
          }),
        );
    }
    if (path === '/api/runtime/missions')
      return reply(
        envelope({
          missions: [
            {
              id: 'mission-a',
              conversationId: 'chat-a',
              revision: 3,
              title: 'Synthetic exact-review mission',
              state: 'ready_to_review',
              output: 'committed',
              delivery: 'held',
              unresolvedEffects: [],
              events: [],
              allowedActions: [],
              reviews: [fixture.review],
            },
          ],
          truncated: false,
        }),
      );
    if (path === '/api/spaces/space-a/pages') return reply(fixture.pages);
    if (/^\/api\/spaces\/space-a\/pages\/page-[ab]$/.test(path))
      return request.method === 'PATCH'
        ? reply({ error: 'Synthetic offline save' }, 503)
        : reply(fixture.pages.find((page) => path.endsWith(page.id)));
    if (/^\/api\/conversations\/[^/]+\/capture$/.test(path)) return reply(null);
    return reply({ error: 'Synthetic fixture endpoint unavailable' }, 501);
  });
  console.log(
    `Synthetic-only existing-browser fixture server: ${origin}/?qa=qualified`,
  );
  await new Promise((resolve) => {
    process.on('SIGTERM', resolve);
    process.on('SIGINT', resolve);
  });
  await new Promise((resolve) => server.close(resolve));
  process.exit(0);
}
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-background-networking'],
  });
} catch (error) {
  evidence.blocker = { stage: 'browser_launch', message: error.message };
  evidence.checks = [
    'unavailable setup fails closed',
    'unqualified setup fails closed',
    'malformed setup fails closed',
    'conversation pagination and canonical history',
    'lost receipt and source survive remount without replay',
    'delayed acceptance preserves newer draft and source',
    'optional capabilities stay unavailable',
    'settings modal initial focus and trap',
    'settings Escape and restored focus',
    'initial draft sends once after history',
    'A to B scope switch clears transcript and draft',
    'Activity exact review and recovery',
    'dirty page Cancel navigation',
    'dirty page browser Back',
    'dirty page browser Forward',
    'computer delayed action and tab switch',
    'narrow navigation and chat',
    'narrow settings Escape',
    'network allowlist and Intelligence exclusion',
    'uncaught browser exceptions',
    'visual screenshot inspection',
  ].map((name) => ({
    name,
    status: 'not_run',
    reason:
      'Chromium could not start in this execution environment; no UI assertion or visual inspection executed.',
  }));
  evidence.finishedAt = new Date().toISOString();
  evidence.summary = { passed: 0, failed: 0, not_run: evidence.checks.length };
  await writeFile(
    resolve(out, 'evidence.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  await new Promise((resolve) => server.close(resolve));
  console.error(
    JSON.stringify({
      summary: evidence.summary,
      blocker: evidence.blocker,
      evidence: resolve(out, 'evidence.json'),
    }),
  );
  process.exit(2);
}
const check = async (name, action) => {
  try {
    await action();
    evidence.checks.push({ name, status: 'passed' });
    console.log(`PASS ${name}`);
  } catch (error) {
    evidence.checks.push({ name, status: 'failed', error: error.message });
    console.log(`FAIL ${name}: ${error.message}`);
  }
};
const shot = async (page, name) => {
  const path = resolve(out, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  evidence.screenshots.push(path);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const createScenario = async (
  mode = 'qualified',
  viewport = { width: 1440, height: 1000 },
) => {
  const context = await browser.newContext({
    viewport,
    serviceWorkers: 'block',
  });
  const state = {
    scope: 'a',
    posts: [],
    inspections: [],
    creates: [],
    reviewPosts: [],
    slowHistory: false,
    holdHistory: false,
    historyRelease: null,
    loseReceipt: true,
    holdCommand: false,
    commandRelease: null,
    computerRelease: null,
    computerPosts: [],
    pages: structuredClone(fixture.pages),
    created: [],
  };
  const page = await context.newPage();
  page.setDefaultTimeout(4000);
  page.on('pageerror', (error) => evidence.pageErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error')
      evidence.consoleErrors.push({ mode, text: msg.text() });
  });
  await context.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) {
      evidence.blockedExternalRequests.push(request.url());
      return route.abort('blockedbyclient');
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname.slice(4),
      method = request.method();
    let body;
    try {
      body = request.postDataJSON();
    } catch {
      body = null;
    }
    evidence.requests.push({
      mode,
      method,
      path: url.pathname + url.search,
      body,
    });
    const send = (value, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(value),
      });
    const letter = url.searchParams.get('dotId')?.endsWith('-b')
      ? 'b'
      : state.scope;
    const envelope = (data, x = state.scope) => ({
      version: fixture.version,
      scope: fixture.scopes[x],
      ...data,
    });
    if (path === '/state') return send(fixture.state);
    if (path === '/workspace') return send(fixture.workspace);
    if (path === '/runtime/setup') {
      state.scope = url.searchParams.get('dotId')?.endsWith('-b') ? 'b' : 'a';
      if (mode === 'unavailable')
        return send({ error: 'Synthetic adapter not installed' }, 501);
      if (mode === 'unqualified')
        return send({ ...fixture.setup[state.scope], qualified: false });
      if (mode === 'malformed')
        return send({
          ...fixture.setup[state.scope],
          unknownCredential: 'must reject',
        });
      return send(
        mode === 'computer'
          ? {
              ...fixture.setup[state.scope],
              features: {
                ...fixture.setup[state.scope].features,
                computer: { state: 'ready', reason: 'Synthetic only' },
              },
            }
          : fixture.setup[state.scope],
      );
    }
    if (path === '/runtime/computers')
      return send(
        envelope({
          executorId: 'synthetic-executor',
          revision: 1,
          refreshedAt: Date.now(),
          configured: true,
          state: 'running',
          permissions: {
            enabled: true,
            browser: false,
            files: true,
            shell: true,
          },
          control: {
            holder: 'bot',
            requested: false,
            transitioning: false,
            resumeSnapshotRequired: false,
          },
          audit: [],
        }),
      );
    if (path === '/runtime/computers/synthetic-executor/actions') {
      state.computerPosts.push(body);
      await new Promise((resolve) => {
        state.computerRelease = resolve;
      });
      return send(
        envelope({
          executorId: 'synthetic-executor',
          revision: 1,
          operationId: body.operationId,
          intentDigest: body.intentDigest,
          effectId: 'synthetic-effect',
          state: 'reconciled',
          output: { text: 'Synthetic delayed output' },
        }),
      );
    }
    if (path === '/runtime/control')
      return send(
        envelope({
          revision: 1,
          admission: 'open',
          schedules: 'paused',
          inFlight: 'continues',
        }),
      );
    if (path === '/runtime/conversations' && method === 'GET') {
      const rows = fixture.conversations[letter];
      return send(
        envelope(
          {
            conversations: url.searchParams.has('cursor')
              ? rows.slice(1)
              : [rows[0], ...state.created],
            nextCursor:
              letter === 'a' && !url.searchParams.has('cursor')
                ? 'older-conversations'
                : null,
          },
          letter,
        ),
      );
    }
    if (path === '/runtime/conversations' && method === 'POST') {
      const conversation = {
        ...fixture.conversations[state.scope][0],
        id: `created-${state.creates.length + 1}`,
        title: body.title,
        lineageId: `created-lineage-${state.creates.length + 1}`,
      };
      state.creates.push(body);
      state.created.push(conversation);
      return send(envelope({ conversation }));
    }
    const conv = path.match(
      /^\/runtime\/conversations\/([^/]+)\/(history|events|calls|provenance|commands)$/,
    );
    if (conv) {
      const [, id, resource] = conv;
      const scopeLetter = id.startsWith('chat-b') ? 'b' : 'a';
      if (resource === 'history') {
        if (state.holdHistory)
          await new Promise((resolve) => {
            state.historyRelease = resolve;
          });
        if (state.slowHistory) await wait(350);
        const older = url.searchParams.has('cursor');
        const text = older
          ? 'Synthetic older retained message'
          : scopeLetter === 'a'
            ? 'Synthetic A private transcript'
            : 'Synthetic B private transcript';
        return send(
          envelope(
            {
              conversationId: id,
              lineageId: id.startsWith('created-')
                ? `created-lineage-${id.split('-')[1]}`
                : `lineage-${id}`,
              messages: id.startsWith('created-')
                ? []
                : [
                    {
                      id: older ? 'message-old' : `message-${id}`,
                      revision: 1,
                      role: 'assistant',
                      parts: [{ kind: 'text', text }],
                      internal: false,
                      committed: true,
                    },
                  ],
              pageContext: null,
              nextCursor: !older && id === 'chat-a' ? 'older-history' : null,
              sessionSequence: 1,
              runtimeCursor: 'cursor-1',
              truncated: false,
              interruption: null,
            },
            scopeLetter,
          ),
        );
      }
      if (resource === 'events')
        return send(envelope({ conversationId: id, events: [] }, scopeLetter));
      if (resource === 'calls')
        return send(envelope({ calls: [] }, scopeLetter));
      if (resource === 'provenance')
        return send(
          envelope(
            { conversationId: id, origins: [], reviewPath: null },
            scopeLetter,
          ),
        );
      if (resource === 'commands') {
        state.posts.push(body);
        if (state.holdCommand)
          await new Promise((resolve) => {
            state.commandRelease = resolve;
          });
        if (state.loseReceipt) {
          state.loseReceipt = false;
          return route.abort('failed');
        }
        return send(
          envelope(
            {
              operationId: body.operationId,
              intentDigest: body.intentDigest,
              status: 'accepted',
              missionId: 'mission-a',
              messageId: 'submitted-message',
              reason: '',
            },
            scopeLetter,
          ),
        );
      }
    }
    if (path.startsWith('/runtime/commands/')) {
      state.inspections.push(path);
      const command = state.posts.find((x) => path.endsWith(x.operationId));
      return send(
        envelope({
          operationId: command.operationId,
          intentDigest: command.intentDigest,
          status: 'accepted',
          missionId: 'mission-a',
          messageId: 'submitted-message',
          reason: '',
        }),
      );
    }
    if (path === '/runtime/missions')
      return send(
        envelope({
          missions: [
            {
              id: 'mission-a',
              conversationId: 'chat-a',
              revision: 3,
              title: 'Synthetic exact-review mission',
              state: 'ready_to_review',
              output: 'committed',
              delivery: 'held',
              unresolvedEffects: [],
              events: [
                {
                  id: 'event-a',
                  time: 1791033600000,
                  summary: 'Synthetic review required',
                },
              ],
              allowedActions: [],
              reviews: [fixture.review],
            },
          ],
          truncated: false,
        }),
      );
    if (path === '/runtime/reviews/review-a/decision') {
      state.reviewPosts.push(body);
      return route.abort('failed');
    }
    if (path.startsWith('/runtime/operations/')) {
      const action = state.reviewPosts.find((x) =>
        path.endsWith(x.operationId),
      );
      if (action)
        return send(
          envelope({
            operationId: action.operationId,
            intentDigest: action.intentDigest,
            status: 'accepted',
            reason: '',
          }),
        );
    }
    if (path === '/spaces/space-a/pages') return send(state.pages);
    const pageMatch = path.match(/^\/spaces\/space-a\/pages\/(page-[ab])$/);
    if (pageMatch) {
      if (method === 'PATCH')
        return send({ error: 'Synthetic offline save; retain draft' }, 503);
      return send(state.pages.find((p) => p.id === pageMatch[1]));
    }
    if (path.match(/^\/conversations\/[^/]+\/capture$/)) return send(null);
    return send(
      { error: `Unhandled synthetic API fixture: ${method} ${path}` },
      501,
    );
  });
  await page.goto(origin);
  await page.getByRole('navigation', { name: 'Dots', exact: true }).waitFor();
  return { context, page, state };
};
try {
  for (const mode of ['unavailable', 'unqualified', 'malformed']) {
    const s = await createScenario(mode);
    await check(`${mode}: runtime chat fails closed`, async () => {
      await s.page
        .getByRole('textbox', { name: 'Start a conversation', exact: true })
        .waitFor();
      assert(
        await s.page
          .getByRole('textbox', { name: 'Start a conversation', exact: true })
          .isDisabled(),
      );
      assert(
        await s.page
          .getByRole('button', { name: 'Start conversation', exact: true })
          .isDisabled(),
      );
      assert.equal(
        evidence.requests.filter(
          (x) =>
            x.mode === mode &&
            (x.method === 'POST' || x.path.includes('/runtime/conversations')),
        ).length,
        0,
      );
    });
    await shot(s.page, `desktop-${mode}`);
    await s.context.close();
  }
  const { context, page, state } = await createScenario();
  await check(
    'qualified: conversation pagination and canonical history',
    async () => {
      await page
        .getByRole('button', { name: 'Load more conversations', exact: true })
        .click();
      await page
        .getByRole('button', {
          name: 'Synthetic A older Synthetic A',
          exact: true,
        })
        .waitFor();
      await page
        .getByRole('button', {
          name: 'Synthetic A current Synthetic A',
          exact: true,
        })
        .click();
      await page
        .getByText('Synthetic A private transcript', { exact: true })
        .waitFor();
      await page
        .getByRole('button', { name: 'Load earlier messages', exact: true })
        .click();
      await page
        .getByText('Synthetic older retained message', { exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByText('Synthetic A private transcript', { exact: true })
          .count(),
        1,
      );
    },
  );
  await check(
    'qualified: lost receipt and source survive remount, repeat send only inspects',
    async () => {
      await page
        .getByRole('textbox', { name: 'Message your Dot', exact: true })
        .fill('Synthetic receipt probe');
      await page
        .getByRole('button', { name: 'Add source page link', exact: true })
        .click();
      await page
        .getByRole('textbox', { name: 'Source page URL', exact: true })
        .fill('https://example.test/original-source');
      await page
        .getByRole('button', { name: 'Send message', exact: true })
        .click();
      await page.getByText(/Admission could not be confirmed/).waitFor();
      await page
        .getByRole('button', { name: 'OpenDots home', exact: true })
        .click();
      await page
        .getByRole('button', {
          name: 'Synthetic A current Synthetic A',
          exact: true,
        })
        .click();
      await page
        .getByText('Synthetic A private transcript', { exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole('textbox', { name: 'Source page URL', exact: true })
          .inputValue(),
        'https://example.test/original-source',
      );
      assert.equal(
        await page
          .getByRole('textbox', { name: 'Message your Dot', exact: true })
          .inputValue(),
        'Synthetic receipt probe',
      );
      await page
        .getByRole('button', { name: 'Send message', exact: true })
        .click();
      await page.getByText(/Work accepted. Execution and delivery/).waitFor();
      assert.equal(state.posts.length, 1);
      assert.equal(state.inspections.length, 1);
      assert(state.inspections[0].endsWith(state.posts[0].operationId));
      assert.equal(
        await page
          .getByRole('textbox', { name: 'Message your Dot', exact: true })
          .inputValue(),
        '',
      );
    },
  );
  await check(
    'qualified: delayed acceptance preserves a newer draft and source',
    async () => {
      state.holdCommand = true;
      await page
        .getByRole('textbox', { name: 'Message your Dot', exact: true })
        .fill('Synthetic delayed original');
      await page
        .getByRole('button', { name: 'Send message', exact: true })
        .click();
      for (let i = 0; !state.commandRelease && i < 40; i++) await wait(50);
      assert(
        state.commandRelease,
        'Fixture must receive first command before replacing draft',
      );
      await page
        .getByRole('textbox', { name: 'Message your Dot', exact: true })
        .fill('Synthetic newer unsent draft');
      await page
        .getByRole('button', { name: 'Add source page link', exact: true })
        .click();
      await page
        .getByRole('textbox', { name: 'Source page URL', exact: true })
        .fill('https://example.test/new-source');
      state.holdCommand = false;
      state.commandRelease();
      await page
        .getByRole('button', { name: 'Send message', exact: true })
        .waitFor();
      await wait(250);
      assert.equal(
        await page
          .getByRole('textbox', { name: 'Message your Dot', exact: true })
          .inputValue(),
        'Synthetic newer unsent draft',
      );
      assert.equal(
        await page
          .getByRole('textbox', { name: 'Source page URL', exact: true })
          .inputValue(),
        'https://example.test/new-source',
      );
    },
  );
  await check('qualified: optional capabilities stay unavailable', async () => {
    for (const name of [
      'Save conversation as page',
      'Schedule a task in this conversation',
      'Start voice call',
    ])
      assert(
        await page.getByRole('button', { name, exact: true }).isDisabled(),
        name,
      );
    assert.equal(
      evidence.requests.filter((x) =>
        /\/runtime\/(voice|specialists|memory|schedules|computer|channels|migration)/.test(
          x.path,
        ),
      ).length,
      0,
    );
  });
  await shot(page, 'desktop-chat');
  await check(
    'settings: focus enters modal and is keyboard trapped',
    async () => {
      await page
        .getByRole('button', { name: 'Open settings', exact: true })
        .click();
      await page.getByRole('dialog').waitFor();
      assert(
        await page.evaluate(() =>
          document
            .querySelector('[role=dialog]')
            ?.contains(document.activeElement),
        ),
        'Opening settings must move keyboard focus into dialog',
      );
      await page.keyboard.press('Shift+Tab');
      assert(
        await page.evaluate(() =>
          document
            .querySelector('[role=dialog]')
            ?.contains(document.activeElement),
        ),
        'Shift+Tab must stay in modal',
      );
    },
  );
  await shot(page, 'desktop-settings');
  await check(
    'settings: Escape closes and restores trigger focus',
    async () => {
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert(
        await page
          .getByRole('button', { name: 'Open settings', exact: true })
          .evaluate((node) => node === document.activeElement),
      );
    },
  );
  await check(
    'qualified: new-conversation initial draft sends once after history',
    async () => {
      await page
        .getByRole('button', { name: 'OpenDots home', exact: true })
        .click();
      state.slowHistory = true;
      await page
        .getByRole('textbox', { name: 'Start a conversation', exact: true })
        .fill('Synthetic initial draft');
      await page
        .getByRole('button', { name: 'Start conversation', exact: true })
        .click();
      await page.getByText(/Work accepted. Execution and delivery/).waitFor();
      assert.equal(state.creates.length, 1);
      assert.equal(
        state.posts.filter((x) => x.intent.text === 'Synthetic initial draft')
          .length,
        1,
      );
      state.slowHistory = false;
    },
  );
  await check(
    'qualified: A to B scope switch clears prior transcript and drafts',
    async () => {
      await page
        .getByRole('textbox', { name: 'Message your Dot', exact: true })
        .fill('Private A unsent draft');
      await page
        .getByRole('navigation', { name: 'Dots', exact: true })
        .getByRole('button', { name: 'Synthetic B', exact: true })
        .click();
      await page
        .getByRole('button', {
          name: 'Synthetic B current Synthetic B',
          exact: true,
        })
        .click();
      await page
        .getByText('Synthetic B private transcript', { exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByText('Synthetic A private transcript', { exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole('textbox', { name: 'Message your Dot', exact: true })
          .inputValue(),
        '',
      );
    },
  );
  await shot(page, 'desktop-scope-b');
  await page
    .getByRole('navigation', { name: 'Dots', exact: true })
    .getByRole('button', { name: 'Synthetic A', exact: true })
    .click();
  await check(
    'Activity: exact review preserves content and ambiguous decision locks',
    async () => {
      await page
        .getByRole('button', { name: 'Open activity', exact: true })
        .click();
      await page
        .getByRole('button', { name: /Synthetic exact-review mission/ })
        .click();
      const review = page.getByRole('region', {
        name: 'Exact action review',
        exact: true,
      });
      await review.waitFor();
      assert.equal(
        await review.locator('pre').textContent(),
        fixture.review.content,
      );
      assert(
        (await review.innerText()).includes(fixture.review.approvalDigest),
      );
      assert((await review.innerText()).includes(fixture.review.actionDigest));
      await review
        .getByRole('button', { name: 'Approve once', exact: true })
        .click();
      await review.getByText(/Decision outcome unknown/).waitFor();
      assert(
        await review
          .getByRole('button', { name: 'Approve once', exact: true })
          .isDisabled(),
      );
      assert(
        await review
          .getByRole('button', { name: 'Deny', exact: true })
          .isDisabled(),
      );
      assert.equal(state.reviewPosts.length, 1);
      assert.deepEqual(state.reviewPosts[0].payload, {
        approvalDigest: fixture.review.approvalDigest,
        choice: 'once',
      });
      assert.equal(state.reviewPosts[0].expectedRevision, 7);
      await review
        .getByRole('button', { name: 'Inspect decision receipt', exact: true })
        .click();
      await review.getByText(/Decision sent/).waitFor();
      assert.equal(state.reviewPosts.length, 1);
    },
  );
  await shot(page, 'desktop-review');
  await check(
    'pages: edit and cancel navigation preserve dirty draft',
    async () => {
      await page.goto(origin + '/#/spaces/space-a/pages/page-a');
      await page
        .getByRole('textbox', { name: 'Page title', exact: true })
        .fill('Synthetic dirty title');
      const dialogPromise = page.waitForEvent('dialog');
      const click = page
        .getByRole('button', { name: 'All pages', exact: true })
        .click({ noWaitAfter: true });
      const dialog = await dialogPromise;
      assert.match(dialog.message(), /unsaved page draft/);
      await dialog.dismiss();
      await click;
      assert.equal(
        await page
          .getByRole('textbox', { name: 'Page title', exact: true })
          .inputValue(),
        'Synthetic dirty title',
      );
      assert(page.url().endsWith('/pages/page-a'));
    },
  );
  await check('pages: browser Back Cancel preserves dirty page', async () => {
    const dialogPromise = page.waitForEvent('dialog');
    await page.evaluate(() => history.back());
    const dialog = await dialogPromise;
    assert.match(dialog.message(), /unsaved page draft/);
    await dialog.dismiss();
    assert.equal(
      await page
        .getByRole('textbox', { name: 'Page title', exact: true })
        .inputValue(),
      'Synthetic dirty title',
    );
    assert(page.url().endsWith('/pages/page-a'));
  });
  await shot(page, 'desktop-dirty-page');
  evidence.checks.push({
    name: 'pages: browser Forward after discarded draft',
    status: 'not_run',
    reason:
      'Back/Cancel safety probe preserves the fixture draft; accepted-discard forward scenario not exercised in this bounded pass.',
  });
  await context.close();
  const computer = await createScenario('computer');
  await check(
    'computer: delayed action survives tab switch, keeps safety controls available',
    async () => {
      await computer.page
        .getByRole('button', { name: 'Show computer', exact: true })
        .click();
      const panel = computer.page.getByRole('region', {
        name: "Synthetic A's computer",
        exact: true,
      });
      await panel.getByRole('tab', { name: 'Terminal', exact: true }).click();
      await panel
        .getByRole('textbox', { name: 'Terminal command', exact: true })
        .fill('synthetic-only-command');
      await panel
        .getByRole('button', { name: 'Run command', exact: true })
        .click();
      for (let i = 0; !computer.state.computerRelease && i < 40; i++)
        await wait(50);
      assert(computer.state.computerRelease);
      await panel.getByRole('tab', { name: 'Files', exact: true }).click();
      assert.equal(await panel.getAttribute('aria-busy'), 'true');
      assert(
        await panel
          .getByRole('button', { name: 'List files', exact: true })
          .isDisabled(),
      );
      assert(
        await panel
          .getByRole('button', { name: 'Take control now', exact: true })
          .isEnabled(),
      );
      assert(
        await panel
          .getByRole('button', { name: 'Emergency stop', exact: true })
          .isEnabled(),
      );
      computer.state.computerRelease();
      await panel.getByText(/reconciled · effect synthetic-effect/).waitFor();
      await wait(100);
      assert.equal(await panel.getAttribute('aria-busy'), 'false');
      assert(
        await panel
          .getByRole('button', { name: 'List files', exact: true })
          .isEnabled(),
      );
      assert.equal(computer.state.computerPosts.length, 1);
      await panel.getByRole('tab', { name: 'Terminal', exact: true }).click();
      await panel.getByText(/Synthetic delayed output/).waitFor();
    },
  );
  await shot(computer.page, 'desktop-computer');
  await computer.context.close();
  const narrow = await createScenario('qualified', { width: 390, height: 844 });
  await check('narrow: navigation, chat and modal remain usable', async () => {
    await narrow.page
      .getByRole('button', { name: 'Open navigation', exact: true })
      .click();
    await narrow.page
      .getByRole('button', {
        name: 'Synthetic A current Synthetic A',
        exact: true,
      })
      .click();
    await narrow.page
      .getByText('Synthetic A private transcript', { exact: true })
      .waitFor();
    const send = narrow.page.getByRole('button', {
      name: 'Send message',
      exact: true,
    });
    const box = await send.boundingBox();
    assert(
      box && box.x >= 0 && box.x + box.width <= 391,
      'Composer send button must fit narrow viewport',
    );
    assert(
      await narrow.page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      'No document horizontal overflow',
    );
  });
  await shot(narrow.page, 'narrow-chat');
  await check('narrow: settings Escape closes', async () => {
    await narrow.page
      .getByRole('button', { name: 'Open navigation', exact: true })
      .click();
    await narrow.page
      .getByRole('button', { name: 'Settings & setup', exact: true })
      .click();
    await narrow.page.getByRole('dialog').waitFor();
    await shot(narrow.page, 'narrow-settings');
    await narrow.page.keyboard.press('Escape');
    await narrow.page.getByRole('dialog').waitFor({ state: 'hidden' });
  });
  await narrow.context.close();
  await check('network: no non-loopback or Intelligence requests', async () => {
    assert.deepEqual(evidence.blockedExternalRequests, []);
    assert(
      !evidence.requests.some((request) =>
        /intelligence|copilotkit|openai|anthropic/i.test(request.path),
      ),
    );
  });
  await check('rendering: no uncaught browser exceptions', async () =>
    assert.deepEqual(evidence.pageErrors, []),
  );
} finally {
  evidence.finishedAt = new Date().toISOString();
  evidence.summary = Object.fromEntries(
    ['passed', 'failed', 'not_run'].map((status) => [
      status,
      evidence.checks.filter((check) => check.status === status).length,
    ]),
  );
  await writeFile(
    resolve(out, 'evidence.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      summary: evidence.summary,
      evidence: resolve(out, 'evidence.json'),
    }),
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  if (evidence.summary.failed) process.exitCode = 1;
}
