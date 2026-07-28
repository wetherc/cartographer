import { test } from 'node:test';
import assert from 'node:assert/strict';

import { initiativeDeps } from '../src/ui/InitiativePanel.js';
import { sameDeps } from '../src/view/SheetStructure.js';
import {
  createCharacter,
  withHP,
  damageCharacter,
  addItem,
  updateItem,
  addResource,
  spendResource,
  learnSpell,
  unlearnSpell,
  getSpellbook,
} from '../src/entities/Character.js';
import { createResource } from '../src/entities/Resource.js';
import { addCondition } from '../src/entities/Conditions.js';
import { equip, equippedWeapons } from '../src/entities/Equipment.js';
import { spellbookIds } from '../src/app/casterFields.js';
import { resolveSpellIds } from '../src/library/Library.js';

/**
 * A weapon the equipped index will accept: a typed inventory stack with at
 * least one damage term.
 * @param {string} id
 * @param {string} name
 * @param {string} die
 */
function weapon(id, name, die) {
  return { id, name, type: 'weapon', quantity: 1, damage: [{ dice: die, type: 'slashing' }] };
}

/** A caster with two weapons in the pack, the sword equipped, and a spellbook. */
function hero() {
  let c = withHP(createCharacter('hero', 'Hero', { STR: 14, DEX: 12 }), 12);
  c = addItem(c, weapon('sword', 'Longsword', '1d8'));
  c = addItem(c, weapon('axe', 'Handaxe', '1d6'));
  c = equip(c, 'mainHand', 'sword');
  c = addResource(c, createResource('slots-1', 'Level 1 slots', 'mana', 3));
  c = learnSpell(c, 'magic-missile');
  return { ...c, spellbook: { ...getSpellbook(c), cantrips: ['fire-bolt'] } };
}

/**
 * The action strip the wiring hands the panel, resolved through the same pure
 * helpers `encounterWiring` uses. Gated exactly as the panel gates it, and
 * counting its resolutions so a skipped turn can be shown to resolve nothing.
 * @param {any} state
 * @param {boolean[]} mayAct
 * @param {Record<string, any>} roster
 */
function stripFor(state, mayAct, roster) {
  const calls = { weapons: 0, spells: 0 };
  const active = state.order[state.index] ?? null;
  if (!active || !mayAct[state.index]) return { weapons: [], spells: [], calls };
  const entity = roster[active.id];
  calls.weapons += 1;
  calls.spells += 1;
  return {
    weapons: entity ? equippedWeapons(entity) : [],
    spells: entity ? resolveSpellIds(spellbookIds(getSpellbook(entity))) : [],
    calls,
  };
}

/** Two combatants, the hero acting first. */
function fight(index = 0) {
  return {
    round: 1,
    index,
    order: [
      { id: 'hero', initiative: 18, modifier: 1 },
      { id: 'goblin', initiative: 9, modifier: 0 },
    ],
  };
}

/**
 * The deps a render would compare, for one roster and one turn.
 * @param {any} state
 * @param {Record<string, any>} roster
 * @param {{ gm?: boolean, mayAct?: boolean[] }} [opts]
 */
function depsFor(state, roster, opts = {}) {
  const gm = opts.gm ?? true;
  const mayAct = opts.mayAct ?? state.order.map(() => gm);
  return initiativeDeps(state, gm, mayAct, stripFor(state, mayAct, roster));
}

test('identical renders compare equal, and nothing built never matches', () => {
  const character = hero();
  const state = fight();
  const roster = { hero: character };
  assert.ok(sameDeps(depsFor(state, roster), depsFor(state, roster)));
  assert.equal(sameDeps(null, depsFor(state, roster)), false, 'a null previous list never matches');
});

