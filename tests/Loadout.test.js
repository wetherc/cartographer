import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLoadout, isEmptyLoadout, loadoutAccess } from '../src/combat/Loadout.js';
import { createCharacter, addItem, withHP } from '../src/entities/Character.js';
import { equip } from '../src/entities/Equipment.js';
import { createCreature } from '../src/entities/Creature.js';
import { createResource, spend } from '../src/entities/Resource.js';
import { item } from './helpers/fixtures.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** A fighter in chain mail with a shield and a sword drawn. */
function armedHero() {
  let hero = withHP(createCharacter('hero', 'Hero', { DEX: 12 }), 20);
  hero = addItem(hero, item('mail', 'Chain Mail', { type: 'armor', armorWeight: 'heavy' }));
  hero = addItem(hero, item('shield', 'Shield', { type: 'shield' }));
  hero = addItem(
    hero,
    item('sword', 'Longsword', {
      type: 'weapon',
      damage: [{ count: 1, sides: 8, bonus: 0, damageType: 'slashing' }],
    }),
  );
  hero = addItem(hero, item('potion', 'Potion of Healing', { type: 'consumable' }));
  hero = equip(hero, 'chest', 'mail');
  hero = equip(hero, 'offHand', 'shield');
  hero = equip(hero, 'mainHand', 'sword');
  return hero;
}

/** A caster with two first-level slots, one already spent, and a pact pool. */
function caster() {
  const hero = withHP(createCharacter('mage', 'Mage'), 8);
  return {
    ...hero,
    resources: [
      ...hero.resources,
      spend(createResource('slots-1', 'Level 1 slots', 'mana', 2), 1),
      createResource('slots-2', 'Level 2 slots', 'mana', 1),
      createResource('pact-3', 'Pact slots (level 3)', 'mana', 2),
    ],
  };
}

const CANTRIP = { id: 'firebolt', name: 'Fire Bolt', level: 0 };
const SPELL = { id: 'shield', name: 'Shield', level: 1 };

test('a character loadout names worn armor and drawn weapons', () => {
  const loadout = buildLoadout({ kind: 'character', entity: armedHero() });
  assert.deepEqual(loadout.armor, ['Chain Mail', 'Shield']);
  assert.deepEqual(loadout.weapons, [{ name: 'Longsword', damage: '1d8 slashing' }]);
});

test('carried but unequipped gear stays off the loadout', () => {
  let hero = createCharacter('hero', 'Hero');
  hero = addItem(hero, item('mail', 'Chain Mail', { type: 'armor' }));
  hero = addItem(hero, item('dagger', 'Dagger', { type: 'weapon' }));
  const loadout = buildLoadout({ kind: 'character', entity: hero });
  assert.deepEqual(loadout.armor, []);
  assert.deepEqual(loadout.weapons, []);
});

test('a weapon in the off hand is a weapon, not armor', () => {
  let hero = createCharacter('hero', 'Hero');
  hero = addItem(
    hero,
    item('axe', 'Handaxe', {
      type: 'weapon',
      damage: [{ count: 1, sides: 6, bonus: 0, damageType: 'slashing' }],
    }),
  );
  hero = equip(hero, 'offHand', 'axe');
  const loadout = buildLoadout({ kind: 'character', entity: hero });
  assert.deepEqual(loadout.armor, [], 'the off hand holds no shield');
  assert.deepEqual(loadout.weapons, [{ name: 'Handaxe', damage: '1d6 slashing' }]);
});

test('spells split into cantrips and leveled spells', () => {
  const loadout = buildLoadout({ kind: 'character', entity: caster() }, [CANTRIP, SPELL, SPELL]);
  assert.deepEqual(loadout.spells, { cantrips: 1, leveled: 2 });
});

test('slots report what is left, leveled first and pact magic after', () => {
  const loadout = buildLoadout({ kind: 'character', entity: caster() });
  assert.deepEqual(loadout.slots, [
    { level: 1, pact: false, remaining: 1, max: 2 },
    { level: 2, pact: false, remaining: 1, max: 1 },
    { level: 3, pact: true, remaining: 2, max: 2 },
  ]);
});

test('a foe loadout reads its authored armor and single weapon', () => {
  const goblin = {
    ...createCreature('goblin', 'Goblin', {
      disposition: 'hostile',
      maxHP: 10,
      stats: { AC: 13 },
      location: HERE,
      level: 1,
    }),
    armor: { name: 'Hide Armor', acBonus: 2 },
    weapon: {
      name: 'Scimitar',
      kind: /** @type {const} */ ('melee'),
      damage: [{ count: 1, sides: 6, bonus: 0, damageType: /** @type {const} */ ('slashing') }],
    },
  };
  const loadout = buildLoadout({ kind: 'creature', entity: goblin });
  assert.deepEqual(loadout.armor, ['Hide Armor']);
  assert.deepEqual(loadout.weapons, [{ name: 'Scimitar', damage: '1d6 slashing' }]);
});

