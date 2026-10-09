import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MapNavigator } from '../src/map/MapNavigator.js';
import { PartyTracker } from '../src/party/PartyTracker.js';
import { buildBlankCampaign } from '../src/campaign/Campaigns.js';
import { buildState } from '../src/storage/SaveManager.js';
import { GM_LOCK_KEY } from '../src/storage/GMLock.js';
import {
  PATCH_KEY_PREFIX,
  clearPatch,
  decodePatch,
  discardPatches,
  encodePatch,
  onPlayerPatch,
  storedPatches,
  writePatch,
} from '../src/storage/PlayerPatch.js';
import { wirePlayerPatches } from '../src/app/playerPatches.js';
import { installLocalStorage, installWindow } from './helpers/env.js';
import { stubApp } from './helpers/app.js';

const QUEST = { id: 'q1', title: 'Find the seal', notes: '', status: 'active' };

/**
 * A stub app over a real blank campaign, so a merge has a grid, a party,
 * and a navigator to re-hydrate.
 * @param {'gm' | 'player'} role
 */
function tab(role) {
  const campaign = buildBlankCampaign();
  const state = /** @type {any} */ ({ ...campaign, mode: 'play', role });
  delete state.grid;
  delete state.party;
  const app = stubApp({
    grid: campaign.grid,
    navigator: new MapNavigator(campaign.grid, 'world'),
    partyTracker: new PartyTracker(campaign.grid, campaign.party),
    state,
  });
  const build = () =>
    buildState({ ...app.state, grid: app.grid, party: app.partyTracker.getPosition() });
  let merged = 0;
  const patches = wirePlayerPatches(app, {
    buildCurrentState: build,
    onMerged: () => (merged += 1),
  });
  return { app, patches, merged: () => merged };
}

/** A storage event for a write that another tab made. */
function storageEvent(/** @type {string} */ key, /** @type {string | null} */ newValue) {
  return { key, newValue, oldValue: null };
}

test('a patch round-trips through its encoding', () => {
  const ops = [{ p: ['splitParty'], f: false, t: true }];
  assert.deepEqual(decodePatch(encodePatch(ops, 3)), ops);
  assert.equal(decodePatch('not json'), null);
  assert.equal(decodePatch('{"n":1}'), null, 'a record without ops is not a patch');
});

test('writePatch stores each patch under its own key, and a full origin returns false', () => {
  const store = installLocalStorage();
  assert.equal(writePatch('abc', []), true);
  writePatch('abc', []);
  const keys = [...store.keys()];
  assert.equal(keys.length, 2, 'a second patch does not overwrite the first');
  assert.ok(keys.every((k) => k.startsWith(`${PATCH_KEY_PREFIX}abc:`)));
  clearPatch(keys[0]);
  assert.equal(store.has(keys[0]), false);

  globalThis.localStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.equal(writePatch('abc', []), false);
});

test('onPlayerPatch reads patch keys only, and unsubscribes', () => {
  installLocalStorage();
  const fire = installWindow();
  /** @type {string[]} */
  const seen = [];
  const stop = onPlayerPatch((ops, key) => seen.push(`${key}:${ops.length}`));
  const ops = [{ p: ['splitParty'], f: false, t: true }];
  fire('storage', storageEvent('campaign-builder:save', encodePatch(ops, 1)));
  fire('storage', storageEvent(`${PATCH_KEY_PREFIX}x`, null));
  fire('storage', storageEvent(`${PATCH_KEY_PREFIX}x`, 'garbage'));
  fire('storage', storageEvent(`${PATCH_KEY_PREFIX}x`, encodePatch(ops, 1)));
  assert.deepEqual(seen, [`${PATCH_KEY_PREFIX}x:1`]);
  stop();
  fire('storage', storageEvent(`${PATCH_KEY_PREFIX}x`, encodePatch(ops, 2)));
  assert.equal(seen.length, 1);
});

