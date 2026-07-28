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
  storedEntryId,
  normalizeLibrary,
  setActiveLibrary,
  getActiveLibrary,
  activeEquipment,
  activeWeapons,
  activeArmors,
  activeEnemyArmor,
  activeBestiary,
  activeBestiaryEntries,
  activeEquipmentEntries,
  activeNPCEntries,
  activeSpells,
  activeSpellEntries,
  activeSpellIndex,
  resolveSpellIds,
} from '../src/library/Library.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

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

test('upsertEntry replacing one of several entries leaves the others in place', () => {
  const customs = [
    { name: 'A', v: 1 },
    { name: 'B', v: 2 },
    { name: 'C', v: 3 },
  ];
  const replaced = upsertEntry(customs, { name: 'b', v: 20 }, nameKey);
  assert.deepEqual(replaced, [
    { name: 'A', v: 1 },
    { name: 'b', v: 20 },
    { name: 'C', v: 3 },
  ]);
});

test('storedEntryId keeps a custom entry id across a rename', () => {
  const found = { entry: { id: 'ember-dart', name: 'Ember Dart' }, source: 'custom' };
  const takenIds = () => ['ember-dart'];
  // Unchanged name, and the rename case campaign references depend on.
  assert.equal(
    storedEntryId({ found, target: found, renamed: false, newKey: 'ember dart', takenIds }),
    'ember-dart',
  );
  assert.equal(
    storedEntryId({ found, target: null, renamed: true, newKey: 'cinder dart', takenIds }),
    'ember-dart',
  );
});

test('storedEntryId gives a renamed default or override a fresh id', () => {
  const takenIds = () => ['fire-bolt', 'ember-dart'];
  for (const source of ['default', 'override']) {
    const found = { entry: { id: 'fire-bolt', name: 'Fire Bolt' }, source };
    // Editing in place stores the override under the default's own id.
    assert.equal(
      storedEntryId({ found, target: found, renamed: false, newKey: 'fire bolt', takenIds }),
      'fire-bolt',
    );
    // Renaming must not keep it: the built-in keeps that id and resurfaces.
    assert.equal(
      storedEntryId({ found, target: null, renamed: true, newKey: 'cinder bolt', takenIds }),
      'cinder-bolt',
    );
  }
});

test('storedEntryId adopts the id of the entry a submitted name overrides', () => {
  const takenIds = () => ['fire-bolt'];
  const target = { entry: { id: 'fire-bolt', name: 'Fire Bolt' }, source: 'default' };
  // A new entry named after a built-in overrides it, so it must carry that id
  // or the two share a name key while campaign references resolve to neither.
  assert.equal(
    storedEntryId({ found: null, target, renamed: true, newKey: 'fire bolt', takenIds }),
    'fire-bolt',
  );
  // Same for a default renamed onto another default's name.
  const found = { entry: { id: 'bless', name: 'Bless' }, source: 'default' };
  assert.equal(
    storedEntryId({ found, target, renamed: true, newKey: 'fire bolt', takenIds }),
    'fire-bolt',
  );
});

test('storedEntryId slugs a new entry away from the taken ids', () => {
  const args = { found: null, target: null, renamed: true, newKey: 'ember dart' };
  assert.equal(storedEntryId({ ...args, takenIds: () => [] }), 'ember-dart');
  assert.equal(storedEntryId({ ...args, takenIds: () => ['ember-dart'] }), 'ember-dart-2');
});

test('normalizeLibrary keeps a supplied id, valid tier, and an armor object', () => {
  const lib = normalizeLibrary({
    bestiary: [
      {
        name: 'Wyvern',
        id: 'wyvern-alpha',
        tier: 'legend',
        armor: { name: 'Scales', acBonus: 3 },
      },
    ],
  });
  const wyvern = lib.bestiary[0];
  assert.equal(wyvern.id, 'wyvern-alpha', 'a present string id is kept, not sluggified');
  assert.equal(wyvern.tier, 'legend', 'a valid tier survives');
  assert.deepEqual(wyvern.armor, { name: 'Scales', acBonus: 3 }, 'an armor object is kept');
});

test('normalizeLibrary keeps a fully-specified NPC verbatim', () => {
  const lib = normalizeLibrary({
    npcs: [
      {
        name: 'Smith',
        role: 'Blacksmith',
        disposition: 'friendly',
        notes: 'Forges blades and gossip alike.',
        stats: { STR: 15 },
      },
    ],
  });
  assert.deepEqual(lib.npcs, [
    {
      name: 'Smith',
      role: 'Blacksmith',
      disposition: 'friendly',
      notes: 'Forges blades and gossip alike.',
      stats: { STR: 15 },
    },
  ]);
});

