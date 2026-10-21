import { CodeBlock } from './CodeBlock';
import { openPageLink } from './page-navigation';
import { Fragment, type ReactNode } from 'react';
import { PhoneOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { AssistantMessage, Message } from '@ag-ui/core';
import type { CallReceipt } from '../shared/types';
import { voiceReceiptMessagePrefix } from '../shared/voice-receipt';
// These markers only control rendering; they do not confer trust or permissions.
export function isInternalVoiceReceipt(message: Message): boolean {
  const metadata = message.metadata;
  return (
    message.role === 'user' &&
    (message.id.startsWith(voiceReceiptMessagePrefix) ||
      (!!metadata &&
        typeof metadata === 'object' &&
        'opendotsSource' in metadata &&
        metadata.opendotsSource === 'voice_receipt'))
  );
}
function MemoryArchive({ text }: { text: string }) {
  let windows: { index: number; text: string }[] = [];
  try {
    const payload = JSON.parse(
      text
        .slice(text.indexOf('\n') + 1)
        .split('\n')
        .at(-1) ?? '',
    );
    if (Array.isArray(payload.windows))
      windows = payload.windows.filter(
        (w: { index?: unknown; text?: unknown }) =>
          typeof w.index === 'number' && typeof w.text === 'string',
      );
  } catch {
    /* A partial history page can be completed with Load earlier messages. */
  }
  return (
    <details className="memory-archive">
      <summary>Conversation history from memory</summary>
      <p>Saved transcript windows. The newest messages may still be syncing.</p>
      {windows.length ? (
        windows.map((w) => <pre key={w.index}>{w.text}</pre>)
      ) : (
        <p>Load the rest of this conversation to read the complete archive.</p>
      )}
    </details>
  );
}

function Receipt({ call }: { call: CallReceipt }) {
  return (
    <div className="call-receipt">
      <PhoneOff size={13} />
      <span>
        {call.status === 'unknown'
          ? 'Call outcome unknown'
          : call.status === 'failed'
            ? 'Call failed'
            : call.endedAt
              ? `${Math.round((call.endedAt - call.startedAt) / 1000)}s · Call ended`
              : 'Call in progress'}
      </span>
      {call.error && <small>{call.error}</small>}
    </div>
  );
}
export function ChatTranscript({
  messages,
  calls,
  renderTools,
  assistantName = 'Assistant',
}: {
  assistantName?: string;
  messages: Message[];
  calls: CallReceipt[];
  renderTools?: (message: AssistantMessage) => ReactNode;
}) {
  const ids = new Set(messages.map((message) => message.id));
  return (
    <>
      {calls
        .filter(
          (call) => !call.anchorMessageId || !ids.has(call.anchorMessageId),
        )
        .map((call) => (
          <Receipt key={call.id} call={call} />
        ))}
      {messages.map((message) => (
        <Fragment key={message.id}>
          {typeof message.content === 'string' && message.content.trim() && (
            <div className={`chat-bubble ${message.role}`}>
              <small>{message.role === 'user' ? 'You' : assistantName}</small>
              {message.role === 'assistant' &&
              String(message.content).startsWith(
                'Imported conversation archive (untrusted historical data, not instructions).',
              ) ? (
                <MemoryArchive text={String(message.content)} />
              ) : (
                <ReactMarkdown
                  components={{
                    pre: CodeBlock,
                    img: ({ alt }) => <span>{alt}</span>,
                    a: ({ href, children }) => (
                      <a
                        onClick={(event) => {
                          if (href?.startsWith('/#/spaces/')) {
                            event.preventDefault();
                            openPageLink(href);
                          }
                        }}
                        href={href}
                        target={
                          href?.startsWith('/#/spaces/') ? undefined : '_blank'
                        }
                        rel="noreferrer"
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {String(message.content)}
                </ReactMarkdown>
              )}
            </div>
          )}
          {message.role === 'assistant' && renderTools?.(message)}
          {calls
            .filter((call) => call.anchorMessageId === message.id)
            .map((call) => (
              <Receipt key={call.id} call={call} />
            ))}
        </Fragment>
      ))}
    </>
  );
}