test('a player tab sends patches only while a GM tab holds the lock', () => {
  const store = installLocalStorage();
  installWindow();
  const player = tab('player');
  assert.equal(player.patches.active(), false, 'no GM tab, so the player writes the save');
  store.set(GM_LOCK_KEY, JSON.stringify({ id: 'gm', at: Date.now() }));
  assert.equal(player.patches.active(), true);
  player.app.state.role = 'gm';
  assert.equal(player.patches.active(), false, 'a GM tab never sends patches');
});

test('each patch holds only the edits since the previous one', () => {
  const store = installLocalStorage();
  installWindow();
  const { app, patches } = tab('player');
  const key = () => [...store.keys()].filter((k) => k.startsWith(PATCH_KEY_PREFIX)).at(-1) ?? '';

  assert.equal(patches.send(), true);
  assert.equal(key(), '', 'no edit, no patch');

  app.state.quests = [QUEST];
  patches.send();
  assert.deepEqual(decodePatch(store.get(key()) ?? ''), [{ p: ['quests', 'q1'], t: QUEST, i: 0 }]);

  app.state.splitParty = true;
  patches.send();
  assert.deepEqual(decodePatch(store.get(key()) ?? ''), [{ p: ['splitParty'], f: false, t: true }]);

  app.state.splitParty = false;
  patches.rebase();
  assert.equal(patches.send(), true);
  assert.deepEqual(decodePatch(store.get(key()) ?? ''), [{ p: ['splitParty'], f: false, t: true }]);

  globalThis.localStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  app.state.splitParty = true;
  assert.equal(patches.send(), false, 'a failed write keeps the edit unsent');
});

test('the GM tab merges a patch into its own edits and removes the key once saved', () => {
  const store = installLocalStorage();
  const fire = installWindow();
  const gm = tab('gm');
  gm.app.state.splitParty = true; // the GM's own unsaved edit
  const key = `${PATCH_KEY_PREFIX}p1:1`;
  const value = encodePatch([{ p: ['quests', 'q1'], t: QUEST, i: 0 }], 1);
  store.set(key, value);

  fire('storage', storageEvent(key, value));

  assert.deepEqual(gm.app.state.quests, [QUEST]);
  assert.equal(gm.app.state.splitParty, true, 'the GM edit stays');
  assert.equal(gm.merged(), 1);
  assert.equal(store.has(key), true, 'the key stays until the save lands');
  gm.patches.mergeQueued();
  assert.equal(gm.merged(), 1, 'a merged patch does not merge again');
  gm.patches.landed();
  assert.equal(store.has(key), false);
});

test('a patch left in storage by a GM tab that reloaded merges on the next boot', () => {
  const store = installLocalStorage();
  installWindow();
  store.set(`${PATCH_KEY_PREFIX}p1:2`, encodePatch([{ p: ['quests', 'q1'], f: QUEST, i: 0 }], 2));
  store.set(`${PATCH_KEY_PREFIX}p1:1`, encodePatch([{ p: ['quests', 'q1'], t: QUEST, i: 0 }], 1));
  store.set(`${PATCH_KEY_PREFIX}p0:1`, encodePatch([{ p: ['splitParty'], f: false, t: true }], 1));
  store.set(`${PATCH_KEY_PREFIX}bad:1`, 'garbage');
  const player = tab('player');
  player.patches.mergeQueued();
  assert.equal(player.merged(), 0, 'a Player tab leaves the patches to the GM tab');

  const gm = tab('gm');
  gm.patches.mergeQueued();
  assert.equal(gm.merged(), 3);
  assert.deepEqual(gm.app.state.quests, [], 'each tab applies in the order it wrote');
  assert.equal(gm.app.state.splitParty, true);
  assert.equal(store.has(`${PATCH_KEY_PREFIX}bad:1`), false, 'a key that is not a patch goes');
  gm.patches.landed();
  assert.equal(storedPatches().length, 0);
});

