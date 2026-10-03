import {
  storeDraft,
  restoreDraft,
  mayClearSubmittedDraft,
} from './runtime/drafts';
import { pendingCommandSchema, sameScope } from '../shared/runtime/contracts';
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
import {
  prepareCommand,
  sendCommand,
  inspectCommand,
} from './runtime/commands';
import { useLiveHistory } from './runtime/use-live-history';
import type {
  CommandReceipt,
  PendingCommand,
} from '../shared/runtime/contracts';
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
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<CommandReceipt>();
  const pending = useRef<PendingCommand | undefined>(undefined);
  const [pendingId, setPendingId] = useState<string>();
  const consumed = useRef(false);
  const liveError = useLiveHistory(
    thread.id,
    runtime,
    history.history,
    history.reload,
  );
  const contextReady =
    history.history !== undefined &&
    !history.error &&
    'pageContext' in history.history;
  const scope = runtime.setup?.scope;
  const scopeKey = JSON.stringify(scope);
  const activeScope = useRef(scopeKey);
  activeScope.current = scopeKey;
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
  const pendingKey = scope
    ? `ryoko-pending:${JSON.stringify([scope, thread.id])}`
    : '';
  useEffect(() => {
    setReceipt(undefined);
    pending.current = undefined;
    setPendingId(undefined);
    if (draftKey) {
      try {
        const saved = restoreDraft(sessionStorage.getItem(draftKey));
        if (saved && draftGeneration.current === 0) {
          setDraft(saved.text);
          setSource(saved.source);
          setSourceOpen(!!saved.source);
        }
      } catch {
        setError(
          'Draft recovery is unavailable or invalid. Do not resend an uncertain request blindly.',
        );
      }
    }
    if (pendingKey && scope) {
      try {
        const raw = sessionStorage.getItem(pendingKey);
        if (raw) {
          const saved = pendingCommandSchema.parse(JSON.parse(raw));
          if (
            !sameScope(scope, saved.scope) ||
            saved.intent.conversationId !== thread.id
          )
            throw new Error();
          pending.current = saved;
          setPendingId(saved.operationId);
        }
      } catch {
        setError(
          'Pending request identity does not match this binding. Inspect canonical Activity before sending.',
        );
      }
    }
  }, [draftKey, pendingKey, scopeKey]);
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
  const send = async (text: string) => {
    if (
      !scope ||
      !runtime.available('commands') ||
      !contextReady ||
      paused ||
      sending.current ||
      !text.trim()
    )
      return;
    sending.current = true;
    setBusy(true);
    setError('');
    pending.current = undefined;
    const submittedDraftGeneration = draftGeneration.current;
    try {
      const prepared = await prepareCommand(scope, {
        operation: 'submit',
        conversationId: thread.id,
        text,
        sourceUrl: source.trim() || null,
      });
      if (!mounted.current || activeScope.current !== scopeKey) return;
      if (pendingKey)
        sessionStorage.setItem(pendingKey, JSON.stringify(prepared.pending));
      pending.current = prepared.pending;
      setPendingId(prepared.pending.operationId);
      const next = await (prepared.existing
        ? inspectCommand(prepared.pending)
        : sendCommand(prepared.pending));
      if (!mounted.current || activeScope.current !== scopeKey) return;
      setReceipt(next);
      if (next.status === 'accepted') {
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
          if (draftKey) storeDraft(draftKey, '', '');
          setSource('');
          setSourceOpen(false);
        }
        if (pendingKey) sessionStorage.removeItem(pendingKey);
        pending.current = undefined;
        setPendingId(undefined);
        onConsumed();
        onSaved();
        await history.reload();
      } else
        setError(
          next.reason || 'Admission was not confirmed. Your draft is retained.',
        );
    } catch {
      if (!mounted.current || activeScope.current !== scopeKey) return;
      setError(
        pending.current
          ? 'Admission could not be confirmed. Your draft and operation ID are retained. Send again to inspect the same operation, not repeat it.'
          : 'The request could not be safely prepared or stored. No command was sent; check the source URL and browser storage.',
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!scope || !receipt?.missionId || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const prepared = await prepareCommand(scope, {
        operation: 'cancel',
        conversationId: thread.id,
        missionId: receipt.missionId,
      });
      if (!mounted.current || activeScope.current !== scopeKey) return;
      const next = await (prepared.existing
        ? inspectCommand(prepared.pending)
        : sendCommand(prepared.pending));
      if (!mounted.current || activeScope.current !== scopeKey) return;
      setReceipt(next);
    } catch {
      if (!mounted.current || activeScope.current !== scopeKey) return;
      setError(
        'Cancellation outcome is unknown. Inspect again; closing this view does not cancel accepted work.',
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    if (
      !consumed.current &&
      initialPrompt &&
      contextReady &&
      runtime.available('commands') &&
      !paused
    ) {
      consumed.current = true;
      void send(initialPrompt);
    }
  }, [initialPrompt, contextReady, scopeKey, paused]);
  const bottom = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
  }, [messages.length]);
  return (
    <div className="live-chat">
      <header className="chat-persona">
        <Mascot
          identity={dot.id}
          name={dot.name}
          small
          state={paused ? 'paused' : 'idle'}
        />
        <div>
          <strong>{dot.name}</strong>
          <span>
            {history.loading
              ? 'Loading saved conversation…'
              : 'Canonical conversation history'}
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
              (!realtimeReady || paused || !contextReady)
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
      <div className="chat-transcript">
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
        {!messages.length && !history.loading && (
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
                        <button onClick={onComputer}>
                          Open scoped computer
                        </button>
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
            {history.loading
              ? 'Loading more conversation…'
              : 'Load more conversation'}
          </button>
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
      {pendingId && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            const original = pending.current;
            if (!original) return;
            setBusy(true);
            try {
              const next = await inspectCommand(original);
              if (!mounted.current || activeScope.current !== scopeKey) return;
              setReceipt(next);
              if (next.status === 'accepted' || next.status === 'rejected') {
                if (pendingKey) sessionStorage.removeItem(pendingKey);
                pending.current = undefined;
                setPendingId(undefined);
                await history.reload();
              }
            } catch {
              setError(
                'Original admission is still unknown. No new command was sent.',
              );
            } finally {
              if (mounted.current) setBusy(false);
            }
          }}
        >
          Inspect pending request {pendingId}
        </button>
      )}
      {(error || liveError) && (
        <div className="chat-error" role="alert">
          {error || liveError}
          <button
            onClick={() => {
              runtime.reload();
              void history.reload();
            }}
          >
            Reconnect and inspect
          </button>
        </div>
      )}
      {receipt && (
        <p className="notice" role="status">
          {receipt.status === 'accepted'
            ? 'Work accepted. Execution and delivery are tracked separately in Activity.'
            : receipt.status === 'cancelled'
              ? 'Cancellation acknowledged. Any unresolved effects remain inspectable.'
              : receipt.status === 'cancel_requested'
                ? 'Cancellation requested; awaiting runtime acknowledgment.'
                : receipt.reason || receipt.status.replaceAll('_', ' ')}
        </p>
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
          {receipt?.missionId &&
            !['cancelled', 'rejected'].includes(receipt.status) && (
              <button
                type="button"
                className="icon-button"
                aria-label="Request cancellation"
                disabled={busy || !runtime.available('commands')}
                onClick={() => void cancel()}
              >
                <Square size={16} />
              </button>
            )}
          <button
            className="send-button"
            aria-label="Send message"
            disabled={
              !draft.trim() ||
              busy ||
              !contextReady ||
              !runtime.available('commands') ||
              paused
            }
          >
            <ArrowUp size={19} />
          </button>
        </div>
        <div className="chat-compose-note">
          {busy
            ? 'Waiting for a durable receipt…'
            : !contextReady
              ? 'Waiting for authoritative conversation context.'
              : 'Closing this view detaches. Accepted work continues.'}
        </div>
      </form>
    </div>
  );
}
