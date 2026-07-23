import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TilePalette } from '../src/map/TilePalette.js';
import {
  GENERATOR_SIZES,
  ARCHETYPES,
  generateNodeTiles,
  generateDungeonLevels,
  wallKind,
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

test('town runs a bridged river past the crossroads', () => {
  for (const seed of [7, 13, 40]) {
    const gen = generateNodeTiles(palette, { kind: 'region', archetype: 'town', size: 'medium' }, mulberry32(seed));
    const river = gen.tiles.filter((t) => t.overlayRef?.includes('/river/'));
    assert.equal(river.length, GENERATOR_SIZES.medium, `seed ${seed}: river spans the map north-south`);
    const bridges = river.filter((t) => t.overlayRef.includes('bridge-h'));
    assert.equal(bridges.length, 1, `seed ${seed}: exactly one bridge where the road crosses`);
    assert.ok(!river.some((t) => t.metadata.poiType), `seed ${seed}: no building sits in the channel`);
  }
});

test('wilderness places a river, coastlines around water, and landmark POIs', () => {
  let sawCoast = false;
  for (const seed of [1, 2, 3, 4, 5]) {
    const gen = generateNodeTiles(palette, { kind: 'region', archetype: 'wilderness', size: 'medium' }, mulberry32(seed));
    assert.ok(gen.tiles.some((t) => t.overlayRef?.includes('/river/')), `seed ${seed}: has a river`);
    assert.ok(gen.tiles.some((t) => t.metadata.poiType === 'landmark'), `seed ${seed}: has a landmark`);
    // Coast overlays only appear next to water; every land tile beside water
    // must carry one (the smoothing pass guarantees a piece exists for it).
    const n = gen.width;
    const isWater = new Set(gen.tiles.filter((t) => t.imageRef.includes('/water/')).map((t) => t.id));
    for (const t of gen.tiles) {
      if (isWater.has(t.id) || t.metadata.poiType) continue;
      const [x, y] = t.id.split(',').map(Number);
      const orthWater = [[0, -1], [1, 0], [0, 1], [-1, 0]]
        .some(([dx, dy]) => isWater.has(`${x + dx},${y + dy}`));
      if (orthWater && !t.overlayRef?.includes('/river/')) {
        sawCoast = true;
        assert.ok(t.overlayRef?.includes('/coast/'), `seed ${seed}: shore tile ${t.id} has a coast overlay`);
      }
    }
    assert.ok(n * n === gen.tiles.length, 'wilderness fills the grid');
  }
  assert.ok(sawCoast, 'at least one seed produced a shoreline');
});

test('dungeon floors are fully enclosed by placed tiles, with stairs up', () => {
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
  // A single-level dungeon has no level below, so no stairs-down leads nowhere.
  assert.ok(!gen.tiles.some((t) => t.imageRef.includes('stairs-down')));
});

test('multi-level dungeon links each stairs-down to the level below, none on the bottom', () => {
  for (const seed of [5, 21]) {
    const ids = ['lvl-2', 'lvl-3', 'lvl-4'];
    let next = 0;
    const levels = generateDungeonLevels(palette, { size: 'medium', levels: 3 }, mulberry32(seed), () => ids[next++]);
    assert.equal(levels.length, 3, `seed ${seed}: three levels`);
    assert.equal(levels[0].id, null, 'first level fills the existing node');
    assert.deepEqual(levels.slice(1).map((l) => l.id), ['lvl-2', 'lvl-3']);
    for (let i = 0; i < levels.length; i++) {
      const down = levels[i].tiles.filter((t) => t.imageRef.includes('stairs-down'));
      const up = levels[i].tiles.filter((t) => t.imageRef.includes('stairs-up'));
      assert.equal(up.length, 1, `seed ${seed} level ${i + 1}: one stairs-up`);
      if (i < levels.length - 1) {
        assert.equal(down.length, 1, `seed ${seed} level ${i + 1}: one stairs-down`);
        assert.equal(down[0].childNodeId, levels[i + 1].id, `seed ${seed} level ${i + 1}: stairs-down links to the level below`);
      } else {
        assert.equal(down.length, 0, `seed ${seed}: bottom level has no stairs-down`);
      }
    }
    // Deeper levels are stairs-entered: entry is their stairs-up, and there is
    // no border door (that's the surface entrance of level 1 only).
    for (const level of levels.slice(1)) {
      const up = level.tiles.find((t) => t.imageRef.includes('stairs-up'));
      assert.equal(level.entry, up.id, `seed ${seed}: deep level entry is its stairs-up`);
      assert.ok(!level.tiles.some((t) => t.imageRef.includes('door')), `seed ${seed}: deep level has no surface door`);
    }
  }
});

test('wallKind picks pieces by connected wall arms', () => {
  assert.equal(wallKind(true, true, true, true), 'wall-cross');
  assert.equal(wallKind(true, true, false, true), 'wall-tee-n');
  assert.equal(wallKind(true, true, true, false), 'wall-tee-e');
  assert.equal(wallKind(false, true, true, true), 'wall-tee-s');
  assert.equal(wallKind(true, false, true, true), 'wall-tee-w');
  assert.equal(wallKind(true, false, true, false), 'wall-v');
  assert.equal(wallKind(false, true, false, true), 'wall-h');
  assert.equal(wallKind(true, true, false, false), 'wall-corner-ne');
  assert.equal(wallKind(false, false, true, true), 'wall-corner-sw');
  assert.equal(wallKind(true, false, false, false), 'wall-v');
  assert.equal(wallKind(false, false, false, false), 'wall-h');
});

test('dungeon wall pieces match their neighbors, junctions included', () => {
  for (const seed of [3, 11, 27, 42]) {
    const gen = generateNodeTiles(palette, { kind: 'interior', archetype: 'dungeon', size: 'medium' }, mulberry32(seed));
    const byId = new Map(gen.tiles.map((t) => [t.id, t]));
    // A cell continues the wall if it holds a wall piece or a door set in it.
    const wallish = (id) => {
      const ref = byId.get(id)?.imageRef ?? '';
      return ref.includes('wall-') || ref.includes('door-');
    };
    for (const t of gen.tiles) {
      if (!t.imageRef.includes('wall-')) continue;
      const [x, y] = t.id.split(',').map(Number);
      const expected = wallKind(wallish(`${x},${y - 1}`), wallish(`${x + 1},${y}`), wallish(`${x},${y + 1}`), wallish(`${x - 1},${y}`));
      assert.ok(t.imageRef.includes(expected), `seed ${seed}: wall ${t.id} is ${expected} (got ${t.imageRef})`);
    }
  }
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
  // Ring corners connect inward (NW corner continues east and south), and the
  // partition tees into both side walls.
  const py = Math.floor(n / 2);
  assert.ok(byId.get('0,0').imageRef.includes('wall-corner-se'));
  assert.ok(byId.get(`${n - 1},0`).imageRef.includes('wall-corner-sw'));
  assert.ok(byId.get(`0,${n - 1}`).imageRef.includes('wall-corner-ne'));
  assert.ok(byId.get(`${n - 1},${n - 1}`).imageRef.includes('wall-corner-nw'));
  assert.ok(byId.get(`0,${py}`).imageRef.includes('wall-tee-e'));
  assert.ok(byId.get(`${n - 1},${py}`).imageRef.includes('wall-tee-w'));
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
