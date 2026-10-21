const { app, BrowserWindow, dialog, shell, session, Menu } = require('electron');
const { execFile } = require('node:child_process');
const { resolve } = require('node:path');
const { promisify } = require('node:util');
const run = promisify(execFile);
const root = resolve(__dirname, '..');
const origin = process.env.DOTS_DESKTOP_ORIGIN || 'http://127.0.0.1:4310';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw Error('Desktop requires an exact loopback origin.');
app.setName('Ryoko Dots');
app.setAppUserModelId('local.ryoko.dots');
app.enableSandbox();
let window;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler(async (contents, permission, callback) => {
      if (new URL(contents.getURL()).origin !== origin || !['media', 'clipboard-sanitized-write'].includes(permission)) return callback(false);
      const { response } = await dialog.showMessageBox(window, { type: 'question', message: `Allow ${permission === 'media' ? 'microphone' : 'clipboard'} access?`, buttons: ['Deny', 'Allow'], defaultId: 0, cancelId: 0 });
      callback(response === 1);
    });
    session.defaultSession.setPermissionCheckHandler(() => false);
    window = new BrowserWindow({ width: 1440, height: 940, minWidth: 580, minHeight: 560, backgroundColor: '#100b1d', title: 'Ryoko Dots', icon: resolve(root, 'public/dots-icon.svg'), webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
    window.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
    window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) { event.preventDefault(); external(url); } });
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Dots', submenu: [{ label: 'Reload', role: 'reload' }, { label: 'Open in browser', click: () => shell.openExternal(origin) }, { label: 'Quit window (tasks keep running)', role: 'quit' }] }, { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }, { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] }]));
    await start();
  });
  app.on('window-all-closed', () => app.quit());
}
function external(url) { if (/^https?:\/\//.test(url)) void shell.openExternal(url); }
async function start() {
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html><body style="background:#100b1d;color:#eee7fa;font:20px system-ui;padding:60px"><h1>Ryoko Dots</h1><p>Starting your workspace…</p><p>Your agent keeps working when this window closes.</p></body></html>'));
  try {
    await run(resolve(root, 'run.sh'), ['start'], { cwd: root, env: { ...process.env, DOTS_NO_BROWSER: '1' }, timeout: 90000 });
    const response = await fetch(origin + '/health/live', { redirect: 'error', signal: AbortSignal.timeout(5000) });
    const value = await response.json();
    if (!response.ok || value.application !== 'ryoko-dots') throw Error('The listener is not the expected Dots backend.');
    await window.loadURL(origin);
  } catch {
    const { response } = await dialog.showMessageBox(window, { type: 'error', message: 'Dots could not start.', detail: 'Check ./run.sh logs in the repository. Your saved conversations have not been removed.', buttons: ['Retry', 'Close'], defaultId: 0, cancelId: 1 });
    if (response === 0) await start(); else app.quit();
  }
}
