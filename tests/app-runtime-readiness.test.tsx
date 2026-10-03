import { useState, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Conversation, State, WorkspaceState } from '../src/shared/types';
import {
  canUse,
  contractVersion,
  featureNames,
  setupSchema,
} from '../src/shared/runtime/contracts';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: vi.fn(actual.useState) };
});
vi.mock('../src/client/api', () => ({
  api: vi.fn(),
  ApiError: class extends Error {},
  getAuthenticationGeneration: () => 1,
}));
vi.mock('../src/client/runtime/use-runtime', () => ({ useRuntime: vi.fn() }));
vi.mock('../src/client/runtime/use-conversations', () => ({
  useConversations: vi.fn(),
}));
vi.mock('../src/client/runtime/conversations', () => ({
  createConversation: vi.fn(),
}));
vi.mock('../src/client/runtime/use-resource', () => ({
  useResource: vi.fn(() => ({
    key: '',
    data: undefined,
    error: 'Runtime resource unavailable',
    loading: false,
    reload: vi.fn(async () => {}),
  })),
}));
vi.mock('../src/client/runtime/use-history', () => ({
  useHistory: () => ({
    history: { messages: [], pageContext: null },
    loading: false,
    error: '',
    reload: vi.fn(),
  }),
}));
vi.mock('../src/client/runtime/use-live-history', () => ({
  useLiveHistory: () => '',
}));
vi.mock('../src/client/runtime/use-commands', () => ({
  useCommands: () => ({ records: [], busy: false, error: '' }),
}));
vi.mock('../src/client/useVoice', () => ({
  useVoice: () => ({ status: 'idle', error: '' }),
}));
vi.mock('../src/client/Chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/Chat')>();
  return {
    Chat: vi.fn((props: ComponentProps<typeof actual.Chat>) => (
      <actual.Chat {...props} />
    )),
  };
});
vi.mock('../src/client/ThreadList', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/client/ThreadList')>();
  return {
    ThreadList: vi.fn((props: ComponentProps<typeof actual.ThreadList>) => (
      <actual.ThreadList {...props} />
    )),
  };
});
vi.mock('../src/client/SpaceNav', () => ({ SpaceNav: () => null }));
vi.mock('../src/client/SpaceWorkspace', () => ({
  SpaceWorkspace: vi.fn(() => null),
}));
vi.mock('../src/client/runtime/MissionsPanel', () => ({
  MissionsPanel: vi.fn(() => null),
}));

import { App } from '../src/client/App';
import { Chat } from '../src/client/Chat';
import { ThreadList } from '../src/client/ThreadList';
import { SpaceWorkspace } from '../src/client/SpaceWorkspace';
import { MissionsPanel } from '../src/client/runtime/MissionsPanel';
import { api } from '../src/client/api';
import { useRuntime } from '../src/client/runtime/use-runtime';
import { useConversations } from '../src/client/runtime/use-conversations';
import { createConversation } from '../src/client/runtime/conversations';
import { useResource } from '../src/client/runtime/use-resource';

const { useState: actualUseState } =
  await vi.importActual<typeof import('react')>('react');
