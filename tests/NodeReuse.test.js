import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TileGrid, createMapNode, createTile, setTile } from '../src/map/TileGrid.js';
import { withRepairedLinks } from '../src/map/NodeDefaults.js';
import { buildState, deserialize, serialize } from '../src/storage/SaveManager.js';
import { encodedOf, namesImageData } from '../src/storage/EncodedNodes.js';
import { MAX_TOTAL_CELLS, decodeNodeList } from '../src/storage/TileCodec.js';
import { fillTiles } from './helpers/grid.js';

const PAYLOAD = 'data:image/png;base64,AAAA';

/**
 * A world node whose corner tile links to a cave, the cave, and a field.
 * @param {(node: any) => any} [editField]
 */
function campaign(editField = (node) => node) {
  const grid = new TileGrid();
  const world = fillTiles(createMapNode('world', 'World', null, 4, 4));
  grid.addNode(setTile(world, { ...createTile('0,0', 'grass.svg'), childNodeId: 'cave' }));
  grid.addNode(fillTiles(createMapNode('cave', 'Cave', 'world', 3, 3)));
  grid.addNode(editField(fillTiles(createMapNode('field', 'Field', 'world', 3, 3))));
  return buildState({ grid });
}

/** @param {any} node */
function paintField(node) {
  return setTile(node, createTile('1,1', 'water.svg'));
}

/**
 * The node list of a state, by id.
 * @param {any} state
 */
function byId(state) {
  return Object.fromEntries(state.nodes.map((/** @type {any} */ node) => [node.id, node]));
}

test('a full read keeps each loaded node whose record is unchanged', () => {
  const live = deserialize(serialize(campaign()));
  const json = serialize(campaign(paintField));
  const read = deserialize(json, undefined, live.nodes);
  const before = byId(live);
  const after = byId(read);
  assert.equal(after.world, before.world);
  assert.equal(after.cave, before.cave);
  assert.notEqual(after.field, before.field, 'the painted node decodes');
  assert.deepEqual(read, deserialize(json), 'the result equals a read with no live nodes');
});

test('a full read keeps each node that this tab saved', () => {
  const state = campaign();
  const json = serialize(state);
  const read = deserialize(json, undefined, state.nodes);
  assert.deepEqual(
    read.nodes.map((node, i) => node === state.nodes[i]),
    [true, true, true],
  );
  assert.deepEqual(read, deserialize(json));
});

test('a load caches each record, and its first save writes the stored nodes', () => {
  const json = serialize(campaign());
  const loaded = deserialize(json);
  for (const node of loaded.nodes) assert.ok(encodedOf(node), node.id);
  assert.deepEqual(JSON.parse(serialize(loaded)), JSON.parse(json));
});

test('a node with an image payload or an asset key always decodes', () => {
  const withPayload = campaign((node) => setTile(node, createTile('2,2', PAYLOAD)));
  const loaded = deserialize(serialize(withPayload));
  assert.equal(encodedOf(byId(loaded).field), undefined, 'a payload node is not cached');
  const again = deserialize(serialize(loaded), undefined, loaded.nodes);
  assert.notEqual(byId(again).field, byId(loaded).field);
  assert.equal(
    byId(again).field.tiles.find((/** @type {any} */ t) => t.id === '2,2').imageRef,
    PAYLOAD,
  );

  // A tab that has not read an image keeps its `asset:` key in the live node.
  const waiting = campaign((node) => setTile(node, createTile('2,2', 'asset:k1')));
  const json = serialize(waiting);
  assert.ok(encodedOf(byId(waiting).field), 'the save caches the node');
  const read = deserialize(json, { k1: PAYLOAD }, waiting.nodes);
  const tile = byId(read).field.tiles.find((/** @type {any} */ t) => t.id === '2,2');
  assert.equal(tile.imageRef, PAYLOAD, 'the key resolves against the table');
  assert.equal(byId(read).world, byId(waiting).world, 'the other nodes are kept');
});

test('a node whose ref the load blanks is not cached', () => {
  const unsafe = campaign((node) => setTile(node, createTile('2,2', 'javascript:alert(1)')));
  const loaded = deserialize(serialize(unsafe));
  assert.equal(encodedOf(byId(loaded).field), undefined);
  assert.ok(encodedOf(byId(loaded).cave));
});

test('a kept node still loses a link to a node that the save removed', () => {
  const live = deserialize(serialize(campaign()));
  const state = campaign();
  const json = serialize({ ...state, nodes: state.nodes.filter((node) => node.id !== 'cave') });
  const read = deserialize(json, undefined, live.nodes);
  const world = byId(read).world;
  assert.notEqual(world, byId(live).world);
  assert.equal(world.tiles.find((/** @type {any} */ t) => t.id === '0,0').childNodeId, null);
  assert.deepEqual(read, deserialize(json));
});

test('each live node stands in for one stored record', () => {
  const live = deserialize(serialize(campaign()));
  const raw = JSON.parse(serialize(campaign()));
  raw.nodes.push(raw.nodes.at(-1));
  const read = deserialize(JSON.stringify(raw), undefined, live.nodes);
  const fields = read.nodes.filter((node) => node.id === 'field');
  assert.equal(fields[0], byId(live).field);
  assert.notEqual(fields[1], fields[0]);
  assert.deepEqual(fields[1], fields[0]);
});

test('decodeNodeList counts a reused node against the cell limit', () => {
  const huge = (/** @type {string} */ id) => ({
    id,
    width: 1000,
    height: 1000,
    refs: ['a'],
    cells: [[0, 1_000_000]],
  });
  const count = MAX_TOTAL_CELLS / 1_000_000 + 1;
  const kept = { id: 'kept', tiles: [] };
  /** @type {object[]} */
  const decoded = [];
  const result = decodeNodeList(
    Array.from({ length: count }, (_, i) => huge(`n${i}`)),
    {
      reuse: (record) => (record.id === 'n0' ? kept : undefined),
      onDecode: (node) => decoded.push(node),
    },
  );
  const nodes = /** @type {any[]} */ (result.nodes);
  assert.equal(nodes[0], kept);
  assert.equal(result.emptied, 1);
  assert.equal(nodes.at(-1).tiles.length, 0);
  assert.equal(decoded.length, count - 2, 'the reused and the emptied node skip onDecode');
});

test('withRepairedLinks trusts a named link list and walks the tiles otherwise', () => {
  const node = setTile(fillTiles(createMapNode('world', 'World', null, 2, 2)), {
    ...createTile('0,0', 'grass.svg'),
    childNodeId: 'gone',
  });
  assert.equal(withRepairedLinks([node], () => [])[0], node, 'an empty list skips the walk');
  const walked = withRepairedLinks([node], () => ['gone'])[0];
  assert.equal(walked.tiles[0].childNodeId, null, 'a dead named link repairs the node');
  assert.equal(withRepairedLinks([node])[0].tiles[0].childNodeId, null);
});

test('namesImageData finds an asset key or a payload at any depth', () => {
  assert.equal(namesImageData({ refs: ['grass.svg', ['a.svg', 'b.svg']], cells: [0, 3] }), false);
  assert.equal(namesImageData({ refs: [['a.svg', 'asset:k1']] }), true);
  assert.equal(namesImageData({ tiles: [{ id: '0,0', overlayRef: PAYLOAD }] }), true);
  assert.equal(namesImageData(7), false);
  assert.equal(namesImageData(null), false);
});
