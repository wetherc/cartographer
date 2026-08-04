import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CREATURE_HP,
  dispositionOptions,
  isCreature,
  defaultEnemyGear,
  createCreature,
  withDefaults,
  effectiveStatBlock,
  addStatModifier,
  tickStatModifiers,
  editCreature,
  applyDamage,
  heal,
  isDefeated,
  toTemplate,
  fromTemplate,
} from '../src/entities/Creature.js';
import { slotLevelOf } from '../src/entities/SpellSlots.js';

/** The normalized stat block createCreature stamps from partial input. */
const fullBlock = (/** @type {Record<string, number>} */ overrides = {}) => ({
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 10,
  WIS: 10,
  CHA: 10,
  AC: 10,
  ...overrides,
});

test('dispositionOptions offers every disposition, capitalized', () => {
  assert.deepEqual(dispositionOptions(), [
    { value: 'friendly', label: 'Friendly' },
    { value: 'neutral', label: 'Neutral' },
    { value: 'hostile', label: 'Hostile' },
  ]);
});

test('isCreature tells a creature from a character by the disposition field', () => {
  assert.equal(isCreature(createCreature('c1', 'Bram')), true);
  assert.equal(isCreature({ id: 'ch1', name: 'Hero', stats: {} }), false);
});

test('createCreature defaults to a neutral, unplaced, unmet, unarmed commoner', () => {
  const creature = createCreature('c1', 'Bram');
  assert.deepEqual(creature, {
    id: 'c1',
    name: 'Bram',
    disposition: 'neutral',
    maxHP: DEFAULT_CREATURE_HP,
    currentHP: DEFAULT_CREATURE_HP,
    stats: fullBlock(),
    location: null,
    conditions: [],
    met: false,
    weapon: null,
    armor: null,
  });
});

test('createCreature with a level stamps the default gear into the stored value', () => {
  const low = createCreature('c1', 'Bandit', { disposition: 'hostile', level: 1 });
  assert.equal(low.weapon.name, 'Shortsword');
  assert.equal(low.armor.name, 'Leather Armor');
  assert.equal(low.level, 1);
  assert.equal(low.tier, 'mob');
  const legend = createCreature('c2', 'Warlord', { level: 6, tier: 'legend' });
  assert.equal(legend.weapon.name, 'Greatsword');
  assert.equal(legend.armor.name, 'Plate');
});

test('createCreature keeps an explicit null through a level', () => {
  const beast = createCreature('c1', 'Wolf', { level: 2, weapon: null, armor: null });
  assert.equal(beast.weapon, null);
  assert.equal(beast.armor, null);
});

test('createCreature without a level stores no level, no tier, and no gear', () => {
  const creature = createCreature('c1', 'Innkeeper', { tier: 'legend' });
  assert.equal('level' in creature, false);
  assert.equal('tier' in creature, false, 'a tier without a level is dropped');
  assert.equal(creature.weapon, null);
  assert.equal(creature.armor, null);
});

test('createCreature takes hit points and gear, deriving AC from DEX when none is typed', () => {
  const weapon = {
    name: 'Club',
    handling: 'melee',
    damage: [{ dice: 1, die: 'd4', type: 'bludgeoning' }],
  };
  const creature = createCreature('c1', 'Guard', { maxHP: 11, stats: { DEX: 14 }, weapon });
  assert.equal(creature.maxHP, 11);
  assert.equal(creature.currentHP, 11);
  assert.equal(creature.stats.AC, 12);
  assert.deepEqual(creature.weapon, weapon);
  assert.equal(creature.armor, null, 'an explicit weapon does not pull in a default armor');
});

test('createCreature clamps a nonsense maximum to a live creature', () => {
  assert.equal(createCreature('a', 'Zero', { maxHP: 0 }).maxHP, DEFAULT_CREATURE_HP);
  assert.equal(createCreature('b', 'Negative', { maxHP: -5 }).maxHP, 1);
  assert.equal(createCreature('c', 'Fraction', { maxHP: 7.8 }).maxHP, 7);
});

test('createCreature keeps role and notes only when given', () => {
  const bare = createCreature('a', 'Bram');
  assert.equal('role' in bare, false);
  assert.equal('notes' in bare, false);
  const full = createCreature('b', 'Mira', { role: 'Innkeeper', notes: 'Owes the party.' });
  assert.equal(full.role, 'Innkeeper');
  assert.equal(full.notes, 'Owes the party.');
});

