import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CURRENT_VERSION,
  MIGRATIONS,
  migrateState,
  stateVersion,
} from '../src/storage/Migrations.js';

test('stateVersion reads a stored version number', () => {
  assert.equal(stateVersion({ version: 3 }), 3);
  assert.equal(stateVersion({ version: 2.7 }), 2, 'a fractional version truncates');
});

test('stateVersion reads an unusable version as the pre-version format', () => {
  assert.equal(stateVersion({}), 0, 'absent: every save written before the field existed');
  assert.equal(stateVersion({ version: '2' }), 0);
  assert.equal(stateVersion({ version: null }), 0);
  assert.equal(stateVersion({ version: Number.NaN }), 0);
  assert.equal(stateVersion({ version: Number.POSITIVE_INFINITY }), 0);
  assert.equal(stateVersion({ version: -4 }), 0);
});

test('migrateState applies every step from the stored version up to the target', () => {
  const table = {
    0: (state) => ({ ...state, steps: [...state.steps, 'a'] }),
    1: (state) => ({ ...state, steps: [...state.steps, 'b'] }),
    2: (state) => ({ ...state, steps: [...state.steps, 'c'] }),
  };
  assert.deepEqual(migrateState({ steps: [] }, 0, 3, table).steps, ['a', 'b', 'c']);
  assert.deepEqual(migrateState({ steps: [] }, 1, 3, table).steps, ['b', 'c']);
});

test('migrateState passes a version with no registered step through unchanged', () => {
  const table = { 1: (state) => ({ ...state, ran: true }) };
  const migrated = migrateState({ ran: false }, 0, 3, table);
  assert.equal(migrated.ran, true, 'the registered step still runs');
});

test('migrateState runs nothing for a save already at the target', () => {
  const table = {
    2: () => {
      throw new Error('a step at or above the target must not run');
    },
  };
  const state = { kept: true };
  assert.equal(migrateState(state, 2, 2, table), state);
});

test('migrateState leaves a save newer than the app untouched', () => {
  const table = {
    0: () => ({ rewritten: true }),
    1: () => ({ rewritten: true }),
  };
  const state = { version: 9, kept: true };
  assert.equal(
    migrateState(state, 9, 2, table),
    state,
    'down-migration is not attempted; the validator reads it best-effort',
  );
});

test('MIGRATIONS registers a step for every version below the current one', () => {
  for (let version = 0; version < CURRENT_VERSION; version += 1) {
    assert.equal(
      typeof MIGRATIONS[version],
      'function',
      `no migration registered from version ${version}; a step under the wrong key silently does nothing`,
    );
  }
});

test('the omission-only steps leave the payload alone', () => {
  const state = { nodes: [], characters: [{ id: 'c1' }] };
  // 0 -> 1 added the version field; 1 -> 2 started omitting default tile fields,
  // which the load path's backfill already restores from absence; 2 -> 3 started
  // hoisting image payloads into a table an older save simply does not have;
  // 3 -> 4 extended the tile omission to the entity collections, whose
  // `withDefaults` the load path runs whether a field was omitted or not.
  assert.deepEqual(MIGRATIONS[0](state), state);
  assert.deepEqual(MIGRATIONS[1](state), state);
  assert.deepEqual(MIGRATIONS[2](state), state);
  assert.deepEqual(MIGRATIONS[3](state), state);
});

test('step 5 turns an encounter into a hostile creature with explicit gear', () => {
  const migrated = MIGRATIONS[5]({
    encounters: [
      {
        id: 'goblin',
        name: 'Goblin',
        maxHP: 7,
        currentHP: 7,
        statBlock: { STR: 8, AC: 13 },
        level: 1,
        tier: 'mob',
        noticed: true,
      },
    ],
    npcs: [],
  });
  assert.equal('encounters' in migrated, false, 'the old key is gone');
  assert.equal('npcs' in migrated, false);
  const goblin = migrated.creatures[0];
  assert.equal(goblin.disposition, 'hostile');
  assert.deepEqual(goblin.stats, { STR: 8, AC: 13 }, 'statBlock renames to stats');
  assert.equal('statBlock' in goblin, false);
  assert.equal(goblin.met, true, 'noticed renames to met');
  assert.equal('noticed' in goblin, false);
  assert.equal(goblin.weapon.name, 'Shortsword', 'absent gear takes the old level default');
  assert.equal(goblin.armor.name, 'Leather Armor');
});

