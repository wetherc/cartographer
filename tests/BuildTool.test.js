import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveBrush, isBlankMap, toolChipLabel, PAINT_TAB } from '../src/view/BuildTool.js';

const grass = { id: 'grass', type: 'grass', label: 'Grass', imageRef: 'g', custom: false };

test('a brush paints only on the Paint tab', () => {
  assert.equal(effectiveBrush(grass, PAINT_TAB), grass);
  assert.equal(effectiveBrush('region', PAINT_TAB), 'region');
  assert.equal(effectiveBrush(grass, 'build-tab-tile'), null);
  assert.equal(effectiveBrush('erase', 'build-tab-encounters'), null);
});

test('the chip names what a click on the map does', () => {
  assert.equal(toolChipLabel(null, null), 'Inspect');
  assert.equal(toolChipLabel('erase', null), 'Erasing tiles');
  assert.equal(toolChipLabel('erase-path', null), 'Erasing paths');
  assert.equal(toolChipLabel('region', 'Ashogate'), 'Linking to Ashogate');
  assert.equal(toolChipLabel('region', null), 'Clearing links');
  assert.equal(toolChipLabel(grass, null), 'Painting: Grass');
  assert.equal(toolChipLabel(grass, null, true), 'Placing creature');
});

test('a map is blank until one cell has tile art', () => {
  assert.equal(isBlankMap({ tiles: [] }), true);
  assert.equal(isBlankMap({ tiles: [null, { imageRef: null }] }), true);
  const painted = { tiles: [null, { imageRef: 'grass' }] };
  assert.equal(isBlankMap(painted), false);
  // The second call reads the cache for the same node object.
  assert.equal(isBlankMap(painted), false);
});
