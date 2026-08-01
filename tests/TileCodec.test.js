import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeNodeTiles, decodeNodeTiles } from '../src/storage/TileCodec.js';
import { gridTiles } from './helpers/grid.js';

/**
 * A packed tile: only the fields a real save would carry, since the codec runs
 * after the default-omission packing and its output is fed back through the
 * tile-defaults backfill.
 * @param {string} id
 * @param {string} imageRef
 * @param {Record<string, any>} [rest]
 * @returns {Record<string, any>}
 */
function tile(id, imageRef, rest = {}) {
  return { id, imageRef, ...rest };
}

/**
 * @param {Partial<Record<string, any>>} node
 * @returns {Record<string, any>}
 */
function makeNode(node) {
  return {
    id: 'n',
    name: 'Node',
    parentId: null,
    width: 3,
    height: 2,
    kind: 'region',
    environ: null,
    tiles: [],
    ...node,
  };
}

/**
 * Round trip a node through both halves and assert the tiles come back
 * identically, ignoring order (the encoder emits row-major, the input need not
 * be). Returns the encoded form so a test can also assert *how* it was stored.
 * @param {Record<string, any>} node
 * @returns {Record<string, any>}
 */
function roundTrip(node) {
  const encoded = encodeNodeTiles(node);
  // The encoded form has to survive JSON, which is the only way it is ever used.
  const decoded = decodeNodeTiles(JSON.parse(JSON.stringify(encoded)));
  const byId = (/** @type {Record<string, any>[]} */ tiles) =>
    [...tiles].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  assert.deepEqual(byId(decoded.tiles), byId(node.tiles), 'tiles round trip');
  const { tiles: _tiles, refs: _refs, cells: _cells, fog: _fog, ...encodedRest } = encoded;
  const { tiles: _decodedTiles, ...decodedRest } = decoded;
  assert.deepEqual(decodedRest, encodedRest, 'every other node field round trips');
  return encoded;
}

test('a dense node encodes to a palette plus a run-length stream', () => {
  const node = makeNode({
    tiles: [
      tile('0,0', 'grass'),
      tile('1,0', 'grass'),
      tile('2,0', 'grass'),
      tile('0,1', 'water'),
      tile('1,1', 'grass'),
      tile('2,1', 'water'),
    ],
  });
  const encoded = roundTrip(node);
  assert.deepEqual(encoded.refs, ['grass', 'water']);
  // Three grass, then single cells: the run pays for itself at three, not below.
  assert.deepEqual(encoded.cells, [[0, 3], 1, 0, 1]);
  assert.equal('fog' in encoded, false, 'nothing revealed, so no fog stream');
  assert.equal('tiles' in encoded, false, 'no tile carries anything out of line');
});

test('a run of two stays as bare indices, a run of three pairs up', () => {
  const two = encodeNodeTiles(
    makeNode({ width: 2, height: 1, tiles: [tile('0,0', 'a'), tile('1,0', 'a')] }),
  );
  assert.deepEqual(two.cells, [0, 0]);
  const three = encodeNodeTiles(
    makeNode({
      width: 3,
      height: 1,
      tiles: [tile('0,0', 'a'), tile('1,0', 'a'), tile('2,0', 'a')],
    }),
  );
  assert.deepEqual(three.cells, [[0, 3]]);
});

test('overlays are part of the palette entry, as a ref and as a stack', () => {
  const node = makeNode({
    width: 4,
    height: 1,
    tiles: [
      tile('0,0', 'grass'),
      tile('1,0', 'grass', { overlayRef: 'road' }),
      tile('2,0', 'grass', { overlayRef: ['coast', 'river'] }),
      tile('3,0', 'grass', { overlayRef: 'road' }),
    ],
  });
  const encoded = roundTrip(node);
  assert.deepEqual(encoded.refs, ['grass', ['grass', 'road'], ['grass', ['coast', 'river']]]);
  assert.deepEqual(encoded.cells, [0, 1, 2, 1], 'the repeated overlay reuses its entry');
});

