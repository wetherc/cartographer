import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNPC, npcsAt, npcsOnTile, withDefaults, formatLocation } from '../src/entities/NPC.js';

test('createNPC defaults role/notes empty, disposition neutral, unplaced, neutral stats', () => {
  const npc = createNPC('n1', 'Bram');
  assert.deepEqual(npc, {
    id: 'n1',
    name: 'Bram',
    role: '',
    disposition: 'neutral',
    notes: '',
    stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    location: null,
  });
});

test('npcsAt returns NPCs at the party node plus unplaced ones', () => {
  const npcs = [
    createNPC('a', 'Bram', { location: { nodeId: 'world', tileId: '3,2' } }),
    createNPC('b', 'Wraith', { location: { nodeId: 'crypt', tileId: '0,0' } }),
    createNPC('c', 'Narrator'), // unplaced, always shown
  ];
  const here = npcsAt(npcs, { nodeId: 'world' }).map((n) => n.id);
  assert.deepEqual(here, ['a', 'c']);
});

test('withDefaults backfills a sparse NPC', () => {
  const restored = withDefaults(/** @type {any} */ ({ id: 'x', name: 'Old', stats: { DEX: 16 } }));
  assert.equal(restored.disposition, 'neutral');
  assert.equal(restored.role, '');
  assert.equal(restored.location, null);
  assert.equal(restored.stats.DEX, 16); // kept
  assert.equal(restored.stats.STR, 10); // backfilled
});

test('formatLocation names the node with coordinates, falling back to the raw id', () => {
  const names = { world: 'World' };
  const lookup = (id) => names[id];
  assert.equal(formatLocation({ nodeId: 'world', tileId: '3,2' }, lookup), 'World (3,2)');
  assert.equal(formatLocation({ nodeId: 'gone', tileId: '0,0' }, lookup), 'gone (0,0)');
  assert.equal(formatLocation(null, lookup), 'Everywhere');
});

test('npcsOnTile matches only NPCs standing exactly on the tile', () => {
  const npcs = [
    createNPC('a', 'Bram', { location: { nodeId: 'world', tileId: '3,2' } }),
    createNPC('b', 'Guard', { location: { nodeId: 'world', tileId: '4,2' } }),
    createNPC('c', 'Narrator'), // unplaced NPCs never join a tile's fight
  ];
  assert.deepEqual(npcsOnTile(npcs, { nodeId: 'world', tileId: '3,2' }).map((n) => n.id), ['a']);
  assert.deepEqual(npcsOnTile(npcs, { nodeId: 'region', tileId: '3,2' }), []);
  assert.deepEqual(npcsOnTile(npcs, null), []);
});
