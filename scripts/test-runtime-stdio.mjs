import process from 'node:process';
import { spawnSync } from 'node:child_process';
if (!process.env.RYOKO_TEST_PYTHON || !process.env.RYOKO_TEST_CHECKOUT)
  throw new Error(
    'Set RYOKO_TEST_PYTHON and RYOKO_TEST_CHECKOUT to the qualified isolated interpreter and pinned producer checkout.',
  );
const result = spawnSync(
  process.execPath,
  [
    'node_modules/vitest/vitest.mjs',
    'run',
    'tests/self-hosted-conversations.test.ts',
  ],
  { stdio: 'inherit', env: process.env },
);
process.exit(result.status ?? 1);
