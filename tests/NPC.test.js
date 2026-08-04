import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createNPC,
  npcsAt,
  knownNpcsAt,
  meetNPCs,
  npcsOnTile,
  isOnTile,
  withDefaults,
  formatLocation,
  dispositionOptions,
  npcStatBlock,
  damageNPC,
  healNPC,
  isNPCDefeated,
  DEFAULT_NPC_HP,
} from '../src/entities/NPC.js';

test('dispositionOptions offers every disposition, capitalized', () => {
  assert.deepEqual(dispositionOptions(), [
    { value: 'friendly', label: 'Friendly' },
    { value: 'neutral', label: 'Neutral' },
    { value: 'hostile', label: 'Hostile' },
  ]);
});

test('createNPC defaults role/notes empty, disposition neutral, unplaced, unmet, commoner stats', () => {
  const npc = createNPC('n1', 'Bram');
  assert.deepEqual(npc, {
    id: 'n1',
    name: 'Bram',
    role: '',
    disposition: 'neutral',
    notes: '',
    stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10, AC: 10 },
    maxHP: DEFAULT_NPC_HP,
    currentHP: DEFAULT_NPC_HP,
    location: null,
    met: false,
    weapon: null,
    armor: null,
    conditions: [],
  });
});

test('createNPC takes hit points and gear, deriving AC from DEX when none is typed', () => {
  const weapon = {
    name: 'Club',
    handling: 'melee',
    damage: [{ dice: 1, die: 'd4', type: 'bludgeoning' }],
  };
  const npc = createNPC('n1', 'Guard', { maxHP: 11, stats: { DEX: 14 }, weapon });
  assert.equal(npc.maxHP, 11);
  assert.equal(npc.currentHP, 11);
  assert.equal(npc.stats.AC, 12);
  assert.deepEqual(npc.weapon, weapon);
});

test('createNPC clamps a nonsense maximum to a live NPC', () => {
  assert.equal(createNPC('a', 'Zero', { maxHP: 0 }).maxHP, DEFAULT_NPC_HP);
  assert.equal(createNPC('b', 'Negative', { maxHP: -5 }).maxHP, 1);
  assert.equal(createNPC('c', 'Fraction', { maxHP: 7.8 }).maxHP, 7);
});

test('npcStatBlock adds the worn armor bonus to the stat block AC', () => {
  const bare = createNPC('a', 'Bram', { stats: { AC: 13 } });
  assert.equal(npcStatBlock(bare).AC, 13);
  const armored = createNPC('b', 'Guard', {
    stats: { AC: 13 },
    armor: { name: 'Shield', acBonus: 2 },
  });
  assert.equal(npcStatBlock(armored).AC, 15);
  assert.equal(armored.stats.AC, 13, 'the stored block is untouched');
});

test('npcStatBlock closes an old stat block over the fixed stat set', () => {
  const legacy = /** @type {any} */ ({ stats: { DEX: 16, Speed: 30 } });
  const block = npcStatBlock(legacy);
  assert.equal(block.AC, 13);
  assert.equal(block.STR, 10);
  assert.equal('Speed' in block, false);
});

test('damageNPC and healNPC clamp to [0, maxHP], and 0 HP is defeat', () => {
  const npc = createNPC('n1', 'Bram', { maxHP: 6 });
  assert.equal(damageNPC(npc, 2).currentHP, 4);
  assert.equal(damageNPC(npc, 99).currentHP, 0);
  assert.equal(healNPC(npc, 5).currentHP, 6);
  assert.equal(healNPC(damageNPC(npc, 4), 1).currentHP, 3);
  assert.equal(isNPCDefeated(npc), false);
  assert.equal(isNPCDefeated(damageNPC(npc, 6)), true);
});

test('withDefaults fills an empty condition list on an NPC saved without one', () => {
  const bare = /** @type {any} */ ({ id: 'n1', name: 'Bram' });
  assert.deepEqual(withDefaults(bare).conditions, []);
  const chipped = { ...createNPC('n2', 'Sela'), conditions: [{ name: 'Poisoned', rounds: 3 }] };
  assert.deepEqual(withDefaults(chipped).conditions, [{ name: 'Poisoned', rounds: 3 }]);
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
  assert.equal(restored.stats.AC, 13); // derived from the kept DEX
  assert.equal(restored.maxHP, DEFAULT_NPC_HP);
  assert.equal(restored.currentHP, DEFAULT_NPC_HP);
  assert.equal(restored.weapon, null);
  assert.equal(restored.armor, null);
});

test('withDefaults keeps live hit points and gear, clamping current HP to the maximum', () => {
  const armor = { name: 'Leather Armor', acBonus: 1 };
  const hurt = { ...createNPC('n1', 'Bram', { maxHP: 9, armor }), currentHP: 3 };
  const restored = withDefaults(hurt);
  assert.equal(restored.currentHP, 3);
  assert.deepEqual(restored.armor, armor);
  const shrunk = withDefaults({ ...hurt, maxHP: 2 });
  assert.equal(shrunk.currentHP, 2);
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

test('isOnTile is the same membership test for one NPC', () => {
  const here = { nodeId: 'world', tileId: '3,2' };
  const placed = createNPC('a', 'Bram', { location: here });
  assert.equal(isOnTile(placed, here), true);
  assert.equal(isOnTile(placed, { nodeId: 'world', tileId: '4,2' }), false, 'another tile');
  assert.equal(isOnTile(placed, { nodeId: 'region', tileId: '3,2' }), false, 'another node');
  assert.equal(isOnTile(placed, null), false, 'nowhere');
  assert.equal(isOnTile(createNPC('c', 'Narrator'), here), false, 'unplaced is on no tile');
});
