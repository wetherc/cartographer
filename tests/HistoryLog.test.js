import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_BYTE_CAP,
  HISTORY_KEY,
  clearHistoryLog,
  historyDepth,
  redoCampaign,
  saveCampaign,
  undoCampaign,
} from '../src/storage/HistoryLog.js';
import { loadFromLocalStorage } from '../src/storage/SaveManager.js';
import { CURRENT_VERSION } from '../src/storage/Migrations.js';
import { installLocalStorage } from './helpers/env.js';

/**
 * A minimal campaign state, optionally with quests, so a save differs from the
 * one before it by a known amount.
 * @param {import('../src/types/quest.js').Quest[]} [quests]
 * @returns {any}
 */
function state(quests = []) {
  return {
    version: CURRENT_VERSION,
    nodes: [],
    party: null,
    characters: [],
    encounters: [],
    travelog: [],
    quests,
    clock: null,
    npcs: [],
    handouts: [],
    bestiary: [],
    splitParty: false,
    combat: null,
  };
}

/**
 * @param {string} id
 * @param {string} title
 * @returns {any}
 */
function quest(id, title) {
  return { id, title, done: false };
}

/** The stored index record, or null. */
function storedIndex() {
  const raw = localStorage.getItem(HISTORY_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** How many delta records are stored, index excluded. */
function storedDeltas(store) {
  return [...store.keys()].filter((key) => key.startsWith(`${HISTORY_KEY}:d`)).length;
}

/** The quest titles of the persisted campaign, in order. */
function persistedTitles() {
  const loaded = /** @type {any} */ (loadFromLocalStorage());
  return loaded.quests.map((/** @type {any} */ q) => q.title);
}

beforeEach(installLocalStorage);

test('a first save records no step, because there is nothing to step back to', () => {
  const result = saveCampaign(state());
  assert.equal(result.ok, true);
  assert.deepEqual(result.history, { ok: true, evictedAll: false });
  assert.deepEqual(historyDepth(), { undo: 0, redo: 0 });
  assert.equal(undoCampaign(), null);
});

test('a second save records one undoable step', () => {
  saveCampaign(state());
  const result = saveCampaign(state([quest('q1', 'Find the barrow')]));
  assert.deepEqual(result.history, { ok: true, evictedAll: false });
  assert.deepEqual(historyDepth(), { undo: 1, redo: 0 });
  assert.deepEqual(persistedTitles(), ['Find the barrow']);
});

test('undo restores the previous save and redo re-applies the edit', () => {
  saveCampaign(state());
  saveCampaign(state([quest('q1', 'Find the barrow')]));
  const undone = /** @type {any} */ (undoCampaign());
  assert.deepEqual(undone.state.quests, []);
  assert.deepEqual(persistedTitles(), [], 'the restored state is what is stored');
  assert.deepEqual(historyDepth(), { undo: 0, redo: 1 });
  const redone = /** @type {any} */ (redoCampaign());
  assert.deepEqual(
    redone.state.quests.map((/** @type {any} */ q) => q.title),
    ['Find the barrow'],
  );
  assert.deepEqual(persistedTitles(), ['Find the barrow']);
  assert.deepEqual(historyDepth(), { undo: 1, redo: 0 });
  assert.equal(redoCampaign(), null, 'nothing left to redo at the head');
});

test('a sequence of saves undoes and redoes step by step', () => {
  saveCampaign(state());
  saveCampaign(state([quest('q1', 'One')]));
  saveCampaign(state([quest('q1', 'One'), quest('q2', 'Two')]));
  saveCampaign(state([quest('q1', 'One'), quest('q2', 'Two'), quest('q3', 'Three')]));
  assert.deepEqual(historyDepth(), { undo: 3, redo: 0 });
  undoCampaign();
  assert.deepEqual(persistedTitles(), ['One', 'Two']);
  undoCampaign();
  assert.deepEqual(persistedTitles(), ['One']);
  undoCampaign();
  assert.deepEqual(persistedTitles(), []);
  assert.equal(undoCampaign(), null);
  redoCampaign();
  redoCampaign();
  assert.deepEqual(persistedTitles(), ['One', 'Two']);
});

test('an edit made behind the head drops the redo tail', () => {
  const store = installLocalStorage();
  saveCampaign(state());
  saveCampaign(state([quest('q1', 'One')]));
  saveCampaign(state([quest('q1', 'One'), quest('q2', 'Two')]));
  undoCampaign();
  undoCampaign();
  assert.deepEqual(historyDepth(), { undo: 0, redo: 2 });
  saveCampaign(state([quest('q9', 'Elsewhere')]));
  assert.deepEqual(historyDepth(), { undo: 1, redo: 0 }, 'the tail is gone');
  assert.equal(storedDeltas(store), 1, 'and its records are removed, not just unindexed');
  assert.equal(redoCampaign(), null);
});

test('an unchanged campaign saved again is not a history step', () => {
  saveCampaign(state());
  saveCampaign(state([quest('q1', 'One')]));
  const again = saveCampaign(state([quest('q1', 'One')]));
  assert.deepEqual(again.history, { ok: true, evictedAll: false });
  assert.deepEqual(historyDepth(), { undo: 1, redo: 0 });
});

test('undo reverses an insertion, a removal, and a reorder together', () => {
  saveCampaign(state([quest('a', 'A'), quest('b', 'B'), quest('c', 'C')]));
  saveCampaign(state([quest('c', 'C'), quest('a', 'A'), quest('d', 'D')]));
  assert.deepEqual(persistedTitles(), ['C', 'A', 'D']);
  undoCampaign();
  assert.deepEqual(persistedTitles(), ['A', 'B', 'C'], 'order and membership both restored');
});

test('the log is dropped when its stored version is not this app schema', () => {
  const store = installLocalStorage();
  saveCampaign(state());
  saveCampaign(state([quest('q1', 'One')]));
  const index = storedIndex();
  localStorage.setItem(HISTORY_KEY, JSON.stringify({ ...index, version: CURRENT_VERSION - 1 }));
  // A delta is never migrated: it describes one app version's state shape, so
  // applying it after an upgrade could corrupt the campaign it lands on.
  assert.deepEqual(historyDepth(), { undo: 0, redo: 0 });
  assert.equal(undoCampaign(), null);
  assert.equal(storedDeltas(store), 0, 'the orphaned records are reclaimed too');
});

test("the previous ring's index and snapshot keys are reclaimed on first use", () => {
  const store = installLocalStorage();
  // The pre-log layout: an array of sequence numbers plus one whole serialized
  // save per key. It is dropped rather than converted -- a snapshot is not a
  // delta and cannot become one.
  localStorage.setItem(HISTORY_KEY, JSON.stringify([0, 1]));
  localStorage.setItem(`${HISTORY_KEY}:0`, '{"nodes":[]}');
  localStorage.setItem(`${HISTORY_KEY}:1`, '{"nodes":[],"party":null}');
  assert.deepEqual(historyDepth(), { undo: 0, redo: 0 });
  assert.equal(
    [...store.keys()].some((key) => key.startsWith(HISTORY_KEY)),
    false,
  );
});

test('a corrupt index reads as an empty log rather than throwing', () => {
  localStorage.setItem(HISTORY_KEY, 'not json');
  assert.deepEqual(historyDepth(), { undo: 0, redo: 0 });
  localStorage.setItem(HISTORY_KEY, `{"version":${CURRENT_VERSION},"deltas":"nope"}`);
  assert.deepEqual(historyDepth(), { undo: 0, redo: 0 });
  assert.equal(undoCampaign(), null);
});

test('a step whose record has gone missing drops the log instead of throwing', () => {
  const store = installLocalStorage();
  saveCampaign(state());
  saveCampaign(state([quest('q1', 'One')]));
  const index = /** @type {any} */ (storedIndex());
  localStorage.removeItem(`${HISTORY_KEY}:d${index.deltas[0]}`);
  assert.equal(undoCampaign(), null);
  assert.equal(storedDeltas(store), 0);
  assert.equal(localStorage.getItem(HISTORY_KEY), null);
  assert.deepEqual(persistedTitles(), ['One'], 'the campaign itself is untouched');
});

test('one edit larger than the whole cap drops the log and reports it', () => {
  saveCampaign(state());
  // Every quest is its own insertion op, so a long enough list exceeds the cap
  // in a single step -- the shape a generated 40x40 node takes.
  const many = [];
  for (let i = 0; many.length * 120 < HISTORY_BYTE_CAP; i += 1) many.push(quest(`q${i}`, `Q${i}`));
  const result = saveCampaign(state(many));
  assert.equal(result.ok, true, 'the campaign still saves');
  assert.deepEqual(result.history, { ok: false, evictedAll: true });
  assert.deepEqual(historyDepth(), { undo: 0, redo: 0 });
});

test('the log drops its oldest steps once it passes the byte cap', () => {
  const store = installLocalStorage();
  // Each step adds one long-titled quest, so the log grows by a known amount and
  // reaches the cap in a bounded number of saves.
  const padding = 'x'.repeat(2000);
  const quests = [];
  saveCampaign(state());
  for (let i = 0; i < 200; i += 1) {
    quests.push(quest(`q${i}`, `${padding}${i}`));
    const result = saveCampaign(state([...quests]));
    assert.deepEqual(result.history, { ok: true, evictedAll: false }, 'trimming is not a failure');
  }
  const bytes = [...store.entries()]
    .filter(([key]) => key.startsWith(`${HISTORY_KEY}:d`))
    .reduce((sum, [, value]) => sum + value.length * 2, 0);
  assert.ok(bytes <= HISTORY_BYTE_CAP, `log is ${bytes} bytes, cap ${HISTORY_BYTE_CAP}`);
  assert.ok(storedDeltas(store) > 1, 'and keeps more than a single step');
  // Depth is bounded but the steps that remain still work.
  undoCampaign();
  assert.equal(persistedTitles().length, 199);
});

test('a full origin gives up the oldest step rather than the whole log', () => {
  const store = installLocalStorage();
  saveCampaign(state());
  saveCampaign(state([quest('q1', 'One')]));
  saveCampaign(state([quest('q1', 'One'), quest('q2', 'Two')]));
  assert.deepEqual(historyDepth(), { undo: 2, redo: 0 });
  const realSetItem = localStorage.setItem;
  let refusals = 1;
  localStorage.setItem = (key, value) => {
    if (key.startsWith(`${HISTORY_KEY}:d`) && refusals > 0) {
      refusals -= 1;
      throw new Error('QuotaExceededError');
    }
    realSetItem(key, value);
  };
  const result = saveCampaign(
    state([quest('q1', 'One'), quest('q2', 'Two'), quest('q3', 'Three')]),
  );
  localStorage.setItem = realSetItem;
  assert.deepEqual(result.history, { ok: true, evictedAll: true }, 'the lost depth is reported');
  assert.deepEqual(historyDepth(), { undo: 2, redo: 0 }, 'shallower, not empty');
  assert.equal(storedDeltas(store), 2);
  undoCampaign();
  assert.deepEqual(persistedTitles(), ['One', 'Two']);
});

test('a write that can never land clears the log and says nothing is undoable', () => {
  const store = installLocalStorage();
  saveCampaign(state());
  saveCampaign(state([quest('q1', 'One')]));
  const realSetItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key.startsWith(`${HISTORY_KEY}:d`)) throw new Error('QuotaExceededError');
    realSetItem(key, value);
  };
  const result = saveCampaign(state([quest('q1', 'One'), quest('q2', 'Two')]));
  localStorage.setItem = realSetItem;
  assert.deepEqual(result.history, { ok: false, evictedAll: true });
  assert.deepEqual(historyDepth(), { undo: 0, redo: 0 });
  assert.equal(storedDeltas(store), 0, 'no orphaned records remain');
  assert.deepEqual(persistedTitles(), ['One', 'Two'], 'the campaign saved regardless');
});

