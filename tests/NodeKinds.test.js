import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NODE_KINDS, environOptions, allowsPaletteType } from '../src/map/NodeKinds.js';

test('NODE_KINDS lists region and interior', () => {
  assert.deepEqual(NODE_KINDS, ['region', 'interior']);
});

test('environOptions returns per-kind suggestions and empty for unknown', () => {
  assert.ok(environOptions('region').includes('forest'));
  assert.ok(environOptions('interior').includes('temple'));
  assert.deepEqual(environOptions('nonsense'), []);
});

test('allowsPaletteType keeps interiors to interior pieces and regions to the rest', () => {
  assert.equal(allowsPaletteType('interior', 'interior'), true);
  assert.equal(allowsPaletteType('interior', 'grass'), false);
  assert.equal(allowsPaletteType('region', 'grass'), true);
  assert.equal(allowsPaletteType('region', 'interior'), false);
});

test('allowsPaletteType always permits custom art on either kind', () => {
  assert.equal(allowsPaletteType('interior', 'custom'), true);
  assert.equal(allowsPaletteType('region', 'custom'), true);
});
