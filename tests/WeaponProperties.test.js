import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ammunitionOf,
  ammunitionStack,
  hasCrossbowExpert,
  heavySlant,
  loadedSwings,
} from '../src/entities/WeaponProperties.js';
import { swingsPerAction } from '../src/entities/CreatureAttacks.js';

const bow = (name, properties = ['ammunition']) =>
  /** @type {any} */ ({ id: name, name, quantity: 1, properties });

test('ammunitionOf names the ammunition of each weapon family', () => {
  assert.equal(ammunitionOf(bow('Heavy Crossbow'))?.noun, 'bolts');
  assert.equal(ammunitionOf(bow('Longbow'))?.noun, 'arrows');
  assert.equal(ammunitionOf(bow('Sling'))?.noun, 'sling bullets');
  assert.equal(ammunitionOf(bow('Blowgun'))?.noun, 'blowgun needles');
  assert.equal(ammunitionOf(bow('Star Thrower'))?.noun, 'ammunition');
  assert.equal(ammunitionOf(bow('Longsword', [])), null);
  assert.equal(ammunitionOf(/** @type {any} */ ({ name: 'Claw' })), null);
});

test('ammunitionStack finds a matching stack with pieces left, never the weapon', () => {
  const weapon = bow('Bow of Arrows');
  const arrows = { id: 'a', name: 'Arrows', quantity: 3 };
  const bolts = { id: 'b', name: 'Crossbow Bolts', quantity: 5 };
  const empty = { id: 'e', name: 'Silver Arrows', quantity: 0 };
  const hero = { inventory: [weapon, empty, bolts, arrows] };
  assert.equal(ammunitionStack(/** @type {any} */ (hero), weapon), arrows);
  assert.equal(ammunitionStack(/** @type {any} */ (hero), bow('Light Crossbow')), bolts);
  assert.equal(ammunitionStack(/** @type {any} */ ({ inventory: [weapon] }), weapon), null);
  assert.equal(ammunitionStack({}, weapon), null, 'a creature carries no inventory');
  assert.equal(ammunitionStack(/** @type {any} */ (hero), bow('Club', [])), null);
});

test('heavySlant gives disadvantage only to a Small attacker with a heavy weapon', () => {
  const heavy = bow('Longbow', ['ammunition', 'heavy']);
  const small = { raceTraits: { size: 'small' } };
  assert.equal(heavySlant(small, heavy), 'disadvantage');
  assert.equal(heavySlant({ raceTraits: { size: 'medium' } }, heavy), null);
  assert.equal(heavySlant({}, heavy), null);
  assert.equal(heavySlant(small, bow('Shortbow')), null);
});

test('hasCrossbowExpert reads the feat by catalog id or by typed name', () => {
  assert.equal(
    hasCrossbowExpert({ asiChoices: [{ type: 'feat', featId: 'crossbow-expert' }] }),
    true,
  );
  assert.equal(
    hasCrossbowExpert({ asiChoices: [{ type: 'feat', feat: ' crossbow expert ' }] }),
    true,
  );
  assert.equal(hasCrossbowExpert({ asiChoices: [{ type: 'feat', feat: 'Alert' }, null] }), false);
  assert.equal(
    hasCrossbowExpert({ asiChoices: [{ type: 'asi', feat: 'Crossbow Expert' }] }),
    false,
  );
  assert.equal(hasCrossbowExpert({}), false);
});

test('loadedSwings caps a loading weapon at one swing without Crossbow Expert', () => {
  const crossbow = bow('Light Crossbow', ['ammunition', 'loading']);
  assert.equal(loadedSwings({}, crossbow, 2), 1);
  assert.equal(
    loadedSwings({ asiChoices: [{ type: 'feat', feat: 'Crossbow Expert' }] }, crossbow, 2),
    2,
  );
  assert.equal(loadedSwings({}, bow('Longbow'), 2), 2);
});

test('swingsPerAction keeps a Multiattack count on a loading weapon', () => {
  const crossbow = bow('Light Crossbow', ['ammunition', 'loading']);
  assert.equal(swingsPerAction({ multiattack: 2 }, crossbow), 2);
  assert.equal(swingsPerAction({}, crossbow), 1);
});
