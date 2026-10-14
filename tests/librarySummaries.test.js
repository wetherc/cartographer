import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creatureSummary, featSummary, spellSummary } from '../src/app/librarySummaries.js';

const bite = { name: 'Bite', damage: [{ count: 2, sides: 4, damageType: 'piercing' }] };

test('creatureSummary leads a rated foe with its challenge rating', () => {
  const wolf = {
    name: 'Wolf',
    disposition: 'hostile',
    maxHP: 11,
    level: 1,
    tier: 'mob',
    cr: 0.25,
    weapons: [bite],
  };
  assert.equal(creatureSummary(/** @type {any} */ (wolf)), 'CR 1/4, 11 HP | Bite 2d4 piercing');
});

test('creatureSummary shows tier and level for an unrated foe, and HP alone otherwise', () => {
  const ogre = { name: 'Ogre', disposition: 'hostile', maxHP: 59, level: 5, tier: 'legend' };
  assert.equal(creatureSummary(/** @type {any} */ (ogre)), 'Legend, level 5, 59 HP');
  const wolf = { name: 'Wolf', disposition: 'hostile', maxHP: 11, level: 1, tier: 'mob' };
  assert.equal(creatureSummary(/** @type {any} */ (wolf)), 'Mob, level 1, 11 HP');
  const ooze = { name: 'Ooze', disposition: 'hostile', maxHP: 20 };
  assert.equal(creatureSummary(/** @type {any} */ (ooze)), '20 HP');
});

test('creatureSummary names who a friendly creature is', () => {
  const smith = { name: 'Smith', disposition: 'friendly', role: 'blacksmith', maxHP: 4 };
  assert.equal(creatureSummary(/** @type {any} */ (smith)), 'blacksmith | friendly');
});

test('spellSummary capitalizes the school', () => {
  const spell = { level: 0, school: 'evocation', effect: { kind: 'attack' }, concentration: false };
  assert.equal(spellSummary(/** @type {any} */ (spell)), 'Cantrip Evocation | Attack roll');
});

test('spellSummary marks a leveled concentration spell', () => {
  const spell = { level: 2, school: 'enchantment', effect: { kind: 'save' }, concentration: true };
  assert.equal(
    spellSummary(/** @type {any} */ (spell)),
    'Level 2 Enchantment | Saving throw | Concentration',
  );
});

test('featSummary names each effect kind', () => {
  const feat = (effects, prerequisite) => /** @type {any} */ ({ effects, prerequisite });
  assert.equal(featSummary(feat([{ kind: 'asi', abilities: ['STR', 'DEX'] }])), '+1 STR/DEX');
  assert.equal(featSummary(feat([{ kind: 'asi', abilities: [] }])), '+1 any');
  assert.equal(
    featSummary(feat([{ kind: 'concentrationAdvantage' }])),
    'advantage on concentration saves',
  );
  assert.equal(featSummary(feat([{ kind: 'hitDieFloor' }])), 'hit die minimum');
  assert.equal(featSummary(feat([{ kind: 'hp', perLevel: 2 }])), '+2 HP per level');
  assert.equal(featSummary(feat([{ kind: 'initiative', bonus: 5 }])), '+5 initiative');
  assert.match(
    featSummary(
      feat([{ kind: 'rider', rider: { dice: { count: 1, sides: 4 }, rolls: ['save'] } }]),
    ),
    / rider$/,
  );
});

test('featSummary lists proficiency picks with singular and plural counts', () => {
  const effect = {
    kind: 'proficiency',
    skills: { choose: 1 },
    saves: { choose: 2 },
    expertise: { choose: 1 },
    armor: ['light', 'medium'],
    tools: { choose: 1 },
    languages: { choose: 1 },
  };
  assert.equal(
    featSummary(/** @type {any} */ ({ effects: [effect] })),
    '1 skill, 2 saves, expertise, armor: light, medium, tools, languages',
  );
  const plural = { kind: 'proficiency', skills: { choose: 3 }, saves: { choose: 1 } };
  assert.equal(featSummary(/** @type {any} */ ({ effects: [plural] })), '3 skills, 1 save');
});

test('spellSummary uses the form label for the other effect kinds', () => {
  const spell = { level: 1, school: 'abjuration', effect: { kind: 'heal' }, concentration: false };
  assert.equal(spellSummary(/** @type {any} */ (spell)), 'Level 1 Abjuration | Heal');
  const odd = { level: 1, school: 'abjuration', effect: { kind: 'odd' }, concentration: false };
  assert.equal(spellSummary(/** @type {any} */ (odd)), 'Level 1 Abjuration | odd');
});

test('featSummary reads "No automatic effect" for a feat with no effects, and names a prerequisite', () => {
  assert.equal(featSummary(/** @type {any} */ ({ effects: [] })), 'No automatic effect');
  assert.equal(
    featSummary(/** @type {any} */ ({ effects: [], prerequisite: 'STR 13' })),
    'No automatic effect | Requires STR 13',
  );
});
