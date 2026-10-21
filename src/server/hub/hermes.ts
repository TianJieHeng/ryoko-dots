import type { RuntimeAdapter, Guard, RunSnapshot } from './adapter.js';
import type { SelfHostedPlatform } from '../self-hosted-platform.js';
import { canonicalCommand } from '../runtime/command-ledger.js';
import { intentDigest } from '../runtime/conversation-ledger.js';
import type { CommandReceipt, CommandIntent } from '../../shared/runtime/contracts.js';
const snapshot = (r: CommandReceipt): RunSnapshot => ({nativeId:r.runId,state:r.executionStatus==='completed'?'completed':r.executionStatus==='failed'||r.executionStatus==='blocked'?'failed':r.status==='cancelled'||r.executionStatus==='cancelled'?'cancelled':r.status==='outcome_unknown'?'unknown':r.status==='rejected'?'failed':r.executionStatus==='claimed'?'running':'accepted'});
export class HermesAdapter implements RuntimeAdapter {
  readonly capabilities;
  constructor(readonly platform: SelfHostedPlatform, readonly dotId: string, private owned=false) {
    this.capabilities={chat:true,cancel:true,computer:!!platform.nativeComputers,children:false,approvals:false};
  }
  readiness(){return this.platform.transport?.connected?'ready':'disconnected';}
  async create(id:string,title:string,guard:Guard){const r=await this.platform.create(id,{dotId:this.dotId,title,pageId:null,spaceId:null},guard);return r.conversation.id;}
  async list(cursor:string|undefined,guard:Guard){const r=await this.platform.list(this.dotId,cursor,'',false,guard);return {items:r.conversations.map(c=>({id:c.id,title:c.title})),nextCursor:r.nextCursor};}
  async messages(id:string,cursor:string|undefined,guard:Guard){const r=await this.platform.history(id,cursor,guard);return {items:r.messages.map(m=>({id:m.id+':'+(m.chunk?.offset??0),role:m.role,text:m.parts.filter(p=>p.kind==='text').map(p=>p.kind==='text'?p.text:'').join('\n'),committed:true})),nextCursor:r.nextCursor};}
  private async command(id:string,operationId:string,intent:CommandIntent,guard:Guard){
    const commands=this.platform.commands;if(!commands)throw Error('Hermes commands unavailable.');
    await commands.connect(id,guard); const scope=this.platform.workspace.runtimeBindings.resolveConversation(id,'write');
    return commands.admit(operationId,intentDigest(canonicalCommand(intent)),intent,scope.authorityRevision,guard);
  }
  async submit(id:string,operationId:string,text:string,guard:Guard){return snapshot(await this.command(id,operationId,{operation:'submit',conversationId:id,text,sourceUrl:null},guard));}
  async inspect(_id:string,operationId:string,_runId:string|null,guard:Guard){return snapshot(await this.platform.commands!.inspect(operationId,guard));}
  async cancel(id:string,operationId:string,_runId:string|null,cancelId:string,guard:Guard){const r=await this.platform.commands!.inspect(operationId,guard);if(!r.runId)throw Error('Run identity is not yet known.');await this.command(id,cancelId,{operation:'cancel',conversationId:id,runId:r.runId,expectedRevision:r.durableRevision},guard);return this.inspect(id,operationId,r.runId,guard);}
  async children(_id:string,_runId:string|null,guard:Guard){guard();return [];}
  async stop(){if(this.owned)await this.platform.stop();}
}
