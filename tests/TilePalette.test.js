import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';

test('TilePalette ships with built-in tiles', () => {
  const palette = new TilePalette();
  const builtins = palette.listBuiltins();
  assert.ok(builtins.length > 0);
  assert.equal(palette.get('grass').custom, false);
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
  assert.throws(() => palette.addCustom('grass', 'Fake Grass', 'data:x'), /built-in/);
});

test('removeCustom deletes a custom entry but ignores built-ins', () => {
  const palette = new TilePalette();
  palette.addCustom('my-tile', 'My Tile', 'data:x');
  palette.removeCustom('my-tile');
  assert.equal(palette.get('my-tile'), undefined);

  palette.removeCustom('grass');
  assert.ok(palette.get('grass'));
});

test('listAll returns both built-in and custom entries', () => {
  const palette = new TilePalette();
  const before = palette.listAll().length;
  palette.addCustom('my-tile', 'My Tile', 'data:x');
  assert.equal(palette.listAll().length, before + 1);
});
