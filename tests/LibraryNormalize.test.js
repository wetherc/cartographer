import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultEquipmentTemplates,
  emptyLibrary,
  isLibraryEmpty,
} from '../src/library/LibraryMerge.js';
import { normalizeLibrary } from '../src/library/LibraryNormalize.js';
import { DEFAULT_CREATURES } from '../src/data/creatures.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { DEFAULT_FEATS } from '../src/data/feats.js';
import { crXP } from '../src/data/challenge.js';
import { normalizeCreatureProficiencies } from '../src/entities/Proficiencies.js';
import { getClass, spellSaveDC } from '../src/entities/Classes.js';
import { fromTemplate } from '../src/entities/CreatureTemplate.js';
import { isCaster, toCaster } from '../src/entities/Caster.js';
import { getSlotPools, slotLevelOf } from '../src/entities/SpellSlots.js';

test('normalizeLibrary keeps a supplied id, valid tier, and an armor object', () => {
  const lib = normalizeLibrary({
    creatures: [
      {
        name: 'Wyvern',
        id: 'wyvern-alpha',
        disposition: 'hostile',
        level: 4,
        tier: 'legend',
        armor: { name: 'Scales', acBonus: 3 },
      },
    ],
  });
  const wyvern = lib.creatures[0];
  assert.equal(wyvern.id, 'wyvern-alpha', 'a present string id is kept, not sluggified');
  assert.equal(wyvern.tier, 'legend', 'a valid tier survives');
  assert.deepEqual(
    wyvern.armor,
    { name: 'Scales', baseAC: 13, armorWeight: 'light' },
    'an armor object with a flat bonus reads as a light base AC',
  );
});

test('normalizeLibrary reads a written challenge rating and drops a bad one', () => {
  const lib = normalizeLibrary({
    creatures: [
      { name: 'Wyvern', cr: 6 },
      { name: 'Kobold', cr: '1/8' },
      { name: 'Thing', cr: 'deadly' },
      { name: 'Commoner' },
    ],
  });
  const byName = Object.fromEntries(lib.creatures.map((c) => [c.name, c]));
  assert.equal(byName.Wyvern.cr, 6);
  assert.equal(byName.Kobold.cr, 0.125, 'a fraction reads as its number');
  assert.equal('cr' in byName.Thing, false);
  assert.equal('cr' in byName.Commoner, false);
});

test('the built-in foes all carry a rating and the townsfolk carry none', () => {
  for (const entry of DEFAULT_CREATURES) {
    const rated = entry.cr !== undefined;
    assert.equal(rated, entry.disposition === 'hostile', `${entry.name} is rated wrongly`);
    if (rated) assert.ok(crXP(entry.cr) > 0, `${entry.name} has an unknown rating`);
  }
});

test('normalizeLibrary keeps a creature proficiency list and drops unknown entries', () => {
  const lib = normalizeLibrary({
    creatures: [
      { name: 'Wyvern', proficiencies: { saves: ['DEX', 'luck'], skills: ['perception'] } },
      { name: 'Thing', proficiencies: 'all' },
      { name: 'Commoner' },
    ],
  });
  const byName = Object.fromEntries(lib.creatures.map((c) => [c.name, c]));
  assert.deepEqual(byName.Wyvern.proficiencies, { saves: ['DEX'], skills: ['perception'] });
  assert.equal('proficiencies' in byName.Thing, false);
  assert.equal('proficiencies' in byName.Commoner, false);
});

test('every built-in proficiency list names a real ability and a real skill', () => {
  for (const entry of DEFAULT_CREATURES) {
    if (!entry.proficiencies) continue;
    assert.deepEqual(
      normalizeCreatureProficiencies(entry.proficiencies),
      entry.proficiencies,
      `${entry.name} names something the app cannot roll`,
    );
  }
});

test('every built-in caster names a real class and spells the catalog holds', () => {
  const spellIds = new Set(DEFAULT_SPELLS.map((s) => s.id));
  for (const entry of DEFAULT_CREATURES) {
    if (!entry.class) continue;
    assert.ok(getClass(entry.class), `${entry.name} names an unknown class`);
    assert.ok(entry.casterLevel !== undefined, `${entry.name} has no caster level`);
    assert.ok(entry.spellbook, `${entry.name} casts from no book`);
    for (const list of ['cantrips', 'known', 'prepared']) {
      for (const id of entry.spellbook[list] ?? []) {
        assert.ok(spellIds.has(id), `${entry.name} carries unknown spell ${id}`);
      }
    }
  }
});

