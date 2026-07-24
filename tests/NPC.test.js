import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createNPC,
  npcsAt,
  knownNpcsAt,
  meetNPCs,
  npcsOnTile,
  withDefaults,
  formatLocation,
} from '../src/entities/NPC.js';

test('createNPC defaults role/notes empty, disposition neutral, unplaced, unmet, neutral stats', () => {
  const npc = createNPC('n1', 'Bram');
  assert.deepEqual(npc, {
    id: 'n1',
    name: 'Bram',
    role: '',
    disposition: 'neutral',
    notes: '',
    stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    location: null,
    met: false,
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
  assert.equal(restored.met, false);
  assert.equal(restored.stats.DEX, 16); // kept
  assert.equal(restored.stats.STR, 10); // backfilled
});

test('knownNpcsAt hides placed NPCs until met, keeps unplaced ones', () => {
  const npcs = [
    createNPC('a', 'Bram', { location: { nodeId: 'world', tileId: '3,2' } }),
    createNPC('b', 'Maera', { location: { nodeId: 'world', tileId: '4,4' }, met: true }),
    createNPC('c', 'Narrator'), // unplaced, always known
  ];
  const known = knownNpcsAt(npcs, { nodeId: 'world' }).map((n) => n.id);
  assert.deepEqual(known, ['b', 'c']);
});

test('meetNPCs marks only NPCs on the exact landing tile, reporting the introductions', () => {
  const npcs = [
    createNPC('a', 'Bram', { location: { nodeId: 'world', tileId: '3,2' } }),
    createNPC('b', 'Guard', { location: { nodeId: 'world', tileId: '4,2' } }),
    createNPC('c', 'Narrator'), // unplaced NPCs are never "met"
  ];
  const { npcs: next, met } = meetNPCs(npcs, { nodeId: 'world', tileId: '3,2' });
  assert.deepEqual(
    met.map((n) => n.id),
    ['a'],
  );
  assert.equal(next.find((n) => n.id === 'a')?.met, true);
  assert.equal(next.find((n) => n.id === 'b')?.met, false);
  assert.equal(next.find((n) => n.id === 'c')?.met, false);
});

test('meetNPCs is a no-op for already-met NPCs, a null position, or an empty tile', () => {
  const npcs = [
    createNPC('a', 'Bram', { location: { nodeId: 'world', tileId: '3,2' }, met: true }),
  ];
  assert.deepEqual(meetNPCs(npcs, { nodeId: 'world', tileId: '3,2' }), { npcs, met: [] });
  assert.deepEqual(meetNPCs(npcs, null), { npcs, met: [] });
  assert.deepEqual(meetNPCs(npcs, { nodeId: 'world', tileId: '9,9' }), { npcs, met: [] });
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
  assert.deepEqual(
    npcsOnTile(npcs, { nodeId: 'world', tileId: '3,2' }).map((n) => n.id),
    ['a'],
  );
  assert.deepEqual(npcsOnTile(npcs, { nodeId: 'region', tileId: '3,2' }), []);
  assert.deepEqual(npcsOnTile(npcs, null), []);
});
