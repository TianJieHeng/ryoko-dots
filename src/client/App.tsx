import { MemoryLearning } from './runtime/MemoryLearning';
import { specialistsSchema, configSchema } from '../shared/runtime/agents';
import { MissionsPanel } from './runtime/MissionsPanel';
import { controlSchema } from '../shared/runtime/missions';
import { useResource } from './runtime/use-resource';
import { runtimeAction } from './runtime/actions';
import { useConversations } from './runtime/use-conversations';
import { createConversation } from './runtime/conversations';
import { useRuntime } from './runtime/use-runtime';
import { RuntimeStatus } from './runtime/RuntimeStatus';
import { openPageLink } from './page-navigation';
import { SpaceNav } from './SpaceNav';
import { SpaceWorkspace } from './SpaceWorkspace';
import { useCallback, useEffect, useState, useRef } from 'react';
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Clock3,
  Code2,
  Folder,
  Menu,
  MessageCircle,
  LogOut,
  Monitor,
  MoreHorizontal,
  Pause,
  PanelLeft,
  Play,
  Plus,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import type {
  Detail,
  Dot,
  Result,
  State,
  WorkspaceState,
} from '../shared/types';
import {
  api,
  ApiError,
  bootstrapSession,
  getAuthenticationGeneration,
  isAuthenticated,
  logoutSession,
  subscribeAuthentication,
  unlockSession,
} from './api';
import { Mascot } from './Mascot';
import { Chat } from './Chat';
import { ThreadList } from './ThreadList';
import { ResultPane } from './ResultPane';
import { TaskRow } from './TaskPresentation';
import { WorkspaceDialog, type Dialog } from './WorkspaceDialog';

export function App() {
  const [authentication, setAuthentication] = useState({
    authenticated: false,
    generation: getAuthenticationGeneration(),
  });
  const [initializing, setInitializing] = useState(true);
  const [auth, setAuth] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeAuthentication(() => {
      if (active)
        setAuthentication({
          authenticated: isAuthenticated(),
          generation: getAuthenticationGeneration(),
        });
    });
    void bootstrapSession()
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not check your owner session.',
          );
      })
      .finally(() => {
        if (active) setInitializing(false);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const signOut = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setLogoutFailed(false);
    try {
      await logoutSession();
    } catch (cause) {
      setLogoutFailed(true);
      setError(
        `Your workspace is locked, but server sign-out could not be confirmed. ${cause instanceof Error ? cause.message : 'Check your connection and try again.'}`,
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  if (initializing)
    return (
      <main className="unlock">
        <Mascot state="working" />
        <h1>Checking your session…</h1>
      </main>
    );
  if (!authentication.authenticated)
    return (
      <main className="unlock">
        <Mascot />
        <h1>Your own little corner.</h1>
        <p>
          Enter the owner access token configured on this template’s server.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending.current) return;
            const ownerToken = auth;
            setAuth('');
            setError('');
            setLogoutFailed(false);
            pending.current = true;
            setBusy(true);
            try {
              await unlockSession(ownerToken);
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'Access token was not accepted.',
              );
            } finally {
              pending.current = false;
              setBusy(false);
            }
          }}
        >
          <input
            type="password"
            aria-label="Owner access token"
            autoComplete="off"
            value={auth}
            disabled={busy}
            onChange={(event) => setAuth(event.target.value)}
            required
          />
          <button className="primary" disabled={busy}>
            {busy ? 'Please wait…' : 'Unlock OpenDots'}
          </button>
        </form>
        {error && (
          <>
            <p className="chat-error" role="alert">
              {error}
            </p>
            {logoutFailed && (
              <button disabled={busy} onClick={() => void signOut()}>
                Retry sign out
              </button>
            )}
          </>
        )}
        <p className="muted">
          The server keeps your session in an HttpOnly cookie. OpenDots does not
          save your access token in browser storage.
        </p>
      </main>
    );
  return (
    <WorkspaceApp
      key={authentication.generation}
      onSignOut={signOut}
      signingOut={busy}
    />
  );
}

