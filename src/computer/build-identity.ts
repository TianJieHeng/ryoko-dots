import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { release } from 'node:os';
import {
  edgeDigest,
  type EdgeTargetIdentity,
} from '../shared/computer-edge-protocol.js';
/** Fingerprint actual running compiled bytes, dependency lock and runtime, plus
 * security-relevant configuration. Supplied env/image tags are not build proof. */
export function measureComputerIdentity(
  root: string,
  lockfile: string,
  configuration: Record<string, unknown>,
  sandboxPath = '/usr/bin/bwrap',
  browserExecutable?: string,
): EdgeTargetIdentity {
  const hash = createHash('sha256');
  const base = realpathSync(root);
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name),
        info = lstatSync(path);
      if (info.isSymbolicLink())
        throw new Error('Compiled target tree contains a symlink.');
      if (info.isDirectory()) walk(path);
      else if (name.endsWith('.js')) {
        hash.update(relative(base, path) + '\0');
        hash.update(readFileSync(path));
        hash.update('\0');
      }
    }
  };
  walk(base);
  hash.update(readFileSync(lockfile));
  hash.update(JSON.stringify(process.versions));
  hash.update(readFileSync(process.execPath));
  if (browserExecutable) hash.update(readFileSync(browserExecutable));
  // Installed OS dependency versions are part of the observed build too.
  hash.update(readFileSync('/etc/os-release'));
  hash.update(readFileSync('/var/lib/dpkg/status'));
  // Actual sandbox executable, so replacing it invalidates the host receipt.
  const sandboxSha256 = createHash('sha256')
    .update(readFileSync(sandboxPath))
    .digest('hex');
  return {
    buildSha256: hash.digest('hex'),
    configurationSha256: edgeDigest({
      ...configuration,
      nodeExecutable: realpathSync(process.execPath),
      platform: process.platform,
      kernelRelease: release(),
      architecture: process.arch,
      uid: process.getuid?.() ?? null,
      gid: process.getgid?.() ?? null,
      sandboxSha256,
    }),
    evidence: 'target-host',
  };
}
