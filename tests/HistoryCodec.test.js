import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOG_OP, NODE_OP, compactOps, expandOps } from '../src/storage/HistoryCodec.js';
import { diffState, invertOps } from '../src/storage/StateDiff.js';
import { applyOps } from '../src/storage/StateApply.js';
import { createMapNode, createTile } from '../src/map/TileGrid.js';
import { withNodeDefaults } from '../src/map/NodeDefaults.js';
import { withNodeTiles } from '../src/map/TileIndex.js';
import { gridTiles } from './helpers/grid.js';

/**
 * A node as a load leaves it, so a decoded node compares equal to it.
 * @param {string} id
 * @param {number} size
 * @param {(id: string, x: number, y: number) => any} [make]
 */
function node(id, size, make) {
  const bare = createMapNode(id, id, null, size, size);
  return withNodeDefaults(withNodeTiles(bare, gridTiles(size, size, make)));
}

/** A state that holds the given nodes and a quest list. */
function state(/** @type {any[]} */ nodes, quests = /** @type {any[]} */ ([])) {
  return { nodes, quests };
}

/** JSON round trip, the form a stored record comes back in. */
function stored(/** @type {unknown} */ value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Compact the step from `before` to `after`, check that it applies in both
 * directions, and return the compact ops.
 * @param {any} before
 * @param {any} after
 */
function roundTrip(before, after) {
  const result = compactOps(diffState(before, after), before, after, Infinity);
  assert.ok(result);
  assert.equal(result.length, JSON.stringify(result.ops).length, 'the length is the JSON length');
  const ops = stored(result.ops);
  assert.deepEqual(applyOps(before, expandOps(ops)), after, 'forward');
  assert.deepEqual(applyOps(after, expandOps(invertOps(ops))), before, 'backward');
  return result.ops;
}

/** A node with every tile painted another way. */
const regenerated = (/** @type {string} */ id, /** @type {number} */ size) =>
  node(id, size, (tileId) => createTile(tileId, 'assets/tiles/snow/snow-1.svg'));

/** A copy of `base` with the given tiles revealed or hidden. */
function withFog(/** @type {any} */ base, /** @type {Record<string, boolean>} */ flags) {
  return {
    ...base,
    tiles: base.tiles.map((/** @type {any} */ tile) =>
      tile.id in flags ? { ...tile, revealed: flags[tile.id] } : tile,
    ),
  };
}

test('an inserted node is one node op in the save form, at its index', () => {
  const a = node('a', 4);
  const b = node('b', 6);
  const ops = roundTrip(state([a]), state([b, a]));
  assert.equal(ops.length, 1);
  assert.equal(ops[0].k, NODE_OP);
  assert.deepEqual(ops[0].p, ['nodes', 'b']);
  assert.equal(ops[0].i, 0);
  assert.ok(Array.isArray(/** @type {any} */ (ops[0].t).cells), 'the tiles are encoded');
  assert.equal('f' in ops[0], false);
});

test('a removed node is one node op that keeps the node to restore', () => {
  const ops = roundTrip(state([node('a', 4), node('b', 4)]), state([node('a', 4)]));
  assert.deepEqual(
    ops.map((op) => [op.k, op.p, 'f' in op, 't' in op]),
    [[NODE_OP, ['nodes', 'b'], true, false]],
  );
});

test('a node whose tiles mostly change is one node op with both sides', () => {
  const before = state([node('a', 12)]);
  const after = state([regenerated('a', 12)]);
  const plain = JSON.stringify(diffState(before, after)).length;
  const ops = roundTrip(before, after);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].k, NODE_OP);
  assert.ok(JSON.stringify(ops).length * 4 < plain, 'much smaller than the plain ops');
});

test('a small paint stroke keeps its plain ops', () => {
  const a = node('a', 12);
  const painted = {
    ...a,
    tiles: a.tiles.map((tile) => (tile.id === '3,3' ? { ...tile, imageRef: 'road.svg' } : tile)),
  };
  const ops = roundTrip(state([a]), state([painted]));
  assert.deepEqual(ops, [
    { p: ['nodes', 'a', 'tiles', '3,3', 'imageRef'], f: 'grass.svg', t: 'road.svg' },
  ]);
});

