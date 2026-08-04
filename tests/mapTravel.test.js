import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapTravel } from '../src/app/mapTravel.js';
import {
  TileGrid,
  createMapNode,
  createTile,
  setTile,
  updateTileMetadata,
} from '../src/map/TileGrid.js';
import { MapNavigator } from '../src/map/MapNavigator.js';
import { PartyTracker } from '../src/party/PartyTracker.js';
import { createCharacter } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { fillTiles, gridTiles } from './helpers/grid.js';
import { stubApp } from './helpers/app.js';

const INTERIOR = 'assets/tiles/interior/interior';

/**
 * A two-node world plus the recording app and env the travel handlers read:
 * a 6x6 "World" whose tile 2,4 links to a 4x4 "Saltmere", with the party
 * standing next to that tile. Every view call the handlers make appends its
 * name to `calls`, so a test asserts which syncs a gesture ran rather than
 * reaching into a canvas.
 *
 * `role` and `splitParty` set who the tab moves. `characters` seeds the
 * roster, and `selected` is the id the split-party path picks up: the GM's
 * roster selection on a GM tab, and the tab's own character on a player tab.
 * `tooltips` records what the hover handler asked the tooltip to show.
 * @param {{
 *   interior?: boolean,
 *   mode?: 'play' | 'build',
 *   role?: 'gm' | 'player',
 *   splitParty?: boolean,
 *   characters?: any[],
 *   creatures?: any[],
 *   selected?: string | null,
 *   markerRange?: string[] | null,
 * }} [opts]
 */
function world({
  interior = false,
  mode = 'play',
  role = 'gm',
  splitParty = false,
  characters = [],
  creatures = [],
  selected = null,
  markerRange = null,
} = {}) {
  const grid = new TileGrid();
  const parent = fillTiles(createMapNode('world', 'World', null, 6, 6), (id) =>
    createTile(id, 'grass.svg'),
  );
  grid.addNode(setTile(parent, createTile('2,4', 'town.svg', { childNodeId: 'child' })));
  const child = createMapNode('child', 'Saltmere', 'world', 4, 4, {
    kind: interior ? 'interior' : 'region',
  });
  grid.addNode({
    ...child,
    tiles: interior
      ? gridTiles(4, 4, (id, x, y) =>
          createTile(id, x === 0 && y === 2 ? `${INTERIOR}-door-v.svg` : `${INTERIOR}-floor-1.svg`),
        )
      : gridTiles(4, 4),
  });

  const navigator = new MapNavigator(grid, 'world');
  const partyTracker = new PartyTracker(grid, { nodeId: 'world', tileId: '2,5' });

  const app = stubApp({
    grid,
    navigator,
    partyTracker,
    state: { role, mode, splitParty, characters, creatures },
    actions: {
      getSelectedCharacterId: () => selected,
      getBoundCharacterId: () => selected,
      maybeTriggerEncounter: (/** @type {any} */ at, /** @type {string} */ who) => {
        app.calls.push('maybeTriggerEncounter');
        app.triggers.push({ at: at ?? null, who: who ?? null });
      },
    },
  });
  app.triggers = [];
  const state = app.state;
  // The handlers record through the app as well as through the env below, so one
  // list holds a gesture's whole trail of syncs, in the order they ran.
  const calls = app.calls;
  const log = app.log;
  const env = /** @type {any} */ ({
    goToNode: (id) => {
      navigator.goTo(id);
      // The real goToNode resyncs through resyncMapViews, which sets the node
      // and re-places the party marker; both are what the exits ride on.
      calls.push('goToNode');
      calls.push('setNode');
      calls.push('syncPartyMarker');
    },
    mapCanvas: {
      setNode: () => calls.push('setNode'),
      refreshNode: () => calls.push('refreshNode'),
      // The real canvas measures the tile against the party and the character
      // tokens. `markerRange` here lists the tiles that are close enough, and
      // null means every tile is.
      markerVisible: (/** @type {string} */ tileId) =>
        markerRange === null || markerRange.includes(tileId),
    },
    breadcrumb: { update: () => calls.push('breadcrumb') },
    worldTree: { update: () => calls.push('worldTree') },
    regionTree: { update: () => calls.push('regionTree') },
    syncPartyMarker: () => calls.push('syncPartyMarker'),
    syncExits: () => calls.push('syncExits'),
    tileTooltip: {
      show: (/** @type {any} */ content, /** @type {number} */ x, /** @type {number} */ y) => {
        calls.push('tooltip');
        tooltips.push({ ...content, x, y });
      },
      hide: () => calls.push('tooltipHidden'),
    },
  });
  /** @type {any[]} */
  const tooltips = [];
  const travel = createMapTravel(app, env);
  /** @param {string} tileId */
  const clickTile = (tileId) => {
    const node = navigator.getCurrentNode();
    const [x, y] = tileId.split(',').map(Number);
    travel.onCellClick(x, y, node.tiles.find((t) => t.id === tileId) ?? null);
  };
  return {
    app,
    env,
    travel,
    grid,
    navigator,
    partyTracker,
    state,
    calls,
    log,
    tooltips,
    clickTile,
  };
}

