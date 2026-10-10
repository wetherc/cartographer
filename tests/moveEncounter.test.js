import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triggerEncounterAfterMove } from '../src/app/moveEncounter.js';

const PARTY = { nodeId: 'world', tileId: '0,0' };

/** @param {any[]} characters */
function app(characters) {
  /** @type {any[][]} */
  const calls = [];
  const ctx = /** @type {any} */ ({
    state: { characters },
    partyTracker: { getPosition: () => PARTY },
    actions: {
      maybeTriggerEncounter: async (/** @type {any[]} */ ...args) => {
        calls.push(args);
      },
    },
  });
  return { ctx, calls };
}

test('a whole-party move checks the party position', () => {
  const { ctx, calls } = app([]);
  triggerEncounterAfterMove(ctx, null);
  assert.deepEqual(calls, [[]]);
});

test('a lone move reads the moved character back off the roster', () => {
  const here = { nodeId: 'cave', tileId: '1,1' };
  const { ctx, calls } = app([{ id: 'c1', name: 'Wren', location: here }]);
  triggerEncounterAfterMove(ctx, /** @type {any} */ ({ id: 'c1', name: 'Wren', location: null }));
  assert.deepEqual(calls, [[here, 'Wren']]);
});

test('a subject missing from the roster falls back to the subject itself', () => {
  const { ctx, calls } = app([]);
  triggerEncounterAfterMove(ctx, /** @type {any} */ ({ id: 'c1', name: 'Wren', location: null }));
  assert.deepEqual(calls, [[PARTY, 'Wren']]);
});
