import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addItem, createCharacter, getHP, removeItem, withHP } from '../src/entities/Character.js';
import { spellSaveDC, spellAttackBonus } from '../src/entities/Classes.js';
import { classMaxHP, spendHitDie, withHitDice } from '../src/entities/HitDice.js';
import { withClasses, withEquipped } from '../src/entities/Progression.js';
import { item } from './helpers/fixtures.js';

/** A level 3 character of one class, with its HP pool at the class value. */
function hero(/** @type {string} */ classId, /** @type {Record<string, number>} */ stats) {
  const base = withClasses({ ...createCharacter('c1', 'Hero', stats), level: 3 }, [
    { classId, level: 3 },
  ]);
  return withHitDice(withHP(base, classMaxHP(base) ?? 1));
}

test('a worn INT buff raises the spell DC and spell attack with the INT check', () => {
  let wizard = hero('wizard', { INT: 14 });
  assert.equal(spellSaveDC(wizard), 8 + 2 + 2);
  wizard = addItem(wizard, item('band', 'Headband', { type: 'helmet', statBonuses: { INT: 4 } }));
  wizard = withEquipped(wizard, 'helmet', 'band');
  assert.equal(spellSaveDC(wizard), 8 + 2 + 4);
  assert.equal(spellAttackBonus(wizard), 2 + 4);
});

test('a worn CON buff moves max HP and hit die healing, and taking it off moves them back', () => {
  let fighter = hero('fighter', { CON: 10 });
  const bare = getHP(fighter).max;
  fighter = addItem(
    fighter,
    item('ring', 'Ring of Vigor', { type: 'ring', statBonuses: { CON: 4 } }),
  );
  const worn = withEquipped(fighter, 'accessory', 'ring');
  assert.equal(getHP(worn).max, bare + 2 * 3, '+2 CON modifier over three levels');
  assert.equal(getHP(withEquipped(worn, 'accessory', null)).max, bare);
  assert.equal(getHP(removeItem(worn, 'ring', 1)).max, bare, 'a removed item takes its HP too');
  const { healed, rolled } = spendHitDie(worn, null, () => 0);
  assert.equal(healed, rolled + 2);
});
