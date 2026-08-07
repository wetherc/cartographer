import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  serializeCampaignFile,
  extractBundledLibrary,
  parseCampaignFile,
  libraryImportAction,
} from '../src/storage/CampaignFile.js';
import { buildState, serialize } from '../src/storage/SaveManager.js';
import { emptyLibrary } from '../src/library/Library.js';
import { createMapNode, TileGrid } from '../src/map/TileGrid.js';
import { createCharacter } from '../src/entities/Character.js';

function sampleState() {
  const grid = new TileGrid();
  grid.addNode(createMapNode('world', 'World', null, 2, 2));
  return buildState({
    grid,
    party: { nodeId: 'world', tileId: '0,0' },
    characters: [createCharacter('c1', 'Hero')],
  });
}

const customs = () => ({
  ...emptyLibrary(),
  spells: [{ id: 'zap', name: 'Zap', level: 0 }],
});

test('serializeCampaignFile carries the normalized customs beside the save', () => {
  const state = sampleState();
  const parsed = JSON.parse(serializeCampaignFile(state, customs()));
  assert.equal(parsed.library.spells[0].name, 'Zap');
  delete parsed.library;
  assert.deepEqual(parsed, JSON.parse(serialize(state)), 'the save part is the plain serialize');
});

test('serializeCampaignFile omits the field for a null or empty library', () => {
  const state = sampleState();
  assert.deepEqual(JSON.parse(serializeCampaignFile(state, null)), JSON.parse(serialize(state)));
  assert.deepEqual(
    JSON.parse(serializeCampaignFile(state, emptyLibrary())),
    JSON.parse(serialize(state)),
  );
});

test('a bundled library never enters the deserialized campaign state', () => {
  const { state } = parseCampaignFile(serializeCampaignFile(sampleState(), customs()));
  assert.equal('library' in state, false);
});

test('parseCampaignFile returns the state and the normalized library together', () => {
  const { state, library } = parseCampaignFile(serializeCampaignFile(sampleState(), customs()));
  assert.equal(state.characters[0].name, 'Hero');
  assert.equal(library?.spells[0].id, 'zap');
});

test('extractBundledLibrary reads an absent, empty, or malformed field as null', () => {
  assert.equal(extractBundledLibrary(null), null);
  assert.equal(extractBundledLibrary('nonsense'), null);
  assert.equal(extractBundledLibrary([]), null);
  assert.equal(extractBundledLibrary({}), null, 'absent field');
  assert.equal(extractBundledLibrary({ library: 7 }), null);
  assert.equal(extractBundledLibrary({ library: 'text' }), null);
  assert.equal(extractBundledLibrary({ library: {} }), null, 'empty library');
  assert.equal(
    extractBundledLibrary({ library: { spells: 'not-a-list' } }),
    null,
    'normalize repairs to empty, which reads as absent',
  );
});

test('extractBundledLibrary normalizes what it lifts', () => {
  const library = extractBundledLibrary({
    library: { spells: [{ name: '  Zap  ' }], bogus: true },
  });
  assert.equal(library?.spells[0].name, 'Zap');
  assert.deepEqual(library?.feats, [], 'missing kinds fill in empty');
});

test('a spell effect the engine cannot model survives extraction as text', () => {
  const library = extractBundledLibrary({
    library: {
      spells: [{ name: 'Weird', effects: [{ kind: 'not-a-kind', text: 'GM adjudicates' }] }],
    },
  });
  const spell = library?.spells[0];
  assert.ok(spell, 'the spell is not dropped over the unknown effect');
  assert.equal(spell.name, 'Weird');
});

test('libraryImportAction picks skip, adopt, or confirm', () => {
  assert.equal(libraryImportAction(null, null), 'skip');
  assert.equal(libraryImportAction(null, customs()), 'skip');
  assert.equal(libraryImportAction(emptyLibrary(), customs()), 'skip');
  assert.equal(libraryImportAction(customs(), null), 'adopt');
  assert.equal(libraryImportAction(customs(), emptyLibrary()), 'adopt');
  assert.equal(libraryImportAction(customs(), customs()), 'confirm');
});
