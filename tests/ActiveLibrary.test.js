import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultEquipmentTemplates, emptyLibrary } from '../src/library/LibraryMerge.js';
import {
  setActiveLibrary,
  getActiveLibrary,
  activeEquipmentEntries,
  activeEquipment,
  activeWeapons,
  activeArmors,
  activeEnemyArmor,
  activeCreatureEntries,
  activeCreatures,
  activeSpellEntries,
  activeSpells,
  activeSpellIndex,
  activeFeatEntries,
  activeFeats,
  resolveSpellIds,
} from '../src/library/ActiveLibrary.js';
import { DEFAULT_CREATURES } from '../src/data/creatures.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { DEFAULT_FEATS } from '../src/data/feats.js';

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

test('the active registry merges customs into every getter', () => {
  setActiveLibrary({
    ...emptyLibrary(),
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
    assert.deepEqual(activeEnemyArmor('Dragonhide'), {
      name: 'Dragonhide',
      baseAC: 15,
      armorWeight: 'medium',
    });
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
  assert.deepEqual(activeEnemyArmor('Leather Armor'), {
    name: 'Leather Armor',
    baseAC: 11,
    armorWeight: 'light',
  });
});

test('activeEnemyArmor hands out a copy, not an element of the memoized list', () => {
  setActiveLibrary(emptyLibrary());
  const armor = /** @type {any} */ (activeEnemyArmor('Leather Armor'));
  assert.notEqual(armor, activeEnemyArmor('Leather Armor'), 'each call is its own object');
  // An encounter tuning its armor must not tune the library's.
  armor.baseAC = 99;
  assert.deepEqual(activeEnemyArmor('Leather Armor'), {
    name: 'Leather Armor',
    baseAC: 11,
    armorWeight: 'light',
  });
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

test('the feat registry merges customs and memoizes until the library changes', () => {
  try {
    setActiveLibrary(emptyLibrary());
    assert.equal(activeFeats().length, DEFAULT_FEATS.length);
    assert.equal(activeFeatEntries(), activeFeatEntries(), 'the merge runs once');
    const before = activeFeats();
    setActiveLibrary({
      ...emptyLibrary(),
      feats: [
        { id: 'skilled', name: 'Skilled', description: 'override', effects: [] },
        { id: 'iron-will', name: 'Iron Will', description: '', effects: [] },
      ],
    });
    assert.notEqual(activeFeats(), before, 'a new library drops the cache');
    const skilled = activeFeatEntries().find((e) => e.entry.name === 'Skilled');
    assert.equal(skilled?.source, 'override');
    assert.equal(skilled?.entry.description, 'override');
    const added = activeFeatEntries().find((e) => e.entry.name === 'Iron Will');
    assert.equal(added?.source, 'custom');
    assert.equal(activeFeatEntries().length, DEFAULT_FEATS.length + 1);
  } finally {
    setActiveLibrary(emptyLibrary());
  }
});
