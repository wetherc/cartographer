import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fightNotice } from '../src/combat/FightNotice.js';

const DYING = { successes: 1, failures: 0, stable: false };
/** @param {object[]} rows */
const view = (rows) =>
  /** @type {any} */ ({
    round: 1,
    turnIndex: 0,
    rows: rows.map((r) => ({ counted: true, defeated: false, deathSaves: null, ...r })),
  });

test('no banner while both sides stand', () => {
  assert.equal(fightNotice(view([{ side: 'party' }, { side: 'foe' }]), true), null);
});

test('a victory reads plainly, with the GM reminder for the GM only', () => {
  const won = view([
    { side: 'party', name: 'Ser Aldric' },
    { side: 'foe', defeated: true },
  ]);
  assert.deepEqual(fightNotice(won, false), {
    outcome: 'victory',
    text: 'The party is victorious.',
  });
  assert.equal(
    fightNotice(won, true)?.text,
    'The party is victorious. End combat when the party is done here.',
  );
});

test('a victory names each party member who is still dying', () => {
  const rows = [
    { side: 'party', name: 'Ser Aldric' },
    { side: 'party', name: 'Wren Tallowby', deathSaves: DYING },
    { side: 'party', name: 'Mirelle', deathSaves: { ...DYING, stable: true } },
    { side: 'foe', defeated: true },
  ];
  assert.equal(fightNotice(view(rows), false)?.text, 'All foes are down. Wren Tallowby is dying.');
  rows[0] = { side: 'party', name: null, deathSaves: DYING };
  rows.push({ side: 'party', name: 'Odo', deathSaves: DYING });
  assert.equal(
    fightNotice(view(rows), false)?.text,
    'All foes are down. A party member, Wren Tallowby and Odo are dying.',
  );
  assert.equal(
    fightNotice(view(rows.slice(0, 2).concat(rows[3])), false)?.text,
    'All foes are down. A party member and Wren Tallowby are dying.',
  );
});

test('a defeat reads plainly, with the GM reminder for the GM only', () => {
  const lost = view([{ side: 'party', defeated: true }, { side: 'foe' }]);
  assert.deepEqual(fightNotice(lost, false), { outcome: 'defeat', text: 'The party is defeated.' });
  assert.equal(
    fightNotice(lost, true)?.text,
    'The party is defeated. End combat when you are ready.',
  );
});
