// A `node --test` reporter that groups the run by module instead of printing
// one flat list of every test.
//
// The suite has well over a thousand tests, so the default output scrolls past
// anything useful. This reporter buffers the run and prints a summary at the
// end: the source area (`entities`, `ui`, `storage`, ...), then one line for
// each test file inside it, with its test count and run time. Individual test
// names appear only for a failure, which also prints its error, and again in a
// recap at the bottom. Set `TEST_VERBOSE=1` for the name of every test.
//
// The area of a test file comes from its own imports. The reporter reads the
// file and counts how often each `../src/<area>/` path appears. The most common
// one wins. A file that imports nothing from `src/` lands under `other`.
//
// What a test file prints is held and counted under that file, because several
// suites exercise a path that warns on purpose. Set `TEST_OUTPUT=1` to see the
// text of it, which a failing file shows anyway.

import { readFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';

const VERBOSE = process.env.TEST_VERBOSE === '1';
const SHOW_OUTPUT = process.env.TEST_OUTPUT === '1';
const COLOR = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;

const c = {
  /** @param {string} s */ dim: (s) => (COLOR ? `\u001b[2m${s}\u001b[0m` : s),
  /** @param {string} s */ bold: (s) => (COLOR ? `\u001b[1m${s}\u001b[0m` : s),
  /** @param {string} s */ green: (s) => (COLOR ? `\u001b[32m${s}\u001b[0m` : s),
  /** @param {string} s */ red: (s) => (COLOR ? `\u001b[31m${s}\u001b[0m` : s),
  /** @param {string} s */ yellow: (s) => (COLOR ? `\u001b[33m${s}\u001b[0m` : s),
  /** @param {string} s */ cyan: (s) => (COLOR ? `\u001b[36m${s}\u001b[0m` : s),
};

const IMPORT_AREA = /from\s+'(?:\.\.\/)+src\/([^/']+)\//g;

/** @type {Map<string, string>} */
const areaCache = new Map();

/**
 * The `src/` subdirectory that a test file exercises most.
 * @param {string} file absolute path of the test file
 * @returns {string}
 */
function areaOf(file) {
  const cached = areaCache.get(file);
  if (cached !== undefined) return cached;
  /** @type {Map<string, number>} */
  const counts = new Map();
  try {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_AREA)) {
      counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
    }
  } catch {
    // An unreadable test file still belongs somewhere in the tree.
  }
  let best = 'other';
  let bestCount = 0;
  for (const [area, n] of counts) {
    if (n > bestCount) {
      best = area;
      bestCount = n;
    }
  }
  areaCache.set(file, best);
  return best;
}

/**
 * `tests/entities/Checks.test.js` -> `Checks`.
 * @param {string} file
 * @returns {string}
 */
function moduleOf(file) {
  return basename(file).replace(/\.test\.js$/, '');
}

/**
 * `1 test`, `2 tests`. Only regular plurals are needed here.
 * @param {number} n
 * @param {string} word
 * @returns {string}
 */
function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * @param {number} ms
 * @returns {string}
 */