/** The tile object the node in view holds under an id. */
function tileOf(navigator, id) {
  return navigator.getCurrentNode().tiles.find((t) => t.id === id);
}

/**
 * Mark one tile of the node in view revealed. A fresh world starts fogged, and
 * the hover tooltip reads nothing off a tile the party has not uncovered.
 * @param {any} w
 * @param {string} id
 */
function reveal(w, id) {
  const node = w.navigator.getCurrentNode();
  w.grid.updateNode({
    ...node,
    tiles: node.tiles.map((t) => (t.id === id ? { ...t, revealed: true } : t)),
  });
}

test('walking into a region recomputes its ways out', () => {
  const { calls, clickTile, navigator } = world();
  clickTile('2,4');
  assert.equal(navigator.getCurrentNode().id, 'child');
  // The regression this pins: this path swaps the node itself instead of going
  // through resyncMapViews, and used to leave the exits alone, so a party that
  // walked into a sub-region got no return arrows while one teleported in from
  // the region rail did.
  const setNode = calls.indexOf('setNode');
  const exits = calls.indexOf('syncExits');
  assert.ok(setNode >= 0, `expected the canvas to be given the child node: ${calls.join(',')}`);
  assert.ok(exits > setNode, `expected the exits recomputed after it: ${calls.join(',')}`);
  assert.ok(calls.includes('syncPartyMarker'));
});

test('every travel gesture that changes the node in view syncs the party marker', () => {
  // One list, because the invariant is the point: the encounter and NPC markers,
  // the screen-reader description, and mapWiring's own exit recompute all hang
  // off this one sync, so a path that moves the view without it leaves them stale.
  const entering = world();
  entering.clickTile('2,4');
  assert.ok(entering.calls.includes('syncPartyMarker'), 'entering a region');

  const leaving = world();
  leaving.clickTile('2,4');
  leaving.calls.length = 0;
  leaving.travel.exitToParent({
    kind: 'edge',
    side: 'south',
    targetNodeId: 'world',
    targetName: 'World',
  });
  assert.ok(leaving.calls.includes('syncPartyMarker'), 'leaving through an exit');

  const stepping = world();
  stepping.clickTile('1,5');
  assert.ok(stepping.calls.includes('syncPartyMarker'), 'stepping within a node');
});

test('currentExits reports the node in view, and nothing while authoring', () => {
  const { travel, clickTile } = world();
  assert.deepEqual(travel.currentExits(), [], 'the root node has no parent to return to');
  clickTile('2,4');
  assert.deepEqual(
    travel.currentExits().map((e) => (e.kind === 'edge' ? e.side : e.kind)),
    ['north', 'east', 'south', 'west'],
  );

  const building = world({ mode: 'build' });
  building.clickTile('2,4');
  assert.deepEqual(building.travel.currentExits(), [], 'Build mode offers no ways out');
});

test('an exit moves the party into the parent beside the block and logs the return', () => {
  const { travel, partyTracker, navigator, log, clickTile } = world();
  clickTile('2,4');
  travel.exitToParent({ kind: 'edge', side: 'south', targetNodeId: 'world', targetName: 'World' });
  const position = partyTracker.getPosition();
  assert.equal(navigator.getCurrentNode().id, 'world');
  assert.equal(position.nodeId, 'world');
  // South of the one-tile block at 2,4.
  assert.equal(position.tileId, '2,5');
  assert.equal(log.at(-1), 'The party returns to World.');
});