test('a failed campaign write records no step, so the log matches what is stored', () => {
  saveCampaign(state());
  const realSetItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === 'campaign-builder:save') throw new Error('QuotaExceededError');
    realSetItem(key, value);
  };
  const result = saveCampaign(state([quest('q1', 'One')]));
  localStorage.setItem = realSetItem;
  assert.equal(result.ok, false);
  assert.deepEqual(result.history, { ok: true, evictedAll: false });
  assert.deepEqual(historyDepth(), { undo: 0, redo: 0 });
});

test('a save made by another tab is diffed against, not against the stale cache', () => {
  saveCampaign(state([quest('q1', 'One')]));
  // What a second tab's write looks like from here: the campaign key changes
  // under us with no save of our own in between.
  saveCampaign(state([quest('q1', 'One'), quest('q2', 'Two')]));
  const external = state([quest('q7', 'Another tab')]);
  installLocalStorage();
  localStorage.setItem('campaign-builder:save', JSON.stringify(external));
  saveCampaign(state([quest('q7', 'Another tab'), quest('q8', 'Ours')]));
  assert.deepEqual(historyDepth(), { undo: 1, redo: 0 });
  undoCampaign();
  assert.deepEqual(persistedTitles(), ['Another tab'], 'undo lands on what was stored');
});

test('clearHistoryLog removes the index and every record', () => {
  const store = installLocalStorage();
  saveCampaign(state());
  saveCampaign(state([quest('q1', 'One')]));
  saveCampaign(state([quest('q1', 'One'), quest('q2', 'Two')]));
  clearHistoryLog();
  assert.equal(localStorage.getItem(HISTORY_KEY), null);
  assert.equal(storedDeltas(store), 0);
  assert.equal(store.has('campaign-builder:save'), true, 'the campaign is not history');
});
