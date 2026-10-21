import { useRef, useState, type ReactNode } from 'react';
export function CodeBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null),
    [message, setMessage] = useState('Copy code');
  return (
    <div className="code-block">
      <button
        type="button"
        aria-label="Copy code"
        onClick={() => {
          void navigator.clipboard.writeText(ref.current?.innerText ?? '').then(
            () => setMessage('Copied'),
            () => setMessage('Select code to copy'),
          );
        }}
      >
        {message}
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}
