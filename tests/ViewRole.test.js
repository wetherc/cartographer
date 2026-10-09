import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGM, hpBand, seesThroughFog } from '../src/view/ViewRole.js';

test('isGM is true only for the gm role', () => {
  assert.equal(isGM('gm'), true);
  assert.equal(isGM('player'), false);
});

test('hpBand reads full health as Unharmed', () => {
  assert.equal(hpBand(10, 10), 'Unharmed');
});

test('hpBand reads above half as Healthy', () => {
  assert.equal(hpBand(6, 10), 'Healthy');
});

test('hpBand reads exactly half as Bloodied (not Healthy)', () => {
  assert.equal(hpBand(5, 10), 'Bloodied');
});

test('hpBand reads above a quarter but at/below half as Bloodied', () => {
  assert.equal(hpBand(3, 10), 'Bloodied');
});

test('hpBand reads at/below a quarter, still standing, as Badly wounded', () => {
  assert.equal(hpBand(2, 10), 'Badly wounded');
  assert.equal(hpBand(1, 10), 'Badly wounded');
});

test('hpBand reads zero or below as Down', () => {
  assert.equal(hpBand(0, 10), 'Down');
  assert.equal(hpBand(-5, 10), 'Down');
});

test('hpBand guards a non-positive max as Unknown', () => {
  assert.equal(hpBand(0, 0), 'Unknown');
});

test('seesThroughFog is true only for a GM outside Build mode', () => {
  for (const mode of /** @type {const} */ (['play', 'combat', 'library'])) {
    assert.equal(seesThroughFog(mode, 'gm'), true, mode);
    assert.equal(seesThroughFog(mode, 'player'), false, mode);
  }
  assert.equal(seesThroughFog('build', 'gm'), false);
  assert.equal(seesThroughFog('build', 'player'), false);
});
