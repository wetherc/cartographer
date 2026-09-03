import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile, TileGrid } from '../src/map/TileGrid.js';
import { createCharacter } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import {
  buildState,
  deserialize,
  packState,
  serialize,
  toTileGrid,
} from '../src/storage/SaveManager.js';
import { installLocalStorage } from './helpers/env.js';

beforeEach(installLocalStorage);

function sampleState() {
  const grid = new TileGrid();
  let world = createMapNode('world', 'World', null, 2, 2);
  world = setTile(world, createTile('0,0', 'grass.svg', { revealed: true }));
  grid.addNode(world);
  grid.addNode(createMapNode('region', 'Region', 'world', 1, 1));
  return buildState({
    grid,
    characters: [createCharacter('c1', 'Aldric')],
    creatures: [createCreature('m1', 'Goblin'), createCreature('m2', 'Wolf')],
  });
}

test('toTileGrid holds the state its own node objects', () => {
  const state = deserialize(serialize(sampleState()));
  const grid = toTileGrid(state);
  for (const node of state.nodes) {
    assert.equal(grid.getNode(node.id), node, `${node.id} is the parsed object`);
  }
  assert.equal(grid.nodes.size, state.nodes.length);
});

test('an unchanged entity packs to the cached object across saves', () => {
  const state = sampleState();
  const first = packState(state);
  const second = packState(state);
  assert.equal(second.characters[0], first.characters[0]);
  assert.equal(second.creatures[1], first.creatures[1]);
  const edited = {
    ...state,
    creatures: [state.creatures[0], { ...state.creatures[1], name: 'Dire Wolf' }],
  };
  const third = packState(edited);
  assert.equal(third.creatures[0], first.creatures[0], 'the untouched creature stays cached');
  assert.notEqual(third.creatures[1], first.creatures[1], 'the edited creature packs anew');
  assert.equal(third.creatures[1].name, 'Dire Wolf');
});

test('a warming pack makes the first real save a cache lookup', () => {
  // This is what the idle warm after a load does: pack once, throw the
  // result away, and let the caches answer the save that follows.
  const state = deserialize(serialize(sampleState()));
  packState(state);
  const first = packState(state);
  const second = packState(state);
  assert.equal(second.nodes[0], first.nodes[0], 'the node encode is the cached object');
  assert.equal(second.characters[0], first.characters[0]);
});
