import { expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  verifyProviderScope,
  type LaunchConfig,
} from '../src/server/runtime/stdio';

test('provider scope requires the exact reviewed profile secret store and detects mutation', () => {
  const root = mkdtempSync(join(tmpdir(), 'dots-scope-fixture-'));
  const home = join(root, 'home'),
    checkout = join(root, 'checkout');
  mkdirSync(home);
  mkdirSync(checkout);
  const config = {
    home,
    checkout,
    providerEnvironment: { OPENAI_API_KEY: 'synthetic-fixture' },
  } as LaunchConfig;
  try {
    expect(() => verifyProviderScope(config)).toThrow('exactly match');
    writeFileSync(join(home, '.env'), 'OPENAI_API_KEY="synthetic-fixture"\n');
    expect(() => verifyProviderScope(config)).not.toThrow();
    writeFileSync(join(home, '.env'), 'OPENAI_API_KEY="changed"\n');
    expect(() => verifyProviderScope(config)).toThrow('exactly match');
    writeFileSync(
      join(home, '.env'),
      'OPENAI_API_KEY="synthetic-fixture"\nOTHER="unreviewed"\n',
    );
    expect(() => verifyProviderScope(config)).toThrow('exactly match');
    writeFileSync(
      join(checkout, '.env'),
      'OPENAI_API_KEY="synthetic-fixture"\n',
    );
    expect(() => verifyProviderScope(config)).toThrow('Checkout');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