test('createCreature with a caster class stamps slot pools at the caster level', () => {
  const caster = createCreature('c1', 'Acolyte', { level: 3, class: 'cleric' });
  assert.equal(caster.class, 'cleric');
  assert.equal(caster.casterLevel, 3, 'the caster level defaults to the level');
  assert.ok(caster.resources.some((r) => slotLevelOf(r) === 1));
  const townMage = createCreature('c2', 'Hedge Wizard', { class: 'wizard' });
  assert.equal(townMage.casterLevel, 1, 'no level means caster level 1');
});

test('withDefaults backfills a sparse creature without rebuilding gear', () => {
  const sparse = /** @type {any} */ ({ id: 'c1', name: 'Old', level: 6, tier: 'legend' });
  const filled = withDefaults(sparse);
  assert.equal(filled.disposition, 'neutral');
  assert.equal(filled.maxHP, DEFAULT_CREATURE_HP);
  assert.equal(filled.currentHP, DEFAULT_CREATURE_HP);
  assert.deepEqual(filled.stats, fullBlock());
  assert.equal(filled.location, null);
  assert.deepEqual(filled.conditions, []);
  assert.equal(filled.met, false);
  assert.equal(filled.weapon, null, 'absent gear reads as none, not as the level default');
  assert.equal(filled.armor, null);
});

test('withDefaults keeps live state and clamps current HP to the maximum', () => {
  const creature = createCreature('c1', 'Guard', { maxHP: 10 });
  const bloated = { ...creature, currentHP: 25 };
  assert.equal(withDefaults(bloated).currentHP, 10);
  const hurt = { ...creature, currentHP: 3 };
  assert.equal(withDefaults(hurt).currentHP, 3);
});

test('withDefaults re-closes the stat block over the fixed stat set', () => {
  const legacy = /** @type {any} */ ({ id: 'c1', name: 'Old', stats: { DEX: 16, Speed: 30 } });
  const filled = withDefaults(legacy);
  assert.equal(filled.stats.DEX, 16);
  assert.equal('Speed' in filled.stats, false);
  assert.equal(filled.stats.AC, 13, 'AC derives from DEX when none is stored');
});

test('effectiveStatBlock adds the worn armor bonus and every active modifier', () => {
  const bare = createCreature('a', 'Bram', { stats: { AC: 13 } });
  assert.equal(effectiveStatBlock(bare).AC, 13);
  const armored = createCreature('b', 'Guard', {
    stats: { AC: 13 },
    armor: { name: 'Shield', acBonus: 2 },
  });
  assert.equal(effectiveStatBlock(armored).AC, 15);
  assert.equal(armored.stats.AC, 13, 'the stored block is untouched');
  const buffed = addStatModifier(armored, 'AC', 3, 2);
  assert.equal(effectiveStatBlock(buffed).AC, 18);
});

test('stat modifiers stack per stat and tick down one round at a time', () => {
  const base = createCreature('c1', 'Ogre', { stats: { STR: 16 } });
  const once = addStatModifier(base, 'STR', 2, 2);
  const twice = addStatModifier(once, 'STR', 1, 1);
  assert.equal(effectiveStatBlock(twice).STR, 19);
  const afterOne = { ...twice, statMods: tickStatModifiers(twice.statMods) };
  assert.equal(effectiveStatBlock(afterOne).STR, 18, 'the one-round modifier drops first');
  const afterTwo = { ...afterOne, statMods: tickStatModifiers(afterOne.statMods) };
  assert.equal(effectiveStatBlock(afterTwo).STR, 16);
});

test('addStatModifier ignores a zero delta and a zero duration', () => {
  const base = createCreature('c1', 'Ogre');
  assert.equal(addStatModifier(base, 'STR', 0, 3), base);
  assert.equal(addStatModifier(base, 'STR', 2, 0), base);
});

