import test from 'node:test';
import assert from 'node:assert/strict';

import { assetKey, hoistAssets, restoreAssets } from '../src/storage/Assets.js';

const PAYLOAD = 'data:image/png;base64,AAAABBBBCCCC';
const OTHER = 'data:image/png;base64,ZZZZYYYYXXXX';

/**
 * @param {Partial<Record<string, any>>} tile
 * @returns {Record<string, any>}
 */
function tile(overrides) {
  return { id: '0,0', imageRef: 'assets/tiles/grass/grass-1.svg', ...overrides };
}

/**
 * @param {Record<string, any>[]} tiles
 * @param {Record<string, any>[]} [handouts]
 * @returns {Record<string, any>}
 */
function state(tiles, handouts = []) {
  return { version: 3, nodes: [{ id: 'world', tiles }], handouts };
}

test('assetKey is stable, content-derived, and short', () => {
  assert.equal(assetKey(PAYLOAD), assetKey(PAYLOAD));
  assert.notEqual(assetKey(PAYLOAD), assetKey(OTHER));
  assert.match(assetKey(PAYLOAD), /^[0-9a-z]{1,7}$/);
});

test('hoisting leaves a save with no image payloads exactly as it was', () => {
  const before = state([
    tile({}),
    tile({ id: '1,0', overlayRef: 'assets/tiles/road/road-ns.svg' }),
  ]);
  const after = hoistAssets(before);
  assert.deepEqual(after, before);
  assert.equal('assets' in after, false, 'an empty table is omitted, not written');
});

test('hoisting replaces a payload with a reference and stores it once', () => {
  const hoisted = hoistAssets(state([tile({ imageRef: PAYLOAD }), tile({ id: '1,0' })]));
  const key = assetKey(PAYLOAD);
  assert.deepEqual(hoisted.assets, { [key]: PAYLOAD });
  assert.equal(hoisted.nodes[0].tiles[0].imageRef, `asset:${key}`);
  assert.equal(
    hoisted.nodes[0].tiles[1].imageRef,
    'assets/tiles/grass/grass-1.svg',
    'a built-in path is not a payload and passes through',
  );
});

test('one payload used by many tiles is stored once', () => {
  // A realistic imported tile: a few kilobytes of base64, painted over a region.
  const art = `data:image/png;base64,${'Qk1'.repeat(2000)}`;
  const tiles = [];
  for (let i = 0; i < 20; i += 1) tiles.push(tile({ id: `${i},0`, imageRef: art }));
  const hoisted = hoistAssets(state(tiles));
  assert.deepEqual(Object.keys(hoisted.assets), [assetKey(art)]);
  const serialized = JSON.stringify(hoisted);
  assert.equal(
    serialized.split(art).length - 1,
    1,
    'the payload appears once in the serialized save, not once per tile',
  );
  assert.ok(
    serialized.length < JSON.stringify(state(tiles)).length / 15,
    'twenty copies of one payload collapse to one',
  );
});

test('hoisting covers an overlay ref, an overlay stack, and a handout image', () => {
  const before = state(
    [
      tile({ overlayRef: PAYLOAD }),
      tile({ id: '1,0', overlayRef: ['assets/tiles/road/road-ns.svg', OTHER] }),
    ],
    [{ id: 'h1', title: 'Map scrap', image: PAYLOAD }],
  );
  const hoisted = hoistAssets(before);
  const key = assetKey(PAYLOAD);
  assert.equal(hoisted.nodes[0].tiles[0].overlayRef, `asset:${key}`);
  assert.deepEqual(hoisted.nodes[0].tiles[1].overlayRef, [
    'assets/tiles/road/road-ns.svg',
    `asset:${assetKey(OTHER)}`,
  ]);
  assert.equal(hoisted.handouts[0].image, `asset:${key}`);
  assert.deepEqual(restoreAssets(hoisted), before, 'and the round trip restores all three');
});

test('restoring is the exact inverse of hoisting', () => {
  const before = state(
    [
      tile({ imageRef: PAYLOAD, overlayRef: [OTHER], revealed: true }),
      tile({ id: '1,0', imageRef: OTHER, childNodeId: 'briarwick' }),
      tile({ id: '2,0' }),
    ],
    [
      { id: 'h1', title: 'One', image: PAYLOAD },
      { id: 'h2', title: 'Two', image: null },
    ],
  );
  assert.deepEqual(restoreAssets(hoistAssets(before)), before);
});

test('a colliding key is probed rather than overwritten', () => {
  const hoisted = hoistAssets(
    state([tile({ imageRef: PAYLOAD }), tile({ id: '1,0', imageRef: OTHER })]),
    () => 'x',
  );
  assert.deepEqual(hoisted.assets, { x: PAYLOAD, 'x~1': OTHER });
  assert.equal(hoisted.nodes[0].tiles[0].imageRef, 'asset:x');
  assert.equal(hoisted.nodes[0].tiles[1].imageRef, 'asset:x~1');
  assert.deepEqual(
    restoreAssets(hoisted).nodes[0].tiles.map((t) => t.imageRef),
    [PAYLOAD, OTHER],
    'each colliding payload still restores to itself',
  );
});