test('a spawned Mage carries wizard-9 slot pools and a castable book', () => {
  const template = DEFAULT_CREATURES.find((c) => c.id === 'mage');
  assert.ok(template);
  const mage = fromTemplate(template, 'm1');
  const pools = getSlotPools(mage).map((p) => [slotLevelOf(p), p.max]);
  assert.deepEqual(pools, [
    [1, 4],
    [2, 3],
    [3, 3],
    [4, 3],
    [5, 1],
  ]);
  assert.equal(isCaster(mage), true);
  assert.equal(spellSaveDC(toCaster(mage)), 14, 'the rating ladder gives prof +3');
});

test('normalizeLibrary reads a pre-merge file: bestiary is hostile, statBlock is stats', () => {
  const lib = normalizeLibrary({
    bestiary: [
      {
        id: 'wyvern',
        name: 'Wyvern',
        maxHP: 30,
        level: 4,
        tier: 'legend',
        statBlock: { STR: 19, AC: 13 },
        weapon: null,
      },
    ],
    npcs: [
      {
        name: 'Smith',
        role: 'Blacksmith',
        disposition: 'friendly',
        notes: 'Forges blades and gossip alike.',
        stats: { STR: 15 },
        maxHP: 11,
        weapon: { name: 'Hammer', damage: [{ count: 1, sides: 6, damageType: 'bludgeoning' }] },
        armor: { name: 'Apron', acBonus: 1 },
      },
    ],
  });
  assert.equal(lib.creatures.length, 2);
  const [wyvern, smith] = lib.creatures;
  assert.equal(wyvern.disposition, 'hostile', 'a bestiary entry reads as hostile');
  assert.equal(wyvern.stats.STR, 19, 'statBlock reads as stats');
  assert.equal(wyvern.stats.AC, 13);
  assert.deepEqual(wyvern.weapons, [], 'explicit null gear survives');
  assert.ok(wyvern.armor, 'absent gear on a leveled entry takes the level default');
  assert.equal(smith.id, 'smith', 'an old NPC entry gains an id');
  assert.equal(smith.disposition, 'friendly');
  assert.equal(smith.role, 'Blacksmith');
  assert.equal(smith.maxHP, 11);
  assert.equal(smith.stats.STR, 15);
  assert.deepEqual(
    smith.weapons[0],
    {
      name: 'Hammer',
      kind: 'melee',
      category: 'simple',
      properties: [],
      range: null,
      versatileDamage: [],
      damage: [{ count: 1, sides: 6, damageType: 'bludgeoning' }],
    },
    'a creature weapon coerces to the property model on the way in',
  );
});

test('normalizeLibrary dedupes one name across the three creature source lists', () => {
  const lib = normalizeLibrary({
    creatures: [{ name: 'Twin', disposition: 'neutral', notes: 'current' }],
    bestiary: [{ name: 'Twin', notes: 'old foe' }],
    npcs: [{ name: 'twin', notes: 'old npc' }],
  });
  assert.equal(lib.creatures.length, 1);
  assert.equal(lib.creatures[0].notes, 'old npc', 'the last entry with the key wins');
});

test('normalizeLibrary repairs hit points and gear it cannot use', () => {
  const lib = normalizeLibrary({
    creatures: [
      { name: 'Cooper' },
      { name: 'Ooze', maxHP: 'plenty', weapon: null, armor: null },
      { name: 'Dregs', maxHP: -4, weapon: 'club' },
      { name: 'Sturdy', maxHP: '9.7' },
      { name: 'Brute', level: 2, tier: 'mob' },
    ],
  });
  const [cooper, ooze, dregs, sturdy, brute] = lib.creatures;
  assert.equal(cooper.maxHP, 4, 'an absent maximum takes the commoner default');
  assert.deepEqual(cooper.weapons, [], 'absent gear on an unleveled entry reads as none');
  assert.equal(cooper.armor, null);
  assert.equal(ooze.maxHP, 4, 'text is not a maximum');
  assert.deepEqual(ooze.weapons, [], 'a null weapon means deliberately unarmed');
  assert.equal(ooze.armor, null);
  assert.equal(dregs.maxHP, 1, 'a negative maximum clamps to one');
  assert.deepEqual(dregs.weapons, [], 'non-object gear drops to none');
  assert.equal(sturdy.maxHP, 9, 'a numeric string floors to an integer');
  assert.equal(brute.weapons[0]?.name, 'Shortsword', 'a leveled entry takes the level default');
  assert.equal(brute.armor?.name, 'Leather Armor');
});

