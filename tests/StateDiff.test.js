import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ID_KEYED,
  applyOps,
  diffState,
  equalValues,
  invertOps,
  opsByteSize,
} from '../src/storage/StateDiff.js';
import { buildExampleCampaign } from '../src/campaign/Campaigns.js';
import { buildState } from '../src/storage/SaveManager.js';
import { TilePalette } from '../src/map/TilePalette.js';

/** A state whose every id-keyed collection is populated, for path coverage. */
function exampleState() {
  return buildState(buildExampleCampaign(new TilePalette()));
}

/** Deep clone through JSON, which is the shape the log round-trips through. */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Assert that the ops carry `before` to `after` and back, and survive JSON. */
function assertRoundTrip(before, after) {
  const ops = clone(diffState(before, after));
  assert.deepEqual(applyOps(before, ops), after, 'forward');
  assert.deepEqual(applyOps(after, invertOps(ops)), before, 'backward');
  return ops;
}

test('an unchanged state produces no ops', () => {
  const state = exampleState();
  assert.deepEqual(diffState(state, clone(state)), []);
});

test('a scalar field change is one op carrying both values', () => {
  const before = { version: 5, splitParty: false };
  const after = { version: 5, splitParty: true };
  const ops = assertRoundTrip(before, after);
  assert.deepEqual(ops, [{ p: ['splitParty'], f: false, t: true }]);
});

test('an added and a removed field are distinguished by which value is absent', () => {
  const ops = diffState({ a: 1 }, { b: 2 });
  assert.deepEqual(ops, [
    { p: ['a'], f: 1 },
    { p: ['b'], t: 2 },
  ]);
  assert.deepEqual(applyOps({ a: 1 }, ops), { b: 2 });
});

test('a null field and an absent one are different states', () => {
  const ops = assertRoundTrip({ clock: null }, {});
  assert.deepEqual(ops, [{ p: ['clock'], f: null }]);
  assert.equal('clock' in applyOps({ clock: null }, ops), false);
});

test('nested records recurse, so an op names only the field that changed', () => {
  const before = { party: { nodeId: 'world', tileId: '1,1' } };
  const after = { party: { nodeId: 'world', tileId: '2,1' } };
  const ops = assertRoundTrip(before, after);
  assert.deepEqual(ops, [{ p: ['party', 'tileId'], f: '1,1', t: '2,1' }]);
});

test('an array outside the id table is replaced whole', () => {
  const before = { characters: [{ id: 'c1', proficiencies: { skills: ['stealth'] } }] };
  const after = { characters: [{ id: 'c1', proficiencies: { skills: ['stealth', 'arcana'] } }] };
  const ops = assertRoundTrip(before, after);
  assert.deepEqual(ops, [
    {
      p: ['characters', 'c1', 'proficiencies', 'skills'],
      f: ['stealth'],
      t: ['stealth', 'arcana'],
    },
  ]);
});

test('an id-keyed collection pairs by id rather than by position', () => {
  const before = {
    npcs: [
      { id: 'a', name: 'Ash' },
      { id: 'b', name: 'Bree' },
    ],
  };
  const after = {
    npcs: [
      { id: 'b', name: 'Bree' },
      { id: 'a', name: 'Asher' },
    ],
  };
  const ops = assertRoundTrip(before, after);
  // One field change plus one permutation, not two whole-element rewrites.
  assert.deepEqual(ops, [
    { p: ['npcs', 'a', 'name'], f: 'Ash', t: 'Asher' },
    { k: 'order', p: ['npcs'], f: ['a', 'b'], t: ['b', 'a'] },
  ]);
});

test('an insertion records its index, so inverting it restores the position', () => {
  const before = { quests: [{ id: 'q1' }, { id: 'q3' }] };
  const after = { quests: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] };
  const ops = assertRoundTrip(before, after);
  assert.deepEqual(ops, [{ p: ['quests', 'q2'], t: { id: 'q2' }, i: 1 }]);
});

test('a removal from the middle is one op and needs no permutation', () => {
  const before = { quests: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] };
  const after = { quests: [{ id: 'q1' }, { id: 'q3' }] };
  const ops = assertRoundTrip(before, after);
  assert.deepEqual(ops, [{ p: ['quests', 'q2'], f: { id: 'q2' }, i: 1 }]);
});

