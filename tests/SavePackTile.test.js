import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createMapNode, createTile, setTile, TileGrid } from '../src/map/TileGrid.js';
import { buildState, packState } from '../src/storage/SaveManager.js';
import { encodeHistoryNode } from '../src/storage/NodePack.js';
import { packEntity } from '../src/storage/EntityPack.js';

/**
 * A state with one node whose tile id is not a grid position. The codec
 * stores such a node unencoded, so its packed tiles stay visible in the
 * output of `packState`.
 * @param {Record<string, any>} tile
 */
function unencodedState(tile) {
  const grid = new TileGrid();
  grid.addNode({ id: 'world', name: 'World', parentId: null, width: 2, height: 1, tiles: [tile] });
  return buildState({ grid });
}

test('a packed tile and a packed entity keep a plain object layout', () => {
  // A packer that deletes fields from a copy moves each object to a
  // hash-table property store, about ten times the memory of a tile. The
  // check needs a V8 intrinsic, so it runs in a child process with the flag
  // that enables it.
  const url = (/** @type {string} */ path) =>
    JSON.stringify(new URL(`../src/${path}`, import.meta.url).href);
  const script = `
    const { buildState, packState } = await import(${url('storage/SaveManager.js')});
    const { TileGrid, createTile } = await import(${url('map/TileGrid.js')});
    const { createCreature } = await import(${url('entities/Creature.js')});
    const grid = new TileGrid();
    const tile = { ...createTile('spawn', 'g.svg'), metadata: { poiType: 'inn', discoverable: false, discovered: false, notes: '' } };
    grid.addNode({ id: 'world', name: 'World', parentId: null, width: 2, height: 1, tiles: [tile] });
    const saved = packState(buildState({ grid, creatures: [createCreature('ogre', 'Ogre')] }));
    const packed = saved.nodes[0].tiles[0];
    process.stdout.write(JSON.stringify([
      %HasFastProperties(packed),
      %HasFastProperties(packed.metadata),
      %HasFastProperties(saved.creatures[0]),
    ]));
  `;
  const run = spawnSync(
    process.execPath,
    ['--allow-natives-syntax', '--input-type=module', '-e', script],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), [true, true, true]);
});

test('packing keeps only the non-default fields, in the tile key order', () => {
  const tile = {
    ...createTile('spawn', 'g.svg'),
    metadata: { poiType: null, discoverable: true, discovered: false, notes: '', metadata: 'kept' },
    span: 1,
  };
  const packed = packState(unencodedState(tile)).nodes[0].tiles[0];
  assert.deepEqual(packed, {
    id: 'spawn',
    imageRef: 'g.svg',
    metadata: { discoverable: true, metadata: 'kept' },
  });
});

test('packing copies an own __proto__ field as a plain field', () => {
  const tile = JSON.parse('{"id":"spawn","imageRef":"g.svg","__proto__":{"polluted":true}}');
  const packed = packState(unencodedState(tile)).nodes[0].tiles[0];
  assert.equal(Object.getPrototypeOf(packed), Object.prototype);
  assert.deepEqual(Object.getOwnPropertyDescriptor(packed, '__proto__')?.value, {
    polluted: true,
  });
  assert.equal(/** @type {any} */ (packed).polluted, undefined);
});

test('the history encode of a node reads the save cache', () => {
  const grid = new TileGrid();
  grid.addNode(setTile(createMapNode('world', 'World', null, 2, 2), createTile('0,0', 'g.svg')));
  const state = buildState({ grid });
  const encoded = encodeHistoryNode(state.nodes[0]);
  packState(state);
  assert.equal(encodeHistoryNode(state.nodes[0]), encoded);
  assert.equal(encoded.cells !== undefined, true, 'the node is in its encoded form');
});

test('the history encode of a node with an inline payload keeps the payload', () => {
  const payload = `data:image/png;base64,${'A'.repeat(32)}`;
  const node = setTile(createMapNode('world', 'World', null, 1, 1), createTile('0,0', payload));
  const first = encodeHistoryNode(node);
  assert.notEqual(encodeHistoryNode(node), first, 'a payload node is not cached');
  assert.ok(JSON.stringify(first).includes(payload));
});

test('packing an entity copies an own __proto__ field as a plain field', () => {
  const entity = JSON.parse('{"__proto__":{"polluted":true},"hp":5}');
  const packed = packEntity(entity, (value) => ({ ...value, hp: 5 }));
  assert.equal(Object.getPrototypeOf(packed), Object.prototype);
  assert.deepEqual(Object.keys(packed), ['__proto__'], 'the default hp is dropped');
  assert.equal(/** @type {any} */ (packed).polluted, undefined);
});
