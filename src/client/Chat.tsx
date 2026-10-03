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
  const [draft, setDraft] = useState(initialPrompt ?? '');
  const [source, setSource] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<CommandReceipt>();
  const pending = useRef<PendingCommand | undefined>(undefined);
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
    ? `ryoko-draft:${scope.owner}:${scope.gateway}:${scope.agent}:${scope.project ?? ''}:${thread.id}`
    : '';
  useEffect(() => {
    setReceipt(undefined);
    pending.current = undefined;
    if (draftKey) {
      try {
        const saved = sessionStorage.getItem(draftKey);
        if (saved !== null) setDraft(saved);
      } catch {
        setError('Draft recovery is unavailable in this browser.');
      }
    }
  }, [draftKey, scopeKey]);
  const changeDraft = (text: string) => {
    setDraft(text);
    if (draftKey) {
      try {
        sessionStorage.setItem(draftKey, text);
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
    try {
      const prepared = await prepareCommand(scope, {
        operation: 'submit',
        conversationId: thread.id,
        text,
        sourceUrl: source.trim() || null,
      });
      if (!mounted.current || activeScope.current !== scopeKey) return;
      pending.current = prepared.pending;
      const next = await (prepared.existing
        ? inspectCommand(prepared.pending)
        : sendCommand(prepared.pending));
      if (!mounted.current || activeScope.current !== scopeKey) return;
      setReceipt(next);
      if (next.status === 'accepted') {
        changeDraft('');
        setSource('');
        setSourceOpen(false);
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
            aria-label="Start voice call"
            disabled
            title="Media adapter qualification required"
          >
            <Phone size={18} />
          </button>
        </div>
      </header>
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
            Earlier history is outside the server retention window.
          </p>
        )}
        {history.history?.interruption && (
          <p className="notice">{history.history.interruption}</p>
        )}
        {history.history?.nextCursor && (
          <button
            disabled={history.loading}
            onClick={() => void history.loadOlder()}
          >
            Load earlier messages
          </button>
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
          calls={calls}
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
        <div ref={bottom} />
      </div>
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
              onChange={(event) => setSource(event.target.value)}
              placeholder="https://example.com/page"
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Remove source"
              onClick={() => {
                setSourceOpen(false);
                setSource('');
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
