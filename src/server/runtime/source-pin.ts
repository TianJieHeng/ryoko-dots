import { execFileSync } from 'node:child_process';
/** Owner-supplied Git checkout verification, not an attestation of the host or interpreter. */
export function verifyGitCheckout(checkout: string, expectedCommit: string) {
  const git = (...args: string[]) =>
    execFileSync(
      '/usr/bin/git',
      [
        '-c',
        'core.fsmonitor=false',
        '-c',
        'core.untrackedCache=false',
        '-C',
        checkout,
        ...args,
      ],
      {
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          PATH: '/usr/bin:/bin',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_TERMINAL_PROMPT: '0',
        },
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
  try {
    if (git('rev-parse', '--verify', 'HEAD').trim() !== expectedCommit)
      throw new Error('commit');
    // Check both staged and unstaged changes without executing external diff tools.
    git('diff', '--no-ext-diff', '--quiet', 'HEAD', '--');
    const flags = git('ls-files', '-v', '-z').split('\0');
    if (
      flags.some(
        (entry) => entry && (entry[0] === 'S' || /[a-z]/.test(entry[0])),
      )
    )
      throw new Error('hidden index');
  } catch {
    throw new Error(
      'Ryoko checkout is not the clean pinned producer revision.',
    );
  }
}