test('editCreature keeps live state and clamps current HP to the new maximum', () => {
  const creature = createCreature('c1', 'Guard', { maxHP: 20, disposition: 'hostile' });
  const hurt = applyDamage(creature, 5);
  const edited = editCreature(hurt, {
    name: 'Veteran Guard',
    disposition: 'hostile',
    maxHP: 12,
    location: null,
  });
  assert.equal(edited.name, 'Veteran Guard');
  assert.equal(edited.maxHP, 12);
  assert.equal(edited.currentHP, 12, 'current HP clamps down to the new maximum');
  const lightEdit = editCreature(hurt, {
    name: 'Guard',
    disposition: 'hostile',
    maxHP: 20,
    location: null,
  });
  assert.equal(lightEdit.currentHP, 15, 'current HP survives an unrelated edit');
});

test('editCreature clears met only when the creature moves', () => {
  const spot = { nodeId: 'n1', tileId: '2,3' };
  const creature = { ...createCreature('c1', 'Bram', { location: spot }), met: true };
  const stay = editCreature(creature, {
    name: 'Bram',
    disposition: 'neutral',
    maxHP: 4,
    location: { ...spot },
  });
  assert.equal(stay.met, true);
  const moved = editCreature(creature, {
    name: 'Bram',
    disposition: 'neutral',
    maxHP: 4,
    location: { nodeId: 'n1', tileId: '4,4' },
  });
  assert.equal(moved.met, false);
});

test('editCreature removes the level and the tier when the edit has no level', () => {
  const foe = createCreature('c1', 'Bandit', { level: 3, tier: 'legend' });
  const retired = editCreature(foe, {
    name: 'Bandit',
    disposition: 'neutral',
    maxHP: foe.maxHP,
    location: null,
  });
  assert.equal('level' in retired, false);
  assert.equal('tier' in retired, false);
  assert.equal(retired.weapon.name, 'Longsword', 'the stored gear stays');
});

test('editCreature keeps spent slots when the caster class and level are unchanged', () => {
  const caster = createCreature('c1', 'Acolyte', { maxHP: 20, level: 3, class: 'cleric' });
  const spent = {
    ...caster,
    resources: caster.resources.map((r) => (slotLevelOf(r) === 1 ? { ...r, current: 0 } : r)),
  };
  const edited = editCreature(spent, {
    name: 'Acolyte',
    disposition: 'neutral',
    maxHP: 20,
    level: 3,
    tier: 'mob',
    location: null,
    class: 'cleric',
    casterLevel: 3,
    subclass: 'life',
  });
  assert.equal(edited.subclass, 'life');
  const l1 = edited.resources.find((r) => slotLevelOf(r) === 1);
  assert.equal(l1.current, 0, 'spent slot survives an unrelated edit');
});

test('editCreature rebuilds slot pools when the caster level changes', () => {
  const caster = createCreature('c1', 'Acolyte', { maxHP: 20, level: 3, class: 'cleric' });
  const spent = {
    ...caster,
    resources: caster.resources.map((r) => (slotLevelOf(r) === 1 ? { ...r, current: 0 } : r)),
  };
  const edited = editCreature(spent, {
    name: 'Acolyte',
    disposition: 'neutral',
    maxHP: 20,
    level: 5,
    tier: 'mob',
    location: null,
    class: 'cleric',
    casterLevel: 5,
  });
  assert.equal(edited.casterLevel, 5);
  const l1 = edited.resources.find((r) => slotLevelOf(r) === 1);
  assert.ok(l1.current > 0, 'the rebuilt pool is full');
});

test('editCreature strips the spell fields when the edit drops the caster class', () => {
  const caster = createCreature('c1', 'Acolyte', { maxHP: 20, level: 3, class: 'cleric' });
  const edited = editCreature(caster, {
    name: 'Acolyte',
    disposition: 'neutral',
    maxHP: 20,
    level: 3,
    tier: 'mob',
    location: null,
  });
  assert.equal('casterLevel' in edited, false);
  assert.equal('spellbook' in edited, false);
  assert.deepEqual(
    (edited.resources ?? []).filter((r) => slotLevelOf(r) !== null),
    [],
  );
});

test('damage and heal clamp to the [0, maxHP] range, and 0 HP is defeat', () => {
  const creature = createCreature('c1', 'Guard', { maxHP: 10 });
  const hurt = applyDamage(creature, 4);
  assert.equal(hurt.currentHP, 6);
  assert.equal(isDefeated(hurt), false);
  const down = applyDamage(hurt, 99);
  assert.equal(down.currentHP, 0);
  assert.equal(isDefeated(down), true);
  const back = heal(down, 99);
  assert.equal(back.currentHP, 10);
});