test('a stale table entry is dropped rather than carried forward', () => {
  const stale = { ...state([tile({})]), assets: { dead: PAYLOAD } };
  assert.equal('assets' in hoistAssets(stale), false);
});

test('an unresolvable reference is left verbatim rather than blanked', () => {
  // The prefix is one character from the built-in tile root (`assets/tiles/...`),
  // so treating a match with no table entry as unrecoverable would destroy a
  // legitimate ref. A ref that will not load already renders as a placeholder.
  const before = { ...state([tile({ imageRef: 'asset:missing' })]), assets: { other: PAYLOAD } };
  const restored = restoreAssets(before);
  assert.equal(restored.nodes[0].tiles[0].imageRef, 'asset:missing');
  assert.equal('assets' in restored, false);
});

test('restoring tolerates a save with no table or an unusable one', () => {
  const before = state([tile({})]);
  assert.equal(restoreAssets(before), before, 'no table: the same object, unallocated');
  for (const assets of [null, 'nope', [PAYLOAD], 7]) {
    const restored = restoreAssets({ ...before, assets });
    assert.equal('assets' in restored, false);
    assert.deepEqual(restored.nodes, before.nodes);
  }
});

test('restoring ignores a table entry that is not a string', () => {
  const before = { ...state([tile({ imageRef: 'asset:k' })]), assets: { k: { nope: true } } };
  assert.equal(restoreAssets(before).nodes[0].tiles[0].imageRef, 'asset:k');
});

test('a tile with no image fields and a non-payload handout image pass through', () => {
  // An interior tile can carry an overlay and no base art, and a handout can
  // point at a built-in file instead of an uploaded payload.
  const before = state(
    [{ id: '0,0', overlayRef: 'assets/tiles/road/road-ns.svg' }, tile({ id: '1,0' })],
    [{ id: 'h1', title: 'Regional map', image: 'assets/handouts/region.png' }],
  );
  const hoisted = hoistAssets(before);
  assert.equal('assets' in hoisted, false);
  assert.equal(hoisted.nodes[0].tiles[0], before.nodes[0].tiles[0], 'the same tile object back');
  assert.equal(hoisted.handouts[0], before.handouts[0], 'and the same handout object');
});

test('a non-string entry inside an overlay stack is left alone', () => {
  const before = state([tile({ overlayRef: [null, PAYLOAD, 7] })]);
  const hoisted = hoistAssets(before);
  assert.deepEqual(hoisted.nodes[0].tiles[0].overlayRef, [null, `asset:${assetKey(PAYLOAD)}`, 7]);
  assert.deepEqual(restoreAssets(hoisted), before);
});

test('hoisting tolerates malformed nodes, tiles, and handouts', () => {
  const before = {
    version: 3,
    nodes: [null, { id: 'no-tiles' }, { id: 'bad', tiles: [null, 7, tile({ imageRef: PAYLOAD })] }],
    handouts: [null, { id: 'h1' }, { id: 'h2', image: 4 }],
  };
  const hoisted = hoistAssets(before);
  assert.deepEqual(hoisted.assets, { [assetKey(PAYLOAD)]: PAYLOAD });
  assert.deepEqual(restoreAssets(hoisted), before);
});

test('restoring blanks a ref that would load from outside the app', () => {
  const before = {
    ...state(
      [
        tile({ imageRef: '//evil.example/pixel.png', overlayRef: ['asset:k', 'javascript:x'] }),
        tile({ id: '1,0' }),
      ],
      [{ id: 'h1', title: 'Map', image: 'https://evil.example/track.png' }],
    ),
    assets: { k: PAYLOAD },
  };
  const restored = restoreAssets(before);
  assert.deepEqual(restored.nodes[0].tiles[0], tile({ imageRef: '', overlayRef: [PAYLOAD, ''] }));
  assert.equal(
    restored.nodes[0].tiles[1],
    before.nodes[0].tiles[1],
    'a clean tile is the same object',
  );
  assert.equal(restored.handouts[0].image, '');
});

test('restoring blanks an unsafe ref even when the save has no table', () => {
  const before = state([tile({ imageRef: '//evil.example/pixel.png' })]);
  assert.equal(restoreAssets(before).nodes[0].tiles[0].imageRef, '');
});

test('a table payload that is not an image is blanked rather than inlined', () => {
  const before = {
    ...state([tile({ imageRef: 'asset:k' })]),
    assets: { k: 'data:text/html,<script>1</script>' },
  };
  assert.equal(restoreAssets(before).nodes[0].tiles[0].imageRef, '');
});
