import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initiativeStatus } from '../src/ui/InitiativePanel.js';

/** Two combatants, the hero acting first. */
function fight(index = 0) {
  return {
    round: 3,
    index,
    order: [
      { id: 'hero', initiative: 18, modifier: 1 },
      { id: 'goblin', initiative: 9, modifier: 0 },
    ],
  };
}

/** @type {Record<string, { name: string, side: 'party' | 'foe' }>} */
const roster = {
  hero: { name: 'Mirelle', side: 'party' },
  goblin: { name: 'Goblin Scout', side: 'foe' },
};

/** @param {{ id: string }} participant */
const describe = (participant) => roster[participant.id] ?? null;

test('the status names the round and the current turn', () => {
  assert.equal(initiativeStatus(fight(), describe), "Round 3, Mirelle's turn");
  assert.equal(initiativeStatus(fight(1), describe), "Round 3, Goblin Scout's turn");
});

test('an id nothing resolves still reads as a turn', () => {
  const orphaned = {
    round: 1,
    index: 0,
    order: [{ id: 'gone', initiative: 12, modifier: 0 }],
  };
  assert.equal(initiativeStatus(orphaned, describe), "Round 1, Unknown combatant's turn");
});