test('an exit for a node the view has already left does nothing', () => {
  const { travel, partyTracker, navigator, log } = world();
  // The party never entered, so the view is still on the root: an exit list
  // computed for the child cannot be acted on here.
  travel.exitToParent({ kind: 'edge', side: 'south', targetNodeId: 'world', targetName: 'World' });
  assert.equal(navigator.getCurrentNode().id, 'world');
  assert.equal(partyTracker.getPosition().tileId, '2,5');
  assert.deepEqual(log, []);
});

test('a door leads out only once the mover stands on it', () => {
  const { navigator, partyTracker, clickTile, log } = world({ interior: true });
  clickTile('2,4');
  assert.equal(navigator.getCurrentNode().id, 'child');
  // First click walks onto the door; the party stays inside.
  clickTile('0,2');
  assert.equal(navigator.getCurrentNode().id, 'child');
  assert.equal(partyTracker.getPosition().tileId, '0,2');
  // Clicking it again, from on top of it, is leaving through it.
  clickTile('0,2');
  assert.equal(navigator.getCurrentNode().id, 'world');
  assert.equal(log.at(-1), 'The party returns to World.');
});

test('a player tab meets nobody, because only the GM tab writes the roster', () => {
  const sage = createCreature('sage', 'Sage', { location: { nodeId: 'world', tileId: '2,5' } });
  const gm = world({ creatures: [sage] });
  gm.travel.meetCreaturesHere();
  assert.deepEqual(gm.log, ['The party meets Sage.']);
  assert.equal(gm.state.creatures[0].met, true);

  const player = world({ role: 'player', creatures: [sage] });
  player.travel.meetCreaturesHere();
  assert.deepEqual(player.log, []);
  assert.equal(player.state.creatures[0].met, false);
});

test('meeting an NPC happens once, and an empty tile meets nobody', () => {
  const sage = createCreature('sage', 'Sage', { location: { nodeId: 'world', tileId: '2,5' } });
  const elsewhere = createCreature('smith', 'Smith', {
    location: { nodeId: 'world', tileId: '0,0' },
  });
  const { travel, log, state } = world({ creatures: [sage, elsewhere] });
  travel.meetCreaturesHere();
  const roster = state.creatures;
  travel.meetCreaturesHere();
  assert.deepEqual(log, ['The party meets Sage.'], 'an already-met NPC is not met again');
  assert.equal(state.creatures, roster, 'nothing new to meet leaves the roster identical');
});

test('teleportToNode brings the view to a node without moving anyone', () => {
  // A player tab and a click on the node the party already occupies both pan
  // the camera. Neither reaches the confirm dialog.
  const player = world({ role: 'player' });
  player.travel.teleportToNode('child');
  assert.equal(player.navigator.getCurrentNode().id, 'child');
  assert.equal(player.partyTracker.getPosition().nodeId, 'world', 'the party stayed put');
  assert.deepEqual(player.log, []);

  const here = world();
  here.travel.teleportToNode('world');
  assert.equal(here.calls.filter((c) => c === 'goToNode').length, 1);
  assert.deepEqual(here.log, []);
});

test('teleportToNode ignores an id no node holds', () => {
  const { travel, calls, navigator } = world();
  travel.teleportToNode('nowhere');
  assert.equal(navigator.getCurrentNode().id, 'world');
  assert.deepEqual(calls, []);
});

test('discoverTile logs a find once, with the notes when the GM wrote any', () => {
  const { travel, grid, navigator, log } = world();
  const withNotes = updateTileMetadata(navigator.getCurrentNode(), '1,1', {
    discoverable: true,
    poiType: 'shrine',
    notes: 'a cracked altar',
  });
  grid.updateNode(updateTileMetadata(withNotes, '3,3', { discoverable: true }));
  travel.discoverTile(tileOf(navigator, '1,1'));
  travel.discoverTile(tileOf(navigator, '3,3'));
  assert.deepEqual(log, ['Discovered shrine: a cracked altar.', 'Discovered a hidden location.']);
  // The flag is stored, so the same tile read fresh discovers nothing more.
  travel.discoverTile(tileOf(navigator, '1,1'));
  travel.discoverTile(tileOf(navigator, '0,0'));
  assert.equal(log.length, 2, 'a found tile and a plain tile both stay quiet');
});

