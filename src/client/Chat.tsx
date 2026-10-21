import { TaskMonitor } from './TaskMonitor';
import {
  storeDraft,
  restoreDraft,
  mayClearSubmittedDraft,
} from './runtime/drafts';
import { canUse } from '../shared/runtime/contracts';
import { ApiError } from './api';
import { chatProgress, pendingChatMessages } from './runtime/chat-presentation';
import { ConversationOrigins } from './runtime/ChannelsPanel';
import { useVoice } from './useVoice';
import { CallView } from './CallView';
import { useResource } from './runtime/use-resource';
import {
  canStartRealtime,
  voiceProfileSchema,
  voiceCallsSchema,
} from '../shared/runtime/voice';
import { runtimeAction } from './runtime/actions';
import { useCommands } from './runtime/use-commands';
import {
  commandIsAdmitted,
  controllableRuns,
  type RecoveredCommand,
} from './runtime/command-recovery';
import { useLiveHistory } from './runtime/use-live-history';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Clock3,
  FilePlus,
  Phone,
  Link2,
  Square,
  X,
} from 'lucide-react';
import type { Message } from '@ag-ui/core';
import type { CallReceipt, Conversation, Dot } from '../shared/types';
import { ChatTranscript } from './ChatTranscript';
import { Mascot } from './Mascot';
import { useRuntime } from './runtime/use-runtime';
import { useHistory } from './runtime/use-history';
import { RuntimeStatus } from './runtime/RuntimeStatus';
export function Chat({
  thread,
  dot,
  initialPrompt,
  calls,
  paused,
  onSchedule,
  onConsumed,
  onSaved,
  onComputer,
}: {
  thread: Conversation;
  dot: Dot;
  initialPrompt?: string;
  onConsumed: () => void;
  voiceReady: boolean;
  calls: CallReceipt[];
  paused: boolean;
  onSaved: () => void;
  onSchedule: () => void;
  onComputer?: () => void;
}) {
  const runtime = useRuntime(dot.id);
  const history = useHistory(thread.id, runtime);
  const callHistory = useResource(
    `/runtime/conversations/${encodeURIComponent(thread.id)}/calls`,
    voiceCallsSchema,
    runtime,
    'conversations',
  );
  const media = useResource(
    '/runtime/voice',
    voiceProfileSchema,
    runtime,
    'voice',
  );
  const voice = useVoice(
    thread.id,
    onSaved,
    history.history?.messages.at(-1)?.id,
    media.data,
    runtime.setup?.scope ?? undefined,
  );
  const realtimeReady =
    runtime.available('voice') &&
    !!runtime.setup?.scope &&
    canStartRealtime(media.data, runtime.setup.scope);
  const [draft, setDraft] = useState(initialPrompt ?? '');
  const [source, setSource] = useState('');
  const [sending, setSending] = useState<{
    key: string;
    text: string;
    startedAt: number;
  } | null>(null);
  const draftGeneration = useRef(0);
  const editSource = (value: string) => {
    draftGeneration.current++;
    setSource(value);
    if (draftKey) {
      try {
        storeDraft(draftKey, draft, value);
      } catch {
        setError(
          'Source draft must be a credential-free HTTP(S) URL before it can be saved.',
        );
      }
    }
  };
  const [sourceOpen, setSourceOpen] = useState(false);
  const [localBusy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connectedKey, setConnectedKey] = useState('');
  const connecting = useRef(false);
  const connectionBlocked = useRef(false);
  const contextGeneration = useRef(0);
  const [steerRun, setSteerRun] = useState('');
  const commands = useCommands(thread.id, runtime);
  const busy = localBusy || commands.busy;
  const liveError = useLiveHistory(
    thread.id,
    runtime,
    history.history,
    history.reload,
    history.limitReached || !!history.error,
  );
  const contextReady =
    history.history !== undefined &&
    !history.error &&
    'pageContext' in history.history;
  const scope = runtime.setup?.scope;
  const scopeKey = JSON.stringify([scope, thread.id]);
  const activeScope = useRef(scopeKey);
  activeScope.current = scopeKey;
  const connected = connectedKey === scopeKey && runtime.available('commands');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const draftKey = scope
    ? `ryoko-draft:v1:${JSON.stringify([scope.owner, scope.gateway, scope.agent, scope.project, thread.id])}`
    : '';
  const previousDraftKey = useRef('');
  useEffect(() => {
    contextGeneration.current++;
    connecting.current = false;
    connectionBlocked.current = false;
    setConnectedKey((key) => (key === scopeKey ? key : ''));
    setBusy(false);
    setSteerRun('');
    setError('');
  }, [scopeKey]);
  useEffect(() => {
    const previous = previousDraftKey.current;
    previousDraftKey.current = draftKey;
    if (!draftKey) {
      if (previous) {
        draftGeneration.current++;
        setDraft('');
        setSource('');
      }
      return;
    }
    try {
      const saved = restoreDraft(sessionStorage.getItem(draftKey));
      if (saved || previous) {
        draftGeneration.current++;
        setDraft(saved?.text ?? '');
        setSource(saved?.source ?? '');
        setSourceOpen(!!saved?.source);
      } else if (draft || source) {
        // Text can be entered while the initial agent scope is still loading.
        // Persist that draft as soon as its verified storage key is available.
        storeDraft(draftKey, draft, source);
      }
    } catch {
      setError(
        'Draft recovery is unavailable or invalid. Keep a copy and inspect uncertain work before resending.',
      );
    }
  }, [draftKey]);
  const changeDraft = (text: string) => {
    draftGeneration.current++;
    setDraft(text);
    if (draftKey) {
      try {
        storeDraft(draftKey, text, source);
      } catch {
        setError('Draft storage is unavailable. Keep a copy before leaving.');
      }
    }
  };
  const connect = async () => {
    if (!scope || busy || connecting.current) return;
    const current = contextGeneration.current;
    const valid = () =>
      mounted.current &&
      activeScope.current === scopeKey &&
      contextGeneration.current === current;
    connecting.current = true;
    setBusy(true);
    setError('');
    try {
      const setup = await runtime.connect(thread.id, (verified) => {
        if (valid() && canUse(verified, 'commands'))
          setConnectedKey(JSON.stringify([verified.scope, thread.id]));
      });
      if (!valid()) return;
      if (!canUse(setup, 'commands'))
        setError(
          setup.features.commands.reason ||
            'This runtime is not ready to execute commands.',
        );
      void commands.refreshRecovery();
      commands.resumeInspection();
      await history.reload();
    } catch (cause) {
      if (valid()) {
        connectionBlocked.current =
          cause instanceof ApiError && [401, 403, 404].includes(cause.status);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Runtime connection could not be verified.',
        );
      }
    } finally {
      if (valid()) {
        connecting.current = false;
        setBusy(false);
      }
    }
  };
  // Opening the selected chat is enough to connect. Retry only connection
  // setup; accepted messages and uncertain operations are never resubmitted.
  const automaticConnection = useRef({
    connect,
    runtime,
    connected,
    busy,
    liveError,
  });
  automaticConnection.current = {
    connect,
    runtime,
    connected,
    busy,
    liveError,
  };
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const maintain = async () => {
      const current = automaticConnection.current;
      if (!active) return;
      if (!current.busy && !connecting.current && !connectionBlocked.current) {
        if (current.liveError && current.connected) {
          setConnectedKey('');
          current.runtime.reload();
        } else if (!current.connected) {
          if (
            current.runtime.setup?.scope &&
            current.runtime.available('conversations')
          )
            await current.connect();
          else if (['disconnected', 'degraded'].includes(current.runtime.state))
            current.runtime.reload();
        }
      }
      if (active) timer = setTimeout(() => void maintain(), 5000);
    };
    void maintain();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [scopeKey]);
  const runs = controllableRuns(commands.records);
  const selectedRun = runs.find((record) => record.receipt?.runId === steerRun);
  const send = async (text: string) => {
    if (!scope || !connected || !contextReady || paused || busy || !text.trim())
      return;
    if (steerRun && (!selectedRun?.receipt?.runId || source.trim())) {
      setError(
        'Refresh the target run before steering. Source links are supported on new messages only.',
      );
      return;
    }
    const submittedDraftGeneration = draftGeneration.current;
    setSending({ key: scopeKey, text, startedAt: Date.now() });
    setError('');
    const next = await commands.submit(
      selectedRun?.receipt?.runId
        ? {
            operation: 'steer',
            conversationId: thread.id,
            runId: selectedRun.receipt.runId,
            expectedRevision: selectedRun.receipt.durableRevision,
            text,
          }
        : {
            operation: 'submit',
            conversationId: thread.id,
            text,
            sourceUrl: source.trim() || null,
          },
    );
    if (!mounted.current || activeScope.current !== scopeKey) return;
    setSending(null);
    if (!next) return;
    if (commandIsAdmitted(next)) {
      if (
        mayClearSubmittedDraft(
          submittedDraftGeneration,
          draftGeneration.current,
          text,
          draft,
        )
      ) {
        setDraft('');
        draftGeneration.current++;
        setSource('');
        setSourceOpen(false);
        if (draftKey) {
          try {
            storeDraft(draftKey, '', '');
            commands.acknowledge(next);
          } catch {
            setError(
              'Work was accepted, but clearing the saved draft failed. Inspect its operation before resending.',
            );
          }
        }
      }
      setSteerRun('');
      onConsumed();
      onSaved();
      await history.reload();
    }
  };
  const cancel = async (record: RecoveredCommand) => {
    const receipt = record.receipt;
    if (!scope || !connected || !receipt?.runId || busy) return;
    setError('');
    await commands.submit({
      operation: 'cancel',
      conversationId: thread.id,
      runId: receipt.runId,
      expectedRevision: receipt.durableRevision,
    });
  };
  const bottom = useRef<HTMLDivElement>(null);
  const canonicalMessages = history.history?.messages ?? [];
  const pendingMessages = pendingChatMessages(
    commands.records,
    canonicalMessages,
  );
  const currentSending = sending?.key === scopeKey ? sending : null;
  const progress = chatProgress(
    commands.records,
    canonicalMessages,
    dot.name,
    !!currentSending,
  );
  const messages: Message[] = (history.history?.messages ?? [])
    .filter((message) => !message.internal)
    .map((message) => ({
      id: message.id,
      role: message.role === 'tool' ? 'assistant' : message.role,
      content: message.parts
        .filter((part) => part.kind === 'text')
        .map((part) => part.text)
        .join('\n'),
    }));
  for (const record of pendingMessages) {
    if (record.pending.intent.operation !== 'cancel')
      messages.push({
        id: `pending:${record.pending.operationId}`,
        role: 'user',
        content: record.pending.intent.text,
      });
  }
  if (
    currentSending &&
    !commands.records.some(
      (record) =>
        record.pending.createdAt >= currentSending.startedAt &&
        record.pending.intent.operation !== 'cancel' &&
        record.pending.intent.text === currentSending.text,
    )
  )
    messages.push({
      id: 'sending',
      role: 'user',
      content: currentSending.text,
    });
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
  }, [messages.length, progress?.text]);
  return (
    <div className="live-chat">
      <TaskMonitor conversationId={thread.id} />
      <header className="chat-persona">
        <Mascot
          identity={dot.id}
          name={dot.name}
          small
          state={paused ? 'paused' : progress?.thinking ? 'thinking' : 'idle'}
        />
        <div>
          <strong>{dot.name}</strong>
          <span>
            {history.loading && !history.history
              ? 'Loading saved conversation…'
              : connected
                ? 'Connected'
                : 'Connecting…'}
          </span>
        </div>
        <div className="chat-persona-actions">
          <button
            className="icon-button"
            aria-label="Save conversation as page"
            disabled={
              busy ||
              !runtime.available('artifacts') ||
              !history.history?.messages.some(
                (message) => message.committed && !message.internal,
              )
            }
            title="Save eligible committed transcript text to the authorized default Space"
            onClick={async () => {
              if (!scope || !history.history) return;
              const title = window.prompt('Page title', thread.title);
              if (!title) return;
              setBusy(true);
              setError('');
              try {
                await runtimeAction(
                  scope,
                  `/runtime/conversations/${encodeURIComponent(thread.id)}/page`,
                  'save_transcript',
                  { title, destinationSpaceId: dot.spaceId },
                  history.history.sessionSequence,
                );
                onSaved();
                setError(
                  'Save admitted. Inspect Artifacts for committed, verified bytes.',
                );
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Save outcome unknown. Inspect the original operation.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <FilePlus size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Schedule a task in this conversation"
            onClick={onSchedule}
            disabled={!runtime.available('schedules')}
          >
            <Clock3 size={18} />
          </button>
          <button
            className="icon-button"
            aria-label={
              voice.status === 'idle' ? 'Start voice call' : 'End voice call'
            }
            disabled={
              voice.status === 'idle' &&
              (!realtimeReady || !connected || paused || !contextReady)
            }
            title={
              media.data
                ? `${media.data.provider} · ${media.data.mode}`
                : 'Media adapter qualification required'
            }
            onClick={() =>
              voice.status === 'idle' ? void voice.start() : void voice.end()
            }
          >
            <Phone size={18} />
          </button>
        </div>
      </header>
      <ConversationOrigins connection={runtime} conversationId={thread.id} />
      {!runtime.available('conversations') && (
        <RuntimeStatus connection={runtime} compact />
      )}
      {history.error && (
        <div className="chat-error" role="alert">
          {history.error}
          <button onClick={() => void history.reload()}>Reload history</button>
        </div>
      )}
      <div className="chat-transcript" data-has-messages={!!history.history?.messages.length}>
        {history.history?.truncated && (
          <p className="notice">
            The server reports that some conversation history is unavailable.
          </p>
        )}
        {history.history?.messages.some(
          (message) => !message.internal && message.chunk?.sanitized,
        ) && (
          <p className="notice">
            Some message text was sanitized by the server for safe display.
          </p>
        )}
        {history.history?.messages.some(
          (message) => !message.internal && message.chunk?.nonTextOmitted,
        ) && (
          <p className="notice">
            This text transcript omits non-text content, such as attachments or
            tool details.
          </p>
        )}
        {history.history?.messages.some(
          (message) =>
            !message.internal && message.chunk && !message.chunk.complete,
        ) && (
          <p className="notice">
            Some message text is only partially loaded.
            {history.history.nextCursor && !history.limitReached
              ? ' Load more conversation to continue it.'
              : ' The full text is not available in this view.'}
          </p>
        )}
        {history.history?.interruption && (
          <p className="notice">{history.history.interruption}</p>
        )}
        {!messages.length && !history.loading && !history.error && history.history && (
          <div className="chat-welcome">
            <span className="eyebrow">A LITTLE SPACE TO THINK</span>
            <h1>What’s on your mind?</h1>
            <p>{dot.instructions}</p>
          </div>
        )}
        <ChatTranscript
          messages={messages}
          calls={
            callHistory.data?.calls ??
            calls.filter((call) => call.endedAt !== null)
          }
          renderTools={(message) => (
            <>
              {history.history?.messages
                .find((item) => item.id === message.id)
                ?.parts.map((part, index) =>
                  part.kind === 'tool' ? (
                    <div key={part.id} className="notice">
                      <strong>
                        {part.name} · {part.state}
                      </strong>
                      <p>{part.summary}</p>
                      {part.name.startsWith('computer_') && onComputer && (
                        <button onClick={onComputer}>Open computer</button>
                      )}
                    </div>
                  ) : part.kind === 'source' ? (
                    <div key={index} className="source-card">
                      <strong>
                        {part.sample ? (
                          part.title
                        ) : (
                          <a href={part.url} target="_blank" rel="noreferrer">
                            {part.title}
                          </a>
                        )}
                      </strong>
                      <p>{part.excerpt}</p>
                      {part.sample && <small>Fictional sample source</small>}
                    </div>
                  ) : null,
                )}
            </>
          )}
        />
        {history.history?.nextCursor && (
          <button
            disabled={history.loading || history.limitReached}
            onClick={() => void history.loadMore()}
          >
            {history.loading && !history.history
              ? 'Loading more conversation…'
              : 'Load more conversation'}
          </button>
        )}
        {progress && (
          <div
            className={`chat-progress${progress.thinking ? ' thinking' : ''}`}
            role="status"
            aria-live="polite"
          >
            {progress.thinking && (
              <span className="thinking-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
            <span>{progress.text}</span>
          </div>
        )}
        <div ref={bottom} />
      </div>
      {media.data && (
        <p className="chat-compose-note">
          Media provider: {media.data.provider} · {media.data.mode}
          {media.data.mode === 'finite_local'
            ? ' (finite nonstreaming speech; realtime calls unavailable)'
            : ''}
          . Microphone access is requested only when you start a qualified call.
          Device switching requires ending this call first.
        </p>
      )}
      {voice.error && (
        <p role="alert" className="chat-error">
          {voice.error}
          <button onClick={() => void voice.inspect()}>
            Inspect media request
          </button>
          {voice.recoveryCall && (
            <button onClick={() => void voice.endRecovered()}>
              End recovered media only
            </button>
          )}
        </p>
      )}
      <CallView
        key={voice.status === 'idle' ? 'idle' : 'call'}
        dot={dot}
        voice={voice}
      />
      {!connected && !error && (
        <p className="chat-compose-note" role="status">
          Connecting to {dot.name}…
        </p>
      )}
      {error && (
        <div className="chat-error" role="alert">
          {error}
        </div>
      )}
      {(commands.records.length > 0 || commands.error || liveError) && (
        <details className="chat-message-details">
          <summary>Message details</summary>
          {(commands.error || liveError) && (
            <p>{commands.error || liveError}</p>
          )}
          {commands.records.map((record) => (
            <div className="notice" key={record.pending.operationId}>
              <p>
                {record.pending.intent.operation} ·{' '}
                {record.receipt?.executionStatus ??
                  record.receipt?.status ??
                  'Checking delivery'}
              </p>
              <small>Message ID: {record.pending.operationId}</small>
              {record.receipt?.reason && <p>{record.receipt.reason}</p>}
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const result = await commands.inspect(record.pending);
                  if (result) await history.reload();
                  commands.resumeInspection();
                }}
              >
                Check message status
              </button>
            </div>
          ))}
          {commands.recoveryCursor && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void commands.recoverMore()}
            >
              Load older message details
            </button>
          )}
        </details>
      )}
      {history.history?.pageContext && (
        <div className="page-chat-context">
          Working on{' '}
          <a
            href={`/#/spaces/${history.history.pageContext.spaceId}/pages/${history.history.pageContext.id}`}
          >
            {history.history.pageContext.title}
          </a>
        </div>
      )}
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        {runs.length > 0 && (
          <label className="chat-compose-note">
            Send as
            <select
              value={steerRun}
              onChange={(event) => setSteerRun(event.target.value)}
              disabled={busy || !connected}
            >
              <option value="">New message</option>
              {runs.map((record, index) => (
                <option
                  key={record.receipt!.runId}
                  value={record.receipt!.runId!}
                >
                  Update ongoing reply{runs.length > 1 ? ` ${index + 1}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {sourceOpen && (
          <div className="source-input">
            <Link2 size={15} />
            <input
              aria-label="Source page URL"
              type="url"
              value={source}
              onChange={(event) => editSource(event.target.value)}
              placeholder="https://example.com/page"
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Remove source"
              onClick={() => {
                setSourceOpen(false);
                editSource('');
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="chat-compose-row">
          <button
            type="button"
            className="icon-button"
            aria-label="Add source page link"
            onClick={() => setSourceOpen(!sourceOpen)}
          >
            <Link2 size={19} />
          </button>
          <textarea
            aria-label="Message your Dot"
            placeholder={`Message ${dot.name}…`}
            rows={1}
            maxLength={4000}
            value={draft}
            onChange={(event) => changeDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          {runs.map((record) => (
            <button
              key={record.receipt!.runId}
              type="button"
              className="icon-button"
              aria-label="Stop response"
              title="Stop this response"
              disabled={
                busy ||
                !connected ||
                record.receipt!.status === 'cancel_requested'
              }
              onClick={() => void cancel(record)}
            >
              <Square size={16} />
            </button>
          ))}
          <button
            className="send-button"
            aria-label={steerRun ? 'Send steering input' : 'Send message'}
            disabled={
              !draft.trim() || busy || !contextReady || !connected || paused
            }
          >
            <ArrowUp size={19} />
          </button>
        </div>
        <div className="chat-compose-note">
          {!connected
            ? `Connecting to ${dot.name}. Your draft stays here.`
            : currentSending
              ? 'Sending…'
              : !contextReady
                ? 'Loading conversation…'
                : 'Enter to send · Shift+Enter for a new line'}
        </div>
      </form>
    </div>
  );
}
