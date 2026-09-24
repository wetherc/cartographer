import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile, TileGrid } from '../src/map/TileGrid.js';
import { createCharacter } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { buildState, packState, warmPackSteps } from '../src/storage/SaveManager.js';

function sampleState() {
  const grid = new TileGrid();
  grid.addNode(setTile(createMapNode('world', 'World', null, 2, 2), createTile('0,0', 'g.svg')));
  grid.addNode(createMapNode('region', 'Region', 'world', 1, 1));
  return buildState({
    grid,
    characters: [createCharacter('hero', 'Hero')],
    creatures: [createCreature('ogre', 'Ogre', { maxHP: 30 })],
  });
}

test('warmPackSteps gives one step per node and per entity', () => {
  const state = sampleState();
  assert.equal(warmPackSteps(state).length, 4);
});

test('each warm step fills the cache packState reads', () => {
  const state = sampleState();
  const [world, region, hero, ogre] = warmPackSteps(state).map((step) => step());
  const packed = packState(state);
  assert.equal(packed.nodes[0], world, 'a warmed node packs to the cached object');
  assert.equal(packed.nodes[1], region);
  assert.equal(packed.characters[0], hero, 'a warmed entity packs to the cached object');
  assert.equal(packed.creatures[0], ogre);
});

test('warmPackSteps skips a collection that is not a list', () => {
  const state = /** @type {any} */ ({ ...sampleState(), handouts: undefined });
  assert.equal(warmPackSteps(state).length, 4);
});
