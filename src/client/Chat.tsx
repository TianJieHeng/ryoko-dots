import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Clock3, FilePlus, Phone } from 'lucide-react';
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
            disabled
            title="Artifact adapter qualification required"
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
        <ChatTranscript messages={messages} calls={calls} />
        {(history.history?.messages ?? [])
          .filter((message) => !message.internal)
          .flatMap((message) =>
            message.parts
              .filter((part) => part.kind === 'tool')
              .map((part) => (
                <div key={`${message.id}:${part.id}`} className="notice">
                  <strong>
                    {part.name} · {part.state}
                  </strong>
                  <p>{part.summary}</p>
                </div>
              )),
          )}
        <div ref={bottom} />
      </div>
      <form
        className="chat-composer"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="chat-compose-row">
          <textarea
            aria-label="Message your Dot"
            placeholder={`Message ${dot.name}…`}
            rows={1}
            maxLength={4000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="send-button" aria-label="Send message" disabled>
            <ArrowUp size={19} />
          </button>
        </div>
        <div className="chat-compose-note">
          Live command adapter is not active. Your unsent text stays in this
          view.
        </div>
      </form>
    </div>
  );
}
