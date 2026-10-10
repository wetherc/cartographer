import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_KEY,
  applyHistoryOps,
  clearHistoryLog,
  redoCampaign,
  saveCampaign,
  undoCampaign,
} from '../src/storage/HistoryLog.js';
import { ADOPTION_WALK, historyPosition, planAdoption } from '../src/storage/HistoryAdoption.js';
import { STORAGE_KEY, SAVE_MARK_KEY, loadFromLocalStorage } from '../src/storage/SaveStorage.js';
import { CURRENT_VERSION } from '../src/storage/Migrations.js';
import { installLocalStorage } from './helpers/env.js';

/**
 * A minimal campaign state whose quests, with every default field, are the
 * given titles, so each save differs from the one before it by a known
 * amount.
 * @param {string[]} titles
 * @returns {any}
 */
function state(titles) {
  return {
    version: CURRENT_VERSION,
    nodes: [],
    party: null,
    characters: [],
    encounters: [],
    travelog: [],
    quests: titles.map((title) => ({
      id: title,
      title,
      done: false,
      notes: '',
      status: 'active',
      revealed: false,
      objectives: [],
      links: [],
      unlocks: [],
    })),
    clock: null,
    npcs: [],
    handouts: [],
    bestiary: [],
    splitParty: false,
    combat: null,
  };
}

/** The stored index record. */
function storedIndex() {
  return JSON.parse(/** @type {string} */ (localStorage.getItem(HISTORY_KEY)));
}

/** @param {any} index */
function writeIndex(index) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(index));
}

/**
 * The state that a follower holding `held` reaches by the delta path. The
 * result must equal the full read of the stored save.
 * @param {any} held
 * @param {string | null} position
 * @param {string | null} [mark]
 */
function assertFollows(held, position, mark = null) {
  const plan = planAdoption(position, mark);
  assert.equal(plan.kind, 'delta');
  const steps = /** @type {any} */ (plan).steps;
  const next = steps.reduce(
    (/** @type {any} */ s, /** @type {any} */ ops) => applyHistoryOps(s, ops),
    held,
  );
  assert.deepEqual(next, loadFromLocalStorage());
  return steps.length;
}

/**
 * Save the state with these quest titles, and return the save as a loading
 * tab reads it.
 * @param {string[]} titles
 */
function saved(titles) {
  saveCampaign(state(titles));
  return loadFromLocalStorage();
}

/** Save `count` more states after `titles`, one quest per step. */
function saveSteps(titles, count) {
  for (let i = 0; i < count; i += 1) saveCampaign(state([...titles, `S${i}`]));
}

beforeEach(installLocalStorage);

test('historyPosition is null with no log and names position 0 of a log', () => {
  assert.equal(historyPosition(), null);
  saveCampaign(state([]));
  assert.equal(historyPosition(), null, 'a first save records no delta');
  saveCampaign(state(['One']));
  const first = historyPosition();
  assert.ok(first, 'a recorded delta gives the save a position');
  undoCampaign();
  const base = historyPosition();
  assert.ok(base, 'an undone log still names position 0');
  assert.notEqual(base, first);
});

test('planAdoption walks one delta forward to the head', () => {
  saveCampaign(state([]));
  const held = saved(['One']);
  const position = historyPosition();
  saveCampaign(state(['One', 'Two']));
  assert.equal(assertFollows(held, position), 1);
});

test('planAdoption answers current when the held position is the cursor', () => {
  saveCampaign(state([]));
  saveCampaign(state(['One']));
  assert.deepEqual(planAdoption(historyPosition()), { kind: 'current' });
  saveCampaign(state(['One', 'Two']));
  undoCampaign();
  assert.deepEqual(planAdoption(historyPosition()), { kind: 'current' }, 'away from the head');
});

test('planAdoption walks the first save of a new log from the base save mark', () => {
  const held = saved([]);
  const mark = localStorage.getItem(SAVE_MARK_KEY);
  assert.equal(historyPosition(), null);
  saveCampaign(state(['One']));
  assert.equal(storedIndex().baseMark, mark);
  assert.equal(assertFollows(held, null, mark), 1);
  assert.deepEqual(planAdoption(null), { kind: 'full' }, 'no mark');
  assert.deepEqual(planAdoption(null, 'another'), { kind: 'full' }, 'another save');
  saveCampaign(state(['One', 'Two']));
  assert.equal(storedIndex().baseMark, mark, 'a later step keeps the base mark');
  assert.equal(assertFollows(held, null, mark), 2);
});

