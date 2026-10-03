import { fstatSync } from 'node:fs';
/** Only the trusted lifetime supervisor supplies this inherited descriptor.
 * Pass it explicitly through Node spawn; default child stdio drops extra FDs.
 * This protects the owned producer process, not independently launched workers. */
export function stateGateDescriptor(env: NodeJS.ProcessEnv = process.env) {
  if (env.DOTS_STATE_GATE_FD === undefined) return undefined;
  if (!/^[1-9][0-9]{0,4}$/.test(env.DOTS_STATE_GATE_FD))
    throw new Error('Invalid inherited state gate.');
  const fd = Number(env.DOTS_STATE_GATE_FD);
  if (fd < 3 || fd > 65535) throw new Error('Invalid inherited state gate.');
  const value = fstatSync(fd);
  if (
    !value.isFile() ||
    value.nlink !== 1 ||
    value.mode & 0o077 ||
    value.uid !== process.getuid?.()
  )
    throw new Error('Unsafe inherited state gate.');
  return fd;
}
