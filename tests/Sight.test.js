import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIGHT, partySight, seesInDark, sightRadius } from '../src/party/Sight.js';
import { sightedLinks } from '../src/map/Sightings.js';
import { revealLinksTo, revealedCount } from '../src/map/FogOfWar.js';
import { PartyTracker } from '../src/party/PartyTracker.js';
import { TileGrid, createMapNode, createTile, setTile } from '../src/map/TileGrid.js';
import { fillTiles } from './helpers/grid.js';

const world = createMapNode('world', 'World', null, 4, 4);
const region = createMapNode('vale', 'Vale', 'world', 4, 4);
const inn = createMapNode('inn', 'Inn', 'vale', 4, 4, { kind: 'interior' });

test('outdoor sight follows the light of the watch', () => {
  assert.equal(sightRadius(region, { day: 1, watch: 0 }), SIGHT.day);
  assert.equal(sightRadius(region, { day: 1, watch: 3 }), SIGHT.day);
  assert.equal(sightRadius(region, { day: 1, watch: 4 }), SIGHT.dusk);
  assert.equal(sightRadius(region, { day: 1, watch: 5 }), SIGHT.night);
  assert.equal(sightRadius(region, null), SIGHT.day, 'no clock reads as dawn');
});

test('interiors and the world map keep one sight at every hour', () => {
  assert.equal(sightRadius(inn, { day: 1, watch: 5 }), SIGHT.interior);
  assert.equal(sightRadius(world, { day: 1, watch: 5 }), SIGHT.world);
});

/** A 4x4 grass node whose tiles 1,1 and 2,1 link to `a`, and 3,3 to `b`. */
function linked(id = 'vale') {
  let node = fillTiles(createMapNode(id, 'Vale', null, 4, 4));
  node = setTile(node, createTile('1,1', 'town.svg', { childNodeId: 'a' }));
  node = setTile(node, createTile('2,1', 'town.svg', { childNodeId: 'a' }));
  return setTile(node, createTile('3,3', 'cave.svg', { childNodeId: 'b' }));
}

test('revealLinksTo reveals every tile of the block and nothing else', () => {
  const node = linked();
  const shown = revealLinksTo(node, 'a');
  assert.equal(revealedCount(shown), 2);
  assert.equal(revealLinksTo(shown, 'a'), shown, 'a revealed block is unchanged');
  assert.equal(revealLinksTo(node, 'nobody'), node);
});

test('sightedLinks names each newly revealed site once', () => {
  const before = linked();
  assert.deepEqual(sightedLinks(before, before), []);
  const after = revealLinksTo(revealLinksTo(before, 'a'), 'b');
  assert.deepEqual(sightedLinks(before, after), ['a', 'b']);
  // A block with a tile already in view is not new.
  assert.deepEqual(sightedLinks(revealLinksTo(before, 'a'), after), ['b']);
});

test('sightedLinks skips a discoverable site the party has not found', () => {
  const hidden = createTile('3,3', 'cave.svg', { childNodeId: 'b' });
  const before = setTile(linked(), {
    ...hidden,
    metadata: { ...hidden.metadata, discoverable: true },
  });
  assert.deepEqual(sightedLinks(before, revealLinksTo(before, 'b')), []);
});

test('a move reveals the link of the party node on every map above', () => {
  const grid = new TileGrid();
  let top = fillTiles(createMapNode('world', 'World', null, 4, 4));
  top = setTile(top, createTile('0,0', 'vale.svg', { childNodeId: 'vale' }));
  grid.addNode(top);
  let mid = fillTiles(createMapNode('vale', 'Vale', 'world', 4, 4));
  mid = setTile(mid, createTile('3,3', 'town.svg', { childNodeId: 'town' }));
  grid.addNode(mid);
  grid.addNode(fillTiles(createMapNode('town', 'Town', 'vale', 4, 4)));
  const tracker = new PartyTracker(grid, { nodeId: 'town', tileId: '0,0' }, { revealRadius: 0 });
  assert.equal(revealedCount(grid.getNode('vale')), 1);
  assert.equal(revealedCount(grid.getNode('world')), 1);
  const shownWorld = grid.getNode('world');
  tracker.moveTo('town', '1,1');
  assert.equal(grid.getNode('world'), shownWorld, 'a revealed map above stays the same object');
});