function WorkspaceApp({
  onSignOut,
  signingOut,
}: {
  onSignOut: () => Promise<void>;
  signingOut: boolean;
}) {
  const [state, setState] = useState<State>();
  const [workspace, setWorkspace] = useState<WorkspaceState>();
  const [selectedDot, setSelectedDot] = useState('');
  const runtime = useRuntime(selectedDot);
  const conversationList = useConversations(selectedDot, runtime);
  const control = useResource(
    '/runtime/control',
    controlSchema,
    runtime,
    'missions',
  );
  const specialists = useResource(
    '/runtime/specialists',
    specialistsSchema,
    runtime,
    'specialists',
  );
  const runtimePaused = control.data?.admission !== 'open';
  const [selectedThread, setSelectedThread] = useState<string>();
  const [view, rawSetView] = useState<'chat' | 'tasks' | 'memories' | 'space'>(
    'chat',
  );
  const dirtyPage = useRef(false);
  const [spaceId, setSpaceId] = useState('');
  const [pageId, setPageId] = useState<string>();
  const setDirtyPage = useCallback((value: boolean) => {
    dirtyPage.current = value;
  }, []);
  const setView = (next: typeof view) => {
    if (dirtyPage.current && !window.confirm('Leave your unsaved page draft?'))
      return;
    dirtyPage.current = false;
    if (next !== 'space')
      history.replaceState(null, '', location.pathname + location.search);
    rawSetView(next);
  };
  useEffect(() => {
    let acceptedHash = location.hash;
    const navigate = () => {
      const mission = location.hash.match(
        /^#\/missions\/([A-Za-z0-9_-]+)(?:\/reviews\/([A-Za-z0-9_-]+))?$/,
      );
      if (mission) {
        if (
          dirtyPage.current &&
          !window.confirm('Leave your unsaved page draft?')
        ) {
          history.replaceState(null, '', acceptedHash || location.pathname);
          return;
        }
        acceptedHash = location.hash;
        dirtyPage.current = false;
        rawSetView('tasks');
        setMobile(false);
        return;
      }
      const match = location.hash.match(
        /^#\/spaces\/([^/]+)(?:\/pages\/([^/]+))?$/,
      );
      if (!match) {
        if (acceptedHash && location.hash !== acceptedHash) {
          if (
            dirtyPage.current &&
            !window.confirm('Leave your unsaved page draft?')
          ) {
            history.replaceState(null, '', acceptedHash);
            return;
          }
          dirtyPage.current = false;
          acceptedHash = location.hash;
          setPageId(undefined);
          rawSetView('chat');
        }
        return;
      }
      if (dirtyPage.current && location.hash === acceptedHash) return;
      if (
        dirtyPage.current &&
        !window.confirm('Leave your unsaved page draft?')
      ) {
        history.replaceState(null, '', acceptedHash || location.pathname);
        return;
      }
      acceptedHash = location.hash;
      dirtyPage.current = false;
      setSpaceId(match[1]);
      setPageId(match[2]);
      rawSetView('space');
      setMobile(false);
    };
    navigate();
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  const openPage = (space: string, page?: string) => {
    openPageLink(`#/spaces/${space}${page ? `/pages/${page}` : ''}`);
  };

  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<Dialog>();
  const [mobile, setMobile] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [pane, setPane] = useState(false);
  const [capture, setCapture] = useState<Result>();
  const [prompt, setPrompt] = useState('');
  const [pendingPrompt, setPendingPrompt] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [taskDetail, setTaskDetail] = useState<Detail>();
  const refresh = useCallback(async () => {
    try {
      const [s, w] = await Promise.all([
        api<State>('/state'),
        api<WorkspaceState>('/workspace'),
      ]);
      setState(s);
      setWorkspace(w);
      setSelectedDot((previous) => previous || w.dots[0]?.id || '');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setState(undefined);
        setWorkspace(undefined);
        setCapture(undefined);
        setTaskDetail(undefined);
        setSelectedThread(undefined);
      } else
        setError(
          e instanceof Error ? e.message : 'Could not connect to the server.',
        );
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    setCapture(undefined);
    if (!selectedThread) return;
    let active = true;
    const load = () =>
      void api<Result | null>(`/conversations/${selectedThread}/capture`)
        .then((result) => {
          if (active) setCapture(result ?? undefined);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    load();
    const timer = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selectedThread]);
  const mutate = async (path: string, method: string, body?: unknown) => {
    setError('');
    try {
      if (path === '/dots' || path.startsWith('/dots/')) {
        if (
          !runtime.available('specialists') ||
          !runtime.setup?.scope ||
          !specialists.data
        )
          throw new Error(
            'Specialist configuration awaits the qualified runtime identity adapter.',
          );
        const configuration = configSchema.parse(body);
        const existing = specialists.data.specialists.find(
          (item) => path === `/dots/${item.dotId}`,
        );
        if (path !== '/dots' && !existing)
          throw new Error('This specialist has no verified runtime binding.');
        await runtimeAction(
          runtime.setup.scope,
          existing
            ? `/runtime/specialists/${encodeURIComponent(existing.id)}/actions`
            : '/runtime/specialists',
          existing ? 'configure' : 'create',
          configuration,
          existing?.revision ?? 0,
        );
        await specialists.reload();
      } else if (path.startsWith('/memories') || path === '/settings')
        throw new Error(
          'Use scoped runtime memory and controls. Legacy global mutation is frozen.',
        );
      else await api(path, method, body);
      await refresh();
      if (taskDetail)
        setTaskDetail(await api<Detail>(`/tasks/${taskDetail.task.id}`));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      return false;
    }
  };
  const dot =
    workspace?.dots.find((item) => item.id === selectedDot) ??
    workspace?.dots[0];
  const thread = conversationList.conversations.find(
    (item) => item.id === selectedThread && item.dotId === dot?.id,
  );
  const configured =
    runtime.available('conversations') && runtime.available('commands');
  const chooseDot = (next: Dot) => {
    setSelectedDot(next.id);
    setSelectedThread(
      conversationList.conversations.find((item) => item.dotId === next.id)?.id,
    );
    setView('chat');
    setMobile(false);
    setPendingPrompt(undefined);
  };
  const newConversation = async (text?: string) => {
    if (!dot || !configured || busy) return;
    setBusy(true);
    setError('');
    try {
      if (!runtime.setup?.scope) return;
      const next = await createConversation(
        runtime.setup.scope,
        dot.id,
        text?.slice(0, 80) || 'A new thought',
      );
      await conversationList.reload();
      await refresh();
      setSelectedThread(next.id);
      setPendingPrompt(text);
      setPrompt('');
      setView('chat');
      setMobile(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not create the conversation.',
      );
    } finally {
      setBusy(false);
    }
  };
  if (!state || !workspace || !dot)
    return (
      <main className="unlock">
        <Mascot state="working" />
        <h1>Finding your dots…</h1>
        {error && (
          <>
            <p className="chat-error">{error}</p>
            <button onClick={() => void refresh()}>Retry</button>
          </>
        )}
      </main>
    );
  const content = (
    <div className={`app template-app ${navCollapsed ? 'nav-collapsed' : ''}`}>
      <nav className="icon-rail" aria-label="Workspace navigation">
        <button
          className="rail-brand"
          aria-label="OpenDots home"
          onClick={() => {
            setView('chat');
            setSelectedThread(undefined);
          }}
        >
          o<span>·</span>
        </button>
        <button
          aria-label={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setNavCollapsed(!navCollapsed)}
        >
          <PanelLeft size={18} />
        </button>
        <button
          aria-label="New chat"
          disabled={!configured}
          onClick={() => void newConversation()}
        >
          <Plus size={19} />
        </button>
        <button
          aria-label="Open Spaces"
          onClick={() => {
            if (workspace.spaces[0]) openPage(workspace.spaces[0].id);
          }}
        >
          <Folder size={18} />
        </button>
        <button aria-label="Open activity" onClick={() => setView('tasks')}>
          <Clock3 size={18} />
        </button>
        <button
          className="rail-settings"
          aria-label="Open settings"
          onClick={() => setDialog({ type: 'settings' })}
        >
          <Settings2 size={18} />
        </button>
      </nav>
      <button
        className="mobile-menu icon-button"
        aria-label="Open navigation"
        aria-expanded={mobile}
        aria-controls="workspace-sidebar"
        onClick={() => setMobile(true)}
      >
        <Menu size={21} />
      </button>
      {mobile && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="workspace-sidebar"
        className={`sidebar ${mobile ? 'open' : ''}`}
      >
        <button
          className="wordmark"
          onClick={() => {
            setView('chat');
            setSelectedThread(undefined);
          }}
        >
          <span className="dotted-logo">
            <i />
            <i />
            <i />
            <i />
          </span>
          OpenDots<span className="wordmark-dot">•</span>
        </button>
        <button
          className="new-chat nav-item"
          disabled={!configured}
          onClick={() => void newConversation()}
        >
          <Plus size={17} />
          <span>New chat</span>
        </button>
        <div className="spaces-heading nav-label">
          DOTS
          <button
            className="icon-button"
            aria-label="Create Dot"
            onClick={() =>
              setDialog({ type: 'dot', spaceId: workspace.spaces[0].id })
            }
          >
            <Plus size={14} />
          </button>
        </div>
        <nav className="dots-nav" aria-label="Dots">
          {workspace.dots.map((item) => (
            <div className="dot-nav-row" key={item.id}>
              <button
                className={`dot-nav ${dot.id === item.id && view === 'chat' ? 'active' : ''}`}
                aria-current={
                  dot.id === item.id && view === 'chat' ? 'page' : undefined
                }
                onClick={() => chooseDot(item)}
              >
                <Mascot identity={item.id} name={item.name} small decorative />
                <span>{item.name}</span>
              </button>
              <button
                className="icon-button dot-settings"
                aria-label={`Edit ${item.name} settings`}
                onClick={() =>
                  setDialog({ type: 'dot', dot: item, spaceId: item.spaceId })
                }
              >
                <MoreHorizontal size={15} />
              </button>
            </div>
          ))}
        </nav>
        <div className="spaces-heading nav-label">
          SPACES
          <button
            className="icon-button"
            aria-label="Create Space"
            onClick={() => setDialog({ type: 'space' })}
          >
            <Plus size={14} />
          </button>
        </div>
        <nav className="spaces-nav" aria-label="Spaces">
          {workspace.spaces.map((space) => (
            <SpaceNav
              key={space.id}
              space={space}
              active={view === 'space' && spaceId === space.id}
              pageId={pageId}
              onOpen={(id) => openPage(space.id, id)}
            />
          ))}
        </nav>
        {configured ? (
          <ThreadList
            dotId={dot.id}
            dots={workspace.dots}
            local={conversationList.conversations}
            hasMore={conversationList.hasMore}
            loading={conversationList.busy}
            error={conversationList.error}
            onLoadMore={conversationList.loadMore}
            selected={view === 'chat' ? selectedThread : undefined}
            onSelect={(id) => {
              const conversation = conversationList.conversations.find(
                (item) => item.id === id,
              );
              if (conversation) setSelectedDot(conversation.dotId);
              setSelectedThread(id);
              setView('chat');
              setMobile(false);
            }}
            onNew={() => void newConversation()}
          />
        ) : (
          <div className="sidebar-empty">
            Set up text chat to begin a persistent conversation.
          </div>
        )}
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${view === 'tasks' ? 'active' : ''}`}
            onClick={() => {
              setView('tasks');
              setMobile(false);
            }}
          >
            <Clock3 size={17} />
            <span>Scheduled & activity</span>
            <small>{state.tasks.length}</small>
          </button>
          <button
            className={`nav-item ${view === 'memories' ? 'active' : ''}`}
            onClick={() => {
              setView('memories');
              setMobile(false);
            }}
          >
            <BookOpen size={17} />
            <span>Memories</span>
            <small>Scoped</small>
          </button>
          <button
            className="nav-item"
            onClick={() => setDialog({ type: 'settings' })}
          >
            <Settings2 size={17} />
            <span>Settings & setup</span>
          </button>
          <button
            className="nav-item"
            disabled={signingOut}
            onClick={() => {
              if (
                dirtyPage.current &&
                !window.confirm('Sign out and discard your unsaved page draft?')
              )
                return;
              void onSignOut();
            }}
          >
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
          <a
            className="nav-item"
            href="https://github.com/TianJieHeng/ryoko-dots"
            target="_blank"
            rel="noreferrer"
          >
            <Code2 size={17} />
            <span>Make it your own</span>
            <ArrowUpRight size={13} />
          </a>
          <div className="version">
            OPEN SOURCE TEMPLATE <span>v0.1</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="desktop-nav-toggle document-icon"
            aria-label={navCollapsed ? 'Show navigation' : 'Hide navigation'}
            onClick={() => setNavCollapsed(!navCollapsed)}
          >
            <PanelLeft size={18} />
          </button>
          <div className="breadcrumbs">
            <span>
              {view === 'space'
                ? workspace.spaces.find((space) => space.id === spaceId)?.name
                : 'Dots'}
            </span>
            <span>/</span>
            <strong>
              {view === 'chat'
                ? dot.name
                : view === 'tasks'
                  ? 'Activity'
                  : view === 'space'
                    ? 'Pages'
                    : 'Memories'}
            </strong>
          </div>
          <div className="top-actions">
            <span className="mode-badge">
              {configured ? 'SELF-HOSTED' : 'SETUP REQUIRED'}
            </span>
            <button
              className="pause-button"
              aria-label={
                runtimePaused
                  ? 'Request resumed admissions'
                  : 'Request paused admissions'
              }
              disabled={!control.data || !runtime.available('missions') || busy}
              onClick={async () => {
                if (!runtime.setup?.scope || !control.data || busy) return;
                setBusy(true);
                try {
                  await runtimeAction(
                    runtime.setup.scope,
                    '/runtime/control',
                    runtimePaused ? 'resume' : 'pause',
                    {},
                    control.data.revision,
                  );
                  await control.reload();
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : 'Pause outcome unknown.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {runtimePaused ? <Play size={14} /> : <Pause size={14} />}
              <span>{runtimePaused ? 'Resume' : 'Pause'}</span>
            </button>
            <button
              className="icon-button"
              aria-label={pane ? 'Hide computer' : 'Show computer'}
              aria-expanded={pane}
              onClick={() => setPane(!pane)}
            >
              <Monitor size={18} />
            </button>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError('')}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {control.data && control.data.admission !== 'open' && (
          <div className="notice">
            Admissions: {control.data.admission.replaceAll('_', ' ')} ·
            schedules: {control.data.schedules} · accepted work:{' '}
            {control.data.inFlight}. Pause is not cancellation.
          </div>
        )}
        {view === 'space' ? (
          <SpaceWorkspace
            key={spaceId}
            space={
              workspace.spaces.find((s) => s.id === spaceId) ??
              workspace.spaces[0]
            }
            pageId={pageId}
            workspace={workspace}
            paused={runtimePaused}
            onPage={(id) => openPage(spaceId, id)}
            onSettings={() => setDialog({ type: 'settings' })}
            onCreateDot={() => setDialog({ type: 'dot', spaceId })}
            onDirty={setDirtyPage}
            onRefresh={refresh}
            onSchedule={(threadId) => setDialog({ type: 'schedule', threadId })}
            onThread={(id) => {
              const target = conversationList.conversations.find(
                (t) => t.id === id,
              );
              if (target) {
                setView('chat');
                setSelectedDot(target.dotId);
                setSelectedThread(id);
              }
            }}
          />
        ) : view === 'chat' ? (
          <div className={`chat-workspace ${pane ? 'split' : ''}`}>
            <div className="chat-column">
              {thread && configured ? (
                <Chat
                  key={thread.id}
                  thread={thread}
                  dot={dot}
                  initialPrompt={pendingPrompt}
                  onConsumed={() => setPendingPrompt(undefined)}
                  voiceReady={workspace.setup.voice}
                  calls={workspace.calls.filter(
                    (call) => call.threadId === thread.id,
                  )}
                  paused={runtimePaused}
                  onSaved={refresh}
                  onComputer={() => setPane(true)}
                  onSchedule={() =>
                    setDialog({ type: 'schedule', threadId: thread.id })
                  }
                />
              ) : (
                <div className="new-conversation">
                  <div className="empty-chat-persona">
                    <Mascot
                      identity={dot.id}
                      name={dot.name}
                      state={state.settings.paused ? 'paused' : 'idle'}
                    />
                    <h2>{dot.name}</h2>
                    <p>{dot.instructions}</p>
                    <button
                      className="text-button"
                      onClick={() =>
                        setDialog({ type: 'dot', dot, spaceId: dot.spaceId })
                      }
                    >
                      Edit specialist <MoreHorizontal size={14} />
                    </button>
                  </div>
                  {!configured && (
                    <div className="setup-card">
                      <span className="setup-icon">
                        <Settings2 size={20} />
                      </span>
                      <div>
                        <RuntimeStatus connection={runtime} compact />
                        <p>
                          Spaces remain available. Chat requires the
                          authenticated self-hosted runtime adapter.
                        </p>
                      </div>
                    </div>
                  )}
                  <form
                    className="composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void newConversation(prompt);
                    }}
                  >
                    <textarea
                      aria-label="Start a conversation"
                      placeholder={
                        configured
                          ? `Message ${dot.name}…`
                          : 'Your first conversation starts after setup.'
                      }
                      value={prompt}
                      maxLength={4000}
                      onChange={(e) => setPrompt(e.target.value)}
                      disabled={!configured}
                    />
                    <div className="composer-bottom">
                      <span>
                        <MessageCircle size={14} />
                        Text and calls, one continuing conversation
                      </span>
                      <button
                        className="send-button"
                        aria-label="Start conversation"
                        disabled={!configured || busy || !prompt.trim()}
                      >
                        <ArrowUp size={19} />
                      </button>
                    </div>
                  </form>
                  <div className="starter-suggestions">
                    {[
                      'Help me think this through',
                      'Research a public page',
                      'Make a plan I can follow',
                    ].map((text) => (
                      <button
                        key={text}
                        disabled={!configured}
                        onClick={() => setPrompt(text)}
                      >
                        {text}
                        <ArrowUpRight size={12} />
                      </button>
                    ))}
                  </div>
                  <div className="connection-note">
                    <span
                      className={`online-dot ${runtime.available('slack') ? '' : 'off'}`}
                    />
                    Slack ·{' '}
                    {runtime.setup?.features.slack.state.replaceAll('_', ' ') ??
                      'unavailable'}
                    <button
                      className="text-button"
                      onClick={() => setDialog({ type: 'settings' })}
                    >
                      Setup details
                    </button>
                  </div>
                </div>
              )}
            </div>
            {pane && (
              <ResultPane
                key={dot.id}
                dots={workspace.dots}
                defaultDotId={dot.id}
                latest={capture}
                dotState="idle"
                onClose={() => setPane(false)}
              />
            )}
          </div>
        ) : (
          <main className="main-content">
            <div className="page-heading">
              <div>
                <span className="eyebrow">YOUR WORKSPACE</span>
                <h1>
                  {view === 'memories'
                    ? 'Memories'
                    : 'A little follow-through.'}
                </h1>
                <p>
                  {view === 'memories'
                    ? 'Private memory stays within the selected agent and assigned backend.'
                    : 'Inspect durable missions, exact reviews and independent delivery status.'}
                </p>
              </div>
            </div>
            {view === 'memories' ? (
              <MemoryLearning
                key={JSON.stringify(runtime.setup?.scope)}
                connection={runtime}
              />
            ) : (
              <>
                <MissionsPanel connection={runtime} />
                <details>
                  <summary>Legacy task archive (read-only)</summary>
                  <label className="search-box">
                    <Search size={16} />
                    <input
                      aria-label="Search tasks"
                      placeholder="Find a task…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <div className="task-list">
                    {state.tasks
                      .filter((task) =>
                        task.prompt
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          onClick={() =>
                            void api<Detail>(`/tasks/${task.id}`)
                              .then(setTaskDetail)
                              .catch((e) => setError(e.message))
                          }
                        />
                      ))}
                  </div>
                  {!state.tasks.length && (
                    <div className="large-empty">
                      <Clock3 size={32} />
                      <h2>Let a thought come back around.</h2>
                      <p>
                        Open a conversation and use the clock button to schedule
                        a server-side task.
                      </p>
                    </div>
                  )}
                  {taskDetail && (
                    <section className="task-detail-card">
                      <h2>{taskDetail.task.prompt}</h2>
                      <p className="notice">
                        Historical task record. Execution and scheduling
                        controls are frozen until migration.
                      </p>
                      {taskDetail.task.error && (
                        <p className="chat-error">{taskDetail.task.error}</p>
                      )}
                      {taskDetail.events.slice(-6).map((event) => (
                        <p className="muted" key={event.id}>
                          {event.text}
                        </p>
                      ))}
                      <small>{taskDetail.runs.length} saved runs</small>
                    </section>
                  )}
                </details>
              </>
            )}
          </main>
        )}
        {pane && view !== 'chat' && (
          <div className="computer-overlay">
            <ResultPane
              key={view === 'space' ? spaceId : dot.id}
              dots={workspace.dots}
              defaultDotId={
                view === 'space'
                  ? (workspace.dots.find((candidate) =>
                      candidate.spaceIds.includes(spaceId),
                    )?.id ?? dot.id)
                  : dot.id
              }
              dotState="idle"
              onClose={() => setPane(false)}
            />
          </div>
        )}
      </div>
      {dialog && (
        <WorkspaceDialog
          dialog={dialog}
          state={state}
          workspace={workspace}
          onClose={() => setDialog(undefined)}
          mutate={mutate}
          runtime={runtime}
          specialist={
            dialog.type === 'dot'
              ? specialists.data?.specialists.find(
                  (item) => item.dotId === dialog.dot?.id,
                )
              : undefined
          }
        />
      )}
    </div>
  );
  return content;
}
