import { lstatSync } from 'node:fs';
import { join } from 'node:path';

/** Owner-configured executable; API callers cannot provide commands or URLs. */
export interface WorkerMcpConfig {
  directory: string;
  command: string;
  script: string;
}
export function workerMcp(
  config: WorkerMcpConfig | undefined,
  operationId: string,
) {
  if (!config) return undefined;
  if (!/^[a-f0-9-]{36}$/.test(operationId))
    throw Error('Invalid conversation operation.');
  const file = join(config.directory, operationId + '.json');
  try {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077)
      throw Error('Agent Chat binding must be a private regular file.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  return {
    command: config.command,
    args: [config.script],
    env: { AGENT_CHAT_BINDING_FILE: file },
  };
}
