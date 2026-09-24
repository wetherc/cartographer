import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advancePastHeld } from '../src/app/turnAdvance.js';
import { createParticipant, startCombat } from '../src/combat/Initiative.js';
import { createCharacter, withHP } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { addCondition } from '../src/entities/Conditions.js';
import { stubApp } from './helpers/app.js';

/** A Hold Person chip. DC 1 always saves, and DC 99 never does. */
const held = (/** @type {number} */ saveDC) =>
  addCondition([], 'Paralyzed', 10, {
    source: {
      spellId: 'hold-person',
      spellName: 'Hold Person',
      casterId: 'mage',
      saveAbility: 'WIS',
      saveDC,
      saveEnds: true,
    },
  });

/**
 * A fight in the order mage, ogre, hero, with the mage acting. The ogre is
 * held by a chip with the given DC.
 * @param {number} saveDC
 */
function fight(saveDC) {
  const mage = withHP(createCharacter('mage', 'Mage'), 10);
  const hero = withHP(createCharacter('hero', 'Hero'), 10);
  const ogre = { ...createCreature('ogre', 'Ogre', { maxHP: 30 }), conditions: held(saveDC) };
  const app = stubApp({ state: { characters: [mage, hero], creatures: [ogre] } });
  const combat = startCombat(
    [createParticipant('mage', 20), createParticipant('ogre', 15), createParticipant('hero', 10)],
    (id) => id,
  );
  return { app, combat };
}

test('a held combatant the pointer steps past rolls its repeated save', () => {
  const { app, combat } = fight(1);
  const result = advancePastHeld(app, combat);
  assert.equal(result.state.order[result.state.index].id, 'hero', 'the held turn is still lost');
  assert.deepEqual(app.state.creatures[0].conditions, [], 'the save ends the chip');
  assert.match(app.log.join('\n'), /Ogre shakes off Paralyzed/);
});

test('a held combatant that fails the save stays held', () => {
  const { app, combat } = fight(99);
  advancePastHeld(app, combat);
  assert.equal(app.state.creatures[0].conditions.length, 1);
  assert.match(app.log.join('\n'), /Ogre is still Paralyzed/);
});

test('a downed combatant rolls no repeated save as the pointer passes it', () => {
  const { app, combat } = fight(1);
  app.state.creatures = [{ ...app.state.creatures[0], currentHP: 0 }];
  advancePastHeld(app, combat);
  assert.equal(app.state.creatures[0].conditions.length, 1);
  assert.equal(app.log.length, 0);
});

test('the turn now ending rolls its repeated save first', () => {
  const { app, combat } = fight(99);
  app.state.characters = [
    { ...app.state.characters[0], conditions: held(1) },
    app.state.characters[1],
  ];
  advancePastHeld(app, combat);
  assert.deepEqual(app.state.characters[0].conditions, []);
  assert.match(app.log[0], /^Mage shakes off Paralyzed/);
});
