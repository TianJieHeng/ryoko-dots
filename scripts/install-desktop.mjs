/* global console */
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
const root = resolve(import.meta.dirname, '..');
const config = resolve(homedir(), '.config/ryoko-dots');
mkdirSync(config, { recursive: true, mode: 0o700 });
writeFileSync(
  resolve(config, 'desktop.json'),
  JSON.stringify({ repository: root }),
  { mode: 0o600 },
);
const bin = resolve(homedir(), '.local/bin');
const apps = resolve(homedir(), '.local/share/applications');
mkdirSync(bin, { recursive: true });
mkdirSync(apps, { recursive: true });
const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
writeFileSync(
  resolve(bin, 'ryoko-dots'),
  `#!/bin/sh\nunset ELECTRON_RUN_AS_NODE\nlog_dir="\${XDG_STATE_HOME:-$HOME/.local/state}/ryoko-dots"\nmkdir -p "$log_dir"\numask 077\nexec ${quote(resolve(root, 'node_modules/electron/dist/electron'))} ${quote(resolve(root, 'desktop/main.cjs'))} "$@" >>"$log_dir/desktop.log" 2>&1\n`,
);
chmodSync(resolve(bin, 'ryoko-dots'), 0o755);
writeFileSync(
  resolve(apps, 'ryoko-dots.desktop'),
  `[Desktop Entry]\nType=Application\nName=Ryoko Dots\nComment=Your agents and conversations\nExec="${resolve(bin, 'ryoko-dots')}"\nIcon=${resolve(root, 'public/dots-icon.svg')}\nTerminal=false\nCategories=Utility;Development;\nStartupWMClass=Ryoko Dots\n`,
);
console.log('Installed Ryoko Dots desktop launcher.');