test('normalizeLibrary turns garbage into an empty library', () => {
  assert.deepEqual(normalizeLibrary(null), emptyLibrary());
  assert.deepEqual(normalizeLibrary('nope'), emptyLibrary());
  assert.deepEqual(normalizeLibrary({ equipment: 'nope', bestiary: 7 }), emptyLibrary());
  assert.ok(isLibraryEmpty(normalizeLibrary({})));
});

test('normalizeLibrary keeps one entry per merge key, the last one winning', () => {
  const lib = normalizeLibrary({
    equipment: [
      { name: 'Dagger', type: 'weapon', notes: 'first' },
      { name: 'Dagger', type: 'gear', notes: 'other type, kept' },
      { name: ' dagger ', type: 'weapon', notes: 'last' },
    ],
    creatures: [
      { name: 'Slime', maxHP: 5 },
      { name: 'SLIME', maxHP: 9 },
    ],
    spells: [
      { name: 'Spark', level: 1 },
      { name: 'Spark', level: 3 },
    ],
  });
  assert.deepEqual(
    lib.equipment.map((e) => `${e.type}:${e.name}`),
    ['weapon:dagger', 'gear:Dagger'],
    'the surviving duplicate keeps the key position of the first',
  );
  assert.equal(lib.creatures.length, 1);
  assert.equal(lib.creatures[0].maxHP, 9);
  assert.equal(lib.creatures[0].id, 'slime', 'the dropped duplicate claims no slug');
  assert.equal(lib.spells.length, 1);
  assert.equal(lib.spells[0].level, 3);
  assert.equal(lib.spells[0].id, 'spark');
});

test('normalizeLibrary drops invalid entries and repairs the valid ones', () => {
  const lib = normalizeLibrary({
    equipment: [
      { name: 'Flame Blade', type: 'weapon', damage: [{ count: 1, sides: 8, damageType: 'fire' }] },
      { name: 'No Type' },
      { type: 'gear' },
    ],
    creatures: [
      {
        name: 'Slime',
        disposition: 'imperious',
        maxHP: -3,
        level: 0,
        tier: 'boss',
        stats: { STR: 4, Speed: 20 },
      },
      { role: 'nameless' },
    ],
  });
  assert.equal(lib.equipment.length, 1);
  assert.equal(lib.equipment[0].name, 'Flame Blade');
  assert.equal(lib.creatures.length, 1, 'a nameless entry drops');
  const slime = lib.creatures[0];
  assert.equal(slime.id, 'slime');
  assert.equal(slime.disposition, 'neutral', 'an unknown disposition reads as neutral');
  assert.equal(slime.maxHP, 1);
  assert.equal(slime.level, 1, 'a zero level parses but clamps to one');
  assert.equal(slime.tier, 'mob');
  assert.equal(slime.stats.STR, 4);
  assert.equal(slime.stats.AC, 10, 'stat block closes over the fixed stat set');
  assert.equal('Speed' in slime.stats, false);
});

test('normalizeLibrary keeps explicit null gear and resolves absent gear by level', () => {
  const lib = normalizeLibrary({
    creatures: [
      { name: 'Ooze', level: 1, weapon: null, armor: null },
      { name: 'Guard', level: 6, tier: 'mob' },
      { name: 'Broken', weapon: 'sword' },
    ],
  });
  assert.deepEqual(lib.creatures[0].weapons, [], 'null gear survives on a leveled entry');
  assert.equal(lib.creatures[0].armor, null);
  assert.equal(
    lib.creatures[1].weapons[0]?.name,
    'Longsword',
    'a level-6 mob takes the high loadout',
  );
  assert.equal(lib.creatures[1].armor?.name, 'Chain Shirt');
  assert.deepEqual(
    lib.creatures[2].weapons,
    [],
    'non-object gear on an unleveled entry drops to none',
  );
});

test('normalizeLibrary keeps a repeated save only alongside a condition', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Hold',
        effect: { kind: 'save', saveAbility: 'WIS', condition: 'Paralyzed', saveEnds: true },
      },
      // No condition to end, so the flag has nothing to mean and is dropped.
      { name: 'Scorch', effect: { kind: 'save', saveAbility: 'DEX', saveEnds: true } },
      // An entry written before the field reads as a condition that runs the
      // spell's whole duration.
      { name: 'Bane', effect: { kind: 'save', saveAbility: 'CHA', condition: 'Frightened' } },
    ],
  });
  assert.equal(lib.spells[0].effect.saveEnds, true);
  assert.equal(lib.spells[1].effect.saveEnds, undefined);
  assert.equal(lib.spells[2].effect.saveEnds, undefined);
});

