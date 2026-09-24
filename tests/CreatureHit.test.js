import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settleConcentration } from '../src/entities/CreatureHit.js';
import { applyDamage, createCreature } from '../src/entities/Creature.js';
import { begin } from '../src/entities/Concentration.js';
import { addCondition } from '../src/entities/Conditions.js';

const HOLD = /** @type {any} */ ({
  id: 'hold-person',
  name: 'Hold Person',
  duration: { kind: 'minutes', amount: 1 },
});

/** A priest with 20 HP and a CON of 10, holding Hold Person. */
const priest = () =>
  begin(createCreature('priest', 'Priest', { maxHP: 20, stats: { CON: 10 } }), HOLD, 2).character;

/** The rng value that makes a d20 come up `value`. */
const d20 = (/** @type {number} */ value) => () => (value - 1) / 20 + 1e-9;

test('a creature holding nothing comes back as written', () => {
  const plain = createCreature('c', 'Cultist', { maxHP: 9 });
  const hurt = applyDamage(plain, 4);
  assert.deepEqual(settleConcentration(plain, hurt), { creature: hurt, events: [], ended: null });
});

test('a drop to 0 HP ends the spell with no save', () => {
  const held = priest();
  const result = settleConcentration(held, applyDamage(held, 20));
  assert.deepEqual(result.events, [{ kind: 'fell', spellName: 'Hold Person' }]);
  assert.equal(result.ended, 'hold-person');
  assert.equal(result.creature.concentration, null);
});

test('damage calls for a CON save that keeps or loses the spell', () => {
  const held = priest();
  const hurt = applyDamage(held, 6);
  const kept = settleConcentration(held, hurt, { rng: d20(15) });
  assert.deepEqual(kept.events, [
    { kind: 'concentration', spellName: 'Hold Person', kept: true, total: 15, dc: 10 },
  ]);
  assert.equal(kept.ended, null);
  assert.equal(kept.creature, hurt);
  const lost = settleConcentration(held, hurt, { rng: d20(4) });
  assert.equal(lost.events[0].kind, 'concentration');
  assert.equal(lost.ended, 'hold-person');
  assert.equal(lost.creature.concentration, null);
});

test('a one-roll rider on the creature is spent by the save', () => {
  const rider = { rolls: ['save'], dice: 1, die: 'd4', once: true };
  const base = priest();
  const held = {
    ...base,
    conditions: addCondition(base.conditions, 'Resistance', 10, {
      rider: /** @type {any} */ (rider),
    }),
  };
  const result = settleConcentration(held, applyDamage(held, 2), { rng: d20(15) });
  assert.deepEqual(
    result.creature.conditions.map((c) => c.name),
    ['Concentrating'],
  );
});

test('a chip that stops the creature acting ends the spell', () => {
  const held = priest();
  const stunned = { ...held, conditions: addCondition(held.conditions, 'Stunned', 1) };
  const result = settleConcentration(held, stunned);
  assert.deepEqual(result.events, []);
  assert.equal(result.ended, 'hold-person');
});

test('removing the Concentrating chip by hand ends the spell', () => {
  const held = priest();
  const result = settleConcentration(held, { ...held, conditions: [] });
  assert.equal(result.ended, 'hold-person');
  assert.equal(result.creature.concentration, null);
  const healed = settleConcentration(held, { ...held, notes: 'edited' });
  assert.equal(healed.ended, null, 'an edit that leaves the chip keeps the spell');
});
