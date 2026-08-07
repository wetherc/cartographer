import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCreature } from '../src/entities/Creature.js';
import {
  creatureCheckBonus,
  creatureProficiencyBonus,
  creatureSaveBonus,
  isProficientCreatureSave,
  isProficientCreatureSkill,
  proficiencySummary,
} from '../src/entities/CreatureChecks.js';

/** A creature with the stats and training a test needs.
 * @param {object} [options] */
function foe(options = {}) {
  return createCreature('foe', 'Foe', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { STR: 16, DEX: 14, CON: 12, INT: 8, WIS: 10, CHA: 10, AC: 13 },
    ...options,
  });
}

test('a rated creature reads the proficiency ladder at its rating', () => {
  assert.equal(
    creatureProficiencyBonus(foe({ cr: 0.25 })),
    2,
    'every rating below 1 rolls with +2',
  );
  assert.equal(creatureProficiencyBonus(foe({ cr: 4 })), 2);
  assert.equal(creatureProficiencyBonus(foe({ cr: 5 })), 3);
  assert.equal(creatureProficiencyBonus(foe({ cr: 17 })), 6);
});

test('an unrated creature falls back to its level, and to 1 with no level', () => {
  assert.equal(creatureProficiencyBonus(foe({ level: 9 })), 4);
  assert.equal(creatureProficiencyBonus(foe()), 2, 'no rating and no level reads as level 1');
});

test('a rating wins over a level, because the rules rate a creature and not its level', () => {
  assert.equal(creatureProficiencyBonus(foe({ level: 20, cr: 1 })), 2);
});

test('a save adds proficiency only where the creature is trained', () => {
  const trained = foe({ cr: 5, proficiencies: { saves: ['STR'], skills: [] } });
  assert.equal(creatureSaveBonus(trained, 'STR'), 6, 'STR 16 gives +3, plus the CR 5 +3');
  assert.equal(creatureSaveBonus(trained, 'DEX'), 2, 'an untrained save is the modifier alone');
  assert.equal(isProficientCreatureSave(trained, 'STR'), true);
  assert.equal(isProficientCreatureSave(trained, 'DEX'), false);
  assert.equal(isProficientCreatureSave(foe(), 'STR'), false, 'no record means trained in nothing');
});

test('a save reads the effective stat block, so armor and a timed modifier reach it', () => {
  const buffed = { ...foe(), statMods: [{ stat: 'DEX', delta: 4, rounds: 2 }] };
  assert.equal(creatureSaveBonus(buffed, 'DEX'), 4, 'DEX 14 plus 4 gives +4');
});

test('an ability the stat block does not carry reads as a score of 10', () => {
  const bare = { ...foe(), stats: {} };
  assert.equal(creatureSaveBonus(bare, 'WIS'), 0);
});

test('exhaustion costs a creature 2 on every save and check', () => {
  const tired = foe({ cr: 5, proficiencies: { saves: ['STR'], skills: [] } });
  assert.equal(creatureSaveBonus({ ...tired, exhaustion: 3 }, 'STR'), 0, '6 less the 6 penalty');
  assert.equal(creatureCheckBonus({ ...tired, exhaustion: 1 }, 'athletics'), 1);
});

test('a check adds proficiency for a trained skill and never doubles it', () => {
  const sneak = foe({ cr: 5, proficiencies: { saves: [], skills: ['stealth'] } });
  assert.equal(creatureCheckBonus(sneak, 'stealth'), 5, 'DEX 14 gives +2, plus the CR 5 +3');
  assert.equal(creatureCheckBonus(sneak, 'acrobatics'), 2, 'the same ability, untrained');
  assert.equal(isProficientCreatureSkill(sneak, 'stealth'), true);
  assert.equal(isProficientCreatureSkill(sneak, 'acrobatics'), false);
});

test('a bare ability check is never trained, and an unknown key reads as 10', () => {
  const strong = foe({ cr: 9, proficiencies: { saves: [], skills: ['athletics'] } });
  assert.equal(creatureCheckBonus(strong, 'STR'), 3, 'proficiency attaches to the skill');
  assert.equal(creatureCheckBonus(strong, 'athletics'), 7, '+3 plus the CR 9 +4');
  assert.equal(creatureCheckBonus(strong, 'lockpicking'), 0);
});

test('the summary names each trained save and skill with its bonus', () => {
  const both = foe({ cr: 5, proficiencies: { saves: ['STR', 'INT'], skills: ['stealth'] } });
  assert.equal(proficiencySummary(both), 'Saves STR +6, INT +2 | Skills Stealth +5');
});

test('the summary signs a penalty and reads empty for an untrained creature', () => {
  const dim = foe({ proficiencies: { saves: ['INT'], skills: [] } });
  assert.equal(proficiencySummary(dim), 'Saves INT +1', 'INT 8 gives -1, plus the level 1 +2');
  const worse = { ...dim, stats: { ...dim.stats, INT: 8 }, exhaustion: 2 };
  assert.equal(proficiencySummary(worse), 'Saves INT -3');
  assert.equal(proficiencySummary(foe()), '');
});

test('a skill-only creature names no saves, and a save-only one names no skills', () => {
  const skilled = foe({ proficiencies: { saves: [], skills: ['stealth'] } });
  assert.equal(proficiencySummary(skilled), 'Skills Stealth +4');
});
