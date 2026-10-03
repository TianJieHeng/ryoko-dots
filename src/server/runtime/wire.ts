import Ajv from 'ajv';
import { producerSchema } from '../../shared/runtime/producer/schema.generated.js';
import type {
  ClientCapabilitiesResult,
  RuntimeProjectResult,
  RuntimeEffectGetResult,
  DotsRegistrationResult,
  DotsPreparedResult,
  DotsEffectResult,
  DotsEffectReceipt,
  DotsPageReadResult,
  DotsApprovalResult,
  RuntimeCapabilities,
  MissionSnapshot,
  RuntimeEventsSinceResult,
  RuntimeConversationCapabilities,
  RuntimeConversationCreateResult,
  RuntimeConversationOperationResult,
  RuntimeConversationListResult,
  RuntimeConversationHistoryResult,
  RuntimeConversationResult,
  RuntimeConversationBindResult,
  CommandReceipt,
  MissionGetResult,
  MissionListResult,
  MissionResult,
  RuntimeApprovalGetResult,
  RuntimeApprovalListResult,
  RuntimeApprovalResolveResult,
  RuntimeControlResult,
  RuntimeDeliveryReceipt,
  RuntimeResultChunk,
  RuntimeEffectListResult,
  RuntimeCommandReceiptResult,
} from '../../shared/runtime/producer/wire.generated.js';
export interface ReadResults {
  'runtime.capabilities': RuntimeCapabilities;
  'runtime.snapshot': MissionSnapshot;
  'runtime.events.since': RuntimeEventsSinceResult;
}
export type ReadMethod = keyof ReadResults;
export interface ConversationResults extends ReadResults {
  'client.capabilities': ClientCapabilitiesResult;
  'runtime.project.get': RuntimeProjectResult;
  'runtime.effect.get': RuntimeEffectGetResult;
  'runtime.dots.register': DotsRegistrationResult;
  'runtime.dots.page.prepare': DotsPreparedResult;
  'runtime.dots.page.publish': DotsEffectResult;
  'runtime.dots.effect.reconcile': DotsEffectResult;
  'runtime.control.get': RuntimeControlResult;
  'runtime.control.pause': RuntimeControlResult;
  'runtime.control.resume': RuntimeControlResult;
  'runtime.approvals.list': RuntimeApprovalListResult;
  'runtime.approval.get': RuntimeApprovalGetResult;
  'runtime.approval.resolve': RuntimeApprovalResolveResult;
  'runtime.effects.list': RuntimeEffectListResult;
  'runtime.mission.history': MissionListResult;
  'runtime.mission.get': MissionGetResult;
  'runtime.mission.pause': MissionResult;
  'runtime.mission.resume': MissionResult;
  'runtime.mission.cancel': MissionResult;
  'runtime.delivery.status': RuntimeDeliveryReceipt;
  'runtime.delivery.retry': RuntimeDeliveryReceipt;
  'runtime.result.get': RuntimeResultChunk;
  'runtime.delivery.ack': RuntimeDeliveryReceipt;

  'runtime.command': CommandReceipt;
  'runtime.command.receipt': RuntimeCommandReceiptResult;
  'runtime.conversation.command.receipt': RuntimeCommandReceiptResult;
  'runtime.conversation.bind': RuntimeConversationBindResult;
  'runtime.conversation.capabilities': RuntimeConversationCapabilities;
  'runtime.conversation.create': RuntimeConversationCreateResult;
  'runtime.conversation.operation.get': RuntimeConversationOperationResult;
  'runtime.conversation.list': RuntimeConversationListResult;
  'runtime.conversation.history': RuntimeConversationHistoryResult;
  'runtime.conversation.export': RuntimeConversationHistoryResult;
  'runtime.conversation.rename': RuntimeConversationResult;
  'runtime.conversation.archive': RuntimeConversationResult;
}
export type ConversationMethod = keyof ConversationResults;
export interface NativeResults {
  'dots.effect.dispatch': DotsEffectReceipt;
  'dots.effect.inspect': DotsEffectReceipt;
  'dots.page.read': DotsPageReadResult;
  'dots.approval': DotsApprovalResult;
}
export type NativeMethod = keyof NativeResults;
export type NativeHandler = (
  method: NativeMethod,
  params: unknown,
  signal: AbortSignal,
) => Promise<NativeResults[NativeMethod]>;
const ajv = new Ajv({
  allErrors: false,
  removeAdditional: false,
  useDefaults: false,
  coerceTypes: false,
});
const validators = new Map(
  [...producerSchema.methods, ...producerSchema.serverRequests].map(
    (method) => [
      method.name,
      {
        params: ajv.compile({
          ...producerSchema,
          $ref: method.params[0].schema.$ref,
        }),
        result: ajv.compile({
          ...producerSchema,
          $ref: method.result.schema.$ref,
        }),
      },
    ],
  ),
);
export function validateWire(
  method: ReadMethod | ConversationMethod | NativeMethod,
  side: 'params' | 'result',
  value: unknown,
): void {
  if (!validators.get(method)?.[side](value))
    throw new Error(`Invalid ${method} ${side} schema`);
}

const cancellationValidator = ajv.compile({
  ...producerSchema,
  $ref: '#/components/schemas/RequestCancelPayload',
});
export function validNativeCancellation(value: unknown): boolean {
  return !!cancellationValidator(value);
}
