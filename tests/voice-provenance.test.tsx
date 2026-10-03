import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CallView } from '../src/client/CallView';
import type { useVoice } from '../src/client/useVoice';
import type { Dot } from '../src/shared/types';

test('call captions explicitly identify provider conversation separately from verified Ryoko results', () => {
  const voice = {
    status: 'active',
    phase: 'speaking',
    caption: 'A conversational response',
    userCaption: 'Hello',
    muted: false,
    speakerMuted: false,
    error: '',
    startedAt: undefined,
    toggleSpeaker() {},
    toggleMute() {},
    async end() {},
  } as ReturnType<typeof useVoice>;
  const html = renderToStaticMarkup(
    <CallView dot={{ id: 'dot', name: 'Ryoko' } as Dot} voice={voice} />,
  );
  expect(html).toContain('media provider speech');
  expect(html).toContain(
    'Media conversation is separate from verified Ryoko task results',
  );
  expect(html).toContain('A conversational response');
});
