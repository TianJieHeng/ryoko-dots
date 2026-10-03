import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { ComputerPanel } from '../src/client/ComputerPanel';
import { useRuntime } from '../src/client/runtime/use-runtime';
import {
  canUse,
  contractVersion,
  featureNames,
  setupSchema,
} from '../src/shared/runtime/contracts';
import type { RuntimeComputerStatus } from '../src/shared/runtime/computers';
import type { ComputerOperationReference } from '../src/client/runtime/computers';
import type { Dot } from '../src/shared/types';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: vi.fn(actual.useState) };
});
vi.mock('../src/client/runtime/use-runtime', () => ({ useRuntime: vi.fn() }));
vi.mock('../src/client/api', () => ({ api: vi.fn() }));
const { useState: actualUseState } =
  await vi.importActual<typeof import('react')>('react');
const scope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'agent',
  project: null,
  generation: 2,
};
const ready = { state: 'ready', reason: '' };
const setup = setupSchema.parse({
  version: contractVersion,
  runtimeOwner: 'ryoko',
  scope,
  qualified: true,
  controlPlane: ready,
  binding: ready,
  compatibility: ready,
  features: Object.fromEntries(featureNames.map((name) => [name, ready])),
});
const dot: Dot = {
  id: 'dot-one',
  name: 'Test Dot',
  spaceId: 'space',
  spaceIds: ['space'],
  instructions: '',
  researchAllowed: false,
  memoryAllowed: false,
  createdAt: 1,
};
const status: RuntimeComputerStatus = {
  version: contractVersion,
  scope,
  executorId: 'native-computer',
  revision: 3,
  refreshedAt: 100000,
  configured: true,
  state: 'running',
  permissions: { enabled: true, browser: true, files: true, shell: true },
  control: {
    holder: 'bot',
    requested: false,
    transitioning: false,
    resumeSnapshotRequired: false,
  },
  audit: [],
};
beforeEach(() => {
  vi.mocked(useState).mockImplementation(actualUseState);
  vi.mocked(useRuntime).mockReturnValue({
    selector: dot.id,
    setup,
    state: 'ready',
    error: '',
    reload: vi.fn(),
    connect: vi.fn(async () => setup),
    available: (feature) => canUse(setup, feature),
  });
});
function render(
  statusValue: RuntimeComputerStatus,
  pending: ComputerOperationReference[] = [],
  selectedDotId = dot.id,
) {
  // Seed the status and pending state normally loaded by effects; retain real
  // React rendering and all production qualification/ownership gates.
  const states: unknown[] = [
    'Browser',
    { dotId: selectedDotId, status: statusValue },
    '',
    pending,
  ];
  vi.mocked(useState).mockImplementation((initial?: unknown) =>
    actualUseState(states.length ? states.shift() : initial),
  );
  return renderToStaticMarkup(<ComputerPanel dot={dot} />);
}
it('shows an unavailable, unqualified executor without enabled safety or setup controls', () => {
  const html = render({ ...status, configured: false, state: 'unavailable' });
  expect(html).toContain('does not have a qualified, available executor');
  expect(html).toContain(
    'configured service URL alone does not establish readiness',
  );
  expect(html).toMatch(/<button disabled="">Take control now<\/button>/);
  expect(html).toMatch(/<button disabled="">Emergency stop<\/button>/);
  expect(html).toMatch(/<button disabled="">Start computer<\/button>/);
  expect(html).not.toContain('aria-label="Browser URL"');
});
it('requires an explicit fresh snapshot before returning to bot browser actions', () => {
  const html = render({
    ...status,
    control: { ...status.control, resumeSnapshotRequired: true },
  });
  expect(html).toContain(
    'Refresh the executor snapshot before resuming browser actions',
  );
  expect(html).toMatch(/aria-label="Browser URL"[^>]*disabled=""/);
  expect(html).toMatch(/<button>Refresh snapshot<\/button>/);
  expect(html).toMatch(/<button>Take control now<\/button>/);
});
it('exposes GET-only recovery and keeps emergency controls independent of unresolved actions', () => {
  const operation = {
    version: contractVersion,
    scope,
    executorId: 'native-computer',
    revision: 3,
    operationId: 'bdbce8c1-e5d8-40a7-9d56-c9f0a5a9e4ff',
    intentDigest: 'a'.repeat(64),
  };
  const safety = {
    ...operation,
    operationId: '2f536746-5aab-411e-937f-e591db1772ad',
    intentDigest: 'b'.repeat(64),
  };
  const html = render(status, [operation, safety]);
  expect(html).toContain(`Inspect original operation ${operation.operationId}`);
  expect(html).toContain(`Inspect original operation ${safety.operationId}`);
  expect(html).toContain('Inspect original operation');
  expect(html).not.toContain('Inspect original effect');
  expect(html).toMatch(/<button disabled="">Refresh snapshot<\/button>/);
  expect(html).toMatch(/<button>Emergency stop<\/button>/);
});
it('renders a server-resolved executor whose identity differs from the Dot selector', () => {
  const html = render(status);
  expect(html).toContain('Executor native-computer');
  expect(html).toContain('Take control now');
});
it.each([
  { status, selectedDotId: 'previous-dot' },
  {
    status: { ...status, scope: { ...scope, generation: 1 } },
    selectedDotId: dot.id,
  },
])(
  'never renders the preceding Dot or binding before effects clear its state',
  (foreign) => {
    const html = render(foreign.status, [], foreign.selectedDotId);
    expect(html).not.toContain('Executor ');
    expect(html).not.toContain('Take control now');
    expect(html).not.toContain('aria-label="Browser URL"');
  },
);
it('labels direct owner audit records as operations without inventing an effect', () => {
  const html = render({
    ...status,
    audit: [
      {
        id: 'audit',
        action: 'exec',
        actor: 'owner',
        outcome: 'reconciled',
        effectId: null,
        createdAt: 1,
      },
    ],
  });
  expect(html).toContain('owner · reconciled · owner operation');
  expect(html).not.toContain('effect unassigned');
});
