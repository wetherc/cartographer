import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultEquipmentTemplates,
  DEFAULT_CREATURES,
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
  activeCreatures,
  activeCreatureEntries,
  activeEquipmentEntries,
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
  assert.equal(longsword?.kind, 'melee');
  assert.equal(longsword?.category, 'martial');
  assert.deepEqual(longsword?.properties, ['versatile']);
  assert.deepEqual(longsword?.versatileDamage, [{ count: 1, sides: 10, damageType: 'slashing' }]);
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
  assert.deepEqual(wyvern.armor, { name: 'Scales', acBonus: 3 }, 'an armor object is kept');
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
  assert.equal(wyvern.weapon, null, 'explicit null gear survives');
  assert.ok(wyvern.armor, 'absent gear on a leveled entry takes the level default');
  assert.equal(smith.id, 'smith', 'an old NPC entry gains an id');
  assert.equal(smith.disposition, 'friendly');
  assert.equal(smith.role, 'Blacksmith');
  assert.equal(smith.maxHP, 11);
  assert.equal(smith.stats.STR, 15);
  assert.deepEqual(
    smith.weapon,
    {
      name: 'Hammer',
      kind: 'melee',
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
  assert.equal(cooper.weapon, null, 'absent gear on an unleveled entry reads as none');
  assert.equal(cooper.armor, null);
  assert.equal(ooze.maxHP, 4, 'text is not a maximum');
  assert.equal(ooze.weapon, null, 'a null weapon means deliberately unarmed');
  assert.equal(ooze.armor, null);
  assert.equal(dregs.maxHP, 1, 'a negative maximum clamps to one');
  assert.equal(dregs.weapon, null, 'non-object gear drops to none');
  assert.equal(sturdy.maxHP, 9, 'a numeric string floors to an integer');
  assert.equal(brute.weapon?.name, 'Shortsword', 'a leveled entry takes the level default');
  assert.equal(brute.armor?.name, 'Leather Armor');
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
  assert.equal(lib.creatures[0].weapon, null, 'null gear survives on a leveled entry');
  assert.equal(lib.creatures[0].armor, null);
  assert.equal(lib.creatures[1].weapon?.name, 'Longsword', 'a level-6 mob takes the high loadout');
  assert.equal(lib.creatures[1].armor?.name, 'Chain Shirt');
  assert.equal(
    lib.creatures[2].weapon,
    null,
    'non-object gear on an unleveled entry drops to none',
  );
});

test('the active registry merges customs into every getter', () => {
  setActiveLibrary({
    equipment: [
      // Overrides the built-in weapon of the same name...
      {
        name: 'Longsword',
        type: 'weapon',
        kind: 'melee',
        damage: [{ count: 1, sides: 10, damageType: 'slashing' }],
      },
      // ...and adds a new armor.
      { name: 'Dragonhide', type: 'armor', armorWeight: 'medium', baseAC: 15 },
    ],
    creatures: [
      { ...DEFAULT_CREATURES[0], name: 'Hobgoblin', id: 'hobgoblin' },
      {
        id: 'innkeeper',
        name: 'Innkeeper',
        role: 'Spy',
        disposition: 'hostile',
        notes: '',
        maxHP: 4,
        stats: {},
        weapon: null,
        armor: null,
      },
    ],
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
    assert.ok(activeCreatures().some((t) => t.name === 'Hobgoblin'));
    assert.ok(
      activeCreatures().some((t) => t.name === 'Goblin'),
      'built-in creatures stay',
    );
    const innkeeper = activeCreatureEntries().find((e) => e.entry.name === 'Innkeeper');
    assert.equal(innkeeper?.source, 'override');
    assert.equal(innkeeper?.entry.role, 'Spy');
    assert.equal(activeCreatureEntries().length, DEFAULT_CREATURES.length + 1);
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

test('normalizeLibrary keeps a spell entry that states every descriptive field', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        id: 'ember-dart',
        name: 'Ember Dart',
        school: 'evocation',
        classes: ['wizard', 7, 'sorcerer'],
        range: '60 feet',
        description: 'A mote of fire streaks to the target.',
        targetCount: 2,
        effect: { kind: 'attack', damage: [{ count: 1, sides: 6, damageType: 'fire' }] },
        scaling: { targetsPerLevel: 1 },
      },
      // The same fields written as values the schema cannot use.
      {
        name: 'Muddle',
        school: 7,
        classes: 'wizard',
        range: { far: true },
        description: null,
        targetCount: null,
      },
    ],
  });
  const [dart, muddle] = lib.spells;
  assert.equal(dart.id, 'ember-dart', 'a stated id is kept, not sluggified from the name');
  assert.equal(dart.school, 'evocation');
  assert.deepEqual(dart.classes, ['wizard', 'sorcerer'], 'non-string classes drop');
  assert.equal(dart.range, '60 feet');
  assert.equal(dart.description, 'A mote of fire streaks to the target.');
  assert.equal(dart.targetCount, 2);
  assert.deepEqual(dart.scaling, { targetsPerLevel: 1 }, 'targets scale without damage dice');
  assert.equal(muddle.id, 'muddle');
  assert.equal(muddle.school, 'abjuration');
  assert.deepEqual(muddle.classes, []);
  assert.equal(muddle.range, 'Self');
  assert.equal(muddle.description, '');
  assert.equal('targetCount' in muddle, false, 'an explicit null reads as no target count');
});

