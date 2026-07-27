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
  // which the load path's backfill already restores from absence.
  assert.deepEqual(MIGRATIONS[0](state), state);
  assert.deepEqual(MIGRATIONS[1](state), state);
});
