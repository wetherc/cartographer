import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEntry,
  appendEntry,
  entriesAfter,
  isoTimestamp,
  stampLabel,
  logBudget,
  TRAVELOG_LIMITS,
  TRAVELOG_FIGHT_LIMIT,
} from '../src/log/Travelogue.js';

test('createEntry builds an entry with the given fields', () => {
  const entry = createEntry('e1', 'travel', 'Entered the Keep.', 1000);
  assert.deepEqual(entry, { id: 'e1', kind: 'travel', message: 'Entered the Keep.', at: 1000 });
});

test('appendEntry adds to the end, keeping oldest-first order', () => {
  let log = [];
  log = appendEntry(log, createEntry('e1', 'travel', 'A', 1));
  log = appendEntry(log, createEntry('e2', 'combat', 'B', 2));
  assert.deepEqual(
    log.map((e) => e.id),
    ['e1', 'e2'],
  );
});

test('appendEntry does not mutate the input list', () => {
  const log = [createEntry('e1', 'travel', 'A', 1)];
  const next = appendEntry(log, createEntry('e2', 'travel', 'B', 2));
  assert.equal(log.length, 1);
  assert.equal(next.length, 2);
});

test('appendEntry trims the oldest entries once past the limit', () => {
  let log = [];
  const limit = TRAVELOG_LIMITS.story;
  for (let i = 0; i < limit + 5; i++) {
    log = appendEntry(log, createEntry(`e${i}`, 'travel', `m${i}`, i));
  }
  assert.equal(log.length, limit);
  // The five oldest (e0..e4) were dropped; the newest is kept.
  assert.equal(log[0].id, 'e5');
  assert.equal(log[log.length - 1].id, `e${limit + 4}`);
});

test('appendEntry honors custom limits', () => {
  let log = [];
  const limits = { story: 2, chatter: 2 };
  for (let i = 0; i < 4; i++) log = appendEntry(log, createEntry(`e${i}`, 'note', 'x', i), limits);
  assert.deepEqual(
    log.map((e) => e.id),
    ['e2', 'e3'],
  );
});

test('logBudget counts rolls and fight lines as chatter, and the rest as story', () => {
  assert.equal(logBudget('roll'), 'chatter');
  assert.equal(logBudget('combat'), 'chatter');
  for (const kind of /** @type {const} */ (['travel', 'note', 'rest'])) {
    assert.equal(logBudget(kind), 'story');
  }
});

test('a flood of rolls and fight lines never removes a story entry', () => {
  const limits = { story: 3, chatter: 3 };
  let log = [
    createEntry('t1', 'travel', 'Entered the Keep.', 1),
    createEntry('n1', 'note', 'Met the Castellan.', 2),
  ];
  for (let i = 0; i < 50; i++) {
    log = appendEntry(log, createEntry(`r${i}`, i % 2 ? 'roll' : 'combat', 'x', 10 + i), limits);
  }
  assert.deepEqual(
    log.map((e) => e.id),
    ['t1', 'n1', 'r47', 'r48', 'r49'],
  );
  log = appendEntry(log, createEntry('s1', 'rest', 'Long rest.', 100), limits);
  log = appendEntry(log, createEntry('t2', 'travel', 'Left.', 101), limits);
  assert.deepEqual(
    log.map((e) => e.id),
    ['n1', 'r47', 'r48', 'r49', 's1', 't2'],
    'the story budget trims only its own oldest entry',
  );
});

test('the regression case: a long fight and many travel lines keep every story line', () => {
  let log = [];
  for (let i = 0; i < 50; i++) log = appendEntry(log, createEntry(`t${i}`, 'travel', 'x', i));
  for (let i = 0; i < 300; i++) {
    log = appendEntry(log, createEntry(`c${i}`, 'combat', 'x', 100 + i), TRAVELOG_LIMITS, 100);
  }
  log = appendEntry(log, createEntry('n', 'note', 'After the fight.', 500));
  assert.equal(log.filter((e) => e.kind === 'travel').length, 50);
  assert.equal(log.filter((e) => e.kind === 'combat').length, TRAVELOG_LIMITS.chatter);
  assert.equal(log.at(-1)?.id, 'n');
});

test('entriesAfter returns the whole log when nothing was rendered yet', () => {
  const log = [createEntry('e1', 'travel', 'A', 1), createEntry('e2', 'combat', 'B', 2)];
  assert.deepEqual(entriesAfter(log, null), log);
  assert.deepEqual(entriesAfter([], null), []);
});

