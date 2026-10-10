import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename, dirname, join, relative } from 'node:path';

/**
 * Every module under `src/` gets imported here, except the composition root.
 *
 * This does two jobs. It is a load smoke test: a module that no suite imports
 * still has to parse, and its own imports still have to resolve, so a renamed
 * export in a file with no test of its own fails here instead of in the
 * browser. `importCycles.test.js` checks for import cycles.
 *
 * The test also fixes the coverage denominator. The
 * coverage report of Node lists only the files that were loaded, so a module
 * that nothing imported was missing from the table rather than sitting in it
 * at zero. That silently flattered the total. With every file loaded, the
 * total counts the whole of `src/`.
 *
 * `src/main.js` is left out on purpose. It builds and mounts the app as a side
 * effect of loading, so it needs a document. Its own coverage is the browser
 * check in `docs/testing.md`. `src/boot.js` is left out for the same reason:
 * it is the before-paint script, and it writes to the document as it loads.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

/** The composition root and the before-paint script, which both act on the document as they load. */
const SKIP = new Set([join(SRC, 'main.js'), join(SRC, 'boot.js')]);

/**
 * Every `.js` file under a directory, deepest paths included, sorted so a
 * failure names the same file on every run.
 * @param {string} dir
 * @returns {string[]}
 */
function jsFiles(dir) {
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...jsFiles(path));
    else if (entry.endsWith('.js')) found.push(path);
  }
  return found;
}

test('every module under src loads on its own', async () => {
  const files = jsFiles(SRC).filter((f) => !SKIP.has(f));
  assert.ok(files.length > 100, 'the walk found the source tree');
  /** @type {string[]} */
  const failures = [];
  for (const file of files) {
    try {
      const module = await import(pathToFileURL(file).href);
      assert.equal(typeof module, 'object');
    } catch (error) {
      failures.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  assert.deepEqual(failures, [], 'a module that no suite imports still has to load');
});

test('no source file under src contains a raw NUL byte', () => {
  // Git treats a file with a raw NUL byte as binary, so its diffs and grep
  // matches go blank. Code that needs a NUL separator writes the `\u0000` escape.
  const withNul = jsFiles(SRC).filter((file) => readFileSync(file).includes(0));
  assert.deepEqual(withNul, []);
});

/**
 * Every file under a directory, deepest paths included.
 * @param {string} dir
 * @returns {string[]}
 */
function allFiles(dir) {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((entry) => join(dir, entry))
    .filter((path) => statSync(path).isFile());
}

/**
 * The groups of files whose basenames match when case is ignored. Each group
 * lists its paths relative to `root`, sorted.
 * @param {string} root
 * @returns {string[][]}
 */
function caseCollisions(root) {
  /** @type {Map<string, string[]>} */
  const byName = new Map();
  for (const path of allFiles(root)) {
    const key = basename(path).toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), relative(root, path)]);
  }
  return [...byName.values()].filter((paths) => paths.length > 1).map((paths) => paths.sort());
}

test('caseCollisions finds basenames that differ only by case', () => {
  const root = mkdtempSync(join(tmpdir(), 'case-names-'));
  try {
    mkdirSync(join(root, 'app'));
    mkdirSync(join(root, 'entities'));
    writeFileSync(join(root, 'app', 'potions.js'), '');
    writeFileSync(join(root, 'entities', 'Potions.js'), '');
    writeFileSync(join(root, 'entities', 'Other.js'), '');
    assert.deepEqual(caseCollisions(root), [
      [join('app', 'potions.js'), join('entities', 'Potions.js')],
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('no two files under src or tests share a basename when case is ignored', () => {
  // macOS and Windows treat `potions.js` and `Potions.js` as one name, so the
  // flat tests directory could not hold a test file for each module of such a
  // pair. A rename with a role suffix (for example `potionsWiring.js`) keeps
  // the names apart.
  assert.deepEqual(caseCollisions(SRC), []);
  assert.deepEqual(caseCollisions(HERE), []);
});
