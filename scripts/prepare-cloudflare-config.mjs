#!/usr/bin/env node
// Local-only configuration step AFTER owner-approved tunnel creation. No DNS/network actions.
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { URL } from 'node:url';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';
const uuid = process.argv[2];
if (
  process.argv.length !== 3 ||
  !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(uuid ?? '')
)
  throw Error(
    'Usage: node scripts/prepare-cloudflare-config.mjs <approved-tunnel-uuid>',
  );
const credentials = join(homedir(), '.cloudflared', uuid + '.json');
const stat = lstatSync(credentials);
if (!stat.isFile() || stat.uid !== process.getuid() || stat.mode & 0o077)
  throw Error('Tunnel credentials must be a private file owned by this user.');
if (JSON.parse(readFileSync(credentials, 'utf8')).TunnelID !== uuid)
  throw Error('Tunnel credentials do not match the supplied UUID.');
const directory = join(homedir(), '.config', 'ryoko-dots', 'cloudflare');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const template = readFileSync(
  new URL('../deployment/cloudflare/config.example.yml', import.meta.url),
  'utf8',
);
const config = template
  .replaceAll('00000000-0000-0000-0000-000000000000', uuid)
  .replace(
    /^credentials-file:.*$/m,
    'credentials-file: ' + JSON.stringify(credentials),
  );
const destination = join(directory, 'config.yml');
writeFileSync(destination, config, { mode: 0o600, flag: 'wx' });
console.log(
  `Prepared ${destination}. Validate ingress before approving DNS/connector activation. Nothing started.`,
);
