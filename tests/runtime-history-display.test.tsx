import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Chat } from '../src/client/Chat';
import { useHistory } from '../src/client/runtime/use-history';
import { historyLimitNotice } from '../src/client/runtime/projection';
import {
  contractVersion,
  type RuntimeHistory,
} from '../src/shared/runtime/contracts';

vi.mock('../src/client/runtime/use-history', () => ({ useHistory: vi.fn() }));
vi.mock('../src/client/runtime/use-runtime', () => ({
  useRuntime: () => ({
    available: (feature: string) => feature === 'conversations',
  }),
}));
vi.mock('../src/client/runtime/use-resource', () => ({
  useResource: () => ({}),
}));
vi.mock('../src/client/runtime/use-live-history', () => ({
  useLiveHistory: () => '',
}));
vi.mock('../src/client/useVoice', () => ({
  useVoice: () => ({ status: 'idle', error: '' }),
}));

const history: RuntimeHistory = {
  version: contractVersion,
  scope: {
    owner: 'owner',
    gateway: 'gateway',
    agent: 'agent',
    project: null,
    generation: 1,
  },
  conversationId: 'conversation',
  lineageId: 'lineage',
  messages: [
    {
      id: 'message',
      revision: 0,
      role: 'user',
      internal: false,
      committed: true,
      parts: [{ kind: 'text', text: 'First visible text' }],
      chunk: {
        offset: 0,
        nextOffset: 100,
        complete: false,
        sanitized: true,
        nonTextOmitted: true,
        physicalSessionId: 'physical-session',
      },
    },
  ],
  nextCursor: 'more-text',
  sessionSequence: 0,
  runtimeCursor: null,
  truncated: false,
  interruption: null,
};
const state = (
  overrides: Partial<ReturnType<typeof useHistory>> = {},
): ReturnType<typeof useHistory> => ({
  key: 'test',
  history,
  error: '',
  limitReached: false,
  loading: false,
  reload: async () => {},
  loadMore: async () => {},
  ...overrides,
});
function render() {
  return renderToStaticMarkup(
    <Chat
      thread={{
        id: 'conversation',
        dotId: 'dot',
        ownerId: 'owner',
        title: 'Conversation',
        createdAt: 0,
      }}
      dot={{
        id: 'dot',
        spaceId: 'space',
        spaceIds: ['space'],
        name: 'dot',
        instructions: '',
        researchAllowed: false,
        memoryAllowed: false,
        createdAt: 0,
      }}
      calls={[]}
      paused={false}
      voiceReady={false}
      onConsumed={() => {}}
      onSaved={() => {}}
      onSchedule={() => {}}
    />,
  );
}
beforeEach(() => vi.mocked(useHistory).mockReturnValue(state()));

it('places the oldest-first load-more control after messages and shows text-only limitations', () => {
  const html = render();
  expect(html.indexOf('First visible text')).toBeLessThan(
    html.indexOf('Load more conversation</button>'),
  );
  expect(html).not.toContain('Load earlier messages');
  expect(html).toContain('only partially loaded');
  expect(html).toContain('sanitized by the server');
  expect(html).toContain('omits non-text content');
});

it('shows a clear client limit and disables further loading while retaining history', () => {
  vi.mocked(useHistory).mockReturnValue(
    state({ error: historyLimitNotice, limitReached: true }),
  );
  const html = render();
  expect(html).toContain(historyLimitNotice);
  expect(html).toContain('First visible text');
  expect(html).toContain('<button disabled="">Load more conversation</button>');
  expect(html).toContain('The full text is not available in this view.');
});

it('reports server truncation without claiming a specific retention cause', () => {
  vi.mocked(useHistory).mockReturnValue(
    state({ history: { ...history, truncated: true, nextCursor: null } }),
  );
  const html = render();
  expect(html).toContain('some conversation history is unavailable');
  expect(html).not.toContain('retention window');
  expect(html).not.toContain('Load more conversation</button>');
});

it('keeps internal-message omission flags out of the visible transcript', () => {
  vi.mocked(useHistory).mockReturnValue(
    state({
      history: {
        ...history,
        messages: history.messages.map((message) => ({
          ...message,
          internal: true,
        })),
        nextCursor: null,
      },
    }),
  );
  const html = render();
  expect(html).not.toContain('First visible text');
  expect(html).not.toContain('sanitized by the server');
  expect(html).not.toContain('omits non-text content');
  expect(html).not.toContain('only partially loaded');
});
