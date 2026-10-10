import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_KEY,
  applyHistoryOps,
  redoCampaign,
  saveCampaign,
  undoCampaign,
} from '../src/storage/HistoryLog.js';
import { historyPosition, planAdoption } from '../src/storage/HistoryAdoption.js';
import { historyForm, opsNameAssets } from '../src/storage/HistoryCodec.js';
import { buildState } from '../src/storage/SaveManager.js';
import { loadFromLocalStorage } from '../src/storage/SaveStorage.js';
import { ASSETS_KEY } from '../src/storage/AssetStore.js';
import { TileGrid, createTile } from '../src/map/TileGrid.js';
import { installLocalStorage } from './helpers/env.js';

const PHOTO = `data:image/png;base64,${'Q'.repeat(245_000)}`;
const TILE_ART = `data:image/png;base64,${'T'.repeat(5_000)}`;

/**
 * A one-node campaign with the given handouts. The first tile uses `art`.
 * @param {{ id: string, title: string, image: string | null }[]} handouts
 * @param {string} [art]
 * @returns {any}
 */
function world(handouts, art = 'assets/tiles/grass/grass-1.svg') {
  const grid = new TileGrid();
  grid.addNode({
    id: 'n',
    name: 'n',
    parentId: null,
    width: 2,
    height: 1,
    tiles: [createTile('0,0', art), createTile('1,0', 'assets/tiles/grass/grass-1.svg')],
  });
  return buildState({
    grid,
    handouts: handouts.map((h) => ({ body: '', revealed: false, ...h })),
  });
}

/** The raw text of the newest record. */
function newestRecord() {
  const index = JSON.parse(/** @type {string} */ (localStorage.getItem(HISTORY_KEY)));
  return localStorage.getItem(`${HISTORY_KEY}:d${index.deltas.at(-1)}`) ?? '';
}

/** The stored image table. */
function storedTable() {
  return JSON.parse(localStorage.getItem(ASSETS_KEY) ?? '{}');
}

const map = { id: 'h1', title: 'Map', image: PHOTO };
const note = { id: 'h2', title: 'Note', image: null };

beforeEach(installLocalStorage);

test('attaching an image records its key, not its payload', () => {
  saveCampaign(world([note]));
  saveCampaign(world([note, map]));
  const record = newestRecord();
  assert.ok(record.startsWith('delta:'));
  assert.ok(record.includes('asset:'));
  assert.ok(!record.includes('data:'), 'the payload is not in the log');
  assert.ok(record.length < 300, `record length ${record.length}`);
});

test('deleting an image keeps its payload for undo, and undo restores it', () => {
  saveCampaign(world([note, map]));
  saveCampaign(world([note]));
  assert.ok(newestRecord().length < 300);
  // An unrelated save runs the retention scan, which finds the record.
  saveCampaign(world([{ ...note, title: 'Note 2' }]));
  assert.ok(Object.values(storedTable()).includes(PHOTO), 'the table keeps the payload');
  undoCampaign();
  undoCampaign();
  const loaded = /** @type {any} */ (loadFromLocalStorage());
  assert.equal(loaded.handouts.find((/** @type {any} */ h) => h.id === 'h1').image, PHOTO);
});

test('undo and redo of an attach restore the payload inline', () => {
  saveCampaign(world([note]));
  saveCampaign(world([note, map]));
  const undone = undoCampaign();
  assert.equal(undone?.state.handouts.length, 1);
  const redone = redoCampaign();
  assert.equal(redone?.state.handouts[1].image, PHOTO);
});

test('a tile painted with custom art records its key, and undo restores the art', () => {
  saveCampaign(world([note]));
  saveCampaign(world([note], TILE_ART));
  assert.ok(!newestRecord().includes('data:'));
  saveCampaign(world([note]));
  const undone = /** @type {any} */ (undoCampaign());
  assert.equal(undone.state.nodes[0].tiles[0].imageRef, TILE_ART);
});

test('a follower applies an image delta to its live state with the payload', () => {
  saveCampaign(world([]));
  const live = world([note]);
  saveCampaign(live);
  const held = historyPosition();
  saveCampaign(world([note, map]));
  const plan = planAdoption(held);
  assert.equal(plan.kind, 'delta');
  const next = /** @type {any} */ (applyHistoryOps(live, /** @type {any} */ (plan).steps[0]));
  assert.equal(next.handouts[1].image, PHOTO);
  assert.equal(next.nodes[0], live.nodes[0], 'an untouched node keeps its identity');
});

test('applyHistoryOps reads no image table for ops that name no image', () => {
  const live = world([note]);
  let reads = 0;
  const getItem = localStorage.getItem;
  localStorage.getItem = (key) => {
    if (key === ASSETS_KEY) reads += 1;
    return getItem(key);
  };
  const next = /** @type {any} */ (
    applyHistoryOps(live, [{ p: ['handouts', 'h2', 'title'], f: 'Note', t: 'Memo' }])
  );
  localStorage.getItem = getItem;
  assert.equal(next.handouts[0].title, 'Memo');
  assert.equal(reads, 0);
});

test('historyForm returns a state with no payload as itself, and caches the rest', () => {
  const plain = world([note]);
  assert.equal(historyForm(plain), plain);
  const withImage = world([note, map]);
  const form = /** @type {any} */ (historyForm(withImage));
  assert.notEqual(form, withImage);
  assert.ok(form.handouts[1].image.startsWith('asset:'));
  assert.equal('assets' in form, false);
  assert.equal(historyForm(withImage), form);
});

test('opsNameAssets looks through strings, lists, and records of op values', () => {
  assert.equal(opsNameAssets([{ p: ['a'], t: 'asset:k' }]), true);
  assert.equal(opsNameAssets([{ p: ['a'], t: [['x', 'asset:k']] }]), true);
  assert.equal(opsNameAssets([{ p: ['a'], t: { refs: ['asset:k'] } }]), true);
  assert.equal(opsNameAssets([{ p: ['a'], f: 'asset:k', t: 'plain' }]), false);
  assert.equal(opsNameAssets([{ p: ['a'], t: 3 }, { p: ['b'] }]), false);
});
