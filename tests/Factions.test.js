import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_FACTION,
  byFaction,
  coerceFactions,
  editFactions,
  factionField,
  factionFilterOptions,
  factionIdField,
  factionName,
  liveFilter,
  withFaction,
} from '../src/entities/Factions.js';
import { withDefaults } from '../src/entities/Creature.js';

const factions = [
  { id: 'f-guild', name: 'Guild' },
  { id: 'f-court', name: 'Court' },
];

test('coerceFactions drops bad entries and repeated ids', () => {
  assert.deepEqual(coerceFactions('x'), []);
  assert.deepEqual(
    coerceFactions([
      null,
      { id: 7, name: 'A' },
      { id: '', name: 'A' },
      { id: 'a', name: '  ' },
      { id: 'a', name: 3 },
      { id: 'b', name: ' Bee ' },
      { id: 'b', name: 'Other' },
    ]),
    [{ id: 'b', name: 'Bee' }],
  );
});

test('factionName reads empty for no id or a removed faction', () => {
  assert.equal(factionName(factions, 'f-court'), 'Court');
  assert.equal(factionName(factions, undefined), '');
  assert.equal(factionName(factions, 'gone'), '');
});

test('editFactions renames, removes, and adds with a fresh id', () => {
  assert.deepEqual(editFactions(factions, { 'f-guild': 'Thieves', 'f-court': ' ' }), [
    { id: 'f-guild', name: 'Thieves' },
  ]);
  assert.deepEqual(editFactions(factions, {}, 'Guild').at(-1), {
    id: 'faction-guild',
    name: 'Guild',
  });
  const twice = editFactions([{ id: 'faction-guild', name: 'Guild' }], {}, 'Guild');
  assert.equal(twice.at(-1)?.id, 'faction-guild-2');
  assert.equal(editFactions([], {}, '!!!')[0].id, 'faction-new');
  assert.deepEqual(editFactions(factions, {}, '  '), factions);
});

test('byFaction filters by id, by no faction, or not at all', () => {
  const creatures = /** @type {any[]} */ ([
    { id: 'a', factionId: 'f-guild' },
    { id: 'b' },
    { id: 'c', factionId: 'gone' },
  ]);
  assert.deepEqual(byFaction(creatures, factions, '').length, 3);
  assert.deepEqual(
    byFaction(creatures, factions, 'f-guild').map((c) => c.id),
    ['a'],
  );
  assert.deepEqual(
    byFaction(creatures, factions, NO_FACTION).map((c) => c.id),
    ['b', 'c'],
  );
});

test('withFaction sets or clears the id', () => {
  const npc = /** @type {any} */ ({ id: 'a', factionId: 'old' });
  assert.deepEqual(withFaction(npc, 'f-court'), { id: 'a', factionId: 'f-court' });
  assert.deepEqual(withFaction(npc, ''), { id: 'a' });
});

test('factionIdField and creature defaults keep only a non-empty string id', () => {
  assert.deepEqual(factionIdField('x'), { factionId: 'x' });
  assert.deepEqual(factionIdField(''), {});
  assert.deepEqual(factionIdField(4), {});
  const base = { id: 'n', name: 'N', maxHP: 4 };
  assert.equal(withDefaults(/** @type {any} */ ({ ...base, factionId: 'f' })).factionId, 'f');
  assert.equal('factionId' in withDefaults(/** @type {any} */ ({ ...base, factionId: 9 })), false);
});

test('factionField offers None and each faction, or nothing with no factions', () => {
  assert.deepEqual(factionField([], 'f-guild'), []);
  const [field] = factionField(factions, 'f-guild');
  assert.equal(field.value, 'f-guild');
  assert.deepEqual(
    field.options.map((o) => o.label),
    ['None', 'Guild', 'Court'],
  );
  assert.equal(factionField(factions, 'gone')[0].value, '');
});

test('factionFilterOptions lists all, each faction, then no faction', () => {
  assert.deepEqual(
    factionFilterOptions(factions).map((o) => o.value),
    ['', 'f-guild', 'f-court', NO_FACTION],
  );
});

test('liveFilter drops a filter whose faction is gone', () => {
  assert.equal(liveFilter(factions, 'f-court'), 'f-court');
  assert.equal(liveFilter(factions, NO_FACTION), NO_FACTION);
  assert.equal(liveFilter(factions, 'gone'), '');
  assert.equal(liveFilter(factions, ''), '');
});