test('normalizeLibrary carries caster fields (subclass, level, spellbook) onto a template', () => {
  const lib = normalizeLibrary({
    creatures: [
      {
        name: 'Cult Priest',
        disposition: 'hostile',
        class: 'cleric',
        subclass: 'death',
        casterLevel: 5,
        spellbook: { cantrips: ['sacred-flame'], known: ['cure-wounds', 7], prepared: 'nope' },
      },
    ],
  });
  const priest = lib.creatures[0];
  assert.equal(priest.class, 'cleric');
  assert.equal(priest.subclass, 'death');
  assert.equal(priest.casterLevel, 5);
  assert.deepEqual(priest.spellbook.cantrips, ['sacred-flame']);
  assert.deepEqual(priest.spellbook.known, ['cure-wounds'], 'non-string ids drop');
  assert.deepEqual(priest.spellbook.prepared, [], 'a non-array list reads empty');
});

test('the built-in catalogs are frozen, so a consumer cannot edit shared data', () => {
  for (const catalog of [
    defaultEquipmentTemplates(),
    DEFAULT_CREATURES,
    DEFAULT_SPELLS,
    DEFAULT_FEATS,
  ]) {
    assert.ok(Object.isFrozen(catalog), 'the list itself');
    assert.ok(Object.isFrozen(catalog[0]), 'and its entries');
  }
  // Same list object per call: assembled once rather than copied per caller.
  assert.equal(defaultEquipmentTemplates(), defaultEquipmentTemplates());
});

test('normalizeLibrary drops a summon stamp from a creature template', () => {
  const lib = normalizeLibrary({
    creatures: [
      {
        name: 'Wolf',
        disposition: 'hostile',
        maxHP: 11,
        summonedBy: { spellId: 'conjure', spellName: 'Conjure', casterId: 'druid' },
      },
    ],
  });
  // The stamp belongs to one spawned creature. A blueprint has no cast behind it.
  assert.equal(/** @type {any} */ (lib.creatures[0]).summonedBy, undefined);
});

test('normalizeLibrary keeps only a true magical flag on a weapon template', () => {
  const lib = normalizeLibrary({
    equipment: [
      { name: 'Frost Brand', type: 'weapon', kind: 'melee', magical: true, damage: [] },
      { name: 'Fake Brand', type: 'weapon', kind: 'melee', magical: 'yes', damage: [] },
    ],
  });
  const byName = Object.fromEntries(lib.equipment.map((e) => [e.name, e]));
  assert.equal(byName['Frost Brand'].magical, true);
  assert.equal('magical' in byName['Fake Brand'], false);
});

test('normalizeLibrary reads a weapon list and coerces each entry', () => {
  const lib = normalizeLibrary({
    creatures: [
      {
        name: 'Owlbear',
        weapons: [
          {
            name: 'Beak',
            kind: 'melee',
            damage: [{ count: 1, sides: 10, damageType: 'piercing' }],
          },
          'claw',
          {
            name: 'Claws',
            kind: 'melee',
            damage: [{ count: 2, sides: 8, damageType: 'slashing' }],
          },
        ],
      },
    ],
  });
  assert.deepEqual(
    lib.creatures[0].weapons.map((w) => w.name),
    ['Beak', 'Claws'],
  );
});

test('normalizeLibrary repairs random tables and keeps one per name', () => {
  const library = normalizeLibrary({
    tables: [
      { name: 'Weather', rows: [{ weight: 2, text: 'Rain' }] },
      { name: ' weather ', rows: [{ text: 'Sun' }] },
      { name: 'Broken', rows: [] },
      'nope',
    ],
  });
  assert.deepEqual(library.tables, [{ name: 'weather', rows: [{ weight: 1, text: 'Sun' }] }]);
});

test('an equipment price above zero loads rounded to copper, and any other drops', () => {
  const lib = normalizeLibrary({
    equipment: [
      { name: 'Lute', type: 'gear', cost: 35 },
      { name: 'Chalk', type: 'gear', cost: '0.011' },
      { name: 'Junk', type: 'gear', cost: 'lots' },
      { name: 'Debt', type: 'gear', cost: -4 },
    ],
  });
  assert.deepEqual(
    lib.equipment.map((e) => e.cost),
    [35, 0.01, undefined, undefined],
  );
  assert.equal(Object.hasOwn(lib.equipment[2], 'cost'), false);
});
