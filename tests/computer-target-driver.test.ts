import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TargetComputerDriver } from '../src/computer/target-driver.js';
const fake = vi.hoisted(() => ({
  count: vi.fn(async () => 1),
  click: vi.fn(async () => {}),
  fill: vi.fn(async () => {}),
  press: vi.fn(async () => {}),
  snapshot: vi.fn(async () => '- button "Fixture" [ref=e1]'),
  launch: vi.fn(),
  route: vi.fn(),
  on: vi.fn(),
}));
vi.mock('playwright', () => ({
  chromium: { launchPersistentContext: fake.launch },
}));
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.clearAllMocks();
  fake.count.mockImplementation(async () => 1);
  fake.fill.mockImplementation(async () => {});
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'target-driver-fixture-'));
  const locator = {
    count: fake.count,
    click: fake.click,
    fill: fake.fill,
    press: fake.press,
    ariaSnapshot: fake.snapshot,
  };
  const page = {
    url: () => 'https://fixture.invalid',
    isClosed: () => false,
    on: fake.on,
    mainFrame: () => null,
    locator: () => locator,
  };
  fake.launch.mockResolvedValue({
    routeWebSocket: async () => {},
    route: fake.route,
    on: fake.on,
    pages: () => [page],
    close: async () => {},
  });
  const driver = new TargetComputerDriver({
    workspace: directory,
    profiles: directory,
    qualifiedActions: ['snapshot', 'click', 'type', 'files_write'],
  });
  cleanups.push(async () => {
    await driver.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return driver;
}
it('checks the real driver dispatch guard after asynchronous ref resolution', async () => {
  const driver = fixture();
  let opened!: () => void, release!: () => void;
  const atCount = new Promise<void>((r) => (opened = r)),
    wait = new Promise<void>((r) => (release = r));
  fake.count.mockImplementation(async () => {
    opened();
    await wait;
    return 1;
  });
  let allowed = true;
  const work = driver.execute(
    'click',
    { snapshotId: 1, ref: 'e1' },
    {
      signal: AbortSignal.timeout(1000),
      guard: () => {
        if (!allowed) throw new Error('revoked');
      },
    },
  );
  await atCount;
  allowed = false;
  release();
  await expect(work).rejects.toThrow('revoked');
  expect(fake.click).not.toHaveBeenCalled();
});
it('checks again between fill and submit; permission loss cannot submit the partially completed action', async () => {
  const driver = fixture();
  let allowed = true;
  fake.fill.mockImplementation(async () => {
    allowed = false;
  });
  await expect(
    driver.execute(
      'type',
      { snapshotId: 1, ref: 'e1', text: 'synthetic', submit: true },
      {
        signal: AbortSignal.timeout(1000),
        guard: () => {
          if (!allowed) throw new Error('revoked');
        },
      },
    ),
  ).rejects.toThrow('revoked');
  expect(fake.fill).toHaveBeenCalledOnce();
  expect(fake.press).not.toHaveBeenCalled();
});
it('does not launch a browser during construction and emits an actual driver snapshot identity', async () => {
  const driver = fixture();
  expect(fake.launch).not.toHaveBeenCalled();
  const guard = vi.fn();
  expect(
    await driver.observe('snapshot', {}, 19, {
      signal: AbortSignal.timeout(1000),
      guard,
    }),
  ).toMatchObject({ snapshotId: 19, tree: '- button "Fixture" [ref=e1]' });
  expect(guard).toHaveBeenCalled();
  expect(fake.launch.mock.calls[0][1]).toMatchObject({
    chromiumSandbox: true,
    serviceWorkers: 'block',
    acceptDownloads: false,
  });
});
it('refuses unqualified shell and a revoked file primitive without any shell/browser execution', async () => {
  const driver = fixture();
  await expect(
    driver.execute(
      'exec',
      { command: 'never execute this', timeoutMs: 1000 },
      { signal: AbortSignal.timeout(1000), guard: () => {} },
    ),
  ).rejects.toThrow('unqualified');
  await expect(
    driver.execute(
      'files_write',
      { path: 'note.txt', contents: 'fixture', append: false },
      {
        signal: AbortSignal.timeout(1000),
        guard: () => {
          throw new Error('revoked');
        },
      },
    ),
  ).rejects.toThrow('revoked');
  expect(fake.launch).not.toHaveBeenCalled();
});
