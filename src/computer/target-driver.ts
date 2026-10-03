import { chromium, type BrowserContext, type Page } from 'playwright';
import {
  constants,
  openSync,
  closeSync,
  fstatSync,
  readSync,
  writeSync,
  ftruncateSync,
  fsyncSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import type { ComputerAction } from '../shared/computer-types.js';
import {
  exactEdgeInput,
  type EdgeObserve,
} from '../shared/computer-edge-protocol.js';
import type { ComputerTargetDriver, TargetDispatch } from './edge-service.js';
import { publicBrowserRequest } from './public-transport.js';
import { validateUrl } from './public-security.js';

type Options = {
  workspace: string;
  profiles: string;
  qualifiedActions: readonly ComputerAction[];
  shellSandbox?: '/usr/bin/bwrap';
  onBrowserChange?: () => void;
};
/** Real primitives are guarded at their invocation, after every async preparation.
 * Constructing this driver does not start Chrome, execute a shell, or grant access. */
export class TargetComputerDriver implements ComputerTargetDriver {
  readonly actions: readonly ComputerAction[];
  private context: BrowserContext | null = null;
  private opening: Promise<BrowserContext> | null = null;
  private root: number;
  constructor(private options: Options) {
    this.actions = options.qualifiedActions;
    if (
      this.actions.includes('exec') &&
      options.shellSandbox !== '/usr/bin/bwrap'
    )
      throw new Error('Qualified shell sandbox required.');
    this.root = openSync(
      options.workspace,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
  }
  async close() {
    closeSync(this.root);
    await this.context?.close();
  }
  private async page(dispatch: TargetDispatch): Promise<Page> {
    dispatch.signal.throwIfAborted();
    if (!this.context) {
      this.opening ??= chromium
        .launchPersistentContext(this.options.profiles, {
          headless: true,
          chromiumSandbox: true,
          serviceWorkers: 'block',
          acceptDownloads: false,
          viewport: { width: 1280, height: 800 },
          args: [
            '--disable-dev-shm-usage',
            '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
          ],
        })
        .then(async (c) => {
          await c.routeWebSocket('**/*', (ws) => ws.close());
          let requests = 0;
          await c.route('**/*', async (route) => {
            if (requests >= 16) {
              await route.abort();
              return;
            }
            requests++;
            try {
              const req = route.request();
              await route.fulfill(
                await publicBrowserRequest({
                  url: req.url(),
                  method: req.method(),
                  headers: await req.allHeaders(),
                  body: req.postDataBuffer(),
                }),
              );
            } catch {
              await route.abort().catch(() => undefined);
            } finally {
              requests--;
            }
          });
          const changed = () => this.options.onBrowserChange?.();
          c.on('page', (page) => {
            changed();
            page.on('framenavigated', (frame) => {
              if (frame === page.mainFrame()) changed();
            });
            page.on('close', changed);
          });
          for (const page of c.pages()) {
            page.on('framenavigated', (frame) => {
              if (frame === page.mainFrame()) changed();
            });
            page.on('close', changed);
          }
          c.on('close', () => {
            this.context = null;
            changed();
          });
          this.context = c;
          return c;
        })
        .finally(() => {
          this.opening = null;
        });
      await this.opening;
    }
    const pages = this.context!.pages().filter((p) => !p.isClosed());
    const page = pages.at(-1) ?? (await this.context!.newPage());
    if (page.url() !== 'about:blank' && !/^https?:\/\//i.test(page.url()))
      throw new Error('Only public web pages are accessible.');
    return page;
  }
  /** Directory descriptors and NOFOLLOW avoid a pathname check/use symlink race.
   * Shell lives in a separate PID/mount/network sandbox and cannot touch journal. */
  private file(
    path: string,
    create: boolean,
    dispatch: TargetDispatch,
  ): { parent: number; name: string; close: () => void } {
    if (
      !path ||
      path.startsWith('/') ||
      path.includes('\\') ||
      path.includes('\0')
    )
      throw new Error('Relative file path required.');
    const parts = path.split('/');
    if (parts.some((p) => !p || p === '.' || p === '..'))
      throw new Error('Invalid path.');
    let parent = this.root;
    const opened: number[] = [];
    try {
      for (const name of parts.slice(0, -1)) {
        const candidate = `/proc/self/fd/${parent}/${name}`;
        if (create) {
          try {
            dispatch.guard();
            mkdirSync(candidate, { mode: 0o700 });
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
          }
        }
        const fd = openSync(
          candidate,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
        );
        opened.push(fd);
        parent = fd;
      }
      return {
        parent,
        name: parts.at(-1)!,
        close: () => opened.reverse().forEach(closeSync),
      };
    } catch (e) {
      opened.reverse().forEach(closeSync);
      throw e;
    }
  }
  async execute(
    action: ComputerAction,
    raw: unknown,
    dispatch: TargetDispatch,
  ): Promise<unknown> {
    if (!this.actions.includes(action)) throw new Error('Action unqualified.');
    const input = exactEdgeInput(action, raw) as Record<string, unknown>;
    if (action === 'files_write') {
      const file = this.file(String(input.path), true, dispatch);
      let fd: number | undefined;
      try {
        dispatch.guard();
        fd = openSync(
          `/proc/self/fd/${file.parent}/${file.name}`,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_NOFOLLOW |
            (input.append ? constants.O_APPEND : 0),
          0o600,
        );
        const info = fstatSync(fd);
        if (!info.isFile() || info.nlink !== 1)
          throw new Error('Regular nonlinked file required.');
        const data = Buffer.from(String(input.contents));
        // ftruncate would be another irreversible primitive; use explicit offset
        // and truncate only after the dispatch fence is checked again.
        if (!input.append) {
          dispatch.guard();
          ftruncateSync(fd, 0);
        }
        dispatch.guard();
        let offset = 0;
        while (offset < data.length) {
          dispatch.guard();
          offset += writeSync(
            fd,
            data,
            offset,
            data.length - offset,
            input.append ? null : offset,
          );
        }
        fsyncSync(fd);
        return {
          path: input.path,
          bytes: data.length,
          appended: !!input.append,
        };
      } finally {
        if (fd !== undefined) closeSync(fd);
        file.close();
      }
    }
    if (action === 'exec') return this.shell(input, dispatch);
    if (
      ['snapshot', 'read', 'screenshot', 'files_list', 'files_read'].includes(
        action,
      )
    )
      throw new Error('Read actions use observation protocol.');
    const page = await this.page(dispatch);
    if (action === 'navigate') {
      const url = String(input.url);
      await validateUrl(url);
      dispatch.guard();
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 25000,
        signal: dispatch.signal,
      });
    } else if (action === 'click' || action === 'type') {
      const locator = page.locator(`aria-ref=${String(input.ref)}`);
      if ((await locator.count()) !== 1) throw new Error('Stale ref.');
      dispatch.guard();
      if (action === 'click')
        await locator.click({ timeout: 10000, signal: dispatch.signal });
      else {
        await locator.fill(String(input.text), {
          timeout: 10000,
          signal: dispatch.signal,
        });
        if (input.submit) {
          dispatch.guard();
          await locator.press('Enter', {
            timeout: 10000,
            signal: dispatch.signal,
          });
        }
      }
    } else if (action === 'key' || action === 'human_key') {
      dispatch.guard();
      await page.keyboard.press(String(input.key));
    } else if (action === 'scroll' || action === 'human_scroll') {
      dispatch.guard();
      await page.mouse.wheel(0, Number(input.deltaY));
    } else if (action === 'human_click') {
      dispatch.guard();
      await page.mouse.click(Number(input.x), Number(input.y));
    } else if (action === 'human_type') {
      dispatch.guard();
      await page.keyboard.insertText(String(input.text));
    } else throw new Error('Action unavailable.');
    return { action, url: page.url() };
  }
  private shell(
    input: Record<string, unknown>,
    dispatch: TargetDispatch,
  ): Promise<unknown> {
    if (this.options.shellSandbox !== '/usr/bin/bwrap')
      throw new Error('Shell isolation unavailable.');
    const args = [
      '--unshare-all',
      '--die-with-parent',
      '--new-session',
      '--clearenv',
      '--ro-bind',
      '/usr',
      '/usr',
      '--symlink',
      'usr/bin',
      '/bin',
      '--symlink',
      'usr/lib',
      '/lib',
      '--symlink',
      'usr/lib64',
      '/lib64',
      '--proc',
      '/proc',
      '--dev',
      '/dev',
      '--tmpfs',
      '/tmp',
      '--bind',
      this.options.workspace,
      '/workspace',
      '--chdir',
      '/workspace',
      '--setenv',
      'PATH',
      '/usr/bin:/bin',
      '--setenv',
      'HOME',
      '/workspace',
      '--',
      '/bin/bash',
      '-c',
      String(input.command),
    ];
    dispatch.guard();
    const child = spawn(this.options.shellSandbox, args, {
      env: {},
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    return new Promise((resolve, reject) => {
      let bytes = 0,
        out = '',
        err = '';
      let bounded = false,
        timedOut = false;
      const stop = () => {
        if (child.pid)
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            /* already exited */
          }
      };
      const append = (chunk: Buffer, stderr: boolean) => {
        bytes += chunk.length;
        if (bytes > 32000) {
          bounded = true;
          stop();
          return;
        }
        if (stderr) err += chunk.toString('utf8');
        else out += chunk.toString('utf8');
      };
      child.stdout.on('data', (c) => append(c, false));
      child.stderr.on('data', (c) => append(c, true));
      const timer = setTimeout(() => {
        timedOut = true;
        stop();
      }, Number(input.timeoutMs));
      dispatch.signal.addEventListener('abort', stop, { once: true });
      if (dispatch.signal.aborted) stop();
      const cleanup = () => {
        clearTimeout(timer);
        dispatch.signal.removeEventListener('abort', stop);
        stop();
      };
      child.once('error', () => {
        cleanup();
        reject(new Error('Sandbox unavailable.'));
      });
      child.once('close', (code) => {
        cleanup();
        resolve({
          exitCode: code ?? -1,
          stdout: out,
          stderr: err,
          truncated: bounded,
          timedOut,
        });
      });
    });
  }
  async observe(
    action: EdgeObserve['action'],
    raw: unknown,
    id: number,
    dispatch: TargetDispatch,
  ): Promise<unknown> {
    if (!this.actions.includes(action)) throw new Error('Action unqualified.');
    const input = exactEdgeInput(action, raw) as Record<string, unknown>;
    if (action === 'files_read') {
      const file = this.file(String(input.path), false, dispatch);
      let fd: number | undefined;
      try {
        dispatch.guard();
        fd = openSync(
          `/proc/self/fd/${file.parent}/${file.name}`,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        const info = fstatSync(fd);
        if (!info.isFile() || info.nlink !== 1 || info.size > 32000)
          throw new Error('File unavailable or oversized.');
        const bytes = Buffer.alloc(32001);
        dispatch.guard();
        const count = readSync(fd, bytes, 0, bytes.length, 0);
        if (count > 32000) throw new Error('File grew beyond bound.');
        return {
          path: input.path,
          text: bytes.subarray(0, count).toString('utf8'),
          bytes: count,
        };
      } finally {
        if (fd !== undefined) closeSync(fd);
        file.close();
      }
    }
    if (action === 'files_list') {
      const path = String(input.path);
      const file = path
        ? this.file(path + '/placeholder', false, dispatch)
        : null;
      try {
        dispatch.guard();
        const entries = readdirSync(
          `/proc/self/fd/${file?.parent ?? this.root}`,
          { withFileTypes: true },
        );
        if (entries.length > 500) throw new Error('Directory exceeds bound.');
        return {
          path,
          entries: entries
            .filter((e) => !e.isSymbolicLink())
            .map((e) => ({
              name: e.name,
              kind: e.isDirectory() ? 'folder' : 'file',
            })),
        };
      } finally {
        file?.close();
      }
    }
    const page = await this.page(dispatch);
    dispatch.guard();
    if (action === 'snapshot')
      return {
        snapshotId: id,
        url: page.url(),
        tree: await page.locator('body').ariaSnapshot({ mode: 'ai' }),
      };
    if (action === 'screenshot')
      return {
        snapshotId: id,
        url: page.url(),
        width: 1280,
        height: 800,
        base64: (await page.screenshot({ type: 'png' })).toString('base64'),
        capturedAt: Date.now(),
      };
    return {
      url: page.url(),
      text: (await page.locator('body').innerText({ timeout: 5000 })).slice(
        0,
        16000,
      ),
    };
  }
}
