import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dot } from '../shared/types';
import type { ComputerAction } from '../shared/computer-types';
import {
  computerStatusSchema,
  screenSchema,
  assertFreshScreen,
  type RuntimeComputerStatus,
} from '../shared/runtime/computers';
import { runComputerOperation } from './runtime/computers';
import { sameScope } from '../shared/runtime/contracts';
import { useRuntime } from './runtime/use-runtime';
import { RuntimeStatus } from './runtime/RuntimeStatus';
import type { z } from 'zod';
import { api } from './api';

type Screen = z.infer<typeof screenSchema>;

export function ComputerPanel({ dot }: { dot: Dot }) {
  const [tab, setTab] = useState<'Browser' | 'Files' | 'Terminal' | 'Activity'>(
    'Browser',
  );
  const runtime = useRuntime(dot.id);
  const [status, setStatus] = useState<RuntimeComputerStatus>();
  const [effectNotice, setEffectNotice] = useState('');
  const [pendingEffect, setPendingEffect] = useState(false);
  const unresolved = useRef<
    | { status: RuntimeComputerStatus; action: string; input: unknown }
    | undefined
  >(undefined);
  const [screen, setScreen] = useState<Screen>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [key, setKey] = useState('Enter');
  const [point, setPoint] = useState({ x: 0, y: 0 });
  const [path, setPath] = useState('');
  const [contents, setContents] = useState('');
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState('');
  const [screenError, setScreenError] = useState('');
  useEffect(() => {
    if (!screen) return;
    const timer = setTimeout(
      () => {
        setScreen(undefined);
        setScreenError('Snapshot expired. Refresh before interacting.');
      },
      Math.max(0, 15000 - (Date.now() - screen.capturedAt)),
    );
    return () => clearTimeout(timer);
  }, [screen]);
  const lifecycle = useRef({
    active: false,
    revision: 0,
    busy: false,
    loaded: false,
    running: false,
  });
  const controller = useRef<AbortController | null>(null);
  const base = `/runtime/computers?dotId=${encodeURIComponent(dot.id)}`;
  const runtimeScopeKey = JSON.stringify(runtime.setup?.scope);
  const runtimeReady = runtime.available('computer');
  useEffect(() => {
    unresolved.current = undefined;
    setPendingEffect(false);
    setEffectNotice('');
  }, [runtimeScopeKey]);
  const refresh = useCallback(async () => {
    const revision = lifecycle.current.revision;
    const current = () =>
      lifecycle.current.active && revision === lifecycle.current.revision;
    try {
      if (!runtimeReady || !runtime.setup?.scope) {
        setStatus(undefined);
        setScreen(undefined);
        return;
      }
      const next = computerStatusSchema.parse(
        await api<unknown>(base, 'GET', undefined, controller.current?.signal),
      );
      if (!sameScope(runtime.setup.scope, next.scope))
        throw new Error('Computer belongs to another binding.');
      if (!current()) return;
      setStatus(next);
      lifecycle.current.loaded = true;
      lifecycle.current.running = next.state === 'running';
      setError('');
      if (
        tab === 'Browser' &&
        next.state === 'running' &&
        next.permissions.browser &&
        next.permissions.enabled
      ) {
        try {
          const capture = screenSchema.parse(
            await api<unknown>(
              `/runtime/computers/${encodeURIComponent(next.executorId)}/screen`,
              'GET',
              undefined,
              controller.current?.signal,
            ),
          );
          assertFreshScreen(capture, next, Date.now());
          if (current()) {
            setScreen(capture);
            setScreenError('');
          }
        } catch (cause) {
          if (current()) {
            setScreen(undefined);
            setScreenError(
              cause instanceof Error
                ? cause.message
                : 'Could not refresh the screen.',
            );
          }
        }
      } else {
        setScreen(undefined);
        setScreenError('');
      }
    } catch (cause) {
      if (current()) {
        setStatus(undefined);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load the computer.',
        );
        setScreen(undefined);
      }
    }
  }, [base, runtimeScopeKey, runtimeReady, tab]);
  useEffect(() => {
    lifecycle.current.active = true;
    setScreen(undefined);
    setStatus(undefined);
    setOutput('');
    controller.current = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (
        !document.hidden &&
        !lifecycle.current.busy &&
        (!lifecycle.current.loaded || lifecycle.current.running)
      )
        await refresh();
      if (!cancelled && lifecycle.current.active)
        timer = setTimeout(() => void poll(), 4000);
    };
    void poll();
    return () => {
      cancelled = true;
      lifecycle.current.active = false;
      lifecycle.current.revision++;
      controller.current?.abort();
      clearTimeout(timer);
    };
  }, [refresh]);
  const inspectEffect = async () => {
    const saved = unresolved.current;
    const revision = lifecycle.current.revision;
    if (!saved || lifecycle.current.busy) return;
    lifecycle.current.busy = true;
    setBusy(true);
    try {
      const receipt = await runComputerOperation(
        saved.status,
        saved.action,
        saved.input,
      );
      if (!lifecycle.current.active || revision !== lifecycle.current.revision)
        return;
      setEffectNotice(
        `${receipt.state} · effect ${receipt.effectId ?? 'not assigned'} · operation ${receipt.operationId}`,
      );
      if (['reconciled', 'failed'].includes(receipt.state)) {
        unresolved.current = undefined;
        setPendingEffect(false);
        if (receipt.output) setOutput(JSON.stringify(receipt.output, null, 2));
      }
      await refresh();
    } catch {
      if (lifecycle.current.active)
        setError(
          'Effect outcome remains unknown. Do not repeat the original action.',
        );
    } finally {
      if (revision === lifecycle.current.revision) {
        lifecycle.current.busy = false;
        if (lifecycle.current.active) setBusy(false);
      }
    }
  };
  const run = async (
    endpoint: string,
    body: unknown = {},
    _method = 'POST',
    showOutput = false,
  ) => {
    if (
      !status ||
      !runtimeReady ||
      lifecycle.current.busy ||
      unresolved.current
    )
      return;
    const input = body as { action?: string; input?: unknown };
    const action = endpoint === '/actions' ? input.action! : endpoint.slice(1);
    const payload = endpoint === '/actions' ? input.input : body;
    const request = { status, action, input: payload };
    unresolved.current = request;
    setPendingEffect(true);
    lifecycle.current.busy = true;
    lifecycle.current.revision++;
    const revision = lifecycle.current.revision;
    setBusy(true);
    setError('');
    try {
      const receipt = await runComputerOperation(status, action, payload);
      if (!lifecycle.current.active || revision !== lifecycle.current.revision)
        return;
      setEffectNotice(
        `${receipt.state} · effect ${receipt.effectId ?? 'not assigned'} · operation ${receipt.operationId}`,
      );
      if (['reconciled', 'failed'].includes(receipt.state)) {
        unresolved.current = undefined;
        setPendingEffect(false);
      }
      if (showOutput)
        setOutput(
          receipt.output
            ? JSON.stringify(receipt.output, null, 2)
            : receipt.state,
        );
      await refresh();
      return receipt.state === 'reconciled' ? receipt.output : undefined;
    } catch {
      if (lifecycle.current.active)
        setError(
          'Computer outcome is unknown. Inspect the original effect; remote execution may have occurred.',
        );
    } finally {
      if (revision === lifecycle.current.revision) {
        lifecycle.current.busy = false;
        if (lifecycle.current.active) setBusy(false);
      }
    }
  };
  const safetyAction = async (action: 'take' | 'emergency_stop') => {
    if (!status || !runtimeReady) return;
    const revision = lifecycle.current.revision;
    try {
      const receipt = await runComputerOperation(status, action, {});
      if (lifecycle.current.active && revision === lifecycle.current.revision) {
        setEffectNotice(
          `Safety control ${receipt.state} · ${receipt.operationId}`,
        );
        await refresh();
      }
    } catch {
      if (lifecycle.current.active)
        setError(
          'Safety control acknowledgment is unknown. Inspect the executor directly; do not assume it stopped.',
        );
    }
  };
  const action = (
    action: ComputerAction,
    input: unknown,
    showOutput = false,
  ) => {
    if (action.startsWith('human_')) {
      try {
        if (!screen || !status) throw new Error();
        assertFreshScreen(screen, status, Date.now());
      } catch {
        setError('Refresh a fresh executor snapshot before interacting.');
        return Promise.resolve(undefined);
      }
    }
    return run('/actions', { action, input }, 'POST', showOutput);
  };
  const running =
    status?.state === 'running' && status.permissions.enabled && !pendingEffect;
  const human =
    status?.control?.holder === 'human' && !status.control.transitioning;
  const browser = !!running && !!status?.permissions.browser;
  return (
    <section
      className="computer-panel"
      aria-label={`${dot.name}'s computer`}
      aria-busy={busy}
    >
      {!runtimeReady && <RuntimeStatus connection={runtime} compact />}
      {effectNotice && <p role="status">{effectNotice}</p>}
      {pendingEffect && (
        <button disabled={busy} onClick={() => void inspectEffect()}>
          Inspect original effect
        </button>
      )}
      {status && (
        <div className="computer-actions">
          <span>
            Executor {status.executorId} · revision {status.revision} · state
            refreshed {new Date(status.refreshedAt).toLocaleTimeString()}
          </span>
          <button onClick={() => void safetyAction('take')}>
            Take control now
          </button>
          <button onClick={() => void safetyAction('emergency_stop')}>
            Emergency stop
          </button>
        </div>
      )}
      {error && (
        <p className="computer-error" role="alert">
          {error}
        </p>
      )}
      {!status ? (
        <p role="status">
          {error ? 'Computer status unavailable.' : 'Loading computer…'}
        </p>
      ) : (
        <>
          <div className="computer-status">
            <strong>{status.state.replaceAll('_', ' ')}</strong>
            {status.state !== 'running' && (
              <button disabled={busy} onClick={() => void refresh()}>
                Refresh
              </button>
            )}
            <span>
              {busy ? 'Working…' : human ? 'You have control' : 'Dot control'}
            </span>
          </div>
          {!status.configured && (
            <div className="computer-setup">
              <h3>Connect a computer service</h3>
              <p>
                This Dot does not have a computer service configured. Configure
                the server’s computer service URL and token, then restart. Each
                Dot gets its own browser and workspace.
              </p>
              <a
                href="https://github.com/CopilotKit/OpenDots/blob/main/docs/COMPUTERS.md"
                target="_blank"
                rel="noreferrer"
              >
                Computer setup guide ↗
              </a>
            </div>
          )}
          {status.error && (
            <p className="computer-error" role="alert">
              {status.error}
            </p>
          )}
          <div
            className="computer-tool-tabs"
            role="tablist"
            aria-label="Computer tools"
          >
            {(['Browser', 'Files', 'Terminal', 'Activity'] as const).map(
              (name) => (
                <button
                  role="tab"
                  aria-selected={tab === name}
                  key={name}
                  onClick={() => setTab(name)}
                >
                  {name}
                </button>
              ),
            )}
          </div>
          {status.configured && (
            <>
              <section
                className="computer-section computer-browser"
                hidden={tab !== 'Browser'}
              >
                {!status.permissions.browser && (
                  <p>Enable Browser permission to use the screen.</p>
                )}
                <form
                  className="computer-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void action('navigate', { url });
                  }}
                >
                  <input
                    type="url"
                    aria-label="Browser URL"
                    placeholder="https://example.com"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    required
                    disabled={!browser || busy || human}
                  />
                  <button disabled={!browser || busy || human || !url.trim()}>
                    Go
                  </button>
                </form>
                {screenError && (
                  <p className="computer-error" role="status">
                    {screenError}
                  </p>
                )}
                {screen ? (
                  <>
                    <div className="computer-current-url" title={screen.url}>
                      {screen.url || 'Browser screen'}
                    </div>
                    <button
                      className="computer-screen"
                      aria-label={
                        human
                          ? 'Click a point on the computer screen'
                          : 'Computer screen; take control to interact'
                      }
                      disabled={!browser || !human || busy}
                      onClick={(event) => {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        void action('human_click', {
                          x: Math.min(
                            screen.width - 1,
                            Math.max(
                              0,
                              Math.floor(
                                ((event.clientX - rect.left) / rect.width) *
                                  screen.width,
                              ),
                            ),
                          ),
                          y: Math.min(
                            screen.height - 1,
                            Math.max(
                              0,
                              Math.floor(
                                ((event.clientY - rect.top) / rect.height) *
                                  screen.height,
                              ),
                            ),
                          ),
                        });
                      }}
                    >
                      <img
                        src={`data:image/png;base64,${screen.base64}`}
                        alt={`Last verified browser screen for ${dot.name}`}
                      />
                    </button>
                    <small>
                      Refreshed{' '}
                      {new Date(screen.capturedAt).toLocaleTimeString()}. Screen
                      updates while this panel is open.
                    </small>
                  </>
                ) : (
                  <p className="computer-screen-empty">
                    {running && status.permissions.browser
                      ? 'Waiting for the browser screen…'
                      : 'Start the computer with Browser permission to see its screen.'}
                  </p>
                )}
                <div className="computer-control-pill">
                  <span>
                    {human ? 'You have control' : `${dot.name} has control`}
                  </span>
                  <button
                    disabled={
                      (!human && !browser) ||
                      busy ||
                      status.control?.transitioning
                    }
                    onClick={() => void run(human ? '/release' : '/take')}
                  >
                    {human ? 'Return control' : 'Take over'}
                  </button>
                </div>
                {status.control?.transitioning && (
                  <p role="status">Transferring control…</p>
                )}
                {human && (
                  <details className="computer-human">
                    <summary>Keyboard & precise controls</summary>
                    <p>
                      Click the screen or enter coordinates below. Text is sent
                      through the scoped executor broker, outside chat. Return
                      control when finished.
                    </p>
                    <form
                      className="computer-row"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void action('human_click', point);
                      }}
                    >
                      <label>
                        X
                        <input
                          type="number"
                          min="0"
                          max={screen ? screen.width - 1 : undefined}
                          value={point.x}
                          onChange={(event) =>
                            setPoint({
                              ...point,
                              x: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Y
                        <input
                          type="number"
                          min="0"
                          max={screen ? screen.height - 1 : undefined}
                          value={point.y}
                          onChange={(event) =>
                            setPoint({
                              ...point,
                              y: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <button disabled={busy || !browser || !screen}>
                        Click
                      </button>
                    </form>
                    <form
                      className="computer-row"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const value = text;
                        setText('');
                        void action('human_type', { text: value });
                      }}
                    >
                      <input
                        type="password"
                        aria-label="Text to type into computer"
                        placeholder="Type into focused field"
                        autoComplete="off"
                        value={text}
                        maxLength={20000}
                        onChange={(event) => setText(event.target.value)}
                      />
                      <button disabled={busy || !browser || !text}>Type</button>
                    </form>
                    <form
                      className="computer-row"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void action('human_key', { key });
                      }}
                    >
                      <select
                        aria-label="Key to press"
                        value={key}
                        onChange={(event) => setKey(event.target.value)}
                      >
                        {[
                          'Enter',
                          'Tab',
                          'Escape',
                          'Backspace',
                          'ArrowUp',
                          'ArrowDown',
                          'ArrowLeft',
                          'ArrowRight',
                        ].map((name) => (
                          <option key={name}>{name}</option>
                        ))}
                      </select>
                      <button disabled={busy || !browser}>Press key</button>
                    </form>
                    <div className="computer-actions">
                      <button
                        disabled={busy || !browser}
                        onClick={() =>
                          void action('human_scroll', { deltaY: -500 })
                        }
                      >
                        Scroll up
                      </button>
                      <button
                        disabled={busy || !browser}
                        onClick={() =>
                          void action('human_scroll', { deltaY: 500 })
                        }
                      >
                        Scroll down
                      </button>
                    </div>
                  </details>
                )}
              </section>
              <details
                className="computer-section"
                open
                hidden={tab !== 'Files'}
              >
                <summary>Workspace files</summary>
                <p>Paths are relative to this Dot’s persistent workspace.</p>
                <label>
                  Path
                  <input
                    value={path}
                    onChange={(event) => setPath(event.target.value)}
                    placeholder="notes.txt"
                    disabled={!running || !status.permissions.files || busy}
                  />
                </label>
                <div className="computer-actions">
                  <button
                    disabled={!running || !status.permissions.files || busy}
                    onClick={() => void action('files_list', { path }, true)}
                  >
                    List files
                  </button>
                  <button
                    disabled={
                      !running ||
                      !status.permissions.files ||
                      busy ||
                      !path.trim()
                    }
                    onClick={() =>
                      void action('files_read', { path }, true).then(
                        (result) => {
                          if (
                            lifecycle.current.active &&
                            result &&
                            typeof result === 'object' &&
                            'text' in result &&
                            typeof result.text === 'string'
                          )
                            setContents(result.text);
                        },
                      )
                    }
                  >
                    Read file
                  </button>
                </div>
                <label>
                  File contents
                  <textarea
                    aria-label="File contents to save"
                    value={contents}
                    onChange={(event) => setContents(event.target.value)}
                    disabled={!running || !status.permissions.files || busy}
                    maxLength={100000}
                    rows={5}
                  />
                </label>
                <button
                  disabled={
                    !running ||
                    !status.permissions.files ||
                    busy ||
                    !path.trim()
                  }
                  onClick={() =>
                    void action('files_write', { path, contents }, true)
                  }
                >
                  Save file (replace contents)
                </button>
                {!status.permissions.files && (
                  <p>
                    Enable Workspace files permission to use these controls.
                  </p>
                )}
              </details>
              <details
                className="computer-section"
                open
                hidden={tab !== 'Terminal'}
              >
                <summary>Terminal</summary>
                <p>
                  Runs inside this Dot’s computer. Commands stop after 30
                  seconds.
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void action('exec', { command, timeoutMs: 30000 }, true);
                  }}
                >
                  <textarea
                    aria-label="Terminal command"
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                    maxLength={8000}
                    rows={3}
                    disabled={!running || !status.permissions.shell || busy}
                    placeholder="pwd"
                  />
                  <button
                    disabled={
                      !running ||
                      !status.permissions.shell ||
                      busy ||
                      !command.trim()
                    }
                  >
                    Run command
                  </button>
                </form>
                {!status.permissions.shell && (
                  <p>Enable Terminal commands permission to run commands.</p>
                )}
              </details>
              {output && (tab === 'Files' || tab === 'Terminal') && (
                <section className="computer-section">
                  <h3>Output</h3>
                  <pre tabIndex={0}>{output}</pre>
                  <button onClick={() => setOutput('')}>Clear output</button>
                </section>
              )}
            </>
          )}
          <details
            className="computer-section"
            open
            hidden={tab !== 'Activity'}
          >
            <summary>Recent activity</summary>
            {status.audit.length ? (
              <ol className="computer-audit">
                {status.audit
                  .slice(-30)
                  .reverse()
                  .map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.action.replaceAll('_', ' ')}</strong>
                      <span>
                        {entry.actor} · {entry.outcome} · effect{' '}
                        {entry.effectId ?? 'unassigned'} ·{' '}
                        {new Date(entry.createdAt).toLocaleTimeString()}
                      </span>
                    </li>
                  ))}
              </ol>
            ) : (
              <p>No computer actions yet.</p>
            )}
          </details>
          <details className="computer-settings">
            <summary>Computer settings</summary>{' '}
            <details
              className="computer-permissions"
              open={!status.permissions.enabled}
            >
              <summary>Computer permissions</summary>
              <p>
                Choose what {dot.name} and the computer controls can access.
              </p>
              {(['enabled', 'browser', 'files', 'shell'] as const).map(
                (permission) => (
                  <label key={permission}>
                    <input
                      type="checkbox"
                      checked={status.permissions[permission]}
                      disabled={busy || pendingEffect || !status.configured}
                      onChange={(event) =>
                        void run(
                          '/permissions',
                          { [permission]: event.target.checked },
                          'PATCH',
                        )
                      }
                    />
                    {
                      {
                        enabled: 'Enable this computer',
                        browser: 'Browser',
                        files: 'Workspace files',
                        shell: 'Terminal commands',
                      }[permission]
                    }
                  </label>
                ),
              )}
            </details>
            <div className="computer-actions">
              <button
                disabled={
                  busy ||
                  !status.configured ||
                  !status.permissions.enabled ||
                  status.state === 'running'
                }
                onClick={() => void run('/start')}
              >
                Start computer
              </button>
              <button
                disabled={busy || status.state !== 'running'}
                onClick={() => void run('/stop')}
              >
                Stop computer
              </button>
            </div>
            <p className="computer-hint">
              Stopping retains this Dot’s workspace files. Browser sessions may
              require signing in again.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
