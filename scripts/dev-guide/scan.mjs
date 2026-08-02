/**
 * Repository scanning for the developer guide.
 *
 * Everything here reads the working tree. Nothing is hard-coded about the
 * shape of the codebase, so the numbers and the lists in the guide follow the
 * repository as it changes.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

/**
 * Every file under `dir`, at any depth. Dotfiles such as `.DS_Store` are
 * skipped, so a file the OS drops in never changes a count.
 * @param {string} dir @returns {string[]}
 */
export function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** @param {string} file */
export function lineCount(file) {
  const text = readFileSync(file, 'utf8');
  if (!text) return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

/**
 * One entry per top-level thing under `src/`: each subdirectory, plus
 * `main.js` on its own. Counts cover every file the directory holds, at any
 * depth.
 * @param {string} root repository root
 */
export function scanDirectories(root) {
  const src = join(root, 'src');
  /** @type {{ id: string, name: string, files: number, lines: number }[]} */
  const dirs = [];

  for (const name of readdirSync(src).sort()) {
    const full = join(src, name);
    if (statSync(full).isDirectory()) {
      const files = walk(full);
      dirs.push({
        id: name,
        name: name + '/',
        files: files.length,
        lines: files.reduce((sum, f) => sum + lineCount(f), 0),
      });
    } else if (name === 'main.js') {
      dirs.push({ id: 'main', name: 'main.js', files: 1, lines: lineCount(full) });
    }
  }

  return dirs;
}

/**
 * The import edges between top-level source areas, read from the `import`
 * statements themselves. A JSDoc `import('...')` type reference is not an
 * edge: it disappears at runtime and would otherwise make every module look
 * like it depends on `types/`.
 * @param {string} root
 * @returns {Record<string, string[]>}
 */
export function scanImportEdges(root) {
  const src = join(root, 'src');
  /** @type {Record<string, Set<string>>} */
  const edges = {};

  for (const file of walk(src)) {
    if (!file.endsWith('.js')) continue;
    const from = areaOf(src, file);
    if (!edges[from]) edges[from] = new Set();
    const text = readFileSync(file, 'utf8');
    const pattern = /^\s*(?:import|export)\s+(?:[^;]*?from\s+)?['"]([^'"]+)['"]/gm;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue;
      const target = areaOf(src, resolve(dirname(file), spec));
      if (target && target !== from) edges[from].add(target);
    }
  }

  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [key, set] of Object.entries(edges)) out[key] = [...set].sort();
  return out;
}

/** @param {string} src @param {string} file */
function areaOf(src, file) {
  const rel = relative(src, file);
  if (rel.startsWith('..')) return '';
  const parts = rel.split(/[\\/]/);
  return parts.length === 1 ? (parts[0] === 'main.js' ? 'main' : '') : parts[0];
}

/**
 * The mount order, read from the composition root. Each entry carries the
 * comment block above the call and the trailing comment beside it, because
 * that is where `main.js` records why a call sits where it does.
 * @param {string} root
 */
export function scanMountOrder(root) {
  const file = join(root, 'src', 'main.js');
  const lines = readFileSync(file, 'utf8').split('\n');
  /** @type {{ call: string, line: number, role: string, why: string }[]} */
  const steps = [];

  lines.forEach((text, i) => {
    const match = /^(?:const\s+\w+\s*=\s*)?(wire[A-Za-z]+)\(app[^)]*\);(?:\s*\/\/\s*(.*))?$/.exec(
      text.trim(),
    );
    if (!match) return;

    const why = [];
    for (let n = i - 1; n >= 0; n -= 1) {
      const above = lines[n].trim();
      if (!above.startsWith('//')) break;
      why.unshift(above.replace(/^\/\/\s?/, ''));
    }

    steps.push({
      call: match[1],
      line: i + 1,
      role: (match[2] || '').trim(),
      why: why.join(' ').trim(),
    });
  });

  return { file: 'src/main.js', firstLine: steps.length ? steps[0].line : 0, steps };
}

/**
 * Which wiring module fills which registry slot. The key is the `wireX`
 * function name, so this joins onto the mount order by name alone.
 * @param {string} root
 */
export function scanRegistrations(root) {
  const dir = join(root, 'src', 'app');
  /** @type {Record<string, { registry: string, name: string, line: number, file: string }[]>} */
  const byWire = {};

  for (const file of walk(dir)) {
    if (!file.endsWith('.js')) continue;
    const text = readFileSync(file, 'utf8');
    const wire = /export function (wire[A-Za-z]+)\s*\(/.exec(text);
    if (!wire) continue;
    const rel = relative(root, file);
    const found = [];
    text.split('\n').forEach((line, i) => {
      const match = /^\s*app\.(views|actions)\.([A-Za-z0-9_]+)\s*=/.exec(line);
      if (match) found.push({ registry: match[1], name: match[2], line: i + 1, file: rel });
    });
    byWire[wire[1]] = found;
  }

  return byWire;
}

/**
 * Every `campaign-builder:` storage key, taken from the string literals that
 * define it. A key built by joining a prefix with a counter is reported by
 * its prefix.
 * @param {string} root
 */
export function scanStorageKeys(root) {
  const src = join(root, 'src');
  /** @type {Map<string, { key: string, file: string, line: number }>} */
  const keys = new Map();

  for (const file of walk(src)) {
    if (!file.endsWith('.js')) continue;
    const rel = relative(root, file);
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const pattern = /['"`](campaign-builder:[A-Za-z0-9:_-]*)['"`]/g;
        let match;
        while ((match = pattern.exec(line)) !== null) {
          if (!keys.has(match[1])) keys.set(match[1], { key: match[1], file: rel, line: i + 1 });
        }
      });
  }

  return [...keys.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** @param {string} root */
export function scanTests(root) {
  const dir = join(root, 'tests');
  const files = walk(dir);
  return {
    suites: files.filter((f) => f.endsWith('.test.js')).length,
    previews: files.filter((f) => f.endsWith('.html')).map((f) => relative(dir, f)).sort(),
  };
}

/** @param {string} root */
export function scanPackage(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return {
    version: pkg.version,
    scripts: pkg.scripts || {},
    runtimeDependencies: Object.keys(pkg.dependencies || {}).length,
    devDependencies: Object.keys(pkg.devDependencies || {}).length,
  };
}
