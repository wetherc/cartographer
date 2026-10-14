import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deserialize, serialize } from '../src/storage/SaveManager.js';
import { loadFixtureState } from './helpers/loadFixture.js';

const state = loadFixtureState();
const json = serialize(state);

/**
 * The same save with every node in the per-tile form, which takes the
 * generic load path: the asset walk over each tile, `withTileDefaults` on
 * each tile, and the dead-link walk.
 */
const perTile = JSON.stringify({ ...JSON.parse(json), nodes: state.nodes });

test('the fixture reaches the odd cases it exists for', () => {
  const parsed = JSON.parse(json);
  assert.ok(parsed.nodes.some((/** @type {any} */ n) => Array.isArray(n.cells)));
  assert.ok(parsed.nodes.some((/** @type {any} */ n) => Array.isArray(n.links)));
  assert.ok(Object.keys(parsed.assets ?? {}).length > 0, 'a payload is hoisted');
  const loaded = deserialize(json);
  const tiles = loaded.nodes.flatMap((n) => n.tiles);
  assert.ok(
    tiles.some((t) => t.imageRef === '' && t.id === '0,0'),
    'an unsafe ref is blanked',
  );
  assert.ok(
    tiles.some((t) => t.imageRef.startsWith('data:image/')),
    'a payload is restored',
  );
  assert.ok(!tiles.some((t) => t.childNodeId === 'missing-node'), 'a dead link is cleared');
  assert.ok(tiles.some((t) => /** @type {any} */ (t).span === 2));
  assert.ok(tiles.some((t) => /** @type {any} */ (t).extraField === 'kept'));
});

test('an encoded save loads the same state as its per-tile form', () => {
  const fast = deserialize(json);
  const slow = deserialize(perTile);
  // The node records list their own fields in another order in the two
  // forms, so the nodes compare field by field and their tiles as strings,
  // which also compares the field order of each tile.
  assert.equal(fast.nodes.length, slow.nodes.length);
  fast.nodes.forEach((node, i) => {
    const { tiles, ...rest } = node;
    const { tiles: slowTiles, ...slowRest } = slow.nodes[i];
    assert.deepEqual(rest, slowRest);
    assert.ok(JSON.stringify(tiles) === JSON.stringify(slowTiles), `tiles of ${node.id}`);
  });
  assert.deepEqual({ ...fast, nodes: [] }, { ...slow, nodes: [] });
  assert.ok(serialize(fast) === serialize(slow), 'the two loads save the same string');
});

test('every loaded tile is frozen and lists its fields in createTile order', () => {
  const order = 'id,imageRef,overlayRef,metadata,revealed,childNodeId';
  for (const node of deserialize(json).nodes) {
    assert.ok(Object.isFrozen(node.tiles), node.id);
    for (const tile of node.tiles) {
      assert.ok(Object.isFrozen(tile), `${node.id} ${tile.id}`);
      assert.ok(Object.keys(tile).join(',').startsWith(order), `${node.id} ${tile.id}`);
    }
  }
});

test('a second read of the same string keeps the clean nodes of the first', () => {
  const first = deserialize(json);
  const again = deserialize(json, undefined, first.nodes);
  assert.equal(JSON.stringify(again), JSON.stringify(first));
  const kept = again.nodes.filter((node, i) => node === first.nodes[i]).length;
  // The two nodes with odd tiles hold payloads or changed refs, and the
  // per-tile node is never cached, so neither form is reused.
  assert.equal(kept, first.nodes.length - 3);
});
