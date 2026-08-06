import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canOffhand,
  isLightMelee,
  offhandDamageModifier,
  offhandWeapons,
} from '../src/combat/TwoWeapon.js';

/**
 * A weapon in the shape both a character's inventory and a creature's assigned
 * weapon use, trimmed to the fields these readers look at.
 * @param {string} name
 * @param {{ kind?: string, properties?: string[] }} [traits]
 */
function weapon(name, { kind = 'melee', properties = ['light'] } = {}) {
  return /** @type {any} */ ({ name, type: 'weapon', kind, properties });
}

/** A participant with the given budget already spent. */
function participant(used) {
  return /** @type {any} */ ({ id: 'hero', initiative: 10, modifier: 0, used });
}

const DAGGER = weapon('Dagger');
const SHORTSWORD = weapon('Shortsword');
const GREATAXE = weapon('Greataxe', { properties: ['heavy', 'two-handed'] });
const HAND_CROSSBOW = weapon('Hand Crossbow', { kind: 'ranged', properties: ['light'] });

test('isLightMelee takes a light melee weapon and nothing else', () => {
  assert.equal(isLightMelee(DAGGER), true);
  assert.equal(isLightMelee(GREATAXE), false, 'a heavy weapon needs both hands');
  assert.equal(isLightMelee(HAND_CROSSBOW), false, 'a light bow is not a melee weapon');
  assert.equal(isLightMelee(weapon('Longsword', { properties: [] })), false);
  const noProperties = /** @type {any} */ ({ name: 'Club', type: 'weapon', kind: 'melee' });
  assert.equal(isLightMelee(noProperties), false, 'a weapon with no property list is not light');
});

test('offhandWeapons offers the light melee weapons once there are two of them', () => {
  assert.deepEqual(
    offhandWeapons([DAGGER, SHORTSWORD]).map((w) => w.name),
    ['Dagger', 'Shortsword'],
    'either hand can take either weapon, so the GM picks',
  );
  assert.deepEqual(offhandWeapons([DAGGER]), [], 'one dagger fights with one hand');
  assert.deepEqual(
    offhandWeapons([DAGGER, GREATAXE, HAND_CROSSBOW]),
    [],
    'the second weapon has to be a light melee one too',
  );
  assert.deepEqual(offhandWeapons([]), []);
});

test('canOffhand waits for the Attack action to be taken and the bonus action to be free', () => {
  const weapons = [DAGGER, SHORTSWORD];
  assert.equal(
    canOffhand(participant({ action: true, attacked: true, bonus: false }), weapons),
    true,
    'the first swing has been taken and the bonus action is there to pay',
  );
  assert.equal(
    canOffhand(participant({ action: false, bonus: false }), weapons),
    false,
    'the off-hand swing is the second attack, not the first',
  );
  assert.equal(
    canOffhand(participant({ action: true, attacked: false, bonus: false }), weapons),
    false,
    'an action spent on a cast is not the Attack action',
  );
  assert.equal(
    canOffhand(participant({ action: true, attacked: true, bonus: true }), weapons),
    false,
    'something else already took the bonus action',
  );
  assert.equal(
    canOffhand(participant({ action: true, attacked: true, bonus: false }), [DAGGER]),
    false,
    'one weapon offers no second hand',
  );
  assert.equal(canOffhand(participant(undefined), weapons), false, 'an unspent turn offers none');
});

test('offhandDamageModifier drops a bonus and keeps a penalty', () => {
  assert.equal(offhandDamageModifier(3), 0);
  assert.equal(offhandDamageModifier(0), 0);
  assert.equal(offhandDamageModifier(-2), -2);
});