test('a fog change is one fog op that lists the tiles it reveals and hides', () => {
  const a = withFog(node('a', 12), { '0,0': true });
  const b = withFog(a, { '0,0': false, '1,1': true, '2,1': true });
  const ops = roundTrip(state([a]), state([b]));
  assert.deepEqual(ops, [{ k: FOG_OP, p: ['nodes', 'a'], f: ['0,0'], t: ['1,1', '2,1'] }]);
});

test('a reveal of a whole node becomes a node op when that is smaller', () => {
  const a = node('a', 30);
  const all = Object.fromEntries(a.tiles.map((tile) => [tile.id, true]));
  const ops = roundTrip(state([a]), state([withFog(a, all)]));
  assert.equal(ops[0].k, NODE_OP);
});

test('a fog flip mixed with another tile edit is not a fog op', () => {
  const a = node('a', 12);
  const b = withFog(a, { '1,1': true });
  b.tiles = b.tiles.map((tile) => (tile.id === '2,2' ? { ...tile, imageRef: 'road.svg' } : tile));
  const ops = roundTrip(state([a]), state([b]));
  assert.equal(
    ops.some((op) => op.k === FOG_OP),
    false,
  );
});

test('ops outside the node list pass through and keep their order', () => {
  const a = node('a', 4);
  const before = state([a], [{ id: 'q1', title: 'Old' }]);
  const after = state([withFog(a, { '1,1': true })], [{ id: 'q1', title: 'New' }]);
  const ops = roundTrip(before, after);
  assert.deepEqual(
    ops.map((op) => op.k ?? op.p[0]),
    [FOG_OP, 'quests'],
  );
});

test('a node list that cannot be keyed passes through whole', () => {
  const a = node('a', 4);
  const ops = roundTrip(state([a]), state([a, a]));
  assert.deepEqual(
    ops.map((op) => op.p),
    [['nodes']],
  );
});

test('a node with no tile list keeps its plain ops', () => {
  const ops = roundTrip(state([{ id: 'x', name: 'X' }]), state([{ id: 'x', name: 'Y' }]));
  assert.deepEqual(ops, [{ p: ['nodes', 'x', 'name'], f: 'X', t: 'Y' }]);
  const inserted = roundTrip(state([]), state([{ id: 'x', name: 'X' }]));
  assert.deepEqual(inserted, [{ p: ['nodes', 'x'], t: { id: 'x', name: 'X' }, i: 0 }]);
});

test('compactOps gives up as soon as the ops pass the limit', () => {
  const before = state([node('a', 12)], [{ id: 'q1', title: 'Old' }]);
  const after = state([regenerated('a', 12)], [{ id: 'q1', title: 'New' }]);
  const ops = diffState(before, after);
  const full = /** @type {{ length: number }} */ (compactOps(ops, before, after, Infinity));
  assert.equal(compactOps(ops, before, after, full.length - 1), null);
  assert.equal(compactOps(ops, before, after, 10), null, 'the first op already passes');
  assert.deepEqual(compactOps(ops, before, after, full.length)?.length, full.length);
});

test('expandOps reads a hand-edited fog op as the tiles it can name', () => {
  const ops = expandOps([
    { k: FOG_OP, p: ['nodes', 'a'], f: 'not a list', t: ['1,1', 7] },
    { k: FOG_OP, p: ['nodes', 'b'] },
  ]);
  assert.deepEqual(ops, [{ p: ['nodes', 'a', 'tiles', '1,1', 'revealed'], f: false, t: true }]);
});

test('a revealed op on a tile id that is not a string is not a fog op', () => {
  const a = node('a', 2);
  const ops = [{ p: ['nodes', 'a', 'tiles', 3, 'revealed'], f: false, t: true }];
  const result = compactOps(ops, state([a]), state([a]), Infinity);
  assert.deepEqual(result?.ops, ops);
});
