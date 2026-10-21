import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { RuntimeAdapter, Guard, RunSnapshot } from './adapter.js';
import type { ChildRun } from '../../shared/hub/types.js';
const item=z.object({id:z.string(),type:z.string(),text:z.string().optional(),clientId:z.string().nullable().optional(),content:z.array(z.object({type:z.string(),text:z.string().optional()})).optional(),receiverThreadIds:z.array(z.string()).optional(),prompt:z.string().nullable().optional(),agentsStates:z.record(z.string(),z.object({status:z.string(),message:z.string().nullable().optional()})).optional(),status:z.string().optional()}).passthrough();
const turn=z.object({id:z.string(),status:z.enum(['completed','interrupted','failed','inProgress']),items:z.array(item),startedAt:z.number().nullable().optional(),completedAt:z.number().nullable().optional()});
const thread=z.object({id:z.string(),turns:z.array(turn).default([])});
type Turn=z.infer<typeof turn>;
interface Approval {id:string;threadId:string;turnId:string;method:string;requestId:number|string;description:string}
export interface CodexConfig {executable:string;cwd:string;home:string;model?:string}
export class CodexAdapter implements RuntimeAdapter {
  readonly capabilities={chat:true,cancel:true,computer:false,children:true,approvals:true};
  private process?:ChildProcessWithoutNullStreams;
  private starting?:Promise<void>;
  private sequence=0;
  private waiting=new Map<number,{resolve:(v:unknown)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private resumed=new Set<string>();
  private approvals=new Map<string,Approval>();
  private db:DatabaseSync;
  private ready=false;
  constructor(private config:CodexConfig,path:string){this.db=new DatabaseSync(path);this.db.exec(`CREATE TABLE IF NOT EXISTS codex_threads(id TEXT PRIMARY KEY,operationId TEXT UNIQUE NOT NULL,title TEXT NOT NULL,createdAt INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS codex_turns(operationId TEXT PRIMARY KEY,threadId TEXT NOT NULL,turnId TEXT);`);}
  readiness(){return this.ready?'ready':'disconnected';}
  private start(){return this.starting??=(async()=>{
    const child=spawn(this.config.executable,['app-server','--listen','stdio://'],{cwd:this.config.cwd,env:{...process.env,CODEX_HOME:this.config.home},stdio:['pipe','pipe','pipe']});this.process=child;
    // Stderr can contain provider context; drain without publishing it to clients.
    child.stderr.on('data',()=>{});
    const rejectAll=()=>{this.ready=false;this.starting=undefined;this.resumed.clear();this.approvals.clear();for(const p of this.waiting.values()){clearTimeout(p.timer);p.reject(Error('Codex transport closed; execution outcome may be unknown.'));}this.waiting.clear();if(this.process===child)this.process=undefined;};
    child.once('error',rejectAll);child.once('exit',rejectAll);
    const lines=createInterface({input:child.stdout});lines.on('line',line=>{if(line.length>16_000_000){child.kill();return;}try{const message=JSON.parse(line) as {id?:number|string;method?:string;params?:Record<string,unknown>;result?:unknown;error?:unknown};
      if(message.method&&message.id!==undefined){this.request(message.id,message.method,message.params??{});return;}
      if(typeof message.id==='number'){const p=this.waiting.get(message.id);if(p){clearTimeout(p.timer);this.waiting.delete(message.id);if(message.error)p.reject(Error('Codex rejected the request.'));else p.resolve(message.result);}}
    }catch{/* A malformed protocol line is never treated as a successful operation. */}});
    await this.rpc('initialize',{clientInfo:{name:'ryoko_dots',title:'Ryoko Dots',version:'1.0.0'},capabilities:{experimentalApi:false}});this.write({method:'initialized'});this.ready=true;
  })().catch(e=>{this.process?.kill();this.starting=undefined;throw e;});}
  private write(value:unknown){if(!this.process?.stdin.writable)throw Error('Codex is disconnected.');this.process.stdin.write(JSON.stringify(value)+'\n');}
  private rpc(method:string,params:unknown):Promise<unknown>{const id=++this.sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.waiting.delete(id);reject(Error('Codex response deadline exceeded; do not replay mutations.'));},60000);this.waiting.set(id,{resolve,reject,timer});try{this.write({id,method,params});}catch(e){clearTimeout(timer);this.waiting.delete(id);reject(e);}});}
  private request(requestId:number|string,method:string,p:Record<string,unknown>){
    const threadId=typeof p.threadId==='string'?p.threadId:'';const turnId=typeof p.turnId==='string'?p.turnId:'';
    if(!this.db.prepare('SELECT id FROM codex_threads WHERE id=?').get(threadId)){this.write({id:requestId,error:{code:-32600,message:'Unknown thread.'}});return;}
    if(!['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(method)){this.write({id:requestId,error:{code:-32601,message:'This client does not support that interactive request.'}});return;}
    const id=randomUUID();this.approvals.set(id,{id,threadId,turnId,method,requestId,description:JSON.stringify({command:p.command??null,cwd:p.cwd??null,reason:p.reason??null,grantRoot:p.grantRoot??null},null,2)});
  }
  pendingApprovals(threadId:string){return [...this.approvals.values()].filter(a=>a.threadId===threadId).map(({requestId:_,...a})=>a);}
  approve(threadId:string,id:string,accept:boolean,guard:Guard){guard();const a=this.approvals.get(id);if(!a||a.threadId!==threadId)throw Error('Approval expired or does not belong to this conversation.');this.write({id:a.requestId,result:{decision:accept?'accept':'decline'}});this.approvals.delete(id);}
  private assertThread(id:string){if(!this.db.prepare('SELECT id FROM codex_threads WHERE id=?').get(id))throw Error('Codex thread is not enrolled in this Dot.');}
  private async resume(id:string){this.assertThread(id);await this.start();if(!this.resumed.has(id)){await this.rpc('thread/resume',{threadId:id,cwd:this.config.cwd,approvalPolicy:'on-request',sandbox:'workspace-write'});this.resumed.add(id);}}
  async create(operationId:string,title:string,guard:Guard){guard();const old=this.db.prepare('SELECT id FROM codex_threads WHERE operationId=?').get(operationId);if(old)return String(old.id);await this.start();guard();const r=z.object({thread}).parse(await this.rpc('thread/start',{cwd:this.config.cwd,approvalPolicy:'on-request',sandbox:'workspace-write',...(this.config.model?{model:this.config.model}:{}),ephemeral:false}));this.db.prepare('INSERT INTO codex_threads VALUES(?,?,?,?)').run(r.thread.id,operationId,title,Date.now());this.resumed.add(r.thread.id);return r.thread.id;}
  async list(cursor:string|undefined,guard:Guard){guard();const rows=this.db.prepare('SELECT id,title FROM codex_threads WHERE id>? ORDER BY id LIMIT 51').all(cursor??'') as unknown as {id:string;title:string}[];return {items:rows.slice(0,50),nextCursor:rows.length>50?rows[49].id:null};}
  private async read(id:string){this.assertThread(id);await this.start();return z.object({thread}).parse(await this.rpc('thread/read',{threadId:id,includeTurns:true})).thread;}
  async messages(id:string,cursor:string|undefined,guard:Guard){guard();const t=await this.read(id);guard();const messages=t.turns.flatMap(t=>t.items.filter(i=>i.type==='userMessage'||i.type==='agentMessage'&&t.status!=='inProgress').map(i=>({id:i.id,role:i.type==='userMessage'?'user':'assistant',text:i.type==='userMessage'?(i.content??[]).filter(c=>c.type==='text').map(c=>c.text??'').join('\n'):i.text??'',committed:true})));const offset=cursor?Number(cursor):0;if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid history cursor.');return {items:messages.slice(offset,offset+100),nextCursor:messages.length>offset+100?String(offset+100):null};}
  private snapshot(t:Turn):RunSnapshot{return {nativeId:t.id,state:[...this.approvals.values()].some(a=>a.turnId===t.id)?'waiting_approval':t.status==='completed'?'completed':t.status==='failed'?'failed':t.status==='interrupted'?'cancelled':'running',detail:t.status==='failed'?'Codex reported a failed turn.':null};}
  async submit(id:string,operationId:string,text:string,guard:Guard){guard();await this.resume(id);guard();if(this.db.prepare('SELECT operationId FROM codex_turns WHERE operationId=?').get(operationId))return this.inspect(id,operationId,null,guard);this.db.prepare('INSERT INTO codex_turns VALUES(?,?,NULL)').run(operationId,id);const r=z.object({turn}).parse(await this.rpc('turn/start',{threadId:id,clientUserMessageId:operationId,input:[{type:'text',text,text_elements:[]}]}));this.db.prepare('UPDATE codex_turns SET turnId=? WHERE operationId=?').run(r.turn.id,operationId);return this.snapshot(r.turn);}
  async inspect(id:string,operationId:string,runId:string|null,guard:Guard){guard();const t=await this.read(id);guard();const record=this.db.prepare('SELECT turnId FROM codex_turns WHERE operationId=? AND threadId=?').get(operationId,id);const match=t.turns.find(t=>t.id===(runId??record?.turnId)||t.items.some(i=>i.type==='userMessage'&&i.clientId===operationId));if(!match)return {nativeId:runId,state:'unknown' as const,detail:'No matching persisted turn found. Automatic replay is disabled.'};return this.snapshot(match);}
  async cancel(id:string,operationId:string,runId:string|null,_cancelId:string,guard:Guard){guard();const current=await this.inspect(id,operationId,runId,guard);if(!current.nativeId)throw Error('Unknown turn cannot be cancelled.');if(['completed','failed','cancelled'].includes(current.state))return current;await this.resume(id);guard();await this.rpc('turn/interrupt',{threadId:id,turnId:current.nativeId});return this.inspect(id,operationId,current.nativeId,guard);}
  async children(id:string,runId:string|null,guard:Guard):Promise<ChildRun[]>{guard();const t=await this.read(id);guard();const parent=t.turns.find(t=>t.id===runId);return (parent?.items??[]).filter(i=>i.type==='collabAgentToolCall').flatMap(i=>(i.receiverThreadIds??[]).map(child=>({id:child,parentId:runId!,task:i.prompt??'Delegated task',state:i.agentsStates?.[child]?.status??i.status??'unknown',updatedAt:null,result:i.agentsStates?.[child]?.message??null})));}
  async stop(){const p=this.process;if(p){p.kill('SIGTERM');await new Promise<void>(resolve=>{const timer=setTimeout(()=>{p.kill('SIGKILL');resolve();},3000);p.once('exit',()=>{clearTimeout(timer);resolve();});});}this.db.close();}
}