test('an unarmed NPC carries nothing, and neither does an unresolved id', () => {
  const sage = createCreature('sage', 'Sage', { location: HERE });
  assert.equal(isEmptyLoadout(buildLoadout({ kind: 'creature', entity: sage })), true);
  assert.equal(isEmptyLoadout(buildLoadout(null)), true);
});

test('an armed NPC reads its gear the way a foe does', () => {
  const guard = createCreature('guard', 'Guard', {
    location: HERE,
    weapon: {
      name: 'Spear',
      kind: /** @type {const} */ ('melee'),
      damage: [{ count: 1, sides: 6, bonus: 0, damageType: /** @type {const} */ ('piercing') }],
    },
    armor: { name: 'Chain Shirt', acBonus: 3 },
  });
  const loadout = buildLoadout({ kind: 'creature', entity: guard });
  assert.deepEqual(loadout.armor, ['Chain Shirt']);
  assert.deepEqual(loadout.weapons, [{ name: 'Spear', damage: '1d6 piercing' }]);
});

test('isEmptyLoadout is false as soon as anything shows', () => {
  assert.equal(isEmptyLoadout(buildLoadout({ kind: 'character', entity: armedHero() })), false);
  const bare = createCharacter('bare', 'Bare');
  assert.equal(isEmptyLoadout(buildLoadout({ kind: 'character', entity: bare }, [CANTRIP])), false);
});

test('the GM sees every combatant whole', () => {
  const viewer = { gm: true, boundCharacterId: null };
  const goblin = {
    kind: /** @type {const} */ ('creature'),
    entity: createCreature('g', 'G', { disposition: 'hostile', maxHP: 5 }),
  };
  assert.equal(loadoutAccess({ kind: 'character', entity: caster() }, viewer, 'mage'), 'full');
  assert.equal(loadoutAccess(goblin, viewer, 'g'), 'full');
});

test('a player sees their own character whole', () => {
  const found = { kind: /** @type {const} */ ('character'), entity: caster() };
  const viewer = { gm: false, boundCharacterId: 'mage' };
  assert.equal(loadoutAccess(found, viewer, 'mage'), 'full');
});

test('a player sees another party member in public only', () => {
  const found = { kind: /** @type {const} */ ('character'), entity: caster() };
  const viewer = { gm: false, boundCharacterId: 'hero' };
  assert.equal(loadoutAccess(found, viewer, 'mage'), 'public');
});

test('a player sees nothing of a foe, and nothing of an unresolved id', () => {
  const viewer = { gm: false, boundCharacterId: 'hero' };
  const goblin = {
    kind: /** @type {const} */ ('creature'),
    entity: createCreature('g', 'G', { disposition: 'hostile', maxHP: 5 }),
  };
  const brigand = createCreature('b', 'Brigand', { location: HERE, disposition: 'hostile' });
  assert.equal(loadoutAccess(goblin, viewer, 'g'), 'none');
  assert.equal(loadoutAccess({ kind: 'creature', entity: brigand }, viewer, 'b'), 'none');
  assert.equal(loadoutAccess(null, viewer, 'gone'), 'none');
});

test('public access keeps armor and weapons and drops spells and slots', () => {
  let mage = caster();
  mage = addItem(mage, item('robe', 'Robe', { type: 'armor' }));
  mage = equip(mage, 'chest', 'robe');
  const loadout = buildLoadout({ kind: 'character', entity: mage }, [CANTRIP, SPELL], 'public');
  assert.deepEqual(loadout.armor, ['Robe']);
  assert.deepEqual(loadout.spells, { cantrips: 0, leveled: 0 }, 'prepared spells stay private');
  assert.deepEqual(loadout.slots, [], 'remaining slots stay private');
});

test('no access draws nothing at all', () => {
  const loadout = buildLoadout({ kind: 'character', entity: armedHero() }, [CANTRIP], 'none');
  assert.equal(isEmptyLoadout(loadout), true);
});

test('a foe with no authored armor reports none', () => {
  const ooze = {
    ...createCreature('ooze', 'Gray Ooze', {
      disposition: 'hostile',
      maxHP: 10,
      stats: { AC: 8 },
      location: HERE,
    }),
    armor: null,
    weapon: null,
  };
  const loadout = buildLoadout({ kind: 'creature', entity: ooze });
  assert.deepEqual(loadout.armor, []);
  assert.deepEqual(loadout.weapons, []);
});