test('activeWeapons excludes a weapon-typed template that carries no damage', () => {
  try {
    setActiveLibrary({
      ...emptyLibrary(),
      equipment: [{ name: 'Broken Hilt', type: 'weapon' }],
    });
    assert.equal(
      activeWeapons().some((w) => w.name === 'Broken Hilt'),
      false,
      'a damage-less weapon is not offered as an enemy weapon',
    );
  } finally {
    setActiveLibrary(emptyLibrary());
  }
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
    bestiary: [
      { name: 'Slime', maxHP: 5 },
      { name: 'SLIME', maxHP: 9 },
    ],
    npcs: [
      { name: 'Mayor', role: 'first' },
      { name: 'mayor', role: 'last' },
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
  assert.equal(lib.bestiary.length, 1);
  assert.equal(lib.bestiary[0].maxHP, 9);
  assert.equal(lib.bestiary[0].id, 'slime', 'the dropped duplicate claims no slug');
  assert.deepEqual(
    lib.npcs.map((n) => n.role),
    ['last'],
  );
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

test('an empty library carries an empty spells list; isLibraryEmpty counts spells', () => {
  assert.deepEqual(emptyLibrary().spells, []);
  assert.equal(isLibraryEmpty(emptyLibrary()), true);
  assert.equal(isLibraryEmpty({ ...emptyLibrary(), spells: [DEFAULT_SPELLS[0]] }), false);
});

test('normalizeLibrary repairs spells: id, defaults, effect shape, and drops nameless', () => {
  const lib = normalizeLibrary({
    spells: [
      // A minimal save spell with a bogus school/ability and a garbage damage term.
      {
        name: ' Scorch ',
        level: '2',
        school: 'pyromancy',
        effect: {
          kind: 'save',
          saveAbility: 'LUCK',
          damage: [{ count: 0, sides: 7, damageType: 'psychic' }, 'junk'],
          halfOnSave: true,
        },
      },
      // An unknown effect kind collapses to utility.
      { name: 'Mystery', effect: { kind: 'bogus' } },
      // Nameless -> dropped.
      { level: 1 },
    ],
  });
  assert.equal(lib.spells.length, 2);
  const scorch = lib.spells[0];
  assert.equal(scorch.name, 'Scorch');
  assert.equal(scorch.id, 'scorch');
  assert.equal(scorch.level, 2);
  assert.equal(scorch.school, 'abjuration', 'unknown school falls back to the first');
  assert.equal(scorch.effect.kind, 'save');
  assert.equal(scorch.effect.saveAbility, 'DEX', 'unknown ability falls back to DEX');
  assert.deepEqual(
    scorch.effect.damage,
    [{ count: 1, sides: 4, damageType: 'psychic' }],
    'the bad die repairs, the non-object term drops',
  );
  assert.equal(lib.spells[1].effect.kind, 'utility');
  assert.deepEqual(scorch.castingTime, { kind: 'action' }, 'absent timing gets the usual default');
  assert.deepEqual(scorch.duration, { kind: 'instantaneous' });
});

test('normalizeLibrary reads spell timing as either a structured value or printed text', () => {
  const lib = normalizeLibrary({
    spells: [
      // A library written before timing was structured carries the printed text.
      { name: 'Old', castingTime: '10 minutes', duration: 'Concentration, up to 1 minute' },
      { name: 'New', castingTime: { kind: 'bonus' }, duration: { kind: 'rounds', amount: 3 } },
      // Neither the parser nor a GM can classify this, so it survives as text.
      { name: 'Odd', castingTime: 'one long night', duration: 'while the choir sings' },
    ],
  });
  assert.deepEqual(lib.spells[0].castingTime, { kind: 'minutes', amount: 10 });
  assert.deepEqual(lib.spells[0].duration, { kind: 'minutes', amount: 1, upTo: true });
  assert.deepEqual(lib.spells[1].castingTime, { kind: 'bonus' });
  assert.deepEqual(lib.spells[1].duration, { kind: 'rounds', amount: 3 });
  assert.deepEqual(lib.spells[2].castingTime, { kind: 'special', text: 'one long night' });
  assert.deepEqual(lib.spells[2].duration, { kind: 'special', text: 'while the choir sings' });
});

test('normalizeLibrary reads an attack spell’s projectiles and drops an unusable block', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Rays',
        effect: {
          kind: 'attack',
          damage: [{ count: 2, sides: 6, damageType: 'fire' }],
          projectiles: { count: '3', perStep: 1, autoHit: true },
        },
      },
      // Nothing usable written, so the entry stays the single-roll attack every
      // spell authored before projectiles existed is.
      { name: 'Bolt', effect: { kind: 'attack', damage: [], projectiles: { count: 'lots' } } },
      { name: 'Plain', effect: { kind: 'attack', damage: [] } },
    ],
  });
  const [rays, bolt, plain] = lib.spells;
  assert.deepEqual(/** @type {any} */ (rays.effect).projectiles, {
    count: 3,
    perStep: 1,
    autoHit: true,
  });
  assert.equal(/** @type {any} */ (bolt.effect).projectiles, undefined);
  assert.equal(/** @type {any} */ (plain.effect).projectiles, undefined);
});