test('an edit the strip does not show leaves the deps equal', () => {
  const character = hero();
  const state = fight();
  const before = depsFor(state, { hero: character });

  const damaged = damageCharacter(character, 4);
  assert.notEqual(damaged, character, 'the edit really did replace the object');
  assert.ok(sameDeps(before, depsFor(state, { hero: damaged })), 'HP');

  const spent = spendResource(character, 'slots-1', 1);
  assert.ok(sameDeps(before, depsFor(state, { hero: spent })), 'a spent spell slot');

  const afflicted = {
    ...character,
    conditions: addCondition(character.conditions ?? [], 'Poisoned'),
  };
  assert.ok(sameDeps(before, depsFor(state, { hero: afflicted })), 'a condition');
});

test('a change to the strip itself forces a rebuild', () => {
  const character = hero();
  const state = fight();
  const before = depsFor(state, { hero: character });

  const swapped = equip(character, 'mainHand', 'axe');
  assert.equal(sameDeps(before, depsFor(state, { hero: swapped })), false, 'a different weapon');

  const sharpened = updateItem(character, 'sword', weapon('sword', 'Longsword +1', '1d10'));
  assert.equal(sameDeps(before, depsFor(state, { hero: sharpened })), false, 'an edited weapon');

  const learned = learnSpell(character, 'fireball');
  assert.equal(sameDeps(before, depsFor(state, { hero: learned })), false, 'a spell learned');

  const forgotten = unlearnSpell(character, 'magic-missile');
  assert.equal(sameDeps(before, depsFor(state, { hero: forgotten })), false, 'a spell forgotten');
});

test('order, turn, role, and permission changes force a rebuild', () => {
  const character = hero();
  const roster = { hero: character };
  const state = fight();
  const before = depsFor(state, roster);

  assert.equal(sameDeps(before, depsFor(fight(1), roster)), false, 'the turn advanced');

  const joined = { ...state, order: [...state.order, { id: 'orc', initiative: 5, modifier: 0 }] };
  assert.equal(sameDeps(before, depsFor(joined, roster)), false, 'a participant joined');

  const left = { ...state, order: [state.order[0]] };
  assert.equal(sameDeps(before, depsFor(left, roster)), false, 'a participant left');

  const reordered = { ...state, order: [state.order[1], state.order[0]] };
  assert.equal(sameDeps(before, depsFor(reordered, roster)), false, 'the order was re-sorted');

  const renamed = { ...state, order: [{ ...state.order[0], id: 'hero-2' }, state.order[1]] };
  assert.equal(sameDeps(before, depsFor(renamed, roster)), false, 'an id changed');

  assert.equal(
    sameDeps(before, depsFor(state, roster, { gm: false, mayAct: [true, true] })),
    false,
    'the viewer stopped being the GM',
  );
  assert.equal(
    sameDeps(before, depsFor(state, roster, { mayAct: [true, false] })),
    false,
    'one combatant became un-actable',
  );
});

test('a turn nobody at this tab may act on resolves nothing', () => {
  const character = hero();
  const state = fight(1);
  const mayAct = [true, false];
  const strip = stripFor(state, mayAct, { hero: character });
  assert.deepEqual({ weapons: strip.weapons, spells: strip.spells }, { weapons: [], spells: [] });
  assert.deepEqual(strip.calls, { weapons: 0, spells: 0 }, 'no weapon or spell resolution ran');
  const deps = initiativeDeps(state, true, mayAct, strip);
  assert.deepEqual(deps.slice(3, 5), [0, 0], 'both strip lengths are zero');
  assert.equal(deps.length, 5 + state.order.length + mayAct.length);
});

test('two strips that flatten alike still compare unequal', () => {
  const state = fight();
  const [a, b] = [{ name: 'Longsword' }, { name: 'Fire Bolt' }];
  const split = initiativeDeps(state, true, [true, true], {
    weapons: /** @type {any} */ ([a]),
    spells: /** @type {any} */ ([b]),
  });
  const together = initiativeDeps(state, true, [true, true], {
    weapons: /** @type {any} */ ([a, b]),
    spells: [],
  });
  assert.deepEqual(split.slice(5), together.slice(5), 'the tails are the same element sequence');
  assert.equal(sameDeps(split, together), false, 'the lengths in the head keep them apart');
});