test('setSight sets the fog radius and leaves revealRadius alone', () => {
  const grid = new TileGrid();
  grid.addNode(fillTiles(createMapNode('n', 'N', null, 5, 5)));
  const tracker = new PartyTracker(grid, { nodeId: 'n', tileId: '0,0' }, { revealRadius: 0 });
  assert.equal(tracker.sightFor(grid.getNode('n')), 0);
  tracker.setSight(() => 1);
  tracker.moveTo('n', '4,4');
  // 1 from the start, and 3 around the corner at radius 1.
  assert.equal(revealedCount(grid.getNode('n')), 4);
  assert.equal(tracker.revealRadius, 0);
});

/** A character with only the fields the sight rule reads. */
function seer({ darkvision = 0, light = false, location = null } = {}) {
  return /** @type {any} */ ({
    raceTraits: { darkvision },
    inventory: light ? [{ id: 'torch', name: 'Torch', quantity: 1, notes: '', light: true }] : [],
    location,
  });
}

test('a group sees in the dark when all have darkvision or one carries a light', () => {
  assert.equal(seesInDark([]), false, 'an empty party gains nothing');
  assert.equal(seesInDark([seer({ darkvision: 60 }), seer({ darkvision: 60 })]), true);
  assert.equal(seesInDark([seer({ darkvision: 60 }), seer()]), false, 'one human blinds the group');
  assert.equal(seesInDark([seer({ darkvision: 60 }), seer({ light: true })]), true);
  assert.equal(seesInDark([{ ...seer(), raceTraits: undefined }]), false, 'no race reads as none');
  const spent = {
    ...seer(),
    inventory: [{ id: 't', name: 'Torch', quantity: 0, notes: '', light: true }],
  };
  assert.equal(seesInDark([spent]), false, 'an empty stack sheds no light');
});

test('a group that sees in the dark sees at Night as at Dusk and in dark rooms as by day', () => {
  const night = { day: 1, watch: 5 };
  const elves = [seer({ darkvision: 60 })];
  assert.equal(sightRadius(region, night, elves), SIGHT.dusk);
  assert.equal(sightRadius(region, night, [seer()]), SIGHT.night);
  assert.equal(
    sightRadius(region, { day: 1, watch: 0 }, elves),
    SIGHT.day,
    'daylight is unchanged',
  );
  const dungeon = createMapNode('d', 'Crypt', 'vale', 4, 4, {
    kind: 'interior',
    environ: 'dungeon',
  });
  assert.equal(sightRadius(dungeon, night, elves), SIGHT.day);
  assert.equal(sightRadius(dungeon, night, [seer()]), SIGHT.interior);
  const hall = createMapNode('h', 'Hall', 'vale', 4, 4, { kind: 'interior', environ: 'building' });
  assert.equal(sightRadius(hall, night, elves), SIGHT.interior, 'a lit room gains nothing');
  assert.equal(sightRadius(world, night, elves), SIGHT.world);
});

test('the party sight rule reads the travelling characters unless a group is given', () => {
  const clock = { day: 1, watch: 5 };
  let characters = [seer({ darkvision: 60 }), seer({ location: { nodeId: 'x', tileId: '0,0' } })];
  const rule = partySight(
    () => clock,
    () => characters,
  );
  assert.equal(rule(region), SIGHT.dusk, 'the split-off human does not travel');
  assert.equal(rule(region, [seer()]), SIGHT.night, 'a lone mover sees with its own eyes');
  characters = [seer()];
  assert.equal(rule(region), SIGHT.night, 'the rule reads the roster on each call');
  const grid = new TileGrid();
  grid.addNode(fillTiles(createMapNode('vale', 'Vale', 'world', 4, 4)));
  const tracker = new PartyTracker(grid, { nodeId: 'vale', tileId: '0,0' }, { reveal: false });
  tracker.setSight(rule);
  assert.equal(tracker.sightFor(region, [seer({ light: true })]), SIGHT.dusk);
});