test('clickSubject moves the whole party unless the split-party toggle is on', () => {
  const hero = createCharacter('hero', 'Hero');
  const off = world({ characters: [hero], selected: 'hero' });
  assert.equal(off.travel.clickSubject(), null, 'splitting off means the party moves together');

  const gm = world({ characters: [hero], splitParty: true, selected: 'hero' });
  assert.equal(gm.travel.clickSubject()?.id, 'hero', 'the GM moves its roster selection');

  const player = world({
    role: 'player',
    characters: [hero],
    splitParty: true,
    selected: 'hero',
  });
  assert.equal(player.travel.clickSubject()?.id, 'hero', 'a bound tab moves its own character');

  const spectator = world({ role: 'player', characters: [hero], splitParty: true });
  assert.equal(spectator.travel.clickSubject(), null, 'an unbound tab moves no one');

  const stale = world({ characters: [hero], splitParty: true, selected: 'deleted' });
  assert.equal(stale.travel.clickSubject(), null, 'a selection nothing holds moves no one');
});

test('moveOneCharacter steps a character alone and rejoins it on the party tile', () => {
  const hero = createCharacter('hero', 'Hero');
  const { travel, state, partyTracker, navigator, app } = world({
    characters: [hero],
    splitParty: true,
    selected: 'hero',
  });
  travel.moveOneCharacter(tileOf(navigator, '0,0'), hero);
  assert.deepEqual(state.characters[0].location, { nodeId: 'world', tileId: '0,0' });
  assert.deepEqual(app.triggers.at(-1), {
    at: { nodeId: 'world', tileId: '0,0' },
    who: 'Hero',
  });
  // Stepping onto the party's own tile drops the individual position again.
  travel.moveOneCharacter(
    tileOf(navigator, partyTracker.getPosition().tileId),
    state.characters[0],
  );
  assert.equal(state.characters[0].location, null);
});

test('a split-party click moves only the selected character', () => {
  const hero = createCharacter('hero', 'Hero');
  const { clickTile, state, partyTracker } = world({
    characters: [hero],
    splitParty: true,
    selected: 'hero',
  });
  clickTile('1,1');
  assert.deepEqual(state.characters[0].location, { nodeId: 'world', tileId: '1,1' });
  assert.equal(partyTracker.getPosition().tileId, '2,5', 'the party did not follow');
});

test('a spectator click moves nobody and leaves the map alone', () => {
  const { clickTile, partyTracker, calls, log } = world({ role: 'player' });
  clickTile('1,1');
  assert.equal(partyTracker.getPosition().tileId, '2,5');
  assert.deepEqual(calls, []);
  assert.deepEqual(log, []);
});

test('a spectator click on a region tile navigates the view without moving anyone', () => {
  const { clickTile, navigator, partyTracker, log } = world({ role: 'player' });
  clickTile('2,4');
  assert.equal(navigator.getCurrentNode().id, 'child', 'the view follows the click');
  assert.equal(partyTracker.getPosition().nodeId, 'world', 'the party stayed behind');
  assert.deepEqual(log, [], 'nobody entered, so nothing is logged');
});

test('a split-party click into a region carries that character in and names the discovery', () => {
  const hero = createCharacter('hero', 'Hero');
  const first = world({ characters: [hero], splitParty: true, selected: 'hero' });
  first.clickTile('2,4');
  assert.equal(first.state.characters[0].location?.nodeId, 'child');
  assert.deepEqual(first.log, ['Hero discovers Saltmere.']);
  assert.equal(first.app.triggers.at(-1)?.who, 'Hero');

  // A second click, with the character already inside, only re-enters the view.
  const inside = first.state.characters[0].location;
  first.travel.onCellClick(2, 4, null);
  first.clickTile('0,0');
  assert.deepEqual(first.state.characters[0].location, {
    nodeId: 'child',
    tileId: '0,0',
  });
  assert.notDeepEqual(inside, first.state.characters[0].location);
});

