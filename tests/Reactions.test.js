import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canReact, opportunityWeapons, reactionSpells } from '../src/combat/Reactions.js';

/**
 * A weapon in the shape both a character's inventory and a creature's assigned
 * weapon use, trimmed to the one field this reader looks at.
 * @param {string} name
 * @param {string} [kind]
 */
function weapon(name, kind = 'melee') {
  return /** @type {any} */ ({ name, type: 'weapon', kind });
}

/**
 * A spell trimmed to its casting time.
 * @param {string} name
 * @param {unknown} [castingTime]
 */
function spell(name, castingTime) {
  return /** @type {any} */ ({ id: name.toLowerCase(), name, level: 1, castingTime });
}

test('canReact reads the reaction pip of the turn', () => {
  const fresh = /** @type {any} */ ({ id: 'hero', used: {} });
  const used = /** @type {any} */ ({ id: 'hero', used: { reaction: true } });
  assert.equal(canReact(fresh), true);
  assert.equal(canReact(used), false);
  assert.equal(
    canReact(/** @type {any} */ ({ id: 'hero' })),
    true,
    'a save written before the budget existed holds every reaction',
  );
});

test('opportunityWeapons keeps the melee weapons and drops the ranged ones', () => {
  const swung = opportunityWeapons([
    weapon('Longsword'),
    weapon('Longbow', 'ranged'),
    weapon('Dagger'),
  ]);
  assert.deepEqual(
    swung.map((w) => w.name),
    ['Longsword', 'Dagger'],
  );
  assert.deepEqual(opportunityWeapons([weapon('Sling', 'ranged')]), []);
  assert.deepEqual(opportunityWeapons([]), []);
});

test('reactionSpells keeps only a reaction casting time', () => {
  const offered = reactionSpells([
    spell('Shield', '1 reaction, which you take when you are hit by an attack'),
    spell('Counterspell', { kind: 'reaction' }),
    spell('Fireball', '1 action'),
    spell('Misty Step', '1 bonus action'),
    spell('Detect Magic'),
  ]);
  assert.deepEqual(
    offered.map((s) => s.name),
    ['Shield', 'Counterspell'],
    'a spell with no stated casting time reads as an action',
  );
});
