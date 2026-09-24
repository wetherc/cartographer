import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revertEdit } from '../src/map/EditRevert.js';
import { createMapNode, createTile, getTile, setTile } from '../src/map/TileGrid.js';
import { fillTiles } from './helpers/grid.js';

const base = fillTiles(createMapNode('n', 'Node', null, 3, 1), (id) => createTile(id, 'grass.svg'));

/** @param {import('../src/types/map.js').MapNode} node @param {string} id @param {object} patch */
const patched = (node, id, patch) =>
  setTile(node, { .../** @type {any} */ (getTile(node, id)), ...patch });

test('revertEdit with no after record puts the whole node back', () => {
  const current = patched(base, '0,0', { imageRef: 'water.svg' });
  assert.equal(revertEdit(current, base, null), base);
});

test('revertEdit returns the current node when the edit changed nothing', () => {
  const current = patched(base, '0,0', { revealed: true });
  assert.equal(revertEdit(current, base, base), current);
});

test('revertEdit reverts only the fields the edit changed', () => {
  const after = patched(base, '0,0', { imageRef: 'water.svg', overlayRef: ['road.svg'] });
  // Later, the party reveals the cell and the GM writes a note on it.
  const current = patched(after, '0,0', {
    revealed: true,
    metadata: { ...base.tiles[0].metadata, notes: 'Ford' },
  });
  const tile = getTile(revertEdit(current, base, after), '0,0');
  assert.equal(tile?.imageRef, 'grass.svg');
  assert.equal(tile?.overlayRef, null);
  assert.equal(tile?.revealed, true);
  assert.equal(tile?.metadata.notes, 'Ford');
});

test('revertEdit reverts a metadata field and keeps the others', () => {
  const meta = base.tiles[1].metadata;
  const after = patched(base, '1,0', { metadata: { ...meta, poiType: 'shop' } });
  const current = patched(after, '1,0', {
    metadata: { ...meta, poiType: 'shop', discovered: true },
  });
  const tile = getTile(revertEdit(current, base, after), '1,0');
  assert.equal(tile?.metadata.poiType, null);
  assert.equal(tile?.metadata.discovered, true);
});

test('revertEdit treats equal overlay stacks as unchanged', () => {
  const before = patched(base, '0,0', { overlayRef: ['road.svg'] });
  const after = patched(before, '0,0', { overlayRef: ['road.svg'] });
  const current = patched(after, '0,0', { overlayRef: ['river.svg'] });
  assert.equal(revertEdit(current, before, after), current);
});

test('revertEdit removes the span a stamp added and restores one it removed', () => {
  const stamped = patched(base, '0,0', { span: 2 });
  assert.equal(
    'span' in /** @type {object} */ (getTile(revertEdit(stamped, base, stamped), '0,0')),
    false,
  );
  const cleared = setTile(stamped, createTile('0,0', 'grass.svg'));
  assert.equal(getTile(revertEdit(cleared, stamped, cleared), '0,0')?.span, 2);
});

test('revertEdit drops a tile the edit created and restores one it erased', () => {
  const sparse = { ...base, tiles: base.tiles.slice(0, 2) };
  const painted = setTile(sparse, createTile('2,0', 'sand.svg'));
  assert.equal(getTile(revertEdit(painted, sparse, painted), '2,0'), undefined);
  const erased = { ...base, tiles: base.tiles.slice(1) };
  const back = revertEdit(erased, base, erased);
  assert.equal(getTile(back, '0,0'), base.tiles[0]);
  assert.equal(back.tiles.length, 3);
});

test('revertEdit leaves a created tile alone when a later edit already removed it', () => {
  const sparse = { ...base, tiles: base.tiles.slice(0, 2) };
  const painted = setTile(sparse, createTile('2,0', 'sand.svg'));
  assert.equal(revertEdit(sparse, sparse, painted), sparse);
});

test('revertEdit puts the before tile back when a later edit removed the changed tile', () => {
  const after = patched(base, '0,0', { imageRef: 'water.svg' });
  const current = { ...after, tiles: after.tiles.slice(1) };
  assert.equal(getTile(revertEdit(current, base, after), '0,0'), base.tiles[0]);
});

test('revertEdit reverts node fields the edit changed', () => {
  const after = { ...base, width: 5, environ: 'forest' };
  const current = { ...after, name: 'Renamed' };
  const reverted = revertEdit(current, base, after);
  assert.equal(reverted.width, 3);
  assert.equal(reverted.environ, null);
  assert.equal(reverted.name, 'Renamed');
});
