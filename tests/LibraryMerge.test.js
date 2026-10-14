import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultEquipmentTemplates,
  emptyLibrary,
  isLibraryEmpty,
  equipmentKey,
  nameKey,
  mergedEntries,
  upsertEntry,
  removeEntry,
} from '../src/library/LibraryMerge.js';
import { storedEntryId } from '../src/library/LibraryIdentity.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

test('defaultEquipmentTemplates covers every built-in preset list', () => {
  const defaults = defaultEquipmentTemplates();
  const types = new Set(defaults.map((e) => e.type));
  for (const type of ['weapon', 'bow', 'armor', 'shield', 'gear', 'consumable']) {
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
  assert.equal(plate?.strength, 15);
  assert.equal(plate?.stealthDisadvantage, true);
  const hide = defaults.find((e) => e.name === 'Hide');
  assert.equal('stealthDisadvantage' in (hide ?? {}), false, 'quiet armor carries no field');
  // The item form's picker reads these templates, not the preset arrays, so a
  // field that this mapping drops never reaches a GM.
  const shield = defaults.find((e) => e.type === 'shield');
  assert.equal(shield?.acBonus, 2);
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

test('an empty library carries an empty spells list; isLibraryEmpty counts spells', () => {
  assert.deepEqual(emptyLibrary().spells, []);
  assert.equal(isLibraryEmpty(emptyLibrary()), true);
  assert.equal(isLibraryEmpty({ ...emptyLibrary(), spells: [DEFAULT_SPELLS[0]] }), false);
});

test('isLibraryEmpty counts random tables', () => {
  assert.deepEqual(emptyLibrary().tables, []);
  const table = { name: 'Weather', rows: [{ weight: 1, text: 'Rain' }] };
  assert.equal(isLibraryEmpty({ ...emptyLibrary(), tables: [table] }), false);
});

test('the built-in equipment carries the SRD prices it knows', () => {
  const byName = new Map(defaultEquipmentTemplates().map((e) => [e.name, e]));
  assert.equal(byName.get('Longsword')?.cost, 15);
  assert.equal(byName.get('Plate')?.cost, 1500);
  assert.equal(byName.get('Shield')?.cost, 10);
  assert.equal(byName.get('Torch')?.cost, 0.01);
  assert.equal(byName.get('Potion of Healing')?.cost, 50);
  assert.equal(Object.hasOwn(byName.get('Arcane Focus') ?? {}, 'cost'), false);
  assert.equal(Object.hasOwn(byName.get('Potion of Greater Healing') ?? {}, 'cost'), false);
});
