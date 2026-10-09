import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteFallback,
  editedNode,
  editedSize,
  newChildNode,
  nodeFieldChange,
  nodeKindFields,
  shrinkQuestion,
  sizeField,
} from '../src/view/NodeForms.js';
import { createMapNode, createTile } from '../src/map/TileGrid.js';

const FLOOR = 'assets/tiles/interior/interior-floor-1.svg';
const form = (/** @type {Record<string, string>} */ over) => ({
  name: 'Keep',
  width: '6',
  height: '4',
  kind: 'interior',
  environ: '',
  lockState: '',
  lockRequires: '',
  ...over,
});

test('nodeKindFields lists every kind and the tags of the chosen kind', () => {
  const [kind, environ] = nodeKindFields('region', null);
  assert.equal(kind.value, 'region');
  assert.ok(kind.options?.some((o) => o.label === 'Interior'));
  assert.equal(environ.value, '');
  assert.ok(Array.isArray(environ.options));
  assert.equal(nodeKindFields('interior', 'inn')[1].value, 'inn');
});

test('nodeFieldChange refills Environment on a kind change and leaves Key item to its rule', () => {
  /** @type {any[]} */
  const calls = [];
  const values = { kind: 'interior', lockState: '' };
  const handle = /** @type {any} */ ({
    get: (/** @type {string} */ k) => values[/** @type {'kind'} */ (k)],
    setOptions: (/** @type {string} */ k) => calls.push(['options', k]),
    setDisabled: (/** @type {string} */ k, /** @type {boolean} */ off) =>
      calls.push(['disabled', k, off]),
  });
  nodeFieldChange('kind', handle);
  nodeFieldChange('lockState', handle);
  values.lockState = 'locked';
  nodeFieldChange('lockState', handle);
  nodeFieldChange('name', handle);
  assert.deepEqual(calls, [['options', 'environ']]);
});

test('sizeField states the range in its caption and sets no bounds', () => {
  assert.deepEqual(sizeField('width', 6, 64), {
    name: 'width',
    label: 'Width (tiles, 1 to 64)',
    type: 'number',
    value: 6,
  });
});

test('newChildNode reads the New map answers', () => {
  const node = newChildNode('n2', 'root', form({ environ: 'inn' }));
  assert.equal(node.name, 'Keep');
  assert.equal(node.parentId, 'root');
  assert.equal(node.width, 6);
  assert.equal(node.height, 4);
  assert.equal(node.kind, 'interior');
  assert.equal(node.environ, 'inn');
});

test('newChildNode names a blank map Untitled and reads an unknown kind as a region', () => {
  const node = newChildNode('n2', 'root', form({ name: '  ', kind: 'moon', width: '0' }));
  assert.equal(node.name, 'Untitled');
  assert.equal(node.kind, 'region');
  assert.equal(node.environ, null);
  assert.equal(node.width, 1);
});

test('editedSize keeps the current size for a field that is not a number', () => {
  const node = createMapNode('n', 'N', null, 8, 5);
  assert.deepEqual(editedSize(node, form({ width: 'x', height: '3' })), { width: 8, height: 3 });
});

test('editedNode resizes, renames, and sets the lock', () => {
  const node = {
    ...createMapNode('n', 'Old', null, 4, 4, { kind: 'interior' }),
    tiles: [createTile('3,3', FLOOR), createTile('0,0', FLOOR)],
  };
  const next = editedNode(
    node,
    form({ width: '2', height: '2', lockState: 'locked', lockRequires: 'Silver Key' }),
  );
  assert.equal(next.name, 'Keep');
  assert.equal(next.width, 2);
  assert.deepEqual(
    next.tiles.map((t) => t.id),
    ['0,0'],
  );
  assert.equal(next.lock?.requires, 'Silver Key');
});

test('editedNode keeps the name on a blank answer and drops a lock that was removed', () => {
  const node = {
    ...createMapNode('n', 'Old', null, 4, 4, { kind: 'interior', environ: 'inn' }),
    lock: { requires: 'Key', open: false },
  };
  const next = editedNode(node, form({ name: ' ', width: '4', height: '4', kind: 'moon' }));
  assert.equal(next.name, 'Old');
  assert.equal(next.kind, 'interior');
  assert.equal(next.environ, null);
  assert.ok(!('lock' in next));
});

test('shrinkQuestion counts the lost tiles', () => {
  assert.equal(
    shrinkQuestion('Keep', 1),
    'Shrinking "Keep" removes 1 tile outside the new bounds.',
  );
  assert.match(shrinkQuestion('Keep', 3), /removes 3 tiles /);
});

test('deleteFallback shows the parent, or the first node when the parent is gone', () => {
  const child = createMapNode('c', 'C', 'p', 2, 2);
  assert.equal(
    deleteFallback(child, (id) => id === 'p', ['root', 'p']),
    'p',
  );
  assert.equal(
    deleteFallback(child, () => false, ['root']),
    'root',
  );
  assert.equal(
    deleteFallback(createMapNode('r', 'R', null, 2, 2), () => true, ['x']),
    'x',
  );
});
