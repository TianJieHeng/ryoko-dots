import { spawn } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import { error } from 'node:console';
// Always use the one operator-selected gate. Do not invent a second lock path,
// delete an existing inode, start a second producer, or create credentials here.
const gate = process.env.DOTS_STATE_GATE_PATH;
const python = process.env.DOTS_GATE_PYTHON ?? '/usr/bin/python3';
const development = process.argv.includes('--development');
if (!gate || !isAbsolute(gate) || !isAbsolute(python)) {
  error(
    'Set DOTS_STATE_GATE_PATH to the existing canonical private maintenance gate path. DOTS_GATE_PYTHON must be an absolute trusted Python executable.',
  );
  process.exit(1);
}
const child = spawn(
  python,
  [
    resolve('scripts/operations/lifetime_gate.py'),
    '--gate',
    gate,
    '--',
    process.execPath,
    ...(development
      ? ['--import', 'tsx', resolve('src/server/index.ts')]
      : [resolve('dist/server/server/index.js')]),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: development ? 'development' : 'production',
    },
    shell: false,
  },
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => child.kill(signal));
child.once('error', () => {
  error('The supervised self-hosted process could not start.');
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
