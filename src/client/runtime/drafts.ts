import { z } from 'zod';
export const draftSchema = z.strictObject({
  version: z.literal(1),
  text: z.string().max(16000),
  source: z
    .string()
    .max(4096)
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    }),
});
export function restoreDraft(value: string | null) {
  return value === null ? null : draftSchema.parse(JSON.parse(value));
}
export function storeDraft(
  key: string,
  text: string,
  source: string,
  storage: Pick<Storage, 'setItem'> = sessionStorage,
) {
  storage.setItem(
    key,
    JSON.stringify(draftSchema.parse({ version: 1, text, source })),
  );
}
export function mayClearSubmittedDraft(
  submittedGeneration: number,
  currentGeneration: number,
  submittedText: string,
  currentText: string,
) {
  return (
    submittedGeneration === currentGeneration && submittedText === currentText
  );
}
