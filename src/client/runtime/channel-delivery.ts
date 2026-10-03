import { api } from '../api';
import { sameScope, type RuntimeScope } from '../../shared/runtime/contracts';
import { deliveriesSchema } from '../../shared/runtime/channels';

/** Explicit bounded provider lookup. GET lists never inspect or resend. */
export async function inspectChannelDelivery(scope: RuntimeScope, id: string) {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(id))
    throw new Error('Invalid delivery identity.');
  const value = deliveriesSchema.parse(
    await api<unknown>(
      `/runtime/channel-deliveries/${encodeURIComponent(id)}/inspect`,
      'POST',
      {},
    ),
  );
  if (
    !sameScope(scope, value.scope) ||
    !value.deliveries.some((row) => row.id === id)
  )
    throw new Error(
      'Delivery inspection does not match the displayed owner or output.',
    );
  return value;
}
