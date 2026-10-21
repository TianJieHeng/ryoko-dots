import type { Capabilities, ChildRun, HubMessage, RunState } from '../../shared/hub/types.js';
export type Guard = () => void;
export interface RunSnapshot { nativeId: string | null; state: RunState; detail?: string | null }
export interface RuntimeAdapter {
  readonly capabilities: Capabilities;
  readiness(): string;
  create(operationId: string, title: string, guard: Guard): Promise<string>;
  list(cursor: string | undefined, guard: Guard): Promise<{items: {id:string;title:string}[];nextCursor:string|null}>;
  messages(nativeId: string, cursor: string | undefined, guard: Guard): Promise<{items:HubMessage[];nextCursor:string|null}>;
  submit(nativeId: string, operationId: string, text: string, guard: Guard): Promise<RunSnapshot>;
  inspect(nativeId: string, operationId: string, runId: string | null, guard: Guard): Promise<RunSnapshot>;
  cancel(nativeId: string, operationId: string, runId: string | null, cancelId: string, guard: Guard): Promise<RunSnapshot>;
  children(nativeId: string, runId: string | null, guard: Guard): Promise<ChildRun[]>;
  stop(): Promise<void>;
}