test('toTemplate captures the blueprint, not the live state', () => {
  const spot = { nodeId: 'n1', tileId: '2,3' };
  const foe = createCreature('c1', 'Bandit', {
    disposition: 'hostile',
    maxHP: 11,
    level: 2,
    location: spot,
  });
  const live = { ...applyDamage(foe, 5), met: true, conditions: [{ name: 'Prone', rounds: 1 }] };
  const template = toTemplate('t1', live);
  assert.deepEqual(template, {
    id: 't1',
    name: 'Bandit',
    disposition: 'hostile',
    maxHP: 11,
    stats: fullBlock(),
    level: 2,
    tier: 'mob',
    weapon: foe.weapon,
    armor: foe.armor,
  });
});

test('fromTemplate spawns at full health and copies gear and spellbook', () => {
  const template = toTemplate(
    't1',
    createCreature('c1', 'Acolyte', {
      disposition: 'hostile',
      maxHP: 9,
      level: 3,
      class: 'cleric',
      spellbook: { cantrips: ['sacred-flame'], known: ['bless'], prepared: [] },
    }),
  );
  const spawn = fromTemplate(template, 'e9', { nodeId: 'n1', tileId: '0,0' });
  assert.equal(spawn.currentHP, 9);
  assert.deepEqual(spawn.location, { nodeId: 'n1', tileId: '0,0' });
  assert.notEqual(spawn.weapon, template.weapon, 'the weapon is a copy, not an alias');
  assert.deepEqual(spawn.weapon, template.weapon);
  assert.notEqual(spawn.spellbook, template.spellbook);
  assert.deepEqual(spawn.spellbook.known, ['bless']);
});

test('fromTemplate keeps an explicit null and stamps a default only with a level', () => {
  const unarmed = fromTemplate(
    /** @type {any} */ ({ id: 't1', name: 'Wolf', maxHP: 11, level: 1, weapon: null, armor: null }),
    'c1',
  );
  assert.equal(unarmed.weapon, null);
  assert.equal(unarmed.armor, null);
  const leveled = fromTemplate(
    /** @type {any} */ ({ id: 't2', name: 'Bandit', maxHP: 11, level: 1 }),
    'c2',
  );
  assert.equal(leveled.weapon.name, 'Shortsword');
  const townsfolk = fromTemplate(
    /** @type {any} */ ({ id: 't3', name: 'Innkeeper', maxHP: 4, disposition: 'neutral' }),
    'c3',
  );
  assert.equal(townsfolk.weapon, null);
});

test('fromTemplate reads the older template shapes', () => {
  const oldFoe = /** @type {any} */ ({
    id: 't1',
    name: 'Goblin',
    maxHP: 7,
    statBlock: { DEX: 14 },
    level: 1,
    tier: 'mob',
  });
  const spawn = fromTemplate(oldFoe, 'c1');
  assert.equal(spawn.stats.DEX, 14, 'a statBlock field reads as stats');
  assert.equal(spawn.disposition, 'hostile', 'a template without a disposition is a foe');
  const oldPerson = /** @type {any} */ ({
    name: 'Innkeeper',
    disposition: 'friendly',
    role: 'Innkeeper',
    stats: { CHA: 14 },
  });
  const person = fromTemplate(oldPerson, 'c2');
  assert.equal(person.disposition, 'friendly');
  assert.equal(person.maxHP, DEFAULT_CREATURE_HP);
  assert.equal(person.role, 'Innkeeper');
  assert.equal(person.weapon, null);
});

test('defaultEnemyGear picks the loadout by tier and level band and returns copies', () => {
  assert.equal(defaultEnemyGear(1, 'mob').weapon.name, 'Shortsword');
  assert.equal(defaultEnemyGear(5, 'mob').weapon.name, 'Longsword');
  assert.equal(defaultEnemyGear(1, 'legend').armor.name, 'Chain Mail');
  assert.equal(defaultEnemyGear(9, 'legend').armor.name, 'Plate');
  assert.equal(defaultEnemyGear(0.5, 'mob').weapon.name, 'Shortsword', 'level floors to 1');
  const a = defaultEnemyGear(1, 'mob');
  const b = defaultEnemyGear(1, 'mob');
  assert.notEqual(a.weapon, b.weapon, 'every call hands out a fresh copy');
});
