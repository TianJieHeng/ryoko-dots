export type RuntimeKind = 'hermes' | 'codex';
export type RunState = 'accepted' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled' | 'unknown';
export interface Capabilities { chat: boolean; cancel: boolean; computer: boolean; children: boolean; approvals: boolean }
export interface HubDot { id: string; name: string; kind: RuntimeKind; runtime: string; archived: boolean; isDefault: boolean; capabilities: Capabilities; readiness: string }
export interface HubThread { id: string; dotId: string; nativeId: string | null; title: string; state: string; createdAt: number }
export interface HubMessage { id: string; role: string; text: string; committed: boolean }
export interface HubRun { id: string; threadId: string; text: string; state: RunState; nativeId: string | null; createdAt: number; updatedAt: number; detail: string | null }
export interface ChildRun { id: string; parentId: string; task: string; state: string; updatedAt: number | null; result: string | null }
export interface HubEvent { id: number; runId: string; state: RunState; at: number }