test('entering a region already visited logs an entry rather than a discovery', () => {
  const { clickTile, log, travel, navigator } = world();
  clickTile('2,4');
  assert.deepEqual(log, ['Discovered Saltmere.']);
  travel.exitToParent({ kind: 'edge', side: 'south', targetNodeId: 'world', targetName: 'World' });
  clickTile('2,4');
  assert.equal(navigator.getCurrentNode().id, 'child');
  assert.equal(log.at(-1), 'Entered Saltmere.');
});

test('a character already standing in a region enters it again without a second step', () => {
  const hero = createCharacter('hero', 'Hero');
  const { clickTile, state, travel } = world({
    characters: [hero],
    splitParty: true,
    selected: 'hero',
  });
  clickTile('2,4');
  const landed = state.characters[0].location;
  travel.exitToParent({ kind: 'edge', side: 'south', targetNodeId: 'world', targetName: 'World' });
  const outside = state.characters[0].location;
  assert.equal(outside?.nodeId, 'world');
  clickTile('2,4');
  assert.equal(state.characters[0].location?.nodeId, 'child');
  assert.equal(state.characters[0].location?.tileId, landed?.tileId);
});

test('exitToParent takes a lone character out and logs its own return', () => {
  const hero = createCharacter('hero', 'Hero');
  const { clickTile, travel, state, log, partyTracker } = world({
    characters: [hero],
    splitParty: true,
    selected: 'hero',
  });
  clickTile('2,4');
  travel.exitToParent({ kind: 'edge', side: 'south', targetNodeId: 'world', targetName: 'World' });
  assert.deepEqual(state.characters[0].location, { nodeId: 'world', tileId: '2,5' });
  assert.equal(log.at(-1), 'Hero returns to World.');
  assert.equal(partyTracker.getPosition().tileId, '2,5', 'the party never moved');
});

test('exitToParent only follows the camera out for a tab that moves nobody', () => {
  const { clickTile, travel, partyTracker, log, navigator } = world({ role: 'player' });
  clickTile('2,4');
  travel.exitToParent({ kind: 'edge', side: 'south', targetNodeId: 'world', targetName: 'World' });
  assert.equal(navigator.getCurrentNode().id, 'world');
  assert.equal(partyTracker.getPosition().nodeId, 'world');
  assert.deepEqual(log, []);
});

test('exitToParent leaves the party where it stands and only pans the view', () => {
  // The GM looks into a child the party is not in. Leaving that view must not
  // drag the party out of wherever it actually stands.
  const { travel, navigator, partyTracker, log } = world();
  navigator.zoomIn('2,4');
  assert.equal(navigator.getCurrentNode().id, 'child');
  travel.exitToParent({ kind: 'edge', side: 'south', targetNodeId: 'world', targetName: 'World' });
  assert.equal(navigator.getCurrentNode().id, 'world');
  assert.deepEqual(partyTracker.getPosition(), { nodeId: 'world', tileId: '2,5' });
  assert.deepEqual(log, []);
});

test('the hover tooltip stays hidden outside play mode and over nothing worth showing', () => {
  const building = world({ mode: 'build' });
  building.travel.onCellHover(tileOf(building.navigator, '1,1'), 5, 5);
  assert.deepEqual(building.tooltips, []);

  const playing = world();
  reveal(playing, '0,0');
  playing.travel.onCellHover(null, 5, 5);
  playing.travel.onCellHover(tileOf(playing.navigator, '0,0'), 5, 5);
  assert.deepEqual(playing.tooltips, [], 'a plain revealed tile carries nothing to say');
});

test('the hover tooltip stays hidden over an unrevealed or undiscovered tile', () => {
  const w = world();
  const { travel, grid, navigator, tooltips } = w;
  reveal(w, '1,1');
  reveal(w, '3,3');
  const revealed = navigator.getCurrentNode();
  grid.updateNode(updateTileMetadata(revealed, '1,1', { discoverable: true, poiType: 'cave' }));
  const withHidden = navigator.getCurrentNode();
  grid.updateNode({
    ...withHidden,
    tiles: withHidden.tiles.map((t) =>
      t.id === '3,3' ? { ...t, revealed: false, metadata: { ...t.metadata, poiType: 'cave' } } : t,
    ),
  });
  travel.onCellHover(tileOf(navigator, '1,1'), 5, 5);
  travel.onCellHover(tileOf(navigator, '3,3'), 5, 5);
  assert.deepEqual(tooltips, [], 'a POI the party has not found or uncovered stays secret');
});