test('step 5 keeps explicit gear, null included, and defaults level and tier', () => {
  const migrated = MIGRATIONS[5]({
    encounters: [{ id: 'ooze', name: 'Ooze', maxHP: 10, currentHP: 10, weapon: null, armor: null }],
  });
  const ooze = migrated.creatures[0];
  assert.equal(ooze.weapon, null, 'a deliberately unarmed foe stays unarmed');
  assert.equal(ooze.armor, null);
  assert.equal(ooze.level, 1);
  assert.equal(ooze.tier, 'mob');
  assert.equal(ooze.met, false);
});

test('step 5 keeps an NPC as it is, with explicit null gear and one id namespace', () => {
  const migrated = MIGRATIONS[5]({
    encounters: [{ id: 'goblin', name: 'Goblin', maxHP: 7, currentHP: 7 }],
    npcs: [
      { id: 'goblin', name: 'Goblin the Barkeep', disposition: 'friendly', met: true },
      { id: 'sage', name: 'Sage', disposition: 'neutral' },
    ],
  });
  const [foe, barkeep, sage] = migrated.creatures;
  assert.equal(foe.id, 'goblin');
  assert.notEqual(barkeep.id, 'goblin', 'a colliding NPC id is re-slugged');
  assert.equal(barkeep.disposition, 'friendly');
  assert.equal(barkeep.met, true);
  assert.equal(barkeep.weapon, null, 'absent NPC gear reads as unarmed, never a default');
  assert.equal(barkeep.armor, null);
  assert.equal(sage.id, 'sage');
  assert.equal(sage.met, false);
});

test('step 5 re-slugs a creature whose id a party character holds', () => {
  const migrated = MIGRATIONS[5]({
    characters: [{ id: 'mirelle', name: 'Mirelle' }],
    encounters: [{ id: 'mirelle', name: 'Mirelle', maxHP: 9, currentHP: 9 }],
    npcs: [{ id: 'mirelle', name: 'Mirelle', disposition: 'neutral' }],
    combat: { order: [{ id: 'mirelle', initiative: 12, modifier: 0 }] },
  });
  const [foe, npc] = migrated.creatures;
  assert.notEqual(foe.id, 'mirelle', 'the foe cannot shadow behind the character');
  assert.notEqual(npc.id, 'mirelle');
  assert.notEqual(npc.id, foe.id, 'the two creatures also stay apart');
  assert.deepEqual(
    migrated.characters,
    [{ id: 'mirelle', name: 'Mirelle' }],
    'the character keeps its id',
  );
  assert.deepEqual(
    migrated.combat.order,
    [{ id: 'mirelle', initiative: 12, modifier: 0 }],
    'stored participant ids are left alone; the old id names the character',
  );
});

test('step 5 coerces bestiary templates the same way as encounters', () => {
  const migrated = MIGRATIONS[5]({
    bestiary: [{ id: 'wolf', name: 'Wolf', maxHP: 11, statBlock: { DEX: 15 }, level: 1 }],
  });
  const wolf = migrated.bestiary[0];
  assert.equal(wolf.disposition, 'hostile');
  assert.deepEqual(wolf.stats, { DEX: 15 });
  assert.equal('statBlock' in wolf, false);
  assert.equal(wolf.weapon.name, 'Shortsword');
});

test('step 5 defends itself against malformed collections', () => {
  const migrated = MIGRATIONS[5]({ encounters: 'none', npcs: [null, 4], bestiary: 7 });
  assert.deepEqual(migrated.creatures, []);
  assert.deepEqual(migrated.bestiary, []);
});

