/**
 * A minimal Chrome DevTools Protocol client, with no dependencies.
 *
 * Node 22 ships a global `WebSocket`, so a CDP session needs no client
 * library. This keeps the benchmark harness under the same zero-dependency
 * rule as the app. The client covers what the harness uses: launch a browser,
 * open one page target, send commands, and receive events.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_PATHS = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
};

/** Wait for a number of milliseconds. */
export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Poll a function until it returns a value that is not null, or until the
 * timeout expires. The poll swallows errors from the function, because the
 * usual caller waits for a port that is not open yet.
 */
async function poll(fn, { timeout = 15000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value !== null && value !== undefined) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  throw lastError ?? new Error('poll timed out');
}

/** The first Chrome binary that exists on this platform. */
function findChrome() {
  const candidates = CHROME_PATHS[process.platform] ?? [];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Start Chrome with the remote debugging port open and a throwaway profile.
 * A throwaway profile matters twice over: the GM's own browser stays closed,
 * and every run starts with empty localStorage, so a scenario measures a
 * cold campaign instead of yesterday's autosave.
 */
export async function launchChrome({ port = 9222, headless = true } = {}) {
  const binary = process.env.CHROME_PATH || findChrome();
  if (!binary) {
    throw new Error(
      'No Chrome binary found. Set CHROME_PATH to the executable, for example ' +
        '"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome".',
    );
  }
  const profile = await mkdtemp(join(tmpdir(), 'campaign-bench-'));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    // The profiler and the heap numbers are only comparable between runs when
    // the same GPU path is taken, so the harness pins the software path.
    '--disable-gpu',
    '--window-size=1600,1000',
    'about:blank',
  ];
  if (headless) args.unshift('--headless=new');

  const child = spawn(binary, args, { stdio: 'ignore' });
  const version = await poll(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    return response.ok ? await response.json() : null;
  });

  const client = await CdpClient.connect(version.webSocketDebuggerUrl);
  return {
    client,
    async close() {
      await client.close();
      const exited = new Promise((resolve) => {
        child.once('exit', resolve);
      });
      child.kill();
      await Promise.race([exited, sleep(3000)]);
      // Chrome writes its caches as it shuts down, so a delete can race the
      // last write. The profile lives in the temporary directory, so a failure
      // here costs a directory the operating system clears anyway.
      await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
    },
  };
}

/** A CDP connection: request and response over one WebSocket. */
export class CdpClient {
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener(
        'error',
        () => {
          reject(new Error(`cannot connect to ${url}`));
        },
        { once: true },
      );
    });
    return new CdpClient(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    /** @type {Map<number, { resolve: Function, reject: Function }>} */
    this.pending = new Map();
    /** @type {Map<string, Function[]>} */
    this.handlers = new Map();
    socket.addEventListener('message', (event) => this._onMessage(String(event.data)));
  }

  _onMessage(raw) {
    const message = JSON.parse(raw);
    if (message.id !== undefined) {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${message.error.message} (${message.id})`));
      else entry.resolve(message.result);
      return;
    }
    for (const handler of this.handlers.get(message.method) ?? []) {
      handler(message.params, message.sessionId);
    }
  }

  /**
   * Send one command. `sessionId` targets a page session instead of the
   * browser.
   *
   * Every command carries a timeout, because a command can be lost rather than
   * answered. A click that reloads the page is the case that matters here: the
   * `Runtime.evaluate` that ran the click dies with the old document and no
   * response ever arrives. Without a timeout the whole run stops there.
   */
  send(method, params = {}, sessionId = undefined, { timeout = 30000 } = {}) {
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    this.socket.send(JSON.stringify(message));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} did not answer within ${timeout} ms`));
      }, timeout);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  /** Register an event handler. Returns a function that removes it. */
  on(method, handler) {
    const list = this.handlers.get(method) ?? [];
    list.push(handler);
    this.handlers.set(method, list);
    return () => {
      const current = this.handlers.get(method) ?? [];
      const at = current.indexOf(handler);
      if (at >= 0) current.splice(at, 1);
    };
  }

  /** Resolve once an event arrives, or reject when the timeout expires. */
  once(method, { timeout = 15000 } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`timed out waiting for ${method}`));
      }, timeout);
      const off = this.on(method, (params) => {
        clearTimeout(timer);
        off();
        resolve(params);
      });
    });
  }

  async close() {
    this.socket.close();
  }
}
