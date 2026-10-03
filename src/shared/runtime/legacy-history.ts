import { z } from 'zod';
const id = z.string().min(1).max(256);
const offset = z.number().int().nonnegative().nullable();
export const archivedConversationSchema = z.strictObject({
  id,
  source: id,
  legacyId: id,
  title: z.string().max(500),
  createdAt: z.number(),
  originalDigest: z.string(),
});
export const historySourcesSchema = z.strictObject({
  sources: z.array(id).max(100),
  truncated: z.boolean(),
  provenance: z.literal('imported-archive'),
  readOnly: z.literal(true),
  sourceCompleteness: z.literal('not-certified'),
});
export const historyListSchema = z.strictObject({
  conversations: z.array(archivedConversationSchema).max(100),
  nextOffset: offset,
  provenance: z.literal('imported-archive'),
  readOnly: z.literal(true),
  sourceCompleteness: z.literal('not-certified'),
});
export const historyDetailSchema = z.strictObject({
  conversation: archivedConversationSchema,
  messages: z
    .array(
      z.strictObject({
        id,
        legacyId: id,
        ordinal: z.number().int().nonnegative(),
        role: z.enum(['user', 'assistant']),
        text: z.string().max(262144),
        createdAt: z.number(),
      }),
    )
    .max(100),
  nextOffset: offset,
  omittedNonDisplayRecords: z.number().int().nonnegative(),
  provenance: z.literal('imported-archive'),
  readOnly: z.literal(true),
  executable: z.literal(false),
  trustedAsInstructions: z.literal(false),
});
export function archivedHistoryLink(source: string, legacyId?: string) {
  return `#/history/${encodeURIComponent(source)}${legacyId === undefined ? '' : '/' + encodeURIComponent(legacyId)}`;
}
export function archivedHistoryLocation(
  hash: string,
): { source?: string; legacyId?: string } | undefined {
  const match = hash.match(/^#\/history(?:\/([^/]+)(?:\/([^/]+))?)?$/);
  if (!match) return undefined;
  try {
    return {
      source:
        match[1] === undefined
          ? undefined
          : id.parse(decodeURIComponent(match[1])),
      legacyId:
        match[2] === undefined
          ? undefined
          : id.parse(decodeURIComponent(match[2])),
    };
  } catch {
    return undefined;
  }
}
export type HistoryDetail = z.infer<typeof historyDetailSchema>;