function duration(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

/**
 * The error text of a failed test, indented under it.
 * @param {any} details
 * @param {string} indent
 * @returns {string[]}
 */
function errorLines(details, indent) {
  const error = details?.error;
  if (!error) return [];
  const cause = error.cause ?? error;
  const text = String(cause?.stack ?? cause?.message ?? cause);
  return text.split('\n').map((line) => `${indent}${c.dim(line)}`);
}

/**
 * @typedef {object} Result
 * @property {string} name
 * @property {number} nesting
 * @property {'pass'|'fail'|'skip'|'todo'} status
 * @property {number} ms
 * @property {any} details
 */

/**
 * @typedef {object} FileEntry
 * @property {string} file
 * @property {Result[]} results
 * @property {number} failed
 * @property {number} ms
 * @property {string[]} output what the file wrote to stdout and stderr
 */

/**
 * The uncovered lines of a file, collapsed into ranges: `12-19, 44`.
 * @param {{ line: number, count: number }[]} lines
 * @returns {string}
 */
function uncoveredRanges(lines) {
  /** @type {string[]} */
  const ranges = [];
  let start = 0;
  let end = 0;
  for (const line of lines) {
    if (line.count > 0) continue;
    if (start && line.line === end + 1) {
      end = line.line;
      continue;
    }
    if (start) ranges.push(start === end ? `${start}` : `${start}-${end}`);
    start = line.line;
    end = line.line;
  }
  if (start) ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(', ');
}

/**
 * @param {number} percent
 * @returns {string}
 */
function percentCell(percent) {
  const text = `${percent.toFixed(1)}%`.padStart(6);
  if (percent >= 95) return c.green(text);
  if (percent >= 80) return c.yellow(text);
  return c.red(text);
}

/**
 * The coverage section, grouped by `src/` area like the test tree above it.
 * @param {any} summary the payload of a `test:coverage` event
 * @returns {string[]}
 */
function coverageLines(summary) {
  /** @type {Map<string, any[]>} */
  const areas = new Map();
  for (const file of summary.files) {
    const parts = relative(summary.workingDirectory, file.path).split('/');
    const area = parts[0] === 'src' && parts.length > 2 ? parts[1] : (parts[0] ?? 'other');
    const list = areas.get(area);
    if (list) list.push(file);
    else areas.set(area, [file]);
  }

  const out = [`${c.bold(c.cyan('Coverage'))} ${c.dim('(line / branch / function)')}\n`];
  for (const area of [...areas.keys()].sort()) {
    out.push(`  ${c.bold(area)}\n`);
    const list = /** @type {any[]} */ (areas.get(area)).sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    for (const file of list) {
      const name = basename(file.path).padEnd(28);
      const cells = [
        percentCell(file.coveredLinePercent),
        percentCell(file.coveredBranchPercent),
        percentCell(file.coveredFunctionPercent),
      ].join(' ');
      const missing = uncoveredRanges(file.lines ?? []);
      out.push(`    ${name} ${cells}${missing ? `  ${c.dim(missing)}` : ''}\n`);
    }
  }
  const t = summary.totals;
  const cells = [
    percentCell(t.coveredLinePercent),
    percentCell(t.coveredBranchPercent),
    percentCell(t.coveredFunctionPercent),
  ].join(' ');
  out.push(`  ${c.bold('all files'.padEnd(30))} ${cells}\n\n`);
  return out;
}

/**
 * The reporter itself. `node --test` pipes it the event stream and prints
 * whatever it yields.
 * @param {AsyncIterable<any>} source
 */
export default async function* moduleTree(source) {
  /** @type {Map<string, FileEntry>} */
  const files = new Map();
  /** @type {{ file: string, name: string, details: any }[]} */
  const failures = [];
  /** @type {any} */
  let totals = null;
  /** @type {any} */
  let coverage = null;
  let totalMs = 0;

  /**
   * @param {string} file
   * @returns {FileEntry}
   */
  const entryFor = (file) => {
    let entry = files.get(file);
    if (!entry) {
      entry = { file, results: [], failed: 0, ms: 0, output: [] };
      files.set(file, entry);
    }
    return entry;
  };

  for await (const event of source) {
    const data = event.data ?? {};
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      const file = data.file ?? 'unknown';
      const entry = entryFor(file);
      const failed = event.type === 'test:fail';
      /** @type {Result['status']} */
      let status = failed ? 'fail' : 'pass';
      if (data.skip) status = 'skip';
      else if (data.todo) status = 'todo';
      entry.results.push({
        name: data.name,
        nesting: data.nesting ?? 0,
        status,
        ms: data.details?.duration_ms ?? 0,
        details: data.details,
      });
      if (failed) {
        entry.failed += 1;
        failures.push({ file, name: data.name, details: data.details });
      }
    } else if (event.type === 'test:summary') {
      if (data.file) entryFor(data.file).ms = data.duration_ms ?? 0;
      else totals = data.counts;
    } else if (event.type === 'test:diagnostic' && typeof data.message === 'string') {
      const match = /^duration_ms (\d+(?:\.\d+)?)$/.exec(data.message);
      if (match && data.nesting === 0) totalMs = Number(match[1]);
    } else if (event.type === 'test:coverage') {
      coverage = data.summary;
    } else if (event.type === 'test:stderr' || event.type === 'test:stdout') {
      // Hold what a file printed and show it under that file, so a warning a
      // test expects cannot look like a loose error at the top of the run.
      // `test:stderr` names its file relative to the working directory, while
      // the test events name it absolutely. Resolve so both land on one entry.
      const file = data.file ? resolve(data.file) : 'unknown';
      entryFor(file).output.push(String(data.message));
    }
  }

  // Group the files by source area, then print each area in turn.
  /** @type {Map<string, FileEntry[]>} */
  const areas = new Map();
  for (const entry of files.values()) {
    const area = areaOf(entry.file);
    const list = areas.get(area);
    if (list) list.push(entry);
    else areas.set(area, [entry]);
  }

  yield '\n';
  for (const area of [...areas.keys()].sort()) {
    const list = /** @type {FileEntry[]} */ (areas.get(area)).sort((a, b) =>
      moduleOf(a.file).localeCompare(moduleOf(b.file)),
    );
    const count = list.reduce((n, entry) => n + entry.results.length, 0);
    const failed = list.reduce((n, entry) => n + entry.failed, 0);
    const tally = failed ? c.red(`${failed} failed`) : c.green('all passing');
    const modules = plural(list.length, 'module');
    const tests = plural(count, 'test');
    yield `${c.bold(c.cyan(area))} ${c.dim(`(${modules}, ${tests}, ${tally}${c.dim(')')}`)}\n`;

    for (const entry of list) {
      const mark = entry.failed ? c.red('x') : c.green('.');
      const label = c.bold(moduleOf(entry.file));
      const counts = entry.failed
        ? c.red(`${entry.failed}/${entry.results.length} failed`)
        : plural(entry.results.length, 'test');
      const noise = entry.output.join('').split('\n').filter(Boolean).length;
      const printed = noise ? c.dim(`, ${plural(noise, 'printed line')}`) : '';
      yield `  ${mark} ${label} ${c.dim(`${counts}, ${duration(entry.ms)}`)}${printed}\n`;
      if (noise && (SHOW_OUTPUT || entry.failed)) {
        for (const line of entry.output.join('').split('\n')) {
          if (line) yield `    ${c.dim(`| ${line}`)}\n`;
        }
      }
      if (!VERBOSE && !entry.failed) continue;

      for (const result of entry.results) {
        if (!VERBOSE && result.status !== 'fail') continue;
        const indent = '    '.padEnd(4 + result.nesting * 2);
        const glyph =
          result.status === 'fail'
            ? c.red('FAIL')
            : result.status === 'pass'
              ? c.green('ok')
              : c.yellow(result.status.toUpperCase());
        const slow = result.ms >= 100 ? c.yellow(` (${duration(result.ms)})`) : '';
        yield `${indent}${glyph} ${result.name}${slow}\n`;
        if (result.status === 'fail') {
          for (const line of errorLines(result.details, `${indent}     `)) yield `${line}\n`;
        }
      }
    }
    yield '\n';
  }

  if (coverage) yield* coverageLines(coverage);

  if (failures.length) {
    yield `${c.bold(c.red('Failures'))}\n`;
    for (const failure of failures) {
      const where = `${moduleOf(failure.file)} (${relative(process.cwd(), failure.file)})`;
      yield `  ${c.red('FAIL')} ${where}\n      ${failure.name}\n`;
      for (const line of errorLines(failure.details, '      ')) yield `${line}\n`;
    }
    yield '\n';
  }

  if (totals) {
    const parts = [
      plural(totals.tests, 'test'),
      c.green(`${totals.passed} passed`),
      totals.failed ? c.red(`${totals.failed} failed`) : '0 failed',
    ];
    if (totals.skipped) parts.push(c.yellow(`${totals.skipped} skipped`));
    if (totals.todo) parts.push(c.yellow(`${totals.todo} todo`));
    if (totalMs) parts.push(duration(totalMs));
    yield `${c.bold(parts.join('  '))}\n`;
  }
}