test('the hover tooltip names the POI and who stands there, and hides GM notes from players', () => {
  const sage = createCreature('sage', 'Sage', { location: { nodeId: 'world', tileId: '1,1' } });
  const seed = (/** @type {any} */ w) => {
    reveal(w, '1,1');
    const node = w.navigator.getCurrentNode();
    w.grid.updateNode(
      updateTileMetadata(node, '1,1', { poiType: 'shrine', notes: 'a cracked altar' }),
    );
    w.travel.onCellHover(tileOf(w.navigator, '1,1'), 12, 34);
  };
  const gm = world({ creatures: [sage] });
  seed(gm);
  assert.deepEqual(gm.tooltips, [
    { title: 'Shrine', npcs: 'Sage', notes: 'a cracked altar', x: 12, y: 34 },
  ]);

  const player = world({ role: 'player', creatures: [sage] });
  seed(player);
  assert.equal(player.tooltips[0].notes, '', 'notes are the GM secret');
  assert.equal(player.tooltips[0].npcs, 'Sage');
});

test('the hover tooltip says nothing about a tile whose markers are out of range', () => {
  // The regression this pins: the keyboard cursor and the pointer both run this
  // handler over any revealed tile, so a tile too far away for its NPC circle
  // and POI outline to draw used to name the NPC standing on it anyway.
  const sage = createCreature('sage', 'Sage', { location: { nodeId: 'world', tileId: '1,1' } });
  const w = world({ role: 'player', creatures: [sage], markerRange: [] });
  reveal(w, '1,1');
  const node = w.navigator.getCurrentNode();
  w.grid.updateNode(updateTileMetadata(node, '1,1', { poiType: 'shrine' }));
  w.travel.onCellHover(tileOf(w.navigator, '1,1'), 12, 34);
  assert.deepEqual(w.tooltips, []);

  const near = world({ role: 'player', creatures: [sage], markerRange: ['1,1'] });
  reveal(near, '1,1');
  const sameNode = near.navigator.getCurrentNode();
  near.grid.updateNode(updateTileMetadata(sameNode, '1,1', { poiType: 'shrine' }));
  near.travel.onCellHover(tileOf(near.navigator, '1,1'), 12, 34);
  assert.deepEqual(near.tooltips, [{ title: 'Shrine', npcs: 'Sage', notes: '', x: 12, y: 34 }]);
});

test('the hover tooltip shows a GM note on a tile with nothing else on it', () => {
  const gm = world();
  reveal(gm, '1,1');
  const node = gm.navigator.getCurrentNode();
  gm.grid.updateNode(updateTileMetadata(node, '1,1', { notes: 'the ford is washed out' }));
  gm.travel.onCellHover(tileOf(gm.navigator, '1,1'), 0, 0);
  assert.deepEqual(gm.tooltips, [
    { title: '', npcs: '', notes: 'the ford is washed out', x: 0, y: 0 },
  ]);

  const player = world({ role: 'player' });
  reveal(player, '1,1');
  const same = player.navigator.getCurrentNode();
  player.grid.updateNode(updateTileMetadata(same, '1,1', { notes: 'the ford is washed out' }));
  player.travel.onCellHover(tileOf(player.navigator, '1,1'), 0, 0);
  assert.deepEqual(player.tooltips, [], 'a note-only tile shows a player nothing');
});

test('a lone character leaves an interior through the door it stands on', () => {
  const hero = createCharacter('hero', 'Hero');
  const w = world({ interior: true, characters: [hero], splitParty: true, selected: 'hero' });
  w.clickTile('2,4');
  assert.equal(w.navigator.getCurrentNode().id, 'child');
  // The first click walks the character onto the door; it stays inside.
  w.clickTile('0,2');
  assert.deepEqual(w.state.characters[0].location, { nodeId: 'child', tileId: '0,2' });
  assert.equal(w.navigator.getCurrentNode().id, 'child');
  // Clicking the door from on top of it is leaving through it.
  w.clickTile('0,2');
  assert.equal(w.navigator.getCurrentNode().id, 'world');
  assert.equal(w.state.characters[0].location?.nodeId, 'world');
  assert.equal(w.log.at(-1), 'Hero returns to World.');
});
