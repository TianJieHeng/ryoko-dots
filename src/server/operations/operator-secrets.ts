import {
  lstatSync,
  openSync,
  readFileSync,
  closeSync,
  constants,
  fstatSync,
} from 'node:fs';
import { dirname, isAbsolute, parse } from 'node:path';

/** Existing operator-mounted secret only. Does not generate/save credentials. */
export function ownerTokenFromEnvironment(
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (env.OWNER_TOKEN && env.OWNER_TOKEN_FILE)
    throw new Error('Choose one owner token source.');
  if (!env.OWNER_TOKEN_FILE) return env.OWNER_TOKEN;
  const path = env.OWNER_TOKEN_FILE;
  if (!isAbsolute(path)) throw new Error('Owner token file must be absolute.');
  for (
    let component = path;
    component !== parse(component).root;
    component = dirname(component)
  )
    if (lstatSync(component).isSymbolicLink())
      throw new Error('Owner token file must not contain symlinks.');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    // Compose secret mounts can be owned by root, but must have no write bits
    // for group/other. Native files additionally should be mode 0400/0600.
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.size > 4097 ||
      stat.mode & 0o022
    )
      throw new Error('Unsafe owner token file.');
    const token = readFileSync(fd, 'utf8').replace(/\r?\n$/, '');
    if (token.length < 24 || token.length > 4096 || /[\r\n\0]/.test(token))
      throw new Error('Invalid owner token file.');
    return token;
  } finally {
    closeSync(fd);
  }
}
