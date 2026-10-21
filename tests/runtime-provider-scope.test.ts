import { expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  verifyProviderScope,
  childEnvironment,
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

test('reviewed OAuth profiles use their pinned scope and explicit Codex home without inherited credentials', () => {
  const root = mkdtempSync(join(tmpdir(), 'dots-oauth-scope-'));
  const home = join(root, 'profile');
  const checkout = join(root, 'checkout');
  mkdirSync(home);
  mkdirSync(checkout);
  const contents = '# Owner-reviewed profile, no inline credentials.\n';
  writeFileSync(join(home, '.env'), contents);
  const config = {
    home,
    checkout,
    runtimeDirectory: join(root, 'runtime'),
    reviewedProfile: {
      configSha256: 'a'.repeat(64),
      dotenvSha256: createHash('sha256').update(contents).digest('hex'),
      codexHome: join(root, 'codex'),
    },
  } as LaunchConfig;
  try {
    expect(() => verifyProviderScope(config)).not.toThrow();
    const env = childEnvironment(config);
    expect(env.CODEX_HOME).toBe(config.reviewedProfile!.codexHome);
    expect(env.HERMES_HOME).toBe(home);
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(() =>
      verifyProviderScope({
        ...config,
        providerEnvironment: { OPENAI_API_KEY: 'unreviewed' },
      }),
    ).toThrow('cannot inject');
    writeFileSync(join(home, '.env'), contents + 'UNREVIEWED=1\n');
    expect(() => verifyProviderScope(config)).toThrow('scope changed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