test('a capped travelogue shift is two ops, not the whole id sequence', () => {
  const entries = (ids) => ({ travelog: ids.map((id) => ({ id, text: id })) });
  const before = entries(['e1', 'e2', 'e3']);
  const after = entries(['e2', 'e3', 'e4']);
  const ops = assertRoundTrip(before, after);
  assert.equal(ops.length, 2, 'the oldest entry out and the newest in');
  assert.equal(
    ops.some((op) => op.k === 'order'),
    false,
    'no permutation: the entries both states share kept their order',
  );
});

test('tiles inside a node are paired by id through the nested table entry', () => {
  const node = (revealed) => ({
    nodes: [
      {
        id: 'world',
        tiles: [
          { id: '0,0', revealed: false },
          { id: '1,0', revealed },
        ],
      },
    ],
  });
  const ops = assertRoundTrip(node(false), node(true));
  assert.deepEqual(ops, [{ p: ['nodes', 'world', 'tiles', '1,0', 'revealed'], f: false, t: true }]);
});

test('a 40-cell stroke costs 40 ops rather than the node', () => {
  const tiles = [];
  for (let i = 0; i < 1600; i += 1)
    tiles.push({ id: `${i},0`, imageRef: 'grass', revealed: false });
  const before = { nodes: [{ id: 'n', tiles }] };
  const after = clone(before);
  for (let i = 0; i < 40; i += 1) after.nodes[0].tiles[i].imageRef = 'road';
  const ops = assertRoundTrip(before, after);
  assert.equal(ops.length, 40);
  assert.ok(
    opsByteSize(ops) < JSON.stringify(before).length * 2 * 0.05,
    'and under a twentieth of the node it edits',
  );
});

