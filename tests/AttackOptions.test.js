import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowsSneakAttack, hasFreeHandFor } from '../src/combat/AttackOptions.js';

const SPEAR = {
  id: 'spear',
  name: 'Spear',
  type: 'weapon',
  kind: 'melee',
  properties: ['versatile'],
};

/**
 * A character stand-in holding the given items in its two hands.
 * @param {Record<string, any>} hands
 */
function holding(hands) {
  const items = Object.values(hands).filter(Boolean);
  const equipment = Object.fromEntries(
    Object.entries(hands).map(([slot, item]) => [slot, item?.id ?? null]),
  );
  return { inventory: items, equipment };
}

test('Sneak Attack needs a finesse or a ranged weapon', () => {
  assert.equal(
    allowsSneakAttack({ name: 'Rapier', kind: 'melee', damage: [], properties: ['finesse'] }),
    true,
  );
  assert.equal(allowsSneakAttack({ name: 'Shortbow', kind: 'ranged', damage: [] }), true);
  assert.equal(
    allowsSneakAttack({
      name: 'Greataxe',
      kind: 'melee',
      damage: [],
      properties: ['heavy', 'two-handed'],
    }),
    false,
  );
});

test('the versatile grip needs the other hand empty', () => {
  const shield = { id: 'shield', name: 'Shield', type: 'shield' };
  const dagger = { id: 'dagger', name: 'Dagger', type: 'weapon' };
  const weapon = /** @type {any} */ (SPEAR);
  assert.equal(hasFreeHandFor(holding({ mainHand: SPEAR, offHand: null }), weapon), true);
  assert.equal(hasFreeHandFor(holding({ mainHand: null, offHand: SPEAR }), weapon), true);
  assert.equal(hasFreeHandFor(holding({ mainHand: SPEAR, offHand: shield }), weapon), false);
  assert.equal(hasFreeHandFor(holding({ mainHand: dagger, offHand: SPEAR }), weapon), false);
});

test('a creature has no hand slots, so its grip is never ruled out', () => {
  assert.equal(
    hasFreeHandFor(
      { id: 'ogre', name: 'Ogre' },
      /** @type {any} */ ({ name: 'Club', kind: 'melee', damage: [] }),
    ),
    true,
  );
});
