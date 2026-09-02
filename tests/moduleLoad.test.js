import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Every module under `src/` gets imported here, except the composition root.
 *
 * This does two jobs. It is a load smoke test: a module that no suite imports
 * still has to parse, and its own imports still have to resolve, so a renamed
 * export or a circular import in a file with no test of its own fails here
 * instead of in the browser. It also fixes the coverage denominator. The
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