test('a permutation of shared elements emits one order op naming both sequences', () => {
  const before = { encounters: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const after = { encounters: [{ id: 'c' }, { id: 'a' }, { id: 'b' }] };
  const ops = assertRoundTrip(before, after);
  assert.deepEqual(ops, [
    { k: 'order', p: ['encounters'], f: ['a', 'b', 'c'], t: ['c', 'a', 'b'] },
  ]);
});

test('an insertion, a removal, and a permutation together round-trip', () => {
  const before = { handouts: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const after = { handouts: [{ id: 'd' }, { id: 'c' }, { id: 'a' }] };
  assertRoundTrip(before, after);
});

test('a collection with a duplicate id falls back to a whole-array replacement', () => {
  const before = { npcs: [{ id: 'a', name: 'one' }] };
  const after = {
    npcs: [
      { id: 'a', name: 'one' },
      { id: 'a', name: 'two' },
    ],
  };
  const ops = assertRoundTrip(before, after);
  assert.deepEqual(ops, [{ p: ['npcs'], f: before.npcs, t: after.npcs }]);
});

test('a collection whose elements have no id falls back the same way', () => {
  const ops = assertRoundTrip({ npcs: [{ name: 'x' }] }, { npcs: [{ name: 'y' }] });
  assert.deepEqual(ops, [{ p: ['npcs'], f: [{ name: 'x' }], t: [{ name: 'y' }] }]);
});

test('applyOps never mutates its input, even when the input is frozen', () => {
  const before = Object.freeze({
    npcs: Object.freeze([Object.freeze({ id: 'a', name: 'Ash' })]),
  });
  const after = { npcs: [{ id: 'a', name: 'Asher' }] };
  const ops = diffState(before, after);
  const applied = applyOps(before, ops);
  assert.deepEqual(applied, after);
  assert.equal(before.npcs[0].name, 'Ash', 'the original is untouched');
  assert.notEqual(applied.npcs, before.npcs);
});

test('invertOps is its own inverse', () => {
  const ops = diffState({ a: 1, b: [{ id: 'x' }] }, { a: 2 });
  assert.deepEqual(invertOps(invertOps(ops)), ops);
});

test('a sequence of edits walks forward and back through every intermediate state', () => {
  const states = [
    { version: 5, npcs: [], quests: [] },
    { version: 5, npcs: [{ id: 'a', name: 'Ash' }], quests: [] },
    { version: 5, npcs: [{ id: 'a', name: 'Asher' }], quests: [{ id: 'q' }] },
    { version: 5, npcs: [], quests: [{ id: 'q', title: 'Find it' }] },
  ];
  const log = [];
  for (let i = 1; i < states.length; i += 1) log.push(clone(diffState(states[i - 1], states[i])));
  let forward = states[0];
  for (let i = 0; i < log.length; i += 1) {
    forward = applyOps(forward, log[i]);
    assert.deepEqual(forward, states[i + 1], `forward to ${i + 1}`);
  }
  let back = forward;
  for (let i = log.length - 1; i >= 0; i -= 1) {
    back = applyOps(back, invertOps(log[i]));
    assert.deepEqual(back, states[i], `back to ${i}`);
  }
});

test('an op whose path no longer resolves is skipped rather than throwing', () => {
  const state = { npcs: [{ id: 'a' }] };
  const ops = [
    { p: ['npcs', 'missing', 'name'], f: 'x', t: 'y' },
    { p: ['absent', 'deeper'], t: 1 },
    { p: [], t: 1 },
    { p: ['npcs', 'a', 'name'], t: 'Ash' },
  ];
  assert.deepEqual(applyOps(state, ops), { npcs: [{ id: 'a', name: 'Ash' }] });
});

test('an order op naming unknown ids keeps every element the collection holds', () => {
  const state = { npcs: [{ id: 'a' }, { id: 'b' }] };
  const applied = applyOps(state, [{ k: 'order', p: ['npcs'], t: ['b', 'zzz'] }]);
  assert.deepEqual(applied, { npcs: [{ id: 'b' }, { id: 'a' }] });
});

test('every id-keyed path in the table exists in a real campaign', () => {
  const state = exampleState();
  for (const pattern of Object.keys(ID_KEYED)) {
    const found = collectByPattern(state, pattern);
    assert.ok(found.length, `${pattern} is present`);
    for (const list of found) assert.ok(Array.isArray(list), `${pattern} is an array`);
  }
});

/** Every value in `state` at the given `a/*\/b` pattern. */
function collectByPattern(state, pattern) {
  let nodes = [state];
  for (const segment of pattern.split('/')) {
    const next = [];
    for (const node of nodes) {
      if (segment === '*') {
        if (Array.isArray(node)) next.push(...node);
      } else if (node && typeof node === 'object' && node[segment] !== undefined) {
        next.push(node[segment]);
      }
    }
    nodes = next;
  }
  return nodes;
}

test('equalValues treats an undefined-valued key as absent', () => {
  assert.equal(equalValues({ a: 1, b: undefined }, { a: 1 }), true);
  assert.equal(equalValues({ a: 1 }, { a: 1, b: null }), false);
  assert.equal(equalValues([1, [2]], [1, [2]]), true);
  assert.equal(equalValues([1], { 0: 1 }), false);
});

test('the example campaign round-trips through a diff of unrelated edits', () => {
  const before = clone(exampleState());
  const after = clone(before);
  after.splitParty = true;
  after.nodes[0].tiles[0].revealed = !after.nodes[0].tiles[0].revealed;
  after.nodes[0].name = 'Renamed';
  after.characters[0].xp += 250;
  after.characters[0].resources[0].current = 1;
  after.encounters.push({ id: 'new-foe', name: 'Foe', hp: { current: 5, max: 5 } });
  after.npcs.shift();
  after.handouts.reverse();
  const ops = assertRoundTrip(before, after);
  assert.ok(
    opsByteSize(ops) < JSON.stringify(before).length * 2 * 0.2,
    'and the log is a fraction of the campaign it edits',
  );
});

test('randomly mutated campaigns round-trip', () => {
  const base = clone(exampleState());
  let seed = 20260727;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];
  for (let round = 0; round < 30; round += 1) {
    const before = clone(base);
    const after = clone(before);
    const mutations = 1 + Math.floor(random() * 4);
    for (let m = 0; m < mutations; m += 1) {
      switch (Math.floor(random() * 6)) {
        case 0:
          after.splitParty = !after.splitParty;
          break;
        case 1:
          pick(after.nodes).tiles.splice(Math.floor(random() * 5), 1);
          break;
        case 2:
          pick(pick(after.nodes).tiles).revealed = random() < 0.5;
          break;
        case 3:
          after.npcs.push({ id: `npc-${round}-${m}`, name: 'Stranger' });
          break;
        case 4:
          after.handouts.sort(() => (random() < 0.5 ? 1 : -1));
          break;
        default:
          pick(after.characters).xp += Math.floor(random() * 500);
      }
    }
    assertRoundTrip(before, after);
  }
});
