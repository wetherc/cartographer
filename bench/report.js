/**
 * The readable half of a benchmark run: which browser counters the harness
 * keeps, and how a run turns into Markdown.
 *
 * `metrics.json` holds everything. This summary holds what a reader compares
 * between two runs, so a regression shows without a diff of the raw numbers.
 */

/**
 * The counters `Performance.getMetrics` returns that mean something here.
 * `Nodes` and `JSEventListeners` are the leak signal for panel rebuilds. The
 * three duration counters are cumulative seconds, so a delta gives the cost of
 * one scenario. `JSHeapUsedSize` is read after a forced collection.
 */
export const TRACKED_METRICS = [
  'Nodes',
  'JSEventListeners',
  'Documents',
  'LayoutCount',
  'RecalcStyleCount',
  'LayoutDuration',
  'RecalcStyleDuration',
  'ScriptDuration',
  'TaskDuration',
  'JSHeapUsedSize',
];

/**
 * True when the document changed during the scenario. The counters count from
 * the document's own start, so a fresh document makes every delta negative.
 * The harness reads that sign rather than asking each scenario to declare it.
 */
function reloaded(result) {
  return result.delta.ScriptDuration < 0 || result.delta.TaskDuration < 0;
}

function ms(seconds) {
  return `${(seconds * 1000).toFixed(1)} ms`;
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** Render one run as Markdown. */
export function summarize(meta, results) {
  const lines = [
    '# Benchmark run',
    '',
    `- When: ${meta.stamp}`,
    `- URL: ${meta.url}`,
    `- Headless: ${meta.headless}`,
    `- Node: ${meta.node}`,
    '',
    '## Per scenario',
    '',
    '| Scenario | Wall | Script | Layout | Style | Long tasks | Worst task | Frame p95 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const r of results) {
    if (r.outcome?.skipped) {
      lines.push(`| ${r.name} | skipped: ${r.outcome.skipped} | | | | | | |`);
      continue;
    }
    if (reloaded(r)) {
      // A scenario that loads a new document resets the counters, so a delta
      // over it is meaningless. Wall time and the long tasks still hold.
      lines.push(
        `| ${r.name} | ${r.wallMs} ms | (reload) | (reload) | (reload) | ` +
          `${r.longTasks.count} (${r.longTasks.totalMs} ms) | ${r.longTasks.worstMs} ms | ` +
          `${r.frames.p95Ms} ms |`,
      );
      continue;
    }
    lines.push(
      `| ${r.name} | ${r.wallMs} ms | ${ms(r.delta.ScriptDuration)} | ` +
        `${ms(r.delta.LayoutDuration)} | ${ms(r.delta.RecalcStyleDuration)} | ` +
        `${r.longTasks.count} (${r.longTasks.totalMs} ms) | ${r.longTasks.worstMs} ms | ` +
        `${r.frames.p95Ms} ms |`,
    );
  }

  lines.push('', '## Resource growth', '');
  lines.push('| Scenario | Nodes | Listeners | Heap after | Layouts | Style recalcs |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of results) {
    if (r.outcome?.skipped) continue;
    const sign = (n) => (n > 0 ? `+${n}` : String(n));
    const growth = reloaded(r) ? '(reload)' : null;
    lines.push(
      `| ${r.name} | ${growth ?? sign(r.delta.Nodes)} | ` +
        `${growth ?? sign(r.delta.JSEventListeners)} | ` +
        `${mb(r.after.JSHeapUsedSize)} | ${growth ?? sign(r.delta.LayoutCount)} | ` +
        `${growth ?? sign(r.delta.RecalcStyleCount)} |`,
    );
  }

  lines.push(
    '',
    'A node or listener count that grows over a scenario that ends where it',
    'started is a leak. The `rehydrate` and `panel-tabs` rows are the ones to',
    'read that way: both run the same rebuild many times and finish on the',
    'panel they opened with.',
    '',
    '## Hot functions by self time',
    '',
  );
  for (const r of results) {
    if (r.outcome?.skipped || !r.hotFunctions.length) continue;
    lines.push(`### ${r.name}`, '');
    for (const fn of r.hotFunctions.slice(0, 10)) {
      lines.push(`- ${fn.selfMs} ms  ${fn.name}`);
    }
    lines.push('');
  }

  lines.push(
    'Self time comes from a 100-microsecond sampled profile. Open the matching',
    '`.cpuprofile` in the DevTools Performance panel for the full flame chart.',
    '',
  );
  return `${lines.join('\n')}\n`;
}