test('metadata, childNodeId, span, and unknown fields ride out of line', () => {
  const node = makeNode({
    width: 4,
    height: 1,
    tiles: [
      tile('0,0', 'grass'),
      tile('1,0', 'grass', {
        metadata: { poiType: 'shop', discoverable: true, discovered: true, notes: 'hi' },
      }),
      tile('2,0', 'grass', { childNodeId: 'child', span: 2 }),
      // A field this module has never heard of: the codec keeps whatever it does
      // not represent itself, so a later `Tile` member survives a save.
      tile('3,0', 'grass', { futureField: { deep: [1, 2] } }),
    ],
  });
  const encoded = roundTrip(node);
  assert.deepEqual(encoded.cells, [[0, 4]], 'out-of-line fields do not split the art run');
  assert.deepEqual(encoded.tiles, [
    { id: '1,0', metadata: { poiType: 'shop', discoverable: true, discovered: true, notes: 'hi' } },
    { id: '2,0', childNodeId: 'child', span: 2 },
    { id: '3,0', futureField: { deep: [1, 2] } },
  ]);
});

test('fog is its own stream, starting unrevealed and dropping the trailing run', () => {
  const node = makeNode({
    width: 4,
    height: 2,
    tiles: [
      tile('0,0', 'a'),
      tile('1,0', 'a', { revealed: true }),
      tile('2,0', 'a', { revealed: true }),
      tile('3,0', 'a'),
      tile('0,1', 'a'),
      tile('1,1', 'a'),
      tile('2,1', 'a'),
      tile('3,1', 'a'),
    ],
  });
  const encoded = roundTrip(node);
  // One fogged, two revealed, and the remaining five fogged cells are implied.
  assert.deepEqual(encoded.fog, [1, 2]);
});

test('a fully revealed node states one run, and a revealed last cell is kept', () => {
  const encoded = encodeNodeTiles(
    makeNode({
      width: 2,
      height: 1,
      tiles: [tile('0,0', 'a', { revealed: true }), tile('1,0', 'a', { revealed: true })],
    }),
  );
  assert.deepEqual(encoded.fog, [0, 2], 'a leading zero-length fogged run, then the reveal');
  const decoded = decodeNodeTiles(encoded);
  assert.equal(
    decoded.tiles.every((/** @type {any} */ t) => t.revealed === true),
    true,
  );
});

test('a sparse gridded node encodes, with empties reserved and the tail dropped', () => {
  const node = makeNode({
    width: 4,
    height: 2,
    tiles: [tile('1,0', 'a'), tile('2,0', 'a')],
  });
  const encoded = roundTrip(node);
  assert.deepEqual(
    encoded.cells,
    [-1, 0, 0],
    'one empty, two tiles, five trailing empties implied',
  );
  assert.equal(encoded.refs.length, 1);
});

test('an empty node encodes to an empty stream and comes back empty', () => {
  const encoded = roundTrip(makeNode({ tiles: [] }));
  assert.deepEqual(encoded.cells, []);
  assert.deepEqual(encoded.refs, []);
});

test('the palette order follows grid position, not the tiles array order', () => {
  const tiles = [tile('2,0', 'water'), tile('0,0', 'grass'), tile('1,0', 'sand')];
  const forward = encodeNodeTiles(makeNode({ width: 3, height: 1, tiles }));
  const shuffled = encodeNodeTiles(makeNode({ width: 3, height: 1, tiles: [...tiles].reverse() }));
  assert.deepEqual(forward.refs, ['grass', 'sand', 'water']);
  // Byte-identical output for the same tile set: the undo ring's duplicate skip
  // and the cross-tab watcher both compare raw strings.
  assert.equal(JSON.stringify(forward), JSON.stringify(shuffled));
});

test('a node that cannot be encoded positionally is returned untouched', () => {
  const cases = {
    'a non-grid id': { tiles: [tile('root', 'a')] },
    'a non-canonical x,y': { tiles: [tile('01,0', 'a')] },
    'an out-of-bounds id': { tiles: [tile('9,0', 'a')] },
    'a duplicate position': { tiles: [tile('0,0', 'a'), tile('0,0', 'b')] },
    'a zero dimension': { width: 0, tiles: [] },
    'a fractional dimension': { width: 2.5, tiles: [] },
    'a non-string imageRef': { tiles: [{ id: '0,0', imageRef: 42 }] },
    'a non-record tile': { tiles: [null] },
    'a missing tiles array': { tiles: undefined },
    'an absurd size': { width: 2000, height: 2000, tiles: [] },
  };
  for (const [label, patch] of Object.entries(cases)) {
    const node = makeNode(patch);
    const result = encodeNodeTiles(node);
    assert.equal(result, node, `${label} disqualifies the node by identity`);
    // And the unencoded node passes through the decoder untouched, which is the
    // same path a save written before this encoding existed takes.
    assert.equal(decodeNodeTiles(node), node, `${label} decodes as a pass-through`);
  }
});

