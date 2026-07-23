import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smoothCoastline, coastKind, coastOverlays, riverCourse } from '../src/map/Autotile.js';

/** Deterministic PRNG so a seed reproduces a course exactly. */
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

/** Build a cells array from rows of single-char codes: ~ water, . grass. */
function cellsFrom(rows) {
  return rows.join('').split('').map((c) => (c === '~' ? 'water' : 'grass'));
}

test('smoothCoastline drowns isthmuses and spits the coast pieces cannot draw', () => {
  // A land cell with water on opposite sides...
  const isthmus = cellsFrom(['~.~']);
  assert.deepEqual(smoothCoastline(isthmus, 3, 1), ['water', 'water', 'water']);
  // ...or three sides becomes water; a clean straight shore is untouched.
  const spit = cellsFrom(['.~.', '..~', '.~.']);
  assert.equal(smoothCoastline(spit, 3, 3)[4], 'water');
  const shore = cellsFrom(['~~~', '...', '...']);
  assert.deepEqual(smoothCoastline(shore, 3, 3), shore);
});

test('coastKind names the water edges: straights, outer corners, inner corners', () => {
  assert.equal(coastKind(true, false, false, false, false, false, false, false), 'n');
  assert.equal(coastKind(false, false, false, true, false, false, false, false), 'w');
  assert.equal(coastKind(true, true, false, false, false, false, false, false), 'corner-ne');
  assert.equal(coastKind(false, false, true, true, false, false, false, false), 'corner-sw');
  assert.equal(coastKind(false, false, false, false, true, false, false, false), 'inner-ne');
  assert.equal(coastKind(false, false, false, false, false, false, true, false), 'inner-sw');
  assert.equal(coastKind(false, false, false, false, false, false, false, false), null);
});

test('coastOverlays rings a lake with matching shoreline pieces', () => {
  const cells = cellsFrom([
    '....',
    '.~~.',
    '.~~.',
    '....',
  ]);
  const coast = coastOverlays(cells, 4, 4);
  assert.equal(coast.get('1,0'), 's'); // water below
  assert.equal(coast.get('0,1'), 'e'); // water to the east
  assert.equal(coast.get('3,2'), 'w');
  assert.equal(coast.get('2,3'), 'n');
  assert.equal(coast.get('0,0'), 'inner-se'); // touches the lake only diagonally
  assert.equal(coast.get('3,3'), 'inner-nw');
  assert.equal(coast.get('1,1'), undefined, 'water cells get no overlay');
});

test('riverCourse runs edge to edge as a connected channel', () => {
  for (const seed of [1, 8, 23]) {
    const size = 12;
    const river = riverCourse(size, size, mulberry32(seed));
    // Touches the top and bottom rows.
    const ys = [...river.keys()].map((id) => Number(id.split(',')[1]));
    assert.equal(Math.min(...ys), 0, `seed ${seed}: starts at the north edge`);
    assert.equal(Math.max(...ys), size - 1, `seed ${seed}: reaches the south edge`);
    // Every piece's open edges point at another river cell or off the map, so
    // the channel never breaks: check each cell connects onward as named.
    const opens = { v: ['n', 's'], h: ['e', 'w'], 'corner-ne': ['n', 'e'], 'corner-nw': ['n', 'w'], 'corner-se': ['s', 'e'], 'corner-sw': ['s', 'w'] };
    const step = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
    for (const [id, kind] of river) {
      const [x, y] = id.split(',').map(Number);
      for (const edge of opens[kind]) {
        const [dx, dy] = step[edge];
        const nx = x + dx;
        const ny = y + dy;
        const offMap = nx < 0 || ny < 0 || nx >= size || ny >= size;
        assert.ok(offMap || river.has(`${nx},${ny}`), `seed ${seed}: ${id} (${kind}) opens ${edge} onto river`);
      }
    }
  }
});

test('riverCourse empties into existing water instead of crossing it', () => {
  const size = 10;
  // Water fills the bottom half; the river must stop at its shore.
  const isWater = (x, y) => y >= 5;
  const river = riverCourse(size, size, mulberry32(4), isWater);
  assert.ok(river.size > 0, 'carved some channel');
  for (const id of river.keys()) {
    const y = Number(id.split(',')[1]);
    assert.ok(y < 5, `river cell ${id} stays out of the lake`);
  }
});