test('step 6 adopts the preset shape for a named weapon and keeps edited dice', () => {
  const migrated = MIGRATIONS[6]({
    characters: [
      {
        id: 'c1',
        name: 'Hero',
        inventory: [
          {
            id: 'sword',
            name: 'Longsword',
            type: 'weapon',
            handling: 'melee',
            // The GM raised the die, so the save's own dice must survive.
            damage: [{ count: 2, sides: 8, damageType: 'slashing' }],
          },
          { id: 'rope', name: 'Rope', type: 'gear' },
        ],
      },
    ],
  });
  const [sword, rope] = migrated.characters[0].inventory;
  assert.equal('handling' in sword, false, 'the legacy field is gone');
  assert.equal(sword.kind, 'melee');
  assert.equal(sword.category, 'martial');
  assert.deepEqual(sword.properties, ['versatile']);
  assert.deepEqual(sword.versatileDamage, [{ count: 1, sides: 10, damageType: 'slashing' }]);
  assert.deepEqual(
    sword.damage,
    [{ count: 2, sides: 8, damageType: 'slashing' }],
    'the edited dice stay',
  );
  assert.deepEqual(rope, { id: 'rope', name: 'Rope', type: 'gear' }, 'non-weapons pass through');
});

test('step 6 maps an unmatched weapon from its handling with the simple category', () => {
  const migrated = MIGRATIONS[6]({
    characters: [
      {
        id: 'c1',
        name: 'Hero',
        inventory: [
          {
            id: 'blade',
            name: 'Void Blade',
            type: 'weapon',
            handling: 'finesse',
            damage: [{ count: 1, sides: 8, damageType: 'necrotic' }],
          },
        ],
      },
    ],
  });
  const blade = migrated.characters[0].inventory[0];
  assert.equal(blade.kind, 'melee');
  assert.equal(blade.category, 'simple', 'simple keeps the old always-proficient rolls');
  assert.deepEqual(blade.properties, ['finesse']);
});

test('step 6 rewrites creature and bestiary weapons and keeps null gear', () => {
  const migrated = MIGRATIONS[6]({
    creatures: [
      {
        id: 'bandit',
        name: 'Bandit',
        weapon: { name: 'Shortsword', handling: 'finesse', damage: [] },
      },
      { id: 'barkeep', name: 'Barkeep', weapon: null },
    ],
    bestiary: [
      {
        id: 'archer',
        name: 'Archer',
        weapon: { name: 'Old Sling', handling: 'ranged', damage: [] },
      },
    ],
  });
  const bandit = migrated.creatures[0];
  assert.equal(bandit.weapon.kind, 'melee');
  assert.equal(bandit.weapon.category, 'martial');
  assert.deepEqual(bandit.weapon.properties, ['finesse', 'light']);
  assert.equal('handling' in bandit.weapon, false);
  assert.equal(migrated.creatures[1].weapon, null, 'unarmed stays unarmed');
  const archer = migrated.bestiary[0];
  assert.equal(archer.weapon.kind, 'ranged');
  assert.deepEqual(archer.weapon.range, { normal: 80, long: 320 }, 'the fallback range');
});

test('step 6 leaves malformed values for the validator to report', () => {
  const state = {
    characters: [{ id: 'c1', name: 'Hero', inventory: 5 }, null],
    creatures: 'none',
  };
  const migrated = MIGRATIONS[6](state);
  assert.deepEqual(migrated.characters, state.characters, 'a bad inventory passes through');
  assert.equal(migrated.creatures, 'none');
  assert.equal('bestiary' in migrated, false, 'an absent list is not invented');
});

test('a bundled library rides through the whole migration chain untouched', () => {
  // A campaign export can carry the custom library beside the save. The
  // field belongs to normalizeLibrary, so no step may rewrite or drop it.
  const library = {
    equipment: [{ name: 'Rope', type: 'gear' }],
    spells: [{ id: 'zap', name: 'Zap', effects: [{ kind: 'mystery' }] }],
  };
  const migrated = /** @type {any} */ (
    migrateState({ version: 1, nodes: [], library: structuredClone(library) }, 1)
  );
  assert.deepEqual(migrated.library, library);
});