test('normalizeLibrary types a heal spell’s dice as healing, not as damage', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Mend',
        effect: { kind: 'heal', healing: [{ count: 2, sides: 8, damageType: 'healing' }] },
        scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'healing' }] },
      },
      // Healing is not one of the 13 damage types, so validating it against them
      // used to repair a heal spell into slashing on every edit or import.
      {
        name: 'Botched',
        effect: { kind: 'heal', healing: [{ count: 1, sides: 8, damageType: 'fire' }] },
        scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'fire' }] },
      },
    ],
  });
  const [mend, botched] = lib.spells;
  assert.equal(/** @type {any} */ (mend.effect).healing[0].damageType, 'healing');
  assert.equal(mend.scaling?.damagePerLevel?.[0].damageType, 'healing');
  assert.equal(/** @type {any} */ (botched.effect).healing[0].damageType, 'healing');
  assert.equal(botched.scaling?.damagePerLevel?.[0].damageType, 'healing');
});

test('normalizeLibrary keeps a damage term’s flat bonus, dice or not', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Darts',
        effect: { kind: 'attack', damage: [{ count: 1, sides: 4, damageType: 'force', bonus: 1 }] },
      },
      // A fixed amount with no dice behind it, which only a bonus can express.
      { name: 'Spark', effect: { kind: 'attack', damage: [{ count: 0, bonus: '2' }] } },
      { name: 'Plain', effect: { kind: 'attack', damage: [{ count: 1, sides: 6 }] } },
    ],
  });
  const [darts, spark, plain] = lib.spells;
  assert.equal(/** @type {any} */ (darts.effect).damage[0].bonus, 1);
  assert.deepEqual(/** @type {any} */ (spark.effect).damage[0].count, 0);
  assert.deepEqual(/** @type {any} */ (spark.effect).damage[0].bonus, 2);
  assert.equal(
    'bonus' in /** @type {any} */ (plain.effect).damage[0],
    false,
    'an unbonused term keeps the shape it had before the field existed',
  );
});

test('normalizeLibrary repairs attack/heal effects, save conditions, and scaling', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Bolt',
        effect: { kind: 'attack', damage: [{ count: 2, sides: 6, damageType: 'fire' }] },
        scaling: {
          damagePerLevel: [{ count: 1, sides: 6, damageType: 'fire' }],
          targetsPerLevel: 1,
        },
      },
      {
        name: 'Mend',
        effect: { kind: 'heal', healing: [{ count: 1, sides: 8, damageType: 'none' }] },
      },
      {
        name: 'Hold',
        effect: {
          kind: 'save',
          saveAbility: 'WIS',
          damage: [],
          halfOnSave: false,
          condition: 'paralyzed',
        },
      },
    ],
  });
  const bolt = lib.spells.find((s) => s.name === 'Bolt');
  assert.equal(bolt.effect.kind, 'attack');
  assert.equal(bolt.effect.damage[0].count, 2);
  assert.deepEqual(bolt.scaling.damagePerLevel, [{ count: 1, sides: 6, damageType: 'fire' }]);
  assert.equal(bolt.scaling.targetsPerLevel, 1);
  const mend = lib.spells.find((s) => s.name === 'Mend');
  assert.equal(mend.effect.kind, 'heal');
  assert.equal(mend.effect.healing[0].sides, 8);
  const hold = lib.spells.find((s) => s.name === 'Hold');
  assert.equal(hold.effect.condition, 'paralyzed');
});

test('normalizeLibrary carries caster fields (subclass, level, spellbook) onto a template', () => {
  const lib = normalizeLibrary({
    bestiary: [
      {
        name: 'Cult Priest',
        class: 'cleric',
        subclass: 'death',
        casterLevel: 5,
        spellbook: { cantrips: ['sacred-flame'], known: ['cure-wounds', 7], prepared: 'nope' },
      },
    ],
  });
  const priest = lib.bestiary[0];
  assert.equal(priest.class, 'cleric');
  assert.equal(priest.subclass, 'death');
  assert.equal(priest.casterLevel, 5);
  assert.deepEqual(priest.spellbook.cantrips, ['sacred-flame']);
  assert.deepEqual(priest.spellbook.known, ['cure-wounds'], 'non-string ids drop');
  assert.deepEqual(priest.spellbook.prepared, [], 'a non-array list reads empty');
});

