import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKGROUND_LIST,
  getBackground,
  withBackground,
  resolveBackground,
} from '../src/entities/Backgrounds.js';
import { createCharacter, withDefaults } from '../src/entities/Character.js';

test('getBackground resolves known ids and rejects unknown or absent ones', () => {
  assert.equal(getBackground('sage')?.name, 'Sage');
  assert.equal(getBackground('gladiator'), null);
  assert.equal(getBackground(undefined), null);
  assert.equal(getBackground(null), null);
  assert.equal(getBackground(''), null);
});

test('withBackground assigns a known id and rejects an unknown one', () => {
  const c = withBackground(createCharacter('c1', 'Mirt'), 'noble');
  assert.equal(c.background, 'noble');
  assert.equal(withBackground(c, 'gladiator'), c);
});

test('withBackground with an empty id clears the background', () => {
  const c = withBackground(createCharacter('c1', 'Mirt'), 'noble');
  assert.equal(withBackground(c, '').background, undefined);
});

test('resolveBackground returns the definition or null', () => {
  const c = withBackground(createCharacter('c1', 'Mirt'), 'soldier');
  assert.equal(resolveBackground(c)?.feature, 'Military Rank');
  assert.equal(resolveBackground(createCharacter('c2', 'Nim')), null);
  assert.equal(resolveBackground({ ...c, background: 'deleted-custom' }), null);
});

test('withDefaults preserves the background on a round-trip', () => {
  const c = withBackground(createCharacter('c1', 'Mirt'), 'acolyte');
  const loaded = withDefaults(JSON.parse(JSON.stringify(c)));
  assert.equal(loaded.background, 'acolyte');
});

test('every catalog background can be assigned and resolved', () => {
  for (const def of BACKGROUND_LIST) {
    const c = withBackground(createCharacter('c1', 'X'), def.id);
    assert.equal(resolveBackground(c)?.name, def.name, def.id);
  }
});
