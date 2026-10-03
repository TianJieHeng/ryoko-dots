import { z } from 'zod';
import { api } from '../api';
import {
  contractVersion,
  conversationSchema,
  sameScope,
  scopeSchema,
  type RuntimeConversation,
  type RuntimeScope,
} from '../../shared/runtime/contracts';
import type { Conversation } from '../../shared/types';
export const conversationResponseSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  conversation: conversationSchema,
});
export function legacyConversation(
  row: RuntimeConversation,
  scope: RuntimeScope,
): Conversation {
  return {
    id: row.id,
    dotId: row.dotId,
    ownerId: scope.owner,
    title: row.title,
    createdAt: row.createdAt,
  };
}
export async function createConversation(
  scope: RuntimeScope,
  dotId: string,
  title: string,
  page?: { id: string; spaceId: string },
): Promise<Conversation> {
  const key = `ryoko-create:${JSON.stringify(scope)}:${dotId}:${page?.id ?? 'chat'}`;
  const stored = sessionStorage.getItem(key);
  const operationId = stored
    ? (JSON.parse(stored).operationId as string)
    : crypto.randomUUID();
  // Once a request may have reached the server, subsequent clicks inspect it.
  // The backend must provide durable create admission/receipt semantics in BE02.
  if (!stored)
    sessionStorage.setItem(key, JSON.stringify({ operationId, title }));
  const raw = await api<unknown>(
    stored
      ? `/runtime/operations/${encodeURIComponent(operationId)}`
      : page
        ? `/runtime/pages/${encodeURIComponent(page.id)}/conversation`
        : '/runtime/conversations',
    stored ? 'GET' : 'POST',
    stored
      ? undefined
      : {
          operationId,
          dotId,
          title,
          ...(page ? { spaceId: page.spaceId } : {}),
        },
  );
  const result = conversationResponseSchema.parse(raw);
  if (!sameScope(scope, result.scope) || result.conversation.dotId !== dotId)
    throw new Error('Conversation receipt belongs to a different binding.');
  sessionStorage.removeItem(key);
  return legacyConversation(result.conversation, scope);
}
