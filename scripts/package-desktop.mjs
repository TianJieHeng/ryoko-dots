/* global console */
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'artifacts/local-build/ryoko-dots-linux-x64');
mkdirSync(output, { recursive: true });
cpSync(resolve(root, 'node_modules/electron/dist'), output, {
  recursive: true,
});
const app = resolve(output, 'resources/app');
mkdirSync(app, { recursive: true });
cpSync(resolve(root, 'desktop/main.cjs'), resolve(app, 'main.cjs'));
writeFileSync(
  resolve(app, 'package.json'),
  JSON.stringify({ name: 'ryoko-dots', version: '1.0.0', main: 'main.cjs' }),
);
writeFileSync(
  resolve(output, 'README.txt'),
  'Ryoko Dots desktop shell. Requires the installed Dots backend checkout and user service. Run npm run desktop:install in that checkout first to write the private desktop.json location. Run ./electron to open the application. No credentials or workspace state are bundled.\n',
);
execFileSync('tar', [
  '-czf',
  output + '.tar.gz',
  '-C',
  resolve(output, '..'),
  'ryoko-dots-linux-x64',
]);
console.log(output + '.tar.gz');
