import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { api, getAuthenticationGeneration } from '../api';
import {
  contractVersion,
  scopeSchema,
  sameScope,
  type RuntimeScope,
} from '../../shared/runtime/contracts';
const id = z
    .string()
    .min(1)
    .max(256)
    .refine((value) => value !== '.' && value !== '..'),
  digest = z.string().regex(/^[a-f0-9]{64}$/);
const receiptSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  conversationId: id,
  effect: z.strictObject({
    effect_id: id,
    operation_id: id,
    state: z.enum([
      'prepared',
      'dispatched',
      'confirmed',
      'failed',
      'outcome_unknown',
      'reconciliation_required',
    ]),
    replay_permitted: z.literal(false),
    receipt: z
      .object({
        identity: z.object({
          effect_id: id,
          operation_id: id,
          adapter_kind: z.literal('page'),
        }),
        state: z.enum(['committed', 'not_applied', 'outcome_unknown']),
        receipt_id: id.nullable(),
        content_sha256: digest.nullable(),
        version: z.number().int().nonnegative().nullable(),
        result_sha256: digest.nullable(),
        reason: z.enum([
          'committed',
          'conflict',
          'grant_revoked',
          'takeover',
          'stale_snapshot',
          'unavailable',
          'unknown',
        ]),
      })
      .nullable(),
  }),
});
export async function inspectPageEffect(
  scope: RuntimeScope,
  conversationId: string,
  effectId: string,
  signal?: AbortSignal,
) {
  id.parse(conversationId);
  id.parse(effectId);
  const auth = getAuthenticationGeneration();
  const result = receiptSchema.parse(
    await api(
      `/runtime/conversations/${encodeURIComponent(conversationId)}/page-effects/${encodeURIComponent(effectId)}/inspect`,
      'POST',
      {},
      signal,
    ),
  );
  if (
    signal?.aborted ||
    auth !== getAuthenticationGeneration() ||
    !sameScope(scope, result.scope) ||
    result.conversationId !== conversationId ||
    result.effect.effect_id !== effectId
  )
    throw new Error(
      'Native page receipt belongs to a different or expired view.',
    );
  const receipt = result.effect.receipt;
  if (
    receipt &&
    (receipt.identity.effect_id !== effectId ||
      receipt.identity.operation_id !== result.effect.operation_id)
  )
    throw new Error('Native page receipt identity mismatched.');
  if (
    result.effect.state === 'confirmed' &&
    (!receipt ||
      receipt.state !== 'committed' ||
      !receipt.receipt_id ||
      !receipt.content_sha256 ||
      !receipt.version)
  )
    throw new Error(
      'Confirmed native page effect has no complete committed receipt.',
    );
  return result;
}
export function PageEffectReceipt({
  scope,
  conversationId,
  effectId,
  disabled = false,
}: {
  scope: RuntimeScope;
  conversationId: string;
  effectId: string;
  disabled?: boolean;
}) {
  const [result, setResult] =
      useState<Awaited<ReturnType<typeof inspectPageEffect>>>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined),
    generation = useRef(0),
    lock = useRef(false);
  const key = JSON.stringify([scope, conversationId, effectId]);
  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    lock.current = false;
    setBusy(false);
    setResult(undefined);
    setError('');
    return () => {
      generation.current++;
      controller.current?.abort();
    };
  }, [key]);
  const inspect = async () => {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const current = generation.current,
      abort = new AbortController();
    controller.current = abort;
    try {
      const receipt = await inspectPageEffect(
        scope,
        conversationId,
        effectId,
        abort.signal,
      );
      if (generation.current === current && !abort.signal.aborted)
        setResult(receipt);
    } catch (cause) {
      if (generation.current === current && !abort.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : 'Page receipt unavailable.',
        );
    } finally {
      if (generation.current === current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <section aria-label="Native page effect receipt">
      <button disabled={disabled || busy} onClick={() => void inspect()}>
        {busy
          ? 'Inspecting original page receipt…'
          : 'Inspect native page receipt'}
      </button>
      <p>
        Inspection only reconciles the original native receipt. It never saves
        the page again.
      </p>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div role="status">
          <p>Producer effect: {result.effect.state.replaceAll('_', ' ')}</p>
          {result.effect.receipt && (
            <>
              <p>
                Native receipt:{' '}
                {result.effect.receipt.state.replaceAll('_', ' ')} ·{' '}
                {result.effect.receipt.reason.replaceAll('_', ' ')}
              </p>
              {result.effect.receipt.version !== null && (
                <p>
                  Exact version {result.effect.receipt.version} · SHA-256{' '}
                  {result.effect.receipt.content_sha256 ?? 'not confirmed'}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
