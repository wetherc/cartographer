import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castSpell } from '../src/entities/Casting.js';
import { createResource } from '../src/entities/Resource.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

/**
 * The resolver's side of an attack spell whose hit brings a second roll: the
 * save a creature makes against the condition of the hit (Ray of Sickness),
 * or the condition alone when the hit brings no save.
 */

/** A deterministic RNG that replays a queue of unit values, then returns 0. */
function seq(values) {
  const queue = [...values];
  return () => (queue.length ? /** @type {number} */ (queue.shift()) : 0);
}

/** The rng value that makes a d`sides` roll come up `value`. */
const face = (sides, value) => (value - 1) / sides + 1e-9;
const d20 = (value) => face(20, value);

const ray = /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === 'ray-of-sickness'));

/** A wizard with 1st-level slots who has Ray of Sickness prepared. */
function caster() {
  return /** @type {any} */ ({
    id: 'c',
    name: 'Caster',
    classes: [{ classId: 'wizard', level: 3 }],
    level: 3,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 10, CHA: 10 },
    resources: [createResource('slots-1', 'Level 1 slots', 2)],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: [], known: [], prepared: ['ray-of-sickness', 'magic-missile'] },
  });
}

const ogre = { id: 'ogre', name: 'Ogre', ac: 11, saveBonus: 2 };

test('a hit rolls the save of its condition after the damage, and a failure imposes it', () => {
  const result = /** @type {any} */ (
    castSpell(caster(), ray, {
      targets: [ogre],
      spellAttackBonus: 5,
      saveDC: 13,
      rng: seq([d20(15), face(8, 3), face(8, 4), d20(5)]),
    })
  );
  const [o] = result.outcomes;
  assert.equal(o.hit, true);
  assert.equal(o.damage.total, 7);
  assert.equal(o.onHit.save.total, 7, 'the d20 of 5 plus the +2 bonus');
  assert.equal(o.onHit.saved, false);
  assert.equal(o.onHit.dc, 13);
  assert.equal(o.onHit.condition, 'Poisoned');
});

test('a made save keeps the condition off', () => {
  const result = /** @type {any} */ (
    castSpell(caster(), ray, {
      targets: [ogre],
      spellAttackBonus: 5,
      saveDC: 13,
      rng: seq([d20(15), face(8, 3), face(8, 4), d20(18)]),
    })
  );
  assert.equal(result.outcomes[0].onHit.saved, true);
  assert.equal(result.outcomes[0].onHit.condition, null);
});

test('a miss rolls no save', () => {
  const result = /** @type {any} */ (
    castSpell(caster(), ray, { targets: [ogre], spellAttackBonus: 0, saveDC: 13, rng: seq([]) })
  );
  assert.equal(result.outcomes[0].hit, false);
  assert.equal(result.outcomes[0].onHit, undefined);
});

test('a chip that fails the save outright throws no save die', () => {
  const result = /** @type {any} */ (
    castSpell(caster(), ray, {
      targets: [{ ...ogre, autoFailSave: 'Stunned' }],
      spellAttackBonus: 5,
      saveDC: 13,
      rng: seq([d20(15), face(8, 3), face(8, 4)]),
    })
  );
  const { onHit } = result.outcomes[0];
  assert.equal(onHit.save, null);
  assert.equal(onHit.autoFailedBy, 'Stunned');
  assert.equal(onHit.condition, 'Poisoned');
});

test('a hit with no save imposes the condition on every creature it hits', () => {
  const spell = {
    ...ray,
    effect: { ...ray.effect, onHit: { condition: 'Blinded' } },
  };
  const result = /** @type {any} */ (
    castSpell(caster(), spell, {
      targets: [ogre],
      spellAttackBonus: 5,
      rng: seq([d20(15), face(8, 3), face(8, 4)]),
    })
  );
  assert.deepEqual(result.outcomes[0].onHit, { condition: 'Blinded' });
});

test('a projectile spell rolls one save per creature, however many projectiles hit it', () => {
  const missile = /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === 'magic-missile'));
  const spell = {
    ...missile,
    effect: { ...missile.effect, onHit: { condition: 'Poisoned', saveAbility: 'CON' } },
  };
  const result = /** @type {any} */ (
    castSpell(caster(), spell, {
      targets: [{ ...ogre, projectiles: 3 }],
      saveDC: 13,
      rng: seq([0, 0, 0, d20(5)]),
    })
  );
  const [o] = result.outcomes;
  assert.equal(o.hits, 3);
  assert.equal(o.onHit.save.total, 7);
  assert.equal(o.onHit.condition, 'Poisoned');
});
