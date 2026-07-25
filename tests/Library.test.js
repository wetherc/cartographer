import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultEquipmentTemplates,
  DEFAULT_BESTIARY,
  DEFAULT_NPC_TEMPLATES,
  emptyLibrary,
  isLibraryEmpty,
  equipmentKey,
  nameKey,
  mergedEntries,
  upsertEntry,
  removeEntry,
  normalizeLibrary,
  setActiveLibrary,
  getActiveLibrary,
  activeEquipment,
  activeWeapons,
  activeArmors,
  activeEnemyArmor,
  activeBestiary,
  activeNPCEntries,
} from '../src/library/Library.js';

test('defaultEquipmentTemplates covers every built-in preset list', () => {
  const defaults = defaultEquipmentTemplates();
  const types = new Set(defaults.map((e) => e.type));
  for (const type of ['weapon', 'bow', 'armor', 'gear', 'consumable']) {
    assert.ok(types.has(type), `missing ${type} templates`);
  }
  const longsword = defaults.find((e) => e.name === 'Longsword');
  assert.equal(longsword?.handling, 'melee');
  assert.deepEqual(longsword?.damage, [{ count: 1, sides: 8, damageType: 'slashing' }]);
  const plate = defaults.find((e) => e.name === 'Plate');
  assert.equal(plate?.baseAC, 18);
});

test('equipmentKey matches on type and case-insensitive name; nameKey on name alone', () => {
  assert.equal(
    equipmentKey({ name: ' Dagger ', type: 'weapon' }),
    equipmentKey({ name: 'dagger', type: 'weapon' }),
  );
  assert.notEqual(
    equipmentKey({ name: 'Dagger', type: 'weapon' }),
    equipmentKey({ name: 'Dagger', type: 'gear' }),
  );
  assert.equal(nameKey({ name: 'Goblin ' }), nameKey({ name: 'goblin' }));
});

test('mergedEntries overrides defaults in place and appends new customs', () => {
  const defaults = [
    { name: 'A', value: 1 },
    { name: 'B', value: 2 },
  ];
  const customs = [
    { name: 'C', value: 30 },
    { name: 'B', value: 20 },
  ];
  const merged = mergedEntries(defaults, customs, nameKey);
  assert.deepEqual(merged, [
    { entry: { name: 'A', value: 1 }, source: 'default' },
    { entry: { name: 'B', value: 20 }, source: 'override' },
    { entry: { name: 'C', value: 30 }, source: 'custom' },
  ]);
});

test('upsertEntry replaces by key or appends; removeEntry drops by key', () => {
  const customs = [{ name: 'Goblin', maxHP: 7 }];
  const replaced = upsertEntry(customs, { name: 'goblin', maxHP: 9 }, nameKey);
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].maxHP, 9);
  const appended = upsertEntry(customs, { name: 'Orc', maxHP: 15 }, nameKey);
  assert.equal(appended.length, 2);
  assert.deepEqual(removeEntry(appended, 'goblin', nameKey), [{ name: 'Orc', maxHP: 15 }]);
});

test('normalizeLibrary turns garbage into an empty library', () => {
  assert.deepEqual(normalizeLibrary(null), emptyLibrary());
  assert.deepEqual(normalizeLibrary('nope'), emptyLibrary());
  assert.deepEqual(normalizeLibrary({ equipment: 'nope', bestiary: 7 }), emptyLibrary());
  assert.ok(isLibraryEmpty(normalizeLibrary({})));
});

test('normalizeLibrary drops invalid entries and repairs the valid ones', () => {
  const lib = normalizeLibrary({
    equipment: [
      { name: 'Flame Blade', type: 'weapon', damage: [{ count: 1, sides: 8, damageType: 'fire' }] },
      { name: 'No Type' },
      { type: 'gear' },
    ],
    bestiary: [
      { name: 'Slime', maxHP: -3, level: 0, tier: 'boss', statBlock: { STR: 4, Speed: 20 } },
    ],
    npcs: [{ name: 'Mayor', disposition: 'imperious' }, { role: 'nameless' }],
  });
  assert.equal(lib.equipment.length, 1);
  assert.equal(lib.equipment[0].name, 'Flame Blade');
  assert.equal(lib.bestiary.length, 1);
  const slime = lib.bestiary[0];
  assert.equal(slime.id, 'slime');
  assert.equal(slime.maxHP, 1);
  assert.equal(slime.level, 1);
  assert.equal(slime.tier, 'mob');
  assert.equal(slime.statBlock.STR, 4);
  assert.equal(slime.statBlock.AC, 10, 'stat block closes over the fixed stat set');
  assert.equal('Speed' in slime.statBlock, false);
  assert.deepEqual(lib.npcs, [
    { name: 'Mayor', role: '', disposition: 'neutral', notes: '', stats: {} },
  ]);
});

