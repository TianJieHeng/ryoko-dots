import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { SelfHostedPlatform } from '../self-hosted-platform.js';
import type { ChildRun } from '../../shared/hub/types.js';
import type { Guard } from './adapter.js';
/** Read-only projection of the pinned producer's BE13 parent-owned handoffs.
 * No child transcripts or memory are read. Unsupported schema is explicit. */
export async function hermesChildren(platform:SelfHostedPlatform,conversationId:string,runId:string|null,guard:Guard):Promise<ChildRun[]>{
  guard();if(!platform.transport)return [];
  await platform.commands?.connect(conversationId,guard);
  const scope=platform.workspace.runtimeBindings.resolveConversation(conversationId,'read');
  const file=join(platform.transport.config.home,'state.db');if(!existsSync(file))throw Error('Delegation state unavailable.');
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='delegation_handoffs'").get())throw Error('Producer does not expose durable handoffs.');
    const rows=db.prepare(`SELECT h.child_id,h.parent_run_id,h.handoff_json,h.state,h.updated_at,h.completion_json FROM delegation_handoffs h JOIN delegation_roots r ON r.root_run_id=h.root_run_id WHERE h.parent_session_id=? AND r.principal_id=? AND r.profile_id=? AND (? IS NULL OR h.parent_run_id=?) ORDER BY h.created_at LIMIT 501`).all(scope.durableSessionId,scope.principalId,scope.profileId,runId,runId);
    if(rows.length>500)throw Error('Delegation history exceeds this view; narrow to a run.');
    guard();return rows.map(row=>{const handoff=z.object({objective:z.string()}).parse(JSON.parse(String(row.handoff_json)));let summary:string|null=null;if(row.completion_json){const parsed=z.record(z.string(),z.unknown()).parse(JSON.parse(String(row.completion_json)));if(typeof parsed.summary==='string')summary=parsed.summary.slice(0,24000);else if(typeof parsed.result==='string')summary=parsed.result.slice(0,24000);}return {id:String(row.child_id),parentId:String(row.parent_run_id),task:handoff.objective.slice(0,16000),state:String(row.state),updatedAt:Number(row.updated_at)*1000,result:summary};});
  }finally{db.close();}
}
