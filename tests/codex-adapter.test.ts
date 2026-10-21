import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexAdapter } from '../src/server/hub/codex';
const clean: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const f of clean.splice(0)) await f();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dots-codex-fixture-'));
  const exe = join(root, 'runtime.py');
  writeFileSync(
    exe,
    `#!/usr/bin/python3
import json,sys,os
path=os.path.join(os.getcwd(),'turn.json')
for line in sys.stdin:
 r=json.loads(line);m=r.get('method');p=r.get('params',{});i=r.get('id')
 if i is None: continue
 if m=='initialize': result={}
 elif m=='thread/start': result={'thread':{'id':'owned-thread','turns':[]}}
 elif m=='thread/resume': result={}
 elif m=='turn/start':
  t={'id':'turn-1','status':'completed','items':[{'id':'user','type':'userMessage','clientId':p['clientUserMessageId'],'content':p['input']},{'id':'answer','type':'agentMessage','text':'Fixture response.'}]}
  with open(path,'w') as f: json.dump(t,f)
  result={'turn':t}
 elif m=='thread/read':
  t=json.load(open(path)) if os.path.exists(path) else None
  result={'thread':{'id':'owned-thread','turns':[t] if t else []}}
 elif m=='turn/interrupt': result={}
 else:
  print(json.dumps({'id':i,'error':{'code':-32601}}),flush=True);continue
 print(json.dumps({'id':i,'result':result}),flush=True)
`,
  );
  chmodSync(exe, 0o755);
  const config = { executable: exe, cwd: root, home: root };
  const db = join(root, 'codex.sqlite');
  let adapter = new CodexAdapter(config, db);
  clean.push(async () => {
    await adapter.stop();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    get adapter() {
      return adapter;
    },
    async restart() {
      await adapter.stop();
      adapter = new CodexAdapter(config, db);
    },
  };
}
it('resumes only enrolled threads and recovers native run IDs without replay', async () => {
  const f = fixture();
  const id = await f.adapter.create('create-1', 'Thread', () => {});
  const r = await f.adapter.submit(id, 'op-1', 'hello', () => {});
  expect(r.state).toBe('completed');
  await f.restart();
  const recovered = await f.adapter.inspect(id, 'op-1', null, () => {});
  expect(recovered.nativeId).toBe('turn-1');
  expect(
    (await f.adapter.messages(id, undefined, () => {})).items.at(-1)?.text,
  ).toBe('Fixture response.');
  await expect(
    f.adapter.messages('foreign-thread', undefined, () => {}),
  ).rejects.toThrow('not enrolled');
  expect((await f.adapter.list(undefined, () => {})).items).toHaveLength(1);
});
it('keeps missing execution evidence unknown and cannot approve a stale request', async () => {
  const f = fixture();
  const id = await f.adapter.create('create-1', 'Thread', () => {});
  expect(
    (await f.adapter.inspect(id, 'never-submitted', null, () => {})).state,
  ).toBe('unknown');
  expect(() => f.adapter.approve(id, 'stale', true, () => {})).toThrow(
    'expired',
  );
});