test('normalizeLibrary keeps explicit null gear (deliberately unarmed) but not absent gear', () => {
  const lib = normalizeLibrary({
    bestiary: [
      { name: 'Ooze', weapon: null, armor: null },
      { name: 'Guard' },
      { name: 'Broken', weapon: 'sword' },
    ],
  });
  assert.equal(lib.bestiary[0].weapon, null);
  assert.equal(lib.bestiary[0].armor, null);
  assert.equal('weapon' in lib.bestiary[1], false);
  assert.equal('weapon' in lib.bestiary[2], false, 'non-object gear drops');
});

test('the active registry merges customs into every getter', () => {
  setActiveLibrary({
    equipment: [
      // Overrides the built-in weapon of the same name...
      {
        name: 'Longsword',
        type: 'weapon',
        handling: 'melee',
        damage: [{ count: 1, sides: 10, damageType: 'slashing' }],
      },
      // ...and adds a new armor.
      { name: 'Dragonhide', type: 'armor', armorWeight: 'medium', baseAC: 15 },
    ],
    bestiary: [{ ...DEFAULT_BESTIARY[0], name: 'Hobgoblin', id: 'hobgoblin' }],
    npcs: [{ name: 'Innkeeper', role: 'Spy', disposition: 'hostile', notes: '', stats: {} }],
  });
  try {
    const longsword = activeWeapons().find((w) => w.name === 'Longsword');
    assert.equal(longsword?.damage?.[0].sides, 10, 'override shadows the built-in preset');
    assert.equal(
      activeWeapons().filter((w) => w.name === 'Longsword').length,
      1,
      'no duplicate for an overridden name',
    );
    assert.deepEqual(activeEnemyArmor('Dragonhide'), { name: 'Dragonhide', acBonus: 5 });
    assert.ok(
      activeArmors().some((a) => a.name === 'Plate'),
      'defaults stay offered',
    );
    assert.ok(activeEquipment('armor').some((e) => e.name === 'Dragonhide'));
    assert.ok(activeBestiary().some((t) => t.name === 'Hobgoblin'));
    assert.ok(
      activeBestiary().some((t) => t.name === 'Goblin'),
      'built-in bestiary stays',
    );
    const innkeeper = activeNPCEntries().find((e) => e.entry.name === 'Innkeeper');
    assert.equal(innkeeper?.source, 'override');
    assert.equal(innkeeper?.entry.role, 'Spy');
    assert.equal(activeNPCEntries().length, DEFAULT_NPC_TEMPLATES.length);
  } finally {
    setActiveLibrary(emptyLibrary());
  }
});

test('getActiveLibrary reflects the library last set, empty by default', () => {
  assert.deepEqual(getActiveLibrary(), emptyLibrary());
  const custom = { ...emptyLibrary(), equipment: [{ name: 'Rope', type: 'gear' }] };
  try {
    setActiveLibrary(custom);
    assert.equal(getActiveLibrary(), custom);
  } finally {
    setActiveLibrary(emptyLibrary());
  }
});

test('with no customizations the active getters return the pure defaults', () => {
  setActiveLibrary(emptyLibrary());
  assert.equal(activeEquipment().length, defaultEquipmentTemplates().length);
  assert.equal(activeBestiary().length, DEFAULT_BESTIARY.length);
  assert.equal(activeEnemyArmor('Nonesuch'), null);
  assert.deepEqual(activeEnemyArmor('Leather Armor'), { name: 'Leather Armor', acBonus: 1 });
});
