import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RAGE_ROUNDS,
  RAGING,
  chipMeleeDamage,
  rageDamageBonus,
  rageLine,
  rageMods,
} from '../src/combat/Rage.js';
import { normalizeChipMods, modsSummary } from '../src/entities/ChipMods.js';
import { rollMode } from '../src/entities/ConditionEffects.js';
import { defensesOf } from '../src/entities/DamageDefenses.js';
import { createCharacter } from '../src/entities/Character.js';
import { hitDamage, prepareSwing } from '../src/combat/WeaponSwing.js';
import { turnActions, BARBARIAN_GROUP } from '../src/combat/TurnActions.js';

const AXE = {
  id: 'axe',
  name: 'Greataxe',
  quantity: 1,
  notes: '',
  type: /** @type {const} */ ('weapon'),
  kind: /** @type {const} */ ('melee'),
  properties: /** @type {any} */ ([]),
  damage: [{ count: 1, sides: 12, damageType: 'slashing' }],
};
const BOW = { ...AXE, id: 'bow', name: 'Longbow', kind: /** @type {const} */ ('ranged') };

/** @param {number} level */
const barbarian = (level) => ({
  .../** @type {any} */ (createCharacter('Brunn')),
  classes: [{ classId: 'barbarian', level }],
  level,
});

test('the Rage damage bonus follows barbarian level', () => {
  assert.deepEqual([1, 8, 9, 15, 16, 20].map(rageDamageBonus), [2, 2, 3, 3, 4, 4]);
});

test('rageMods give resistance, STR advantage, and the damage bonus', () => {
  const mods = rageMods(barbarian(9));
  assert.deepEqual(mods, {
    resist: ['bludgeoning', 'piercing', 'slashing'],
    saveAdvantage: ['STR'],
    checkAdvantage: ['STR'],
    meleeDamage: 3,
  });
  assert.deepEqual(normalizeChipMods(mods), mods);
  assert.match(modsSummary(mods), /advantage on STR checks, \+3 melee damage with STR/);
  assert.equal(RAGE_ROUNDS, 10);
  assert.match(rageLine('Brunn', 3), /^Brunn enters a Rage: \+3 melee damage/);
});

test('a Raging chip reaches the roll modes and the damage defenses', () => {
  const chip = { name: RAGING, rounds: 10, mods: rageMods(barbarian(1)) };
  assert.equal(rollMode({ roller: [chip], kind: 'check', ability: 'STR' }), 'advantage');
  assert.equal(rollMode({ roller: [chip], kind: 'check', ability: 'DEX' }), null);
  assert.equal(rollMode({ roller: [chip], kind: 'save', ability: 'STR' }), 'advantage');
  assert.deepEqual(defensesOf({ conditions: [chip] }).resist, [
    'bludgeoning',
    'piercing',
    'slashing',
  ]);
});

test('chipMeleeDamage counts only melee STR swings and the highest chip', () => {
  const chips = [
    { name: 'a', rounds: 1, mods: { meleeDamage: 2 } },
    { name: 'b', rounds: 1, mods: { meleeDamage: 4 } },
  ];
  assert.equal(chipMeleeDamage(chips, { melee: true, ability: 'STR' }), 4);
  assert.equal(chipMeleeDamage(chips, { melee: true, ability: 'DEX' }), 0);
  assert.equal(chipMeleeDamage(chips, { melee: false, ability: 'STR' }), 0);
  assert.equal(chipMeleeDamage(undefined, { melee: true, ability: 'STR' }), 0);
});

test('a raging barbarian adds the Rage bonus to a melee STR hit only', () => {
  const calm = barbarian(1);
  const raging = { ...calm, conditions: [{ name: RAGING, rounds: 10, mods: rageMods(calm) }] };
  const defender = { name: 'Orc', ac: 10, conditions: [] };
  /** @param {any} attacker @param {any} weapon */
  const swing = (attacker, weapon) => {
    const setup = prepareSwing({ attacker, defender, weapon, tweaks: {}, rng: () => 0 });
    return hitDamage(setup, { attacker, defender, weapon, tweaks: {}, crit: false, rng: () => 0 });
  };
  const base = swing(calm, AXE).damage.total;
  const hit = swing(raging, AXE);
  assert.equal(hit.damage.total, base + 2);
  assert.match(hit.riderNote, /Rage \+2/);
  assert.equal(swing(raging, BOW).damage.total, swing(calm, BOW).damage.total);
});

test('turnActions offers Rage as a bonus action with the uses left', () => {
  const rage = turnActions({ rage: 1 }).find((a) => a.id === 'rage');
  assert.equal(rage?.cost, 'bonus');
  assert.equal(rage?.group, BARBARIAN_GROUP);
  assert.equal(rage?.poolId, 'rage');
  assert.match(rage?.title ?? '', /1 use left/);
  assert.equal(
    turnActions().some((a) => a.id === 'rage'),
    false,
  );
});
