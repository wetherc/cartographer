import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeNodeList } from '../src/storage/TileDecode.js';
import { withTileDefaults } from '../src/map/NodeDefaults.js';

/** A restore that blanks `bad` and maps `asset:k` to a payload. */
const restoreRef = (/** @type {string} */ ref) =>
  ref === 'bad' ? '' : ref === 'asset:k' ? 'data:image/png;base64,AA' : ref;

/**
 * Decode one record through `decodeNodeList` and return what `onDecode` saw.
 * @param {Record<string, any>} record
 * @returns {{ node: Record<string, any>, refsKept: boolean, links: string[] | undefined }}
 */
function decodeOne(record) {
  /** @type {{ node: Record<string, any>, refsKept: boolean, links: string[] | undefined }[]} */
  const seen = [];
  decodeNodeList([record], {
    restoreRef,
    onDecode: (node, _record, facts) => seen.push({ node, ...facts }),
  });
  assert.equal(seen.length, 1);
  return seen[0];
}

const base = { id: 'n', name: 'n', parentId: null, width: 2, height: 1 };

test('the decoder restores each palette ref and reports a node it left as stored', () => {
  const kept = decodeOne({ ...base, refs: ['a', ['a', ['road', 7]]], cells: [0, 1] });
  assert.equal(kept.refsKept, true);
  assert.deepEqual(kept.node.tiles[1].overlayRef, ['road'], 'a non-string overlay is dropped');
  const changed = decodeOne({ ...base, refs: ['bad', ['a', 'asset:k']], cells: [0, 1] });
  assert.equal(changed.refsKept, false);
  assert.equal(changed.node.tiles[0].imageRef, '');
  assert.equal(changed.node.tiles[1].overlayRef, 'data:image/png;base64,AA');
});

test('a leftover record takes the restored art of its cell', () => {
  const { node, refsKept } = decodeOne({
    ...base,
    refs: [['bad', 'asset:k']],
    cells: [0, -1],
    tiles: [{ id: '0,0', span: 2, overlayRef: 'stale' }],
  });
  assert.equal(refsKept, false);
  assert.deepEqual(node.tiles, [
    withTileDefaults(
      /** @type {any} */ ({
        id: '0,0',
        imageRef: '',
        overlayRef: 'data:image/png;base64,AA',
        span: 2,
      }),
    ),
  ]);
});

test('a node with unusable dimensions restores the refs of its leftover records', () => {
  const record = {
    ...base,
    width: 0,
    refs: ['a'],
    cells: [0],
    tiles: [{ id: '4,4', imageRef: 'bad', overlayRef: ['asset:k', 3] }, { id: '5,5' }],
  };
  const { node, refsKept } = decodeOne(record);
  assert.equal(refsKept, false);
  assert.deepEqual(node.tiles, [
    withTileDefaults(
      /** @type {any} */ ({ id: '4,4', imageRef: '', overlayRef: ['data:image/png;base64,AA'] }),
    ),
    withTileDefaults(/** @type {any} */ ({ id: '5,5' })),
  ]);
  const clean = decodeOne({ ...record, tiles: [{ id: '5,5', imageRef: 'a' }] });
  assert.equal(clean.refsKept, true);
});

test('a decode with no restore keeps every ref as stored', () => {
  /** @type {boolean[]} */
  const flags = [];
  const { nodes } = decodeNodeList([{ ...base, refs: ['bad'], cells: [0, 0] }], {
    onDecode: (_node, _record, { refsKept }) => flags.push(refsKept),
  });
  assert.deepEqual(flags, [true]);
  assert.equal(/** @type {any} */ (nodes[0]).tiles[0].imageRef, 'bad');
});

test('the decode lists the links of a node when its link palette names them all', () => {
  const grid = { ...base, refs: ['a'], cells: [0, 0] };
  assert.deepEqual(decodeOne(grid).links, [], 'no stream and no leftovers');
  const streamed = { ...grid, links: ['c', 5], linkCells: [0, 1] };
  assert.deepEqual(decodeOne(streamed).links, ['c'], 'the string entries of the palette');
  const leftover = { ...streamed, tiles: [{ id: '1,0', childNodeId: 'stale' }] };
  assert.deepEqual(decodeOne(leftover).links, ['c'], 'the stream overrides a leftover link');
  const unstreamed = { ...grid, tiles: [{ id: '1,0', childNodeId: 'old' }] };
  assert.equal(decodeOne(unstreamed).links, undefined, 'a leftover record can hold a link');
  assert.equal(decodeOne({ ...grid, width: 0 }).links, undefined, 'unusable dimensions');
});
