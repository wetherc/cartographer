import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  abilityCheck,
  auraBonus,
  checkBonus,
  halfProficiency,
  initiativeBonus,
  proficientSave,
  saveBonus,
  savingThrow,
} from '../src/entities/Checks.js';
import { critRange } from '../src/entities/Features.js';
import { resolveAttack } from '../src/combat/AttackResolve.js';
import { initiativeSlant, rollInitiative } from '../src/combat/InitiativeRoll.js';
import { combatRoster } from '../src/combat/CombatRoster.js';
import { buildStamp } from '../src/entities/FeatChoices.js';
import { takeFeat } from '../src/entities/LevelUp.js';
import { createCharacter } from '../src/entities/Character.js';
import { DEFAULT_FEATS } from '../src/data/feats.js';
import { normalizeFeat } from '../src/library/Library.js';
import { featSummary } from '../src/app/librarySummaries.js';
import { initiativeReadout } from '../src/view/InitiativeBadge.js';

/**
 * @param {string} classId
 * @param {number} level
 * @param {Record<string, number>} [stats]
 * @param {string} [subclass]
 */
function hero(classId, level, stats = {}, subclass) {
  return {
    ...createCharacter('h', 'Hero', stats),
    classes: [{ classId, level, ...(subclass ? { subclass } : {}) }],
    level,
  };
}

test('Jack of All Trades adds half proficiency, rounded down, to untrained checks', () => {
  const bard = hero('bard', 2, { STR: 10, DEX: 10 });
  assert.equal(checkBonus(bard, 'athletics'), 1, 'proficiency 2, half is 1');
  assert.equal(checkBonus(bard, 'STR'), 1, 'a bare ability check counts too');
  assert.equal(checkBonus(hero('bard', 1, { STR: 10 }), 'athletics'), 0, 'not before level 2');
  assert.equal(checkBonus(hero('fighter', 2, { STR: 10 }), 'athletics'), 0);
  assert.equal(initiativeBonus(bard), 1, 'initiative is a DEX check');
});

test('Jack of All Trades leaves a proficient check at full proficiency', () => {
  const bard = { ...hero('bard', 5, { CHA: 10 }) };
  const trained = {
    ...bard,
    proficiencies: { ...bard.proficiencies, skills: ['performance'] },
  };
  assert.equal(checkBonus(trained, 'performance'), 3);
});

test('Remarkable Athlete adds half proficiency, rounded up, to STR, DEX, and CON checks', () => {
  const champ = hero('fighter', 7, { STR: 10, DEX: 10, INT: 10 }, 'champion');
  assert.equal(halfProficiency(champ, 'STR'), 2, 'proficiency 3, half rounded up');
  assert.equal(checkBonus(champ, 'acrobatics'), 2);
  assert.equal(checkBonus(champ, 'arcana'), 0, 'an INT check gets nothing');
  assert.equal(initiativeBonus(champ), 2);
  assert.equal(halfProficiency(hero('fighter', 6, {}, 'champion'), 'STR'), 0, 'not before 7');
  assert.equal(halfProficiency(champ, null), 0);
});

test('a Bard and Champion takes the larger half-proficiency term', () => {
  const both = {
    ...createCharacter('h', 'Hero', { STR: 10 }),
    classes: [
      { classId: 'fighter', level: 7, subclass: 'champion' },
      { classId: 'bard', level: 2 },
    ],
    level: 9,
  };
  assert.equal(halfProficiency(both, 'STR'), 2, 'ceil(4 / 2) is 2');
  assert.equal(halfProficiency(both, 'INT'), 2, 'floor(4 / 2) is 2');
});

test('the half-proficiency term reaches the rolled check', () => {
  const bard = hero('bard', 2, { STR: 10 });
  const result = abilityCheck(bard, 'athletics', 10, { rng: () => 0 });
  assert.equal(result.total, 2, 'natural 1 plus 1');
});

