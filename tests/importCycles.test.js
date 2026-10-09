import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { importCycles, importGraph } from './helpers/importGraph.js';

/**
 * No module under `src/` sits in an import cycle. A cycle loads today when
 * every use of an imported name runs inside a function body, but a
 * top-level constant built from a cycle member throws a `ReferenceError` at
 * startup, because the member has not run yet when the constant is built.
 * `tests/moduleLoad.test.js` loads every module in one fixed order, so it
 * misses a cycle that throws only when the browser enters it from another
 * module.
 *
 * A cycle that has to stay goes in `ALLOWED` as its sorted member list,
 * with a comment that says why.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {string[][]} */
const ALLOWED = [];

test('no module under src/ is part of an import cycle', () => {
  const allowed = new Set(ALLOWED.map((members) => members.join(' ')));
  const cycles = importCycles(importGraph(ROOT, join(ROOT, 'src')));
  assert.deepEqual(
    cycles.filter((members) => !allowed.has(members.join(' '))),
    [],
  );
});

test('importCycles finds each cycle once and ignores imports outside the graph', () => {
  const graph = new Map([
    ['a.js', ['b.js', 'lib.js']],
    ['b.js', ['c.js']],
    ['c.js', ['a.js']],
    ['d.js', ['d.js']],
    ['e.js', ['a.js']],
  ]);
  assert.deepEqual(importCycles(graph), [['a.js', 'b.js', 'c.js'], ['d.js']]);
  assert.deepEqual(
    importCycles(
      new Map([
        ['x.js', ['y.js']],
        ['y.js', []],
      ]),
    ),
    [],
  );
});

test('importGraph reads static imports and re-exports', () => {
  const graph = importGraph(ROOT, join(ROOT, 'src', 'entities'));
  const character = graph.get(join('src', 'entities', 'Character.js')) ?? [];
  assert.ok(character.includes(join('src', 'entities', 'Progression.js')), 'import');
  assert.ok(character.includes(join('src', 'entities', 'CharacterInventory.js')), 're-export');
});
