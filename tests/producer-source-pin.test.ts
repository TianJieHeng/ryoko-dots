import { expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyGitCheckout } from '../src/server/runtime/source-pin';
test('producer source pin rejects a different commit and implementation drift with unchanged schemas', () => {
  const root = mkdtempSync(join(tmpdir(), 'dots-source-pin-'));
  const git = (...args: string[]) =>
    execFileSync('/usr/bin/git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        PATH: '/usr/bin:/bin',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
      },
    });
  try {
    git('init');
    writeFileSync(join(root, 'runtime.py'), 'original implementation\n');
    writeFileSync(join(root, 'schema.json'), '{}\n');
    git('add', '.');
    git(
      '-c',
      'user.name=Isolated test fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-m',
      'Isolated source fixture',
    );
    const commit = git('rev-parse', 'HEAD').trim();
    expect(() => verifyGitCheckout(root, commit)).not.toThrow();
    expect(() => verifyGitCheckout(root, '0'.repeat(40))).toThrow('pinned');
    writeFileSync(
      join(root, 'runtime.py'),
      'changed implementation, same schema\n',
    );
    expect(() => verifyGitCheckout(root, commit)).toThrow('pinned');
    git('add', 'runtime.py');
    expect(() => verifyGitCheckout(root, commit)).toThrow('pinned');
    git('reset', '--hard', 'HEAD');
    git('update-index', '--assume-unchanged', 'runtime.py');
    expect(() => verifyGitCheckout(root, commit)).toThrow('pinned');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
