/**
 * One page target, plus the measurement primitives a scenario needs.
 *
 * `Page` wraps a CDP session. It handles the domains the harness enables, the
 * in-page bootstrap that records long tasks, and the three measurements the
 * harness takes: browser metrics, a sampled CPU profile, and long-task
 * entries.
 *
 * The interaction helpers deliberately drive the real UI. A click goes through
 * `Input.dispatchMouseEvent` or a DOM `click()`, not through app internals, so
 * a scenario measures the same path a GM takes. The app exposes no global
 * handle for the harness to reach past the UI with.
 */

/**
 * The bootstrap that runs in every document before the app loads. It installs
 * a long-task observer, because a task that blocks the main thread for more
 * than 50 ms is the thing a GM feels. It also keeps the frame timestamps that
 * a scenario can turn into a frame-interval distribution.
 */
const BOOTSTRAP = `
  // Recording starts on, because a scenario that navigates gets a fresh
  // document and the harness cannot arm the new one before the load runs.
  window.__bench = { longTasks: [], frames: [], recording: true };
  new PerformanceObserver((list) => {
    if (!window.__bench.recording) return;
    for (const entry of list.getEntries()) {
      window.__bench.longTasks.push({ start: entry.startTime, duration: entry.duration });
    }
  }).observe({ entryTypes: ['longtask'] });
  (function frame(now) {
    if (window.__bench.recording) window.__bench.frames.push(now);
    requestAnimationFrame(frame);
  })(0);
`;

export class Page {
  /** Open a fresh page target on a connected client. */
  static async open(client) {
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(client, sessionId);
    await page._enable();
    return page;
  }

  constructor(client, sessionId) {
    this.client = client;
    this.sessionId = sessionId;
  }

  send(method, params, options) {
    return this.client.send(method, params, this.sessionId, options);
  }

  async _enable() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Performance.enable');
    await this.send('Profiler.enable');
    // Enabled only for `HeapProfiler.collectGarbage`, so a heap reading counts
    // live objects instead of whatever the last scenario left behind.
    await this.send('HeapProfiler.enable');
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOTSTRAP });
  }

  /** Load a URL and wait for the load event. */
  async navigate(url) {
    const loaded = new Promise((resolve) => {
      const off = this.client.on('Page.loadEventFired', (_params, session) => {
        if (session !== this.sessionId) return;
        off();
        resolve(undefined);
      });
    });
    await this.send('Page.navigate', { url });
    await loaded;
  }

  /** Reload the current document and wait for its load event. */
  async reload() {
    const loaded = this.client.once('Page.loadEventFired');
    await this.send('Page.reload', { ignoreCache: true });
    await loaded;
  }

  /**
   * Run an expression in the page and return its value. The expression is
   * wrapped so a bare statement sequence works, and awaited so a scenario can
   * evaluate an async helper.
   */
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.exception?.description ?? 'evaluation failed';
      throw new Error(text);
    }
    return result.result.value;
  }

  /**
   * Click something that replaces the document, then wait for the new load.
   *
   * The app replaces a campaign by persisting it and calling
   * `location.reload()`, so the evaluation that ran the click cannot answer.
   * This helper starts the click, ignores its dead reply, and waits for the
   * load event instead.
   */
  async clickForReload(selector, text, { timeout = 30000 } = {}) {
    const loaded = this.client.once('Page.loadEventFired', { timeout });
    const expression = text
      ? `[...document.querySelectorAll(${JSON.stringify(selector)})].find((n) => n.textContent.trim() === ${JSON.stringify(text)})?.click()`
      : `document.querySelector(${JSON.stringify(selector)})?.click()`;
    this.send(
      'Runtime.evaluate',
      { expression, awaitPromise: false, returnByValue: true },
      { timeout },
    ).catch(() => undefined);
    await loaded;
  }

  /** Wait until an expression returns a truthy value. */
  async waitFor(expression, { timeout = 10000, interval = 50 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await this.eval(`return Boolean(${expression});`)) return true;
      await new Promise((resolve) => {
        setTimeout(resolve, interval);
      });
    }
    throw new Error(`timed out waiting for: ${expression}`);
  }

  /** Click the first element that matches a selector. Returns false when absent. */
  clickSelector(selector) {
    return this.eval(`
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return false;
      node.click();
      return true;
    `);
  }

  /**
   * Click the first element under a selector whose text matches, for example a
   * modal's confirm button or a segmented switch's Build button. Matching on
   * text keeps the harness working when a class name changes.
   */
  clickText(selector, text) {
    return this.eval(`
      const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const hit = nodes.find((n) => n.textContent.trim() === ${JSON.stringify(text)});
      if (!hit) return false;
      hit.click();
      return true;
    `);
  }

  /** The bounding box of one element, in CSS pixels. */
  box(selector) {
    return this.eval(`
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    `);
  }

  /** Dispatch one raw mouse event at a viewport position. */
  mouse(type, x, y, { button = 'left', buttons = 1 } = {}) {
    return this.send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button,
      buttons: type === 'mouseMoved' ? buttons : 1,
      clickCount: 1,
    });
  }

  /** Dispatch a wheel event, for the map's zoom path. */
  wheel(x, y, deltaY) {
    return this.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      deltaX: 0,
      deltaY,
    });
  }

  /** Force a collection so a heap reading measures live objects, not garbage. */
  gc() {
    return this.send('HeapProfiler.collectGarbage');
  }

  /** The browser's own counters, as a plain object. */
  async metrics() {
    const { metrics } = await this.send('Performance.getMetrics');
    return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  }

  /**
   * Start recording long tasks and frames. The bootstrap is absent on the
   * `about:blank` target that a session opens with, so both helpers tolerate
   * its absence rather than fail the first scenario.
   */
  startRecording() {
    return this.eval(`
      if (window.__bench) {
        window.__bench.longTasks.length = 0;
        window.__bench.frames.length = 0;
        window.__bench.recording = true;
      }
      return null;
    `);
  }

  /** Stop recording and return what the page collected. */
  stopRecording() {
    return this.eval(`
      if (!window.__bench) return { longTasks: [], frames: [] };
      window.__bench.recording = false;
      return { longTasks: window.__bench.longTasks, frames: window.__bench.frames };
    `);
  }

  /** Run a function with the sampling profiler on. Returns the `.cpuprofile`. */
  async profile(fn, { intervalMicroseconds = 100 } = {}) {
    await this.send('Profiler.setSamplingInterval', { interval: intervalMicroseconds });
    await this.send('Profiler.start');
    let value;
    try {
      value = await fn();
    } finally {
      this.lastProfile = (await this.send('Profiler.stop')).profile;
    }
    return { value, profile: this.lastProfile };
  }

  close() {
    return this.send('Page.close').catch(() => undefined);
  }
}
