/**
 * The browser-side benchmark runner.
 *
 * Usage:
 *   pnpm bench                       every scenario, headless
 *   pnpm bench -- --headful          the same run, in a visible window
 *   pnpm bench -- --only=paint-stroke,zoom-pan
 *   pnpm bench -- --port=8934        an already-running dev server
 *
 * Every scenario after `load-example` reads the example campaign. When
 * `--only` names one of them without `load-example`, the runner adds
 * `load-example` in front, because those scenarios would otherwise drive an
 * empty campaign and report nothing.
 *
 * Each run writes one directory under `bench/results/`: a `metrics.json` with
 * every reading, a `summary.md` to read, and one `.cpuprofile` per scenario.
 * A `.cpuprofile` opens in the DevTools Performance panel as a flame chart.
 *
 * The runner starts a dev server only when the port is closed, and it stops
 * only a server that it started itself.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchChrome, sleep } from './cdp.js';
import { Page } from './page.js';
import { SCENARIOS } from './scenarios.js';
import { summarize, TRACKED_METRICS } from './report.js';
import { exampleSaveOnEncounter } from './seed.js';

const ROOT = new URL('..', import.meta.url).pathname;

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/** True when something already listens on the port. */
async function portOpen(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/index.html`, { method: 'HEAD' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Serve the repository root. The dev server here is `python3 -m http.server`,
 * the same one the visual checks use.
 */
async function ensureServer(port) {
  if (await portOpen(port)) return { stop: () => {}, reused: true };
  const child = spawn('python3', ['-m', 'http.server', String(port)], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    if (await portOpen(port)) return { stop: () => child.kill(), reused: false };
    await sleep(100);
  }
  child.kill();
  throw new Error(`no server on port ${port}`);
}

/**
 * Reject when a scenario outruns its budget. A scenario drives a real UI, so a
 * control that never appears must end that scenario and not the run.
 */
function withTimeout(promise, ms, label) {
  let timer;
  const limit = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms} ms`)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/** Aggregate a `.cpuprofile` into self time per function, in milliseconds. */
function selfTimes(profile) {
  if (!profile?.nodes?.length) return [];
  const total = profile.endTime - profile.startTime;
  const samples = profile.samples ?? [];
  const perSample = samples.length ? total / samples.length / 1000 : 0;
  const hits = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  for (const id of samples) {
    const node = byId.get(id);
    if (!node) continue;
    const frame = node.callFrame;
    const name = `${frame.functionName || '(anonymous)'} ${shortUrl(frame.url)}:${frame.lineNumber + 1}`;
    hits.set(name, (hits.get(name) ?? 0) + 1);
  }
  return [...hits.entries()]
    .map(([name, count]) => ({ name, selfMs: Number((count * perSample).toFixed(2)) }))
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, 15);
}

function shortUrl(url) {
  if (!url) return '(native)';
  const at = url.indexOf('/src/');
  return at >= 0 ? url.slice(at + 1) : url.replace(/^https?:\/\/[^/]+\//, '');
}

async function main() {
  const port = Number(arg('port', '8934'));
  const only = arg('only');
  const scenarioBudgetMs = Number(arg('budget', '60000'));
  const headless = !process.argv.includes('--headful');
  const wanted = only ? new Set(only.split(',')) : null;
  const scenarios = selectScenarios(wanted);
  if (!scenarios.length) throw new Error('no scenario matched --only');
  if (wanted && !wanted.has('load-example') && scenarios.some((s) => s.name === 'load-example')) {
    process.stdout.write('load-example added: a selected scenario reads the example campaign\n');
  }

  const server = await ensureServer(port);
  const chrome = await launchChrome({ headless });
  const url = `http://127.0.0.1:${port}/index.html`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(ROOT, 'bench', 'results', stamp);
  await mkdir(outDir, { recursive: true });

  // Built once here rather than per scenario, because building the example
  // campaign costs more than the scenario that consumes the save.
  const seedSave = exampleSaveOnEncounter();
  const results = [];
  try {
    const page = await Page.open(chrome.client);
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1600,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });

    for (const scenario of scenarios) {
      process.stdout.write(`${scenario.name} ... `);
      await page.gc();
      const before = await page.metrics();
      await page.startRecording();
      const started = performance.now();
      let outcome;
      let profile;
      try {
        const run = await page.profile(() =>
          withTimeout(scenario.run(page, { url, seedSave }), scenarioBudgetMs, scenario.name),
        );
        outcome = run.value;
        profile = run.profile;
      } catch (error) {
        outcome = { error: String(error.message ?? error) };
        profile = page.lastProfile;
      }
      const wallMs = Number((performance.now() - started).toFixed(1));
      const recorded = await page.stopRecording();
      await page.gc();
      const after = await page.metrics();

      const delta = {};
      for (const name of TRACKED_METRICS) {
        delta[name] = Number(((after[name] ?? 0) - (before[name] ?? 0)).toFixed(3));
      }
      const longTasks = recorded.longTasks ?? [];
      const result = {
        name: scenario.name,
        description: scenario.description,
        outcome,
        wallMs,
        delta,
        after: Object.fromEntries(TRACKED_METRICS.map((n) => [n, after[n] ?? 0])),
        longTasks: {
          count: longTasks.length,
          totalMs: Number(longTasks.reduce((sum, t) => sum + t.duration, 0).toFixed(1)),
          worstMs: Number(Math.max(0, ...longTasks.map((t) => t.duration)).toFixed(1)),
        },
        frames: frameStats(recorded.frames ?? []),
        hotFunctions: selfTimes(profile),
      };
      results.push(result);
      if (profile) {
        await writeFile(join(outDir, `${scenario.name}.cpuprofile`), JSON.stringify(profile));
      }
      const skipped = outcome && outcome.skipped;
      process.stdout.write(skipped ? `skipped (${skipped})\n` : `${wallMs} ms\n`);
    }

    await page.close();
  } finally {
    // Shutdown must never lose a completed run's numbers.
    await chrome.close().catch(() => undefined);
    server.stop();
  }

  const meta = { stamp, url, headless, node: process.version };
  await writeFile(join(outDir, 'metrics.json'), `${JSON.stringify({ meta, results }, null, 2)}\n`);
  await writeFile(join(outDir, 'summary.md'), summarize(meta, results));
  process.stdout.write(`\nresults: bench/results/${stamp}/summary.md\n`);
}

/**
 * The scenarios to run, in catalog order. A null selection runs every
 * scenario. A selection that names a scenario listed after `load-example`
 * gains `load-example`, because that scenario reads the example campaign.
 */
function selectScenarios(wanted) {
  if (!wanted) return SCENARIOS;
  const loadAt = SCENARIOS.findIndex((s) => s.name === 'load-example');
  const dependent = SCENARIOS.some((s, i) => i > loadAt && wanted.has(s.name));
  const names = dependent ? new Set([...wanted, 'load-example']) : wanted;
  return SCENARIOS.filter((s) => names.has(s.name));
}

/** Frame intervals as a p50 and p95, which show a stall the mean hides. */
function frameStats(frames) {
  if (frames.length < 3) return { count: frames.length, p50Ms: 0, p95Ms: 0 };
  const gaps = frames.slice(1).map((t, i) => t - frames[i]);
  gaps.sort((a, b) => a - b);
  const at = (q) => Number(gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))].toFixed(1));
  return { count: frames.length, p50Ms: at(0.5), p95Ms: at(0.95) };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
