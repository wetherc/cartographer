import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wardType, wardTypes } from '../src/entities/DamageWard.js';

const ABSORB = /** @type {any} */ ({
  id: 'absorb-elements',
  name: 'Absorb Elements',
  level: 1,
  school: 'abjuration',
  classes: ['wizard'],
  castingTime: { kind: 'reaction', trigger: 'when you take elemental damage' },
  range: 'Self',
  components: ['S'],
  duration: { kind: 'rounds', amount: 1 },
  concentration: false,
  ritual: false,
  description: 'Resist the triggering damage type until the start of your next turn.',
  effect: {
    kind: 'buff',
    resistChoice: ['acid', 'cold', 'fire', 'lightning', 'thunder'],
    until: 'caster-start',
  },
});

test('wardType picks the largest type the spell resists that the defender does not', () => {
  const groups = [
    { damageType: 'fire', rolls: [3], bonus: 0, subtotal: 3 },
    { damageType: 'cold', rolls: [6], bonus: 0, subtotal: 6 },
    { damageType: 'slashing', rolls: [8], bonus: 0, subtotal: 8 },
  ];
  assert.equal(wardType(ABSORB, groups, {}), 'cold');
  assert.equal(wardType(ABSORB, groups, { resist: ['cold'] }), 'fire');
  assert.equal(wardType(ABSORB, groups, { immune: ['cold', 'fire'] }), null);
  assert.deepEqual(wardTypes({ ...ABSORB, effect: { kind: 'utility' } }), []);
  assert.deepEqual(wardTypes({ ...ABSORB, effect: { kind: 'buff', mods: { resist: ['acid'] } } }), [
    'acid',
  ]);
});