test('planAdoption walks gaps up to ADOPTION_WALK deltas and no further', () => {
  saveCampaign(state([]));
  const held = saved(['Held']);
  const position = historyPosition();
  saveCampaign(state(['Held', 'Two']));
  saveCampaign(state(['Held', 'Two', 'Three']));
  assert.equal(assertFollows(held, position), 2);
  saveSteps(['Held'], ADOPTION_WALK - 2);
  assert.equal(assertFollows(held, position), ADOPTION_WALK);
  saveSteps(['Held', 'Last'], 1);
  assert.deepEqual(planAdoption(position), { kind: 'full' });
});

test('planAdoption walks back across undos and forward again across redos', () => {
  saveCampaign(state([]));
  saveCampaign(state(['One']));
  saveCampaign(state(['One', 'Two']));
  const head = saved(['One', 'Two', 'Three']);
  const position = historyPosition();
  undoCampaign();
  assert.equal(assertFollows(head, position), 1);
  undoCampaign();
  assert.equal(assertFollows(head, position), 2);
  undoCampaign();
  assert.equal(assertFollows(head, position), 3, 'back to position 0');
  const base = loadFromLocalStorage();
  const basePosition = historyPosition();
  redoCampaign();
  redoCampaign();
  assert.equal(assertFollows(base, basePosition), 2);
});

test('planAdoption walks forward across a save from an undone cursor', () => {
  saveCampaign(state([]));
  const held = saved(['One']);
  saveCampaign(state(['One', 'Two']));
  undoCampaign();
  const position = historyPosition();
  saveCampaign(state(['One', 'Nine']));
  assert.equal(assertFollows(held, position), 1);
});

test('planAdoption falls back when a record in the walk is missing', () => {
  saveCampaign(state([]));
  saveCampaign(state(['One']));
  const position = historyPosition();
  saveSteps(['One'], 3);
  localStorage.removeItem(`${HISTORY_KEY}:d${storedIndex().deltas[2]}`);
  assert.deepEqual(planAdoption(position), { kind: 'full' });
});

test('planAdoption falls back for a cleared log and for a restarted one', () => {
  saveCampaign(state([]));
  saveCampaign(state(['One']));
  saveCampaign(state(['One', 'Two']));
  const position = historyPosition();
  clearHistoryLog();
  assert.deepEqual(planAdoption(position), { kind: 'full' }, 'a cleared log');
  // A new log reuses the same sequence numbers with different states behind
  // them. The log id in the position keeps this from matching.
  saveCampaign(state(['Seven']));
  saveCampaign(state(['Seven', 'Eight']));
  saveCampaign(state(['Seven', 'Eight', 'Nine']));
  assert.deepEqual(planAdoption(position), { kind: 'full' }, 'a restarted log');
});

test('a dropped first record retires the base mark and position 0', () => {
  saveCampaign(state([]));
  const mark = localStorage.getItem(SAVE_MARK_KEY);
  saveCampaign(state(['One']));
  saveCampaign(state(['One', 'Two']));
  undoCampaign();
  undoCampaign();
  const base = historyPosition();
  redoCampaign();
  redoCampaign();
  const index = storedIndex();
  localStorage.removeItem(`${HISTORY_KEY}:d${index.deltas[0]}`);
  writeIndex({ ...index, deltas: index.deltas.slice(1), cursor: index.cursor - 1 });
  assert.deepEqual(planAdoption(null, mark), { kind: 'full' });
  assert.deepEqual(planAdoption(base), { kind: 'full' });
});

test('a new log stores no base mark when another save lands during the read', () => {
  saveCampaign(state([]));
  localStorage.setItem(SAVE_MARK_KEY, 'read-first');
  const getItem = localStorage.getItem;
  localStorage.getItem = (key) => {
    const value = getItem(key);
    if (key === STORAGE_KEY) localStorage.setItem(SAVE_MARK_KEY, 'landed-between');
    return value;
  };
  saveCampaign(state(['One']));
  localStorage.getItem = getItem;
  assert.equal(storedIndex().baseMark, null);
  assert.deepEqual(planAdoption(null, 'read-first'), { kind: 'full' });
});
