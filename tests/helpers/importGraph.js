import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * The static import graph of a source tree, and the import cycles in it.
 * Only `import ... from` and `export ... from` statements with a relative
 * path count. A dynamic `import()` loads later, so it cannot cause a
 * load-order failure, and a JSDoc `import('...')` type has no runtime effect.
 */

const STATIC_IMPORT =
  /^\s*(?:import|export)\s[^'";]*?\bfrom\s*['"](\.[^'"]+)['"]|^\s*import\s*['"](\.[^'"]+)['"]/gm;

/**
 * Every `.js` file under `dir`.
 * @param {string} dir
 * @returns {string[]}
 */
function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return jsFiles(path);
    return path.endsWith('.js') ? [path] : [];
  });
}

/**
 * The edges from each module to the modules it imports, keyed by the path
 * relative to `root`.
 * @param {string} root the directory that paths are relative to
 * @param {string} dir the tree to scan
 * @returns {Map<string, string[]>}
 */
export function importGraph(root, dir) {
  /** @type {Map<string, string[]>} */
  const graph = new Map();
  for (const file of jsFiles(dir)) {
    const source = readFileSync(file, 'utf8');
    const deps = [...source.matchAll(STATIC_IMPORT)].map((m) =>
      relative(root, resolve(dirname(file), m[1] ?? m[2])),
    );
    graph.set(relative(root, file), deps);
  }
  return graph;
}

/**
 * The strongly connected components of more than one module, and the
 * modules that import themselves, found with Tarjan's algorithm. Each
 * component lists its members in sorted order, and the list is sorted by
 * its first member, so a failure reads the same on every run.
 * @param {Map<string, string[]>} graph
 * @returns {string[][]}
 */
export function importCycles(graph) {
  let next = 0;
  /** @type {Map<string, number>} */
  const index = new Map();
  /** @type {Map<string, number>} */
  const low = new Map();
  /** @type {string[]} */
  const stack = [];
  const onStack = new Set();
  /** @type {string[][]} */
  const found = [];
  /** @param {string} v */
  const visit = (v) => {
    index.set(v, next);
    low.set(v, next++);
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue;
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(Number(low.get(v)), Number(low.get(w))));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(Number(low.get(v)), Number(index.get(w))));
      }
    }
    if (low.get(v) !== index.get(v)) return;
    /** @type {string[]} */
    const members = [];
    let w;
    do {
      w = /** @type {string} */ (stack.pop());
      onStack.delete(w);
      members.push(w);
    } while (w !== v);
    if (members.length > 1 || (graph.get(v) ?? []).includes(v)) found.push(members.sort());
  };
  for (const v of graph.keys()) if (!index.has(v)) visit(v);
  return found.sort((a, b) => a[0].localeCompare(b[0]));
}
