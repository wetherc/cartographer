import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAMPAIGN_FIELDS,
  CAMPAIGN_FIELD_KEYS,
  campaignFields,
} from '../src/storage/CampaignFields.js';
import { buildState, deserialize, serialize } from '../src/storage/SaveManager.js';
import { buildBlankCampaign } from '../src/campaign/Campaigns.js';
import { createMapNode, TileGrid } from '../src/map/TileGrid.js';

/** Keys that the save names apart from the table. */
const OUTSIDE = ['version', 'nodes', 'party'];

/** The property names of the `CampaignState` interface, read from its source. */
function campaignStateKeys() {
  const source = readFileSync(new URL('../src/types/storage.ts', import.meta.url), 'utf8');
  const body = source.split('export interface CampaignState {')[1].split('\n}')[0];
  return [...body.matchAll(/^ {2}(\w+)\??:/gm)].map((match) => match[1]);
}

function smallGrid() {
  const grid = new TileGrid();
  grid.addNode(createMapNode('world', 'World', null, 2, 2));
  return grid;
}

test('the table names every CampaignState field except version, nodes, and party', () => {
  assert.deepEqual([...CAMPAIGN_FIELD_KEYS, ...OUTSIDE].sort(), campaignStateKeys().sort());
});

test('buildState writes each table field in table order after nodes and party', () => {
  const state = buildState({ grid: smallGrid() });
  assert.deepEqual(Object.keys(state), ['nodes', 'party', ...CAMPAIGN_FIELD_KEYS, 'version']);
});

test('a save of empty fields reads back with the same empty values', () => {
  const state = buildState({ grid: smallGrid() });
  const loaded = deserialize(serialize(state));
  assert.deepEqual(Object.keys(loaded).sort(), [...CAMPAIGN_FIELD_KEYS, ...OUTSIDE].sort());
  for (const { key, empty } of CAMPAIGN_FIELDS) assert.deepEqual(loaded[key], empty(), key);
});

test('each coercion turns a missing value into the empty value', () => {
  for (const { key, empty, coerce } of CAMPAIGN_FIELDS) {
    assert.deepEqual(coerce(undefined), empty(), key);
  }
});

test('campaignFields fills undefined fields, keeps given ones, and drops extra keys', () => {
  const quests = [{ id: 'q' }];
  const fields = campaignFields({ quests, splitParty: undefined, mode: 'play', grid: {} });
  assert.equal(fields.quests, quests);
  assert.equal(fields.splitParty, false);
  assert.deepEqual(Object.keys(fields), [...CAMPAIGN_FIELD_KEYS]);
});

test('each empty value is a fresh object', () => {
  const a = campaignFields({});
  const b = campaignFields({});
  assert.notEqual(a.characters, b.characters);
  assert.notEqual(a.entryTiles, b.entryTiles);
});

test('the blank campaign has exactly the table fields beside grid and party', () => {
  const keys = Object.keys(buildBlankCampaign()).filter((key) => key !== 'grid' && key !== 'party');
  assert.deepEqual(keys, [...CAMPAIGN_FIELD_KEYS]);
});
