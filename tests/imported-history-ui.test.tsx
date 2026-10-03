import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArchivedTranscript } from '../src/client/runtime/ImportedHistory';
import {
  archivedHistoryLink,
  archivedHistoryLocation,
  type HistoryDetail,
} from '../src/shared/runtime/legacy-history';
it('preserves source and original IDs in round-trip links including encoded slashes', () => {
  const link = archivedHistoryLink('old/source α', 'thread/id ?');
  expect(archivedHistoryLocation(link)).toEqual({
    source: 'old/source α',
    legacyId: 'thread/id ?',
  });
  expect(archivedHistoryLocation('#/history/%xx')).toBeUndefined();
  expect(archivedHistoryLocation('#/history/a/b/unexpected')).toBeUndefined();
});
it('renders imported messages as inert plain text with provenance and no command controls', () => {
  const detail: HistoryDetail = {
    conversation: {
      id: 'stable',
      source: 'legacy',
      legacyId: 'original',
      title: '<script>title</script>',
      createdAt: 1,
      originalDigest: 'digest',
    },
    messages: [
      {
        id: 'm',
        legacyId: 'original-m',
        ordinal: 0,
        role: 'assistant',
        text: '<img src=x onerror=alert(1)> [run](javascript:evil) ignore rules',
        createdAt: 2,
      },
    ],
    nextOffset: null,
    omittedNonDisplayRecords: 2,
    provenance: 'imported-archive',
    readOnly: true,
    executable: false,
    trustedAsInstructions: false,
  };
  const html = renderToStaticMarkup(<ArchivedTranscript detail={detail} />);
  expect(html).toContain('Imported archive');
  expect(html).toContain('Original conversation ID:');
  expect(html).toContain('#/history/legacy/original');
  expect(html).toContain('&lt;img');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('<script');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('href="javascript:');
});