test('normalizeLibrary carries a caster class that states nothing else', () => {
  const lib = normalizeLibrary({
    creatures: [{ name: 'Hedge Witch', class: 'druid', casterLevel: 'later' }],
  });
  const witch = lib.creatures[0];
  assert.equal(witch.class, 'druid');
  assert.equal('subclass' in witch, false);
  assert.equal('casterLevel' in witch, false, 'an unusable level is left for a default to fill');
  assert.deepEqual(witch.spellbook, { cantrips: [], known: [], prepared: [] });
});

test('normalizeLibrary keeps a named material and implies the M letter', () => {
  const lib = normalizeLibrary({
    spells: [
      {
        name: 'Revive',
        components: ['V', 'S', 'M'],
        materials: { text: ' diamonds worth 300 gp ', costGP: '300', consumed: 'yes' },
      },
      // A material named without the letter beside it: the block is what makes it
      // an M component, so the letter is added rather than the material dropped.
      { name: 'Spark', components: ['V'], materials: { text: 'a pinch of dust' } },
      { name: 'Word', components: ['V'] },
    ],
  });
  const [revive, spark, word] = lib.spells;
  assert.deepEqual(revive.materials, {
    text: 'diamonds worth 300 gp',
    costGP: 300,
    consumed: true,
  });
  assert.deepEqual(spark.materials, { text: 'a pinch of dust', consumed: false });
  assert.deepEqual(spark.components, ['V', 'M']);
  assert.equal('materials' in word, false, 'a spell with no material carries no block');
  assert.deepEqual(word.components, ['V']);
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
  assert.equal(activeCreatures().length, DEFAULT_CREATURES.length);
  assert.equal(activeEnemyArmor('Nonesuch'), null);
  assert.deepEqual(activeEnemyArmor('Leather Armor'), { name: 'Leather Armor', acBonus: 1 });
});

test('the built-in catalogs are frozen, so a consumer cannot edit shared data', () => {
  for (const catalog of [defaultEquipmentTemplates(), DEFAULT_CREATURES, DEFAULT_SPELLS]) {
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
    assert.equal(activeCreatureEntries(), activeCreatureEntries());

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

test('normalizeLibrary keeps a rider only alongside a chip to carry it', () => {
  const rider = { rolls: ['attack', 'save'], dice: -1, die: 'd4' };
  const lib = normalizeLibrary({
    spells: [
      { name: 'Bane', effect: { kind: 'save', saveAbility: 'CHA', condition: 'Bane', rider } },
      // No condition, so nothing carries the rider.
      { name: 'Scorch', effect: { kind: 'save', saveAbility: 'DEX', rider } },
      // A buff always has a chip, named or not.
      { name: 'Bless', effect: { kind: 'buff', condition: 'Bless', rider } },
      { name: 'Shielded', effect: { kind: 'buff' } },
      // Junk in the rider block drops the block, not the spell.
      { name: 'Noise', effect: { kind: 'buff', rider: { rolls: ['wibble'], dice: 1 } } },
    ],
  });
  assert.deepEqual(lib.spells[0].effect.rider, rider);
  assert.equal(lib.spells[1].effect.rider, undefined);
  assert.deepEqual(lib.spells[2].effect.rider, rider);
  assert.deepEqual(lib.spells[3].effect, { kind: 'buff' });
  assert.deepEqual(lib.spells[4].effect, { kind: 'buff' });
});

test('normalizeLibrary trims a buff’s chip name and drops an empty one', () => {
  const lib = normalizeLibrary({
    spells: [
      { name: 'Bless', effect: { kind: 'buff', condition: '  Bless  ' } },
      { name: 'Plain', effect: { kind: 'buff', condition: '   ' } },
    ],
  });
  assert.equal(lib.spells[0].effect.condition, 'Bless');
  assert.equal(lib.spells[1].effect.condition, undefined);
});