test('entriesAfter returns only the entries newer than the given id', () => {
  const log = ['e1', 'e2', 'e3'].map((id, i) => createEntry(id, 'note', id, i));
  assert.deepEqual(
    entriesAfter(log, 'e1').map((e) => e.id),
    ['e2', 'e3'],
  );
  assert.deepEqual(entriesAfter(log, 'e3'), []);
});

test('entriesAfter still finds the id after older entries were trimmed away', () => {
  let log = [];
  for (let i = 0; i < 5; i++)
    log = appendEntry(log, createEntry(`e${i}`, 'note', 'x', i), { story: 3, chatter: 3 });
  // e2 survived the trim to ['e2','e3','e4'].
  assert.deepEqual(
    entriesAfter(log, 'e2').map((e) => e.id),
    ['e3', 'e4'],
  );
});

test('entriesAfter returns null when the id is gone, signalling a rebuild', () => {
  const log = [createEntry('e9', 'note', 'x', 9)];
  assert.equal(entriesAfter(log, 'e1'), null);
  assert.equal(entriesAfter([], 'e1'), null);
});

test('isoTimestamp formats a real date and gives null for one it cannot read', () => {
  assert.equal(isoTimestamp(0), '1970-01-01T00:00:00.000Z');
  assert.equal(isoTimestamp(Number.NaN), null);
  assert.equal(isoTimestamp(8.64e15 + 1), null, 'past the largest date a Date can hold');
});

test('a running fight keeps its own entries past the limit', () => {
  /** @type {import('../src/types/log.js').LogEntry[]} */
  let log = [];
  const add = (i, keepSince) => {
    log = appendEntry(
      log,
      createEntry(`e${i}`, 'combat', `m${i}`, i),
      { story: 3, chatter: 3 },
      keepSince,
    );
  };
  for (let i = 0; i < 3; i++) add(i, null);
  // The fight starts at time 2, so e2 onward belongs to it.
  for (let i = 3; i < 6; i++) add(i, 2);
  assert.deepEqual(
    log.map((e) => e.id),
    ['e2', 'e3', 'e4', 'e5'],
    'only the entries older than the fight are trimmed',
  );
  add(6, null);
  assert.equal(log.length, 3, 'the first append after the fight trims back to the limit');
  add(7, 99);
  assert.deepEqual(
    log.map((e) => e.id),
    ['e5', 'e6', 'e7'],
    'a fight start later than every entry still trims to the limit',
  );
});

test('a fight that never ends stops growing at the fight limit', () => {
  /** @type {import('../src/types/log.js').LogEntry[]} */
  let log = [];
  for (let i = 0; i < TRAVELOG_FIGHT_LIMIT + 5; i++) {
    log = appendEntry(log, createEntry(`e${i}`, 'combat', `m${i}`, i), TRAVELOG_LIMITS, 0);
  }
  assert.equal(log.length, TRAVELOG_FIGHT_LIMIT);
  assert.equal(log[0].id, 'e5');
});

test('createEntry keeps an in-game clock and a round, copied', () => {
  const clock = { day: 2, watch: 4, minutes: 30 };
  const entry = createEntry('e1', 'combat', 'Hit.', 5, undefined, { clock, round: 3 });
  assert.deepEqual(entry.clock, { day: 2, watch: 4 });
  assert.equal(entry.round, 3);
  assert.notEqual(entry.clock, clock);
  const plain = createEntry('e2', 'note', 'A', 5, undefined, { round: undefined });
  assert.equal('clock' in plain || 'round' in plain, false);
});

test('stampLabel reads the day and watch, and the round of a fight line', () => {
  const clock = { day: 3, watch: 4 };
  assert.equal(stampLabel(createEntry('a', 'note', 'A', 1)), null);
  assert.equal(stampLabel(createEntry('a', 'note', 'A', 1, {}, { clock })), 'Day 3, Dusk');
  const fight = createEntry('b', 'combat', 'B', 1, {}, { clock, round: 2 });
  assert.equal(stampLabel(fight), 'Day 3, Dusk, round 2');
  assert.equal(stampLabel(fight, true), 'Round 2');
  assert.equal(stampLabel(createEntry('c', 'combat', 'C', 1, {}, { round: 4 })), 'Round 4');
  assert.equal(stampLabel(createEntry('d', 'note', 'D', 1, {}, { clock }), true), 'Day 3, Dusk');
});
