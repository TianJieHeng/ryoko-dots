import { afterEach, expect, it } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  chmodSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { workerMcp } from '../src/server/hub/worker-mcp';
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
it('connects only to the owner-installed connector and exact private conversation binding', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dots-mcp-'));
  dirs.push(directory);
  const config = {
    directory,
    command: '/usr/bin/node',
    script: '/owner/connector.ts',
  };
  const id = randomUUID(),
    other = randomUUID(),
    file = join(directory, id + '.json');
  expect(workerMcp(config, id)).toBeUndefined();
  writeFileSync(file, '{}', { mode: 0o600 });
  expect(workerMcp(config, id)).toEqual({
    command: config.command,
    args: [config.script],
    env: { AGENT_CHAT_BINDING_FILE: file },
  });
  expect(workerMcp(config, other)).toBeUndefined();
  expect(() => workerMcp(config, '../escape')).toThrow();
  chmodSync(file, 0o644);
  expect(() => workerMcp(config, id)).toThrow();
  chmodSync(file, 0o600);
  symlinkSync(file, join(directory, other + '.json'));
  expect(() => workerMcp(config, other)).toThrow();
});
