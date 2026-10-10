import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { restoreGear, tabulateGear } from '../src/storage/GearTable.js';
import { buildState, deserialize, packState, serialize } from '../src/storage/SaveManager.js';
import { trySaveToLocalStorage, loadFromLocalStorage } from '../src/storage/SaveStorage.js';
import { buildExampleCampaign } from '../src/campaign/Campaigns.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { applyDamage } from '../src/entities/Creature.js';
import { fromTemplate } from '../src/entities/CreatureTemplate.js';
import { installLocalStorage } from './helpers/env.js';

beforeEach(installLocalStorage);

const sword = () => ({ name: 'Shortsword', kind: 'melee', damage: [{ count: 1, sides: 6 }] });
const torch = (quantity) => ({ id: 'torch', name: 'Torch', quantity, notes: '', type: 'gear' });

/** A save as JSON text, then parsed, as the load path reads it. */
const roundTrip = (save) => restoreGear(JSON.parse(JSON.stringify(save)));

test('a repeated weapon is stored once and restored in place', () => {
  const save = {
    creatures: [
      { id: 'g1', weapon: sword() },
      { id: 'g2', weapon: sword(), armor: { name: 'Hide' } },
      { id: 'g3' },
    ],
  };
  const packed = tabulateGear(save);
  assert.deepEqual(packed.gear, [sword()]);
  assert.deepEqual(packed.creatures[0], { id: 'g1', weapon: { '@': 0 } });
  assert.deepEqual(packed.creatures[1].armor, { name: 'Hide' }, 'a piece used once stays inline');
  assert.equal(packed.creatures[2], save.creatures[2], 'a record with no gear stays the same');
  assert.equal(JSON.stringify(roundTrip(packed)), JSON.stringify(save));
});

test('inventory items share an entry and keep their own quantity and notes', () => {
  const save = {
    characters: [
      { id: 'a', inventory: [torch(5), { id: 'rope', name: 'Rope', quantity: 1, notes: '' }] },
      { id: 'b', inventory: [{ ...torch(2), notes: 'Wet' }] },
    ],
  };
  const packed = tabulateGear(save);
  assert.deepEqual(packed.gear, [
    { id: 'torch', name: 'Torch', quantity: null, notes: null, type: 'gear' },
  ]);
  assert.deepEqual(packed.characters[1].inventory, [{ '@': 0, quantity: 2, notes: 'Wet' }]);
  assert.equal(packed.characters[0].inventory[1].name, 'Rope');
  assert.equal(
    JSON.stringify(roundTrip(packed)),
    JSON.stringify(save),
    'the restored items keep their key order',
  );
});

test('a save with nothing repeated packs to itself', () => {
  const save = { creatures: [{ id: 'g1', weapon: sword() }], bestiary: 'junk', characters: [7] };
  assert.equal(tabulateGear(save), save);
  assert.equal(restoreGear(save), save, 'a save with no table loads as it is');
});

test('the walk skips entries and fields that are not records', () => {
  const save = {
    creatures: [null, { id: 'g1', weapon: sword() }, { id: 'g2', weapon: sword(), armor: 3 }],
    characters: [
      { id: 'a', inventory: 'none' },
      { id: 'b', inventory: [null, torch(1)] },
    ],
  };
  const packed = tabulateGear(save);
  assert.equal(packed.creatures[0], null);
  assert.equal(packed.creatures[2].armor, 3);
  assert.equal(packed.characters[1].inventory, save.characters[1].inventory);
  assert.equal(JSON.stringify(roundTrip(packed)), JSON.stringify(save));
});

test('a reference that names no entry is left as it is', () => {
  const save = {
    gear: [sword(), 'junk'],
    creatures: [
      { id: 'g1', weapon: { '@': 9 } },
      { id: 'g2', weapon: { '@': 'x' } },
      { id: 'g3', weapon: { '@': 1 } },
      { id: 'g4', weapon: { '@': 0 } },
    ],
  };
  const restored = restoreGear(save);
  assert.equal('gear' in restored, false);
  assert.deepEqual(
    restored.creatures.map((c) => c.weapon),
    [{ '@': 9 }, { '@': 'x' }, { '@': 1 }, sword()],
  );
  assert.notEqual(restored.creatures[3].weapon, save.gear[0], 'each reference gets its own copy');
});

test('the example campaign plus a goblin horde round-trips through the table', () => {
  const base = buildState(buildExampleCampaign(new TilePalette()));
  const goblin = base.bestiary.find((b) => b.id === 'goblin');
  const horde = Array.from({ length: 20 }, (_, i) =>
    applyDamage(fromTemplate(goblin, `g${i}`, null), i % 3),
  );
  const state = { ...base, creatures: [...base.creatures, ...horde] };
  const json = serialize(state);
  const packed = packState(state);
  assert.ok(packed.gear.length > 0);
  const plain = JSON.stringify(restoreGear(JSON.parse(json)));
  assert.ok(json.length < plain.length - 20 * 200, 'each goblin saves its gear copy');
  const loaded = deserialize(json);
  assert.deepEqual(loaded, deserialize(plain), 'the table changes nothing a load returns');
  const again = serialize(loaded);
  assert.ok(serialize(deserialize(again)) === again, 'a load and a save give back the same string');
});

test('a stored save with a gear table loads back from localStorage', () => {
  const base = buildState(buildExampleCampaign(new TilePalette()));
  assert.equal(trySaveToLocalStorage(base).ok, true);
  assert.ok(localStorage.getItem('campaign-builder:save')?.includes('"gear":['));
  assert.deepEqual(loadFromLocalStorage(), deserialize(serialize(base)));
});

test('a weapon list stores each repeated piece once', () => {
  const bow = { name: 'Shortbow', kind: 'ranged', damage: [{ count: 1, sides: 6 }] };
  const save = {
    creatures: [
      { id: 'g1', weapons: [sword(), bow] },
      { id: 'g2', weapons: [sword(), bow] },
    ],
  };
  const packed = tabulateGear(save);
  assert.deepEqual(packed.gear, [sword(), bow]);
  assert.deepEqual(packed.creatures[1].weapons, [{ '@': 0 }, { '@': 1 }]);
  assert.equal(JSON.stringify(roundTrip(packed)), JSON.stringify(save));
});