test('a tab that leaves the GM role sends its unsaved merges and drops their keys', () => {
  const store = installLocalStorage();
  const fire = installWindow();
  const gm = tab('gm');
  const key = `${PATCH_KEY_PREFIX}p1:1`;
  const value = encodePatch([{ p: ['quests', 'q1'], t: QUEST, i: 0 }], 1);
  store.set(key, value);
  fire('storage', storageEvent(key, value));
  gm.app.state.role = 'player';
  assert.equal(gm.patches.send(), true);
  assert.equal(store.has(key), false);
  assert.equal(storedPatches().length, 1, 'the new patch has the quest');
  assert.deepEqual(storedPatches()[0].ops, [{ p: ['quests', 'q1'], t: QUEST, i: 0 }]);
});

test('discardPatches removes every stored patch and nothing else', () => {
  const store = installLocalStorage();
  writePatch('a', []);
  writePatch('b', []);
  store.set('campaign-builder:save', 'x');
  discardPatches();
  assert.deepEqual([...store.keys()], ['campaign-builder:save']);
});

test('a player tab ignores another player tab patch', () => {
  installLocalStorage();
  const fire = installWindow();
  const player = tab('player');
  fire(
    'storage',
    storageEvent(`${PATCH_KEY_PREFIX}p2`, encodePatch([{ p: ['splitParty'], t: true }], 1)),
  );
  assert.equal(player.app.state.splitParty, false);
  assert.equal(player.merged(), 0);
});

test('a patch that arrives in Build mode waits for Play mode, in order', () => {
  const store = installLocalStorage();
  const fire = installWindow();
  const gm = tab('gm');
  gm.app.state.mode = 'build';
  /** @param {number} n @param {any[]} ops */
  const arrive = (n, ops) => {
    const key = `${PATCH_KEY_PREFIX}p1:${n}`;
    store.set(key, encodePatch(ops, n));
    fire('storage', storageEvent(key, encodePatch(ops, n)));
  };
  arrive(1, [{ p: ['quests', 'q1'], t: QUEST, i: 0 }]);
  arrive(2, [{ p: ['quests', 'q1'], f: QUEST, i: 0 }]);
  assert.deepEqual(gm.app.state.quests, []);

  gm.patches.mergeQueued();
  assert.equal(gm.merged(), 0, 'still in Build mode');

  gm.app.state.mode = 'combat';
  gm.patches.mergeQueued();
  assert.equal(gm.merged(), 2);
  assert.deepEqual(gm.app.state.quests, [], 'the later removal wins over the earlier insert');
  gm.patches.mergeQueued();
  assert.equal(gm.merged(), 2, 'the queue is empty');
});

test('a merge that throws does not count as merged', () => {
  installLocalStorage();
  const fire = installWindow();
  const gm = tab('gm');
  gm.app.actions.resyncMap = () => {
    throw new Error('the map cannot draw this campaign');
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    fire('storage', storageEvent(`${PATCH_KEY_PREFIX}p1`, encodePatch([], 1)));
  } finally {
    console.warn = warn;
  }
  assert.equal(gm.merged(), 0);
});

test('a player patch never sends back a GM-only line it adopted, and keeps the flag of its own', () => {
  const store = installLocalStorage();
  installWindow();
  const { app, patches } = tab('player');
  const key = () => [...store.keys()].filter((k) => k.startsWith(PATCH_KEY_PREFIX)).at(-1) ?? '';
  // The GM tab's save brings a GM-only line, and the player tab adopts it.
  const secret = { id: 'g1', at: 1, kind: 'combat', message: 'Pool of 15 HP.', gm: true };
  app.state.travelog = [secret];
  patches.rebase();
  assert.equal(patches.send(), true);
  assert.equal(key(), '', 'an adopted line is not an edit');
  // A line the player tab logs itself goes to the GM tab whole.
  const own = { ...secret, id: 'p1', player: 'An HP pool.' };
  app.state.travelog = [secret, own];
  patches.send();
  assert.deepEqual(decodePatch(store.get(key()) ?? ''), [{ p: ['travelog', 'p1'], t: own, i: 1 }]);
});
