import { expect, it } from 'vitest';
import {
  mayClearSubmittedDraft,
  restoreDraft,
  storeDraft,
} from '../src/client/runtime/drafts';
it('recovers exact text and source intent after a lost response/remount', () => {
  let saved = '';
  storeDraft('key', 'Read this', 'https://example.com/source', {
    setItem: (_key, value) => {
      saved = value;
    },
  });
  expect(restoreDraft(saved)).toEqual({
    version: 1,
    text: 'Read this',
    source: 'https://example.com/source',
  });
});
it('never clears a newer draft/source edit on older admission receipt', () => {
  expect(mayClearSubmittedDraft(4, 5, 'first', 'next')).toBe(false);
  expect(mayClearSubmittedDraft(4, 5, 'same text', 'same text')).toBe(false);
  expect(mayClearSubmittedDraft(4, 4, 'first', 'first')).toBe(true);
});
it('does not persist a source containing credentials', () => {
  expect(() =>
    storeDraft('key', 'Read', 'https://user:secret@example.com', {
      setItem: () => {
        throw new Error('must not write');
      },
    }),
  ).toThrow();
});