test('a custom spell shadows a built-in of the same name; new names append', () => {
  const firebolt = DEFAULT_SPELLS.find((s) => s.name === 'Fire Bolt');
  const override = { ...firebolt, description: 'Homebrewed hotter.' };
  const brandNew = { ...firebolt, id: 'chill-touch-x', name: 'Frost Lance' };
  try {
    setActiveLibrary({ ...emptyLibrary(), spells: [override, brandNew] });
    const merged = activeSpellEntries();
    const bolt = merged.find((e) => e.entry.name === 'Fire Bolt');
    assert.equal(bolt?.source, 'override');
    assert.equal(bolt?.entry.description, 'Homebrewed hotter.');
    assert.equal(merged.find((e) => e.entry.name === 'Frost Lance')?.source, 'custom');
    assert.equal(activeSpells().length, DEFAULT_SPELLS.length + 1);
  } finally {
    setActiveLibrary(emptyLibrary());
  }
});

test('with no customizations activeSpells returns the curated defaults, memoized', () => {
  setActiveLibrary(emptyLibrary());
  assert.equal(activeSpells().length, DEFAULT_SPELLS.length);
  assert.equal(activeSpellEntries(), activeSpellEntries());
});

test('activeSpellIndex maps ids to spells and is memoized until the library changes', () => {
  setActiveLibrary(emptyLibrary());
  const index = activeSpellIndex();
  assert.equal(index, activeSpellIndex()); // same Map back: built once
  const first = DEFAULT_SPELLS[0];
  assert.equal(
    index.get(first.id),
    activeSpells().find((s) => s.id === first.id),
  );
  assert.equal(index.get('no-such-spell'), undefined);
  setActiveLibrary(emptyLibrary()); // reset invalidates the memo
  assert.notEqual(index, activeSpellIndex());
});

test('resolveSpellIds resolves through the index, deduplicating and dropping unknowns', () => {
  setActiveLibrary(emptyLibrary());
  const first = DEFAULT_SPELLS[0];
  const second = DEFAULT_SPELLS[1];
  const spells = resolveSpellIds([first.id, 'no-such-spell', second.id, first.id]);
  assert.deepEqual(
    spells.map((s) => s.id),
    [first.id, second.id],
    'order kept, duplicate and unknown ids dropped',
  );
  assert.deepEqual(resolveSpellIds([]), []);
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

test('the built-in catalogs are frozen, so a consumer cannot edit shared data', () => {
  for (const catalog of [
    defaultEquipmentTemplates(),
    DEFAULT_BESTIARY,
    DEFAULT_NPC_TEMPLATES,
    DEFAULT_SPELLS,
  ]) {
    assert.ok(Object.isFrozen(catalog), 'the list itself');
    assert.ok(Object.isFrozen(catalog[0]), 'and its entries');
  }
  // Same list object per call: assembled once rather than copied per caller.
  assert.equal(defaultEquipmentTemplates(), defaultEquipmentTemplates());
});

test('activeEnemyArmor hands out a copy, not an element of the memoized list', () => {
  setActiveLibrary(emptyLibrary());
  const armor = /** @type {any} */ (activeEnemyArmor('Leather Armor'));
  assert.notEqual(armor, activeEnemyArmor('Leather Armor'), 'each call is its own object');
  // An encounter tuning its armor must not tune the library's.
  armor.acBonus = 99;
  assert.deepEqual(activeEnemyArmor('Leather Armor'), { name: 'Leather Armor', acBonus: 1 });
});

test('the active getters memoize their merged lists until the library changes', () => {
  try {
    setActiveLibrary(emptyLibrary());
    // Same object back on a repeat call: the merge ran once.
    assert.equal(activeEquipmentEntries(), activeEquipmentEntries());
    assert.equal(activeWeapons(), activeWeapons());
    assert.equal(activeArmors(), activeArmors());
    assert.equal(activeBestiaryEntries(), activeBestiaryEntries());
    assert.equal(activeNPCEntries(), activeNPCEntries());

    const before = activeEquipmentEntries();
    const beforeWeapons = activeWeapons();
    setActiveLibrary({
      ...emptyLibrary(),
      equipment: [
        {
          name: 'Sunforged Maul',
          type: 'weapon',
          damage: [{ count: 1, sides: 8, damageType: 'bludgeoning' }],
        },
      ],
    });
    // Setting a new library drops the cache; the fresh merge sees the custom.
    const after = activeEquipmentEntries();
    assert.notEqual(after, before);
    assert.notEqual(activeWeapons(), beforeWeapons);
    assert.ok(
      after.some(({ entry, source }) => entry.name === 'Sunforged Maul' && source === 'custom'),
    );
  } finally {
    setActiveLibrary(emptyLibrary());
  }
});
