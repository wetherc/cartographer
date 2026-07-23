import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import {
  GENERATOR_SIZES,
  ARCHETYPES,
  generateNodeTiles,
} from '../src/map/MapGenerator.js';

/** Deterministic PRNG so a seed reproduces a generation exactly. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const palette = new TilePalette();

test('ARCHETYPES lists region and interior options', () => {
  assert.ok(ARCHETYPES.region.some((a) => a.value === 'wilderness'));
  assert.ok(ARCHETYPES.region.some((a) => a.value === 'town'));
  assert.ok(ARCHETYPES.interior.some((a) => a.value === 'dungeon'));
  assert.ok(ARCHETYPES.interior.some((a) => a.value === 'castle'));
});

test('size preset sets square dimensions and fills every cell for wilderness', () => {
  const n = GENERATOR_SIZES.medium;
  const gen = generateNodeTiles(palette, { kind: 'region', archetype: 'wilderness', size: 'medium' }, mulberry32(1));
  assert.equal(gen.width, n);
  assert.equal(gen.height, n);
  assert.equal(gen.tiles.length, n * n);
  assert.ok(gen.tiles.every((t) => t.imageRef));
});

test('generation is deterministic for a given seed', () => {
  const a = generateNodeTiles(palette, { kind: 'region', archetype: 'wilderness', size: 'small' }, mulberry32(42));
  const b = generateNodeTiles(palette, { kind: 'region', archetype: 'wilderness', size: 'small' }, mulberry32(42));
  assert.deepEqual(a.tiles.map((t) => t.imageRef), b.tiles.map((t) => t.imageRef));
});

test('town lays roads as overlays and scatters building markers', () => {
  const gen = generateNodeTiles(palette, { kind: 'region', archetype: 'town', size: 'medium' }, mulberry32(7));
  assert.ok(gen.tiles.some((t) => t.overlayRef), 'has at least one road overlay');
  assert.ok(gen.tiles.some((t) => t.metadata.poiType === 'settlement'), 'has at least one building POI');
});

test('dungeon floors are fully enclosed by placed tiles, with stairs up and down', () => {
  const n = GENERATOR_SIZES.medium;
  const gen = generateNodeTiles(palette, { kind: 'interior', archetype: 'dungeon', size: 'medium' }, mulberry32(3));
  const placed = new Set(gen.tiles.map((t) => t.id));
  const floors = gen.tiles.filter((t) => /floor|stairs/.test(t.imageRef));
  assert.ok(floors.length > 0, 'carved some floor');
  assert.ok(gen.tiles.length <= n * n, 'no more tiles than the grid holds');
  for (const f of floors) {
    const [x, y] = f.id.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      assert.ok(placed.has(`${nx},${ny}`), `floor ${f.id} neighbor ${nx},${ny} is walled/floored, not void`);
    }
  }
  assert.ok(gen.tiles.some((t) => t.imageRef.includes('stairs-up')));
  assert.ok(gen.tiles.some((t) => t.imageRef.includes('stairs-down')));
});

test('castle is a walled ring with a floored interior and doors', () => {
  const n = GENERATOR_SIZES.small;
  const gen = generateNodeTiles(palette, { kind: 'interior', archetype: 'castle', size: 'small' }, mulberry32(9));
  const byId = new Map(gen.tiles.map((t) => [t.id, t]));
  assert.equal(gen.tiles.length, n * n, 'castle fills the whole grid');
  // Every border cell is a wall/corner/door, never bare floor.
  for (let i = 0; i < n; i++) {
    for (const id of [`${i},0`, `${i},${n - 1}`, `0,${i}`, `${n - 1},${i}`]) {
      assert.ok(!byId.get(id).imageRef.includes('floor'), `border ${id} is not floor`);
    }
  }
  assert.ok(gen.tiles.some((t) => t.imageRef.includes('floor')), 'has interior floor');
  assert.ok(gen.tiles.some((t) => t.imageRef.includes('door')), 'has a door');
  assert.ok(gen.tiles.some((t) => t.imageRef.includes('stairs')), 'has stairs');
});

test('every archetype returns a border entry that exists and is walkable', () => {
  const cases = [
    ['region', 'wilderness'],
    ['region', 'town'],
    ['interior', 'dungeon'],
    ['interior', 'castle'],
  ];
  for (const [kind, archetype] of cases) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const gen = generateNodeTiles(palette, { kind, archetype, size: 'small' }, mulberry32(seed));
      const [x, y] = gen.entry.split(',').map(Number);
      const onBorder = x === 0 || y === 0 || x === gen.width - 1 || y === gen.height - 1;
      assert.ok(onBorder, `${archetype} seed ${seed}: entry ${gen.entry} on the border`);
      const tile = gen.tiles.find((t) => t.id === gen.entry);
      assert.ok(tile, `${archetype} seed ${seed}: entry tile exists`);
      assert.ok(!tile.imageRef.includes('wall-'), `${archetype} seed ${seed}: entry is not a wall`);
    }
  }
});

test('dungeon entry connects to the whole floor network', () => {
  for (const seed of [3, 11, 27]) {
    const n = GENERATOR_SIZES.medium;
    const gen = generateNodeTiles(palette, { kind: 'interior', archetype: 'dungeon', size: 'medium' }, mulberry32(seed));
    const walkable = new Set(
      gen.tiles.filter((t) => !t.imageRef.includes('wall-')).map((t) => t.id),
    );
    // Flood-fill the walkable tiles from the entry door.
    const seen = new Set([gen.entry]);
    const queue = [gen.entry];
    while (queue.length) {
      const [x, y] = queue.pop().split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const id = `${x + dx},${y + dy}`;
        if (walkable.has(id) && !seen.has(id)) {
          seen.add(id);
          queue.push(id);
        }
      }
    }
    assert.equal(seen.size, walkable.size, `seed ${seed}: every walkable tile reachable from the entry (${seen.size}/${walkable.size})`);
    assert.ok(n * n > walkable.size, 'sanity: dungeon is sparse');
  }
});
