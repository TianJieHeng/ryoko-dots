import { readFileSync, realpathSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { WorkspaceStore } from '../workspace.js';
import { SelfHostedPlatform } from '../self-hosted-platform.js';
import { loadLaunchConfig, StdioConversationTransport } from '../runtime/stdio.js';
import { HermesAdapter } from './hermes.js';
import type { DotHub } from './service.js';
const path=z.string().refine(isAbsolute);
export const runtimeManifest=z.strictObject({version:z.literal(1),runtimes:z.array(z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('hermes'),id:z.string().regex(/^[a-z0-9-]{1,64}$/),name:z.string().min(1).max(80),launchConfig:path}),
  z.strictObject({kind:z.literal('codex'),id:z.string().regex(/^[a-z0-9-]{1,64}$/),name:z.string().min(1).max(80),executable:path,cwd:path,home:path,model:z.string().max(100).optional()}),
])).max(500)});
export function readRuntimeManifest(file:string|undefined){return file?runtimeManifest.parse(JSON.parse(readFileSync(file,'utf8'))):{version:1 as const,runtimes:[]};}
export function enrollHermes(hub:DotHub,entry:Extract<z.infer<typeof runtimeManifest>['runtimes'][number],{kind:'hermes'}>,database:string,ownerId:string,homes:Set<string>){
  const config=loadLaunchConfig(entry.launchConfig);if(!config||config.ownerId!==ownerId)throw Error('Runtime owner mismatch.');
  const home=realpathSync(config.home);if(homes.has(home))throw Error('Two runtimes cannot own the same Hermes profile.');homes.add(home);
  const db=resolve(dirname(database),'runtimes',entry.id,'workspace.sqlite');mkdirSync(dirname(db),{recursive:true,mode:0o700});
  const workspace=new WorkspaceStore(db,ownerId);
  if(!workspace.dot(config.dotId))workspace.mirrorRuntimeDot(config.dotId,{name:entry.name,instructions:'Use the enrolled runtime profile.',researchAllowed:false,memoryAllowed:false,spaceIds:[],defaultSpaceId:null});
  const platform=new SelfHostedPlatform(workspace,db,new StdioConversationTransport(config));
  const adapter=new HermesAdapter(platform,config.dotId,true);
  const stop=adapter.stop.bind(adapter);adapter.stop=async()=>{await stop();workspace.close();};
  hub.register({id:config.dotId,name:entry.name,kind:'hermes',runtime:entry.id},adapter);
}