const scope = {
  owner: 'owner',
  gateway: 'gateway',
  agent: 'agent',
  project: null,
  generation: 1,
};
const ready = { state: 'ready', reason: '' };
const setup = setupSchema.parse({
  version: contractVersion,
  runtimeOwner: 'ryoko',
  qualified: true,
  scope,
  controlPlane: ready,
  binding: ready,
  compatibility: ready,
  features: Object.fromEntries(featureNames.map((name) => [name, ready])),
});
const state: State = {
  settings: {
    name: 'Dot',
    paused: false,
    researchAllowed: true,
    memoryAllowed: true,
  },
  tasks: [],
  memories: [],
  mode: 'live',
  configured: true,
};
const conversation: Conversation = {
  id: 'conversation',
  dotId: 'dot',
  ownerId: 'owner',
  title: 'Saved thought',
  createdAt: 1,
};
const foreignConversation = {
  ...conversation,
  id: 'foreign-conversation',
  dotId: 'other-dot',
};
const workspace: WorkspaceState = {
  spaces: [{ id: 'space', name: 'Space', description: '', createdAt: 1 }],
  dots: [
    {
      id: 'dot',
      spaceId: 'space',
      spaceIds: ['space'],
      name: 'Dot',
      instructions: 'Help with a thought',
      researchAllowed: true,
      memoryAllowed: true,
      createdAt: 1,
    },
  ],
  conversations: [],
  calls: [],
  setup: {
    intelligence: false,
    model: false,
    browser: false,
    voice: false,
    slack: '',
    missing: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  const freshSetup = {
    ...setup,
    features: {
      ...setup.features,
      commands: {
        state: 'disconnected' as const,
        reason: 'Connect explicitly',
      },
    },
  };
  vi.mocked(useRuntime).mockReturnValue({
    selector: 'dot',
    setup: freshSetup,
    state: 'degraded',
    error: '',
    reload: vi.fn(),
    connect: vi.fn(async () => freshSetup),
    available: (feature) => canUse(freshSetup, feature),
  });
  vi.mocked(useConversations).mockReturnValue({
    rows: [],
    conversations: [conversation, foreignConversation],
    error: '',
    busy: false,
    hasMore: false,
    loadMore: vi.fn(),
    reload: vi.fn(async () => {}),
  });
  vi.mocked(createConversation).mockResolvedValue(conversation);
  vi.mocked(api).mockImplementation(async (path) =>
    path === '/state' ? state : workspace,
  );
  vi.stubGlobal('location', { pathname: '/', search: '' });
  vi.stubGlobal('history', { replaceState: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

function renderWorkspace(
  selectedThread: string | null = conversation.id,
  view = 'chat',
) {
  // Seed only the App/WorkspaceApp state loaded by effects. Descendant hooks
  // retain real React state and render the actual Chat execution gate.
  const initialStates: unknown[] = [
    { authenticated: true, generation: 1 },
    false, // Session initialization finished.
    '',
    '',
    false,
    false,
    state,
    workspace,
    'dot',
    selectedThread ?? undefined,
    view,
  ];
  vi.mocked(useState).mockImplementation((initial?: unknown) =>
    actualUseState(initialStates.length ? initialStates.shift() : initial),
  );
  return renderToStaticMarkup(<App />);
}

it('reaches the explicit Chat connection control before command execution is ready', () => {
  const html = renderWorkspace();
  expect(html).toContain('Canonical conversation history');
  expect(html).toMatch(/<button type="button">Connect runtime<\/button>/);
  expect(html).toMatch(/aria-label="Send message" disabled=""/);
  expect(html).not.toContain('Your first conversation starts after setup.');
  expect(useRuntime().connect).not.toHaveBeenCalled();
});

it('allows creating a canonical conversation while commands are disconnected', async () => {
  const html = renderWorkspace(null);
  expect(html).toMatch(/aria-label="New chat"(?! disabled)/);
  expect(html).toContain('aria-label="Start a conversation"');
  expect(html).not.toMatch(/aria-label="Start a conversation"[^>]*disabled/);
  const props = vi.mocked(ThreadList).mock.calls[0][0];
  props.onNew();
  await vi.waitFor(() => {
    expect(createConversation).toHaveBeenCalledExactlyOnceWith(
      scope,
      'dot',
      'A new thought',
    );
    expect(api).toHaveBeenCalledWith('/workspace');
  });
  expect(useRuntime().connect).not.toHaveBeenCalled();
});

it('keeps conversation creation and Chat unavailable when canonical storage is unavailable', () => {
  const connection = useRuntime();
  vi.mocked(useRuntime).mockReturnValue({
    ...connection,
    available: () => false,
  });
  const html = renderWorkspace();
  expect(html).toMatch(/aria-label="New chat" disabled=""/);
  expect(html).toContain('Your first conversation starts after setup.');
  expect(Chat).not.toHaveBeenCalled();
});

it('does not turn unavailable global control into an acknowledged pause', () => {
  const html = renderWorkspace();
  expect(vi.mocked(Chat).mock.calls[0][0].paused).toBe(false);
  expect(useResource).not.toHaveBeenCalledWith(
    '/runtime/control',
    expect.anything(),
    expect.anything(),
    expect.anything(),
  );
  expect(html).not.toContain('Request resumed admissions');
  expect(html).not.toContain('Request paused admissions');
  expect(html).not.toContain('Admissions:');

  renderWorkspace(conversation.id, 'space');
  expect(vi.mocked(SpaceWorkspace).mock.calls[0][0].paused).toBe(false);
});

it('passes only the selected current-Dot conversation to Activity controls', () => {
  renderWorkspace(conversation.id, 'tasks');
  const props = vi.mocked(MissionsPanel).mock.calls[0][0];
  expect(props.connection).toBe(useRuntime());
  expect(props.conversationId).toBe(conversation.id);
  expect(props.conversations).toEqual([conversation]);
  expect(props.onConversationChange).toBeTypeOf('function');
});

it.each(['missing-conversation', foreignConversation.id])(
  'does not target Activity controls at stale or foreign selection %s',
  (selected) => {
    renderWorkspace(selected, 'tasks');
    const props = vi.mocked(MissionsPanel).mock.calls[0][0];
    expect(props.conversationId).toBeUndefined();
    expect(props.conversations).toEqual([conversation]);
  },
);
