import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';

test('TilePalette ships with built-in terrain variants', () => {
  const palette = new TilePalette();
  const grassVariants = palette.listVariants('grass');
  assert.equal(grassVariants.length, 3);
  assert.equal(palette.get('grass-1').custom, false);
  assert.equal(palette.get('grass-1').imageRef, 'assets/tiles/grass/grass-1.svg');
});

test('TilePalette ships with built-in road connector pieces', () => {
  const palette = new TilePalette();
  const cross = palette.getRoadPiece('cross');
  assert.equal(cross.imageRef, 'assets/tiles/road/road-cross.svg');
  assert.equal(palette.listVariants('road').length, 11);
});

test('TilePalette ships with single-image POI markers', () => {
  const palette = new TilePalette();
  assert.equal(palette.get('settlement').imageRef, 'assets/tiles/settlement/settlement.svg');
  assert.equal(palette.get('dungeon').imageRef, 'assets/tiles/dungeon/dungeon.svg');
  assert.equal(palette.get('castle').imageRef, 'assets/tiles/castle/castle.svg');
  assert.equal(palette.get('wizard-tower').label, 'Wizard Tower');
  assert.equal(palette.get('general-store').label, 'General Store');
  for (const type of ['tavern', 'inn', 'blacksmith', 'alchemist', 'temple', 'shrine', 'academy', 'barracks']) {
    assert.ok(palette.get(type), `missing marker "${type}"`);
  }
});

test('TilePalette ships with building-interior pieces', () => {
  const palette = new TilePalette();
  assert.equal(palette.listVariants('interior').length, 13);
  assert.equal(
    palette.getInteriorPiece('wall-corner-ne').imageRef,
    'assets/tiles/interior/interior-wall-corner-ne.svg',
  );
  assert.equal(palette.getInteriorPiece('floor-1').type, 'interior');
  assert.equal(palette.getInteriorPiece('stairs-down').id, 'interior-stairs-down');
});

test('pickVariant selects deterministically from an injected rng', () => {
  const palette = new TilePalette();
  const first = palette.pickVariant('grass', () => 0);
  const last = palette.pickVariant('grass', () => 0.999);
  assert.equal(first.id, 'grass-1');
  assert.equal(last.id, 'grass-3');
});

test('pickVariant throws for an unknown type', () => {
  const palette = new TilePalette();
  assert.throws(() => palette.pickVariant('lava', () => 0), /No variants/);
});

test('addCustom registers a new tile entry', () => {
  const palette = new TilePalette();
  const entry = palette.addCustom('my-tile', 'My Tile', 'data:image/png;base64,abc');
  assert.equal(entry.custom, true);
  assert.equal(palette.get('my-tile'), entry);
  assert.equal(palette.listCustom().length, 1);
});

test('addCustom refuses to override a built-in id', () => {
  const palette = new TilePalette();
  assert.throws(() => palette.addCustom('grass-1', 'Fake Grass', 'data:x'), /built-in/);
});

test('removeCustom deletes a custom entry but ignores built-ins', () => {
  const palette = new TilePalette();
  palette.addCustom('my-tile', 'My Tile', 'data:x');
  palette.removeCustom('my-tile');
  assert.equal(palette.get('my-tile'), undefined);

  palette.removeCustom('grass-1');
  assert.ok(palette.get('grass-1'));
});

test('listAll returns both built-in and custom entries', () => {
  const palette = new TilePalette();
  const before = palette.listAll().length;
  palette.addCustom('my-tile', 'My Tile', 'data:x');
  assert.equal(palette.listAll().length, before + 1);
});