test('Feral Instinct gives advantage on initiative', () => {
  const barb = hero('barbarian', 7, { DEX: 10 });
  const slant = initiativeSlant(barb);
  assert.equal(slant.mode, 'advantage');
  assert.ok(slant.reasons.includes('Feral Instinct, advantage'));
  assert.equal(initiativeSlant(hero('barbarian', 6)).mode, null);
  const rolls = [0.05, 0.9];
  const roll = rollInitiative({ id: 'h', value: 10, modifier: 0 }, barb, () => rolls.shift() ?? 0);
  assert.equal(roll.value, 19, 'keeps the higher d20');
});

test('the Alert feat adds 5 to initiative through its feat record', () => {
  const alert = /** @type {any} */ (DEFAULT_FEATS.find((f) => f.id === 'alert'));
  const stamp = buildStamp(alert, {});
  assert.equal(stamp.initiativeBonus, 5);
  const took = takeFeat(hero('fighter', 4, { DEX: 14 }), stamp);
  assert.equal(initiativeBonus(took), 7);
  assert.deepEqual(initiativeReadout(took), {
    label: 'Init +7',
    note: 'Initiative bonus: DEX modifier +2, features and feats +5',
  });
});

test('combatRoster seeds a character row from initiativeBonus', () => {
  const bard = hero('bard', 2, { DEX: 14 });
  const [row] = combatRoster([bard], [], { nodeId: 'n', tileId: '0,0' });
  assert.equal(row.modifier, 3);
  assert.equal(row.initiative, 13);
});

test('a library feat keeps an initiative effect and drops a zero one', () => {
  const feat = normalizeFeat(
    { name: 'Quick', effects: [{ kind: 'initiative', bonus: 3 }] },
    'quick',
  );
  assert.deepEqual(feat?.effects, [{ kind: 'initiative', bonus: 3 }]);
  assert.equal(featSummary(/** @type {any} */ (feat)).startsWith('+3 initiative'), true);
  const none = normalizeFeat({ name: 'Slow', effects: [{ kind: 'initiative', bonus: 0 }] }, 's');
  assert.deepEqual(none?.effects, []);
});

test('Aura of Protection adds the paladin CHA modifier, at least +1, to its saves', () => {
  const pal = hero('paladin', 6, { CHA: 16, DEX: 10 });
  assert.equal(auraBonus(pal), 3);
  assert.equal(saveBonus(pal, 'DEX'), 3, 'untrained DEX save, aura only');
  assert.equal(auraBonus(hero('paladin', 6, { CHA: 8 })), 1, 'at least +1');
  assert.equal(auraBonus(hero('paladin', 5, { CHA: 16 })), 0, 'not before level 6');
  const save = savingThrow(pal, 'DEX', 10, { rng: () => 0 });
  assert.equal(save.total, 4, 'natural 1 plus 3 reaches the rolled save');
});

test('Diamond Soul makes a monk proficient in every save', () => {
  const monk = hero('monk', 14, { CHA: 10 });
  assert.equal(proficientSave(monk, 'CHA'), true);
  assert.equal(saveBonus(monk, 'CHA'), 5);
  assert.equal(proficientSave(hero('monk', 13, { CHA: 10 }), 'CHA'), false);
});

test('critRange follows the Champion crit features', () => {
  assert.equal(critRange(hero('fighter', 2, {}, 'champion')), 20);
  assert.equal(critRange(hero('fighter', 3, {}, 'champion')), 19);
  assert.equal(critRange(hero('fighter', 15, {}, 'champion')), 18);
  assert.equal(critRange(hero('fighter', 15, {}, 'eldritch-knight')), 20);
});

test('resolveAttack crits and hits on a natural roll in the crit range', () => {
  assert.deepEqual(resolveAttack({ natural: 19, total: 20, ac: 30, critOn: 19 }), {
    crit: true,
    hit: true,
    outcome: 'critical hit',
  });
  assert.equal(resolveAttack({ natural: 19, total: 20, ac: 30 }).hit, false, 'default is 20');
  assert.equal(resolveAttack({ natural: 1, total: 30, ac: 10, critOn: 18 }).hit, false);
});