test('a malformed encoded node degrades instead of throwing', () => {
  const base = { id: 'n', name: 'n', parentId: null, width: 2, height: 2, kind: 'region' };
  // An unreadable palette skips every cell rather than inventing tiles.
  assert.deepEqual(decodeNodeTiles({ ...base, refs: 'nope', cells: [0, 0] }).tiles, []);
  // An index with no palette entry skips only that cell.
  assert.deepEqual(
    decodeNodeTiles({ ...base, refs: ['a'], cells: [5, 0] }).tiles.map((t) => t.id),
    ['1,0'],
  );
  // An unreadable run ends the stream.
  assert.deepEqual(
    decodeNodeTiles({ ...base, refs: ['a'], cells: [0, 'x', 0] }).tiles.map((t) => t.id),
    ['0,0'],
  );
  // A stream longer than the grid stops at the last position.
  assert.equal(decodeNodeTiles({ ...base, refs: ['a'], cells: [[0, 99]] }).tiles.length, 4);
  // An unreadable fog run leaves the rest fogged.
  const fogged = decodeNodeTiles({ ...base, refs: ['a'], cells: [[0, 4]], fog: [1, 'x', 2] });
  assert.deepEqual(
    fogged.tiles.map((/** @type {any} */ t) => t.revealed === true),
    [false, false, false, false],
  );
  // A run whose index or count is a number JSON can hold but arithmetic cannot
  // (`1e999` parses as Infinity) ends the stream where an unreadable run does.
  for (const run of [
    ['x', 2],
    [JSON.parse('1e999'), 2],
    [0, 'x'],
    [0, JSON.parse('1e999')],
  ]) {
    assert.deepEqual(
      decodeNodeTiles({ ...base, refs: ['a'], cells: [0, run] }).tiles.map(
        (/** @type {any} */ t) => t.id,
      ),
      ['0,0'],
      JSON.stringify(run),
    );
  }
  // Unusable dimensions keep the out-of-line records, which carry their own ids.
  const dimensionless = decodeNodeTiles({
    ...base,
    width: 0,
    refs: ['a'],
    cells: [0],
    tiles: [{ id: '4,4', childNodeId: 'c' }],
  });
  assert.deepEqual(dimensionless.tiles, [{ id: '4,4', childNodeId: 'c' }]);
  // One bad dimension is enough, whichever of the two it is.
  const flat = decodeNodeTiles({
    ...base,
    height: 'two',
    refs: ['a'],
    cells: [0],
    tiles: [{ id: '4,4', childNodeId: 'c' }],
  });
  assert.deepEqual(flat.tiles, [{ id: '4,4', childNodeId: 'c' }]);
  // The codec's own fields win over a leftover record that contradicts them.
  const contradicted = decodeNodeTiles({
    ...base,
    refs: ['a'],
    cells: [0],
    tiles: [{ id: '0,0', imageRef: 'b', overlayRef: 'o', revealed: true, span: 3 }],
  });
  assert.deepEqual(contradicted.tiles, [{ id: '0,0', imageRef: 'a', span: 3 }]);
});

test('the encoded form never leaks the codec fields back into a decoded node', () => {
  const encoded = encodeNodeTiles(makeNode({ tiles: [tile('0,0', 'a')] }));
  const decoded = decodeNodeTiles(encoded);
  for (const key of ['refs', 'cells', 'fog']) {
    assert.equal(key in decoded, false, `${key} is not carried into live state`);
  }
});

test('random nodes round trip', () => {
  // Deterministic LCG so a failure is reproducible.
  let seed = 20260727;
  const rand = (/** @type {number} */ n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const art = ['grass-1', 'grass-2', 'water', 'sand', 'stone'];
  const overlays = [null, 'road', ['coast', 'river']];
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const width = 1 + rand(9);
    const height = 1 + rand(9);
    const tiles = gridTiles(width, height, (id) => {
      if (rand(5) === 0) return null; // a hole, so sparse nodes are covered too
      /** @type {Record<string, any>} */
      const extra = {};
      const overlay = overlays[rand(overlays.length)];
      if (overlay) extra.overlayRef = overlay;
      if (rand(4) === 0) extra.revealed = true;
      if (rand(6) === 0) extra.childNodeId = `child-${rand(3)}`;
      if (rand(7) === 0) extra.span = 2 + rand(2);
      if (rand(8) === 0) extra.metadata = { poiType: 'landmark', notes: `n${rand(100)}` };
      return tile(id, art[rand(art.length)], extra);
    });
    roundTrip(makeNode({ width, height, tiles }));
  }
});
