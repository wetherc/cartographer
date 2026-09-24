import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBlankCampaign,
  buildExampleCampaign,
  campaignFromLiveState,
  isBlankCampaign,
  loadInitialCampaign,
  loadInitialCampaignSafe,
  partyOnGrid,
} from '../src/campaign/Campaigns.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { createTile, getTile, TileGrid } from '../src/map/TileGrid.js';
import { buildingTile } from '../src/campaign/ExampleWorld.js';
import { createCharacter, getHP, getClasses } from '../src/entities/Character.js';
import { isHitDicePool } from '../src/entities/HitDice.js';
import { mulberry32 } from '../src/util/Rng.js';
import { coerceCR, crXP } from '../src/data/challenge.js';
import { difficultyLine } from '../src/entities/EncounterDifficulty.js';
import { effectiveStatBlock } from '../src/entities/Creature.js';
import { installLocalStorage } from './helpers/env.js';

beforeEach(installLocalStorage);

test('loadInitialCampaign boots a blank campaign when nothing is saved', () => {
  const campaign = loadInitialCampaign();
  assert.deepEqual(campaign, buildBlankCampaign());
});

test('loadInitialCampaign restores a save and default-fills fields older saves lack', () => {
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [{ id: 'world', name: 'World', parentId: null, width: 2, height: 2, tiles: [] }],
      party: { nodeId: 'world', tileId: '1,1' },
      characters: [createCharacter('c1', 'Hero')],
      encounters: [],
      // No travelog/quests/clock/npcs/handouts/bestiary: a pre-feature save.
    }),
  );
  const campaign = loadInitialCampaign();
  assert.equal(campaign.grid.getNode('world').name, 'World');
  assert.deepEqual(campaign.party, { nodeId: 'world', tileId: '1,1' });
  assert.equal(campaign.characters[0].name, 'Hero');
  assert.ok(Array.isArray(campaign.characters[0].inventory), 'characters are default-filled');
  assert.deepEqual(campaign.travelog, []);
  assert.deepEqual(campaign.quests, []);
  assert.ok(campaign.clock, 'a missing clock is created, not left null');
  assert.deepEqual(campaign.creatures, []);
  assert.deepEqual(campaign.handouts, []);
  assert.deepEqual(campaign.bestiary, []);
  assert.deepEqual(campaign.entryTiles, {});
  assert.equal(campaign.splitParty, false);
  // No demo character is injected into an authored-empty roster.
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [{ id: 'world', name: 'World', parentId: null, width: 2, height: 2, tiles: [] }],
      party: null,
      characters: [],
      encounters: [],
    }),
  );
  assert.equal(loadInitialCampaign().characters.length, 0);
});

test('loadInitialCampaign passes through every present field of a full save', () => {
  const clock = { day: 3, watch: 4 };
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [{ id: 'world', name: 'World', parentId: null, width: 2, height: 2, tiles: [] }],
      party: { nodeId: 'world', tileId: '0,1' },
      characters: [createCharacter('c1', 'Hero')],
      encounters: [],
      travelog: [{ id: 'e1', text: 'moved', at: 1 }],
      quests: [{ id: 'q1', title: 'Find it', status: 'active', notes: '' }],
      clock,
      npcs: [{ id: 'n1', name: 'Barkeep', location: null, notes: '' }],
      handouts: [{ id: 'h1', title: 'Map', nodeId: null, revealed: false }],
      bestiary: [{ id: 'b1', name: 'Goblin' }],
      splitParty: true,
    }),
  );
  const campaign = loadInitialCampaign();
  assert.deepEqual(campaign.party, { nodeId: 'world', tileId: '0,1' });
  assert.equal(campaign.travelog.length, 1);
  assert.equal(campaign.quests[0].id, 'q1');
  assert.deepEqual(campaign.clock, clock);
  // The pre-merge save's npcs list migrates into the creatures list.
  assert.equal(campaign.creatures[0].name, 'Barkeep');
  assert.equal(campaign.handouts[0].title, 'Map');
  assert.equal(campaign.bestiary[0].id, 'b1');
  assert.equal(campaign.splitParty, true);
});

test('loadInitialCampaign keeps the entry memory and drops what names a missing node', () => {
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [
        { id: 'world', name: 'World', parentId: null, width: 2, height: 2, tiles: [] },
        { id: 'cave', name: 'Cave', parentId: 'world', width: 2, height: 2, tiles: [] },
      ],
      party: { nodeId: 'world', tileId: '0,0' },
      entryTiles: { party: { cave: '1,1', gone: '0,0' }, 'c:hero': { gone: '0,0' } },
    }),
  );
  assert.deepEqual(loadInitialCampaign().entryTiles, { party: { cave: '1,1' } });
});

test('loadInitialCampaignSafe falls back to a blank campaign when a save is unreadable', () => {
  // Any JSON record parses as a campaign, and one with no nodes has no map.
  localStorage.setItem('campaign-builder:save', JSON.stringify({ hello: 'world' }));
  assert.throws(loadInitialCampaign, 'the strict loader still reports the problem');
  const { campaign, navigator, partyTracker, failed } = loadInitialCampaignSafe();
  assert.equal(failed, true);
  assert.deepEqual(campaign, buildBlankCampaign());
  assert.equal(navigator.getCurrentNode().id, 'world');
  assert.equal(partyTracker.grid, campaign.grid, 'the tracker walks the fallback grid');
  assert.ok(
    localStorage.getItem('campaign-builder:save'),
    'the unreadable save is left alone, so Undo can still reach the one before it',
  );
});

test('loadInitialCampaignSafe reports success for a readable save', () => {
  const { campaign, failed } = loadInitialCampaignSafe();
  assert.equal(failed, false);
  assert.deepEqual(campaign, buildBlankCampaign());
});

test('buildExampleCampaign defaults rng to Math.random when none is given', () => {
  const campaign = buildExampleCampaign(new TilePalette());
  assert.ok(campaign.grid.getNode('world'), 'built an overworld without an injected rng');
  assert.ok(campaign.creatures.length > 0);
});

test('blank campaign has no demo content', () => {
  const campaign = buildBlankCampaign();
  assert.equal(campaign.characters.length, 0);
  assert.equal(campaign.creatures.length, 0);
  assert.equal(campaign.quests.length, 0);
});

test('example campaign ships a full arc: quests, NPCs, bosses, field enemies', () => {
  const campaign = buildExampleCampaign(new TilePalette(), mulberry32(1));

  assert.ok(campaign.quests.length >= 5, 'expected a quest chain');
  assert.ok(campaign.quests.every((q) => q.status === 'active' && q.notes.length > 0));

  const folk = campaign.creatures.filter((c) => c.disposition !== 'hostile');
  assert.ok(folk.length >= 5, 'expected a staffed world');
  assert.ok(folk.every((n) => n.location !== null && (n.notes ?? '').length > 0));

  const legends = campaign.creatures.filter((e) => e.tier === 'legend');
  const mobs = campaign.creatures.filter((e) => e.tier === 'mob');
  assert.ok(legends.length >= 4, 'expected minor bosses plus a major boss');
  assert.ok(mobs.length >= 8, 'expected field enemies');
  const major = legends.reduce((a, b) => ((b.level ?? 0) > (a.level ?? 0) ? b : a));
  assert.equal(major.id, 'ostrand');
  assert.equal(major.location?.nodeId, 'barrow');

  assert.ok(campaign.bestiary.length >= 6, 'expected reusable mob templates');
  assert.ok(campaign.handouts.length >= 4, 'expected lore handouts');
  assert.ok(campaign.handouts.every((h) => !h.revealed));

  assert.equal(campaign.characters.length, 2);
  for (const character of campaign.characters) {
    const hp = getHP(character);
    assert.ok(hp && hp.current === hp.max && hp.max > 0, `${character.name} needs an HP pool`);
    assert.ok(character.inventory.length > 0, `${character.name} needs starting kit`);
    // The example party exercises the whole character model: each member is
    // classed, has an origin, carries assembled proficiencies, and owns a
    // spendable hit-dice pool sized to its class levels.
    assert.ok(getClasses(character).length >= 1, `${character.name} needs a class`);
    assert.ok(character.background, `${character.name} needs a background`);
    assert.ok(
      character.proficiencies && character.proficiencies.skills.length > 0,
      `${character.name} needs skill proficiencies`,
    );
    assert.ok(character.resources.some(isHitDicePool), `${character.name} needs a hit-dice pool`);
  }
});

test('every example enemy and template is rated, so the difficulty hint has numbers', () => {
  const campaign = buildExampleCampaign(new TilePalette(), mulberry32(1));
  const hostiles = campaign.creatures.filter((c) => c.disposition === 'hostile');
  assert.ok(hostiles.length > 0);
  for (const entry of [...hostiles, ...campaign.bestiary]) {
    assert.ok(crXP(entry.cr) > 0, `${entry.name} needs a rating worth XP`);
  }
  // A rating stamped by hand must be one of the defined steps, or the write
  // paths would drop it and the hint would silently read short.
  for (const entry of [...hostiles, ...campaign.bestiary]) {
    assert.equal(coerceCR(entry.cr), entry.cr, `${entry.name} names no defined rating`);
  }
  const party = campaign.characters;
  assert.match(
    difficultyLine(
      party,
      hostiles.filter((c) => c.id === 'ostrand'),
    ),
    /^Deadly: /,
    'the major boss alone is deadly for the level-3 example party',
  );
});

test('example campaign placements land on real tiles across seeds', () => {
  for (const seed of [1, 7, 27, 42, 99]) {
    const campaign = buildExampleCampaign(new TilePalette(), mulberry32(seed));
    /** @param {import('../src/types/entities.js').EncounterLocation} location @param {string} what */
    const assertPlaced = (location, what) => {
      const node = campaign.grid.getNode(location.nodeId);
      assert.ok(node, `seed ${seed}: ${what} in missing node ${location.nodeId}`);
      const tile = getTile(node, location.tileId);
      assert.ok(
        tile,
        `seed ${seed}: ${what} on missing tile ${location.nodeId}/${location.tileId}`,
      );
      return tile;
    };

    for (const c of campaign.creatures) {
      assert.ok(c.location, `seed ${seed}: creature ${c.id} unplaced`);
      assertPlaced(c.location, `creature ${c.id}`);
    }
    for (const h of campaign.handouts) {
      if (h.nodeId !== null)
        assert.ok(campaign.grid.getNode(h.nodeId), `seed ${seed}: handout ${h.id}`);
    }

    // Story bosses stand on their stamped landmarks, and the barrow boss on
    // real dungeon floor rather than a wall or the void.
    const snagtooth = campaign.creatures.find((e) => e.id === 'snagtooth');
    const campTile = assertPlaced(/** @type {any} */ (snagtooth?.location), 'snagtooth');
    assert.equal(campTile.metadata.poiType, 'landmark', `seed ${seed}: camp not stamped`);
    const ostrand = campaign.creatures.find((e) => e.id === 'ostrand');
    const tombTile = assertPlaced(/** @type {any} */ (ostrand?.location), 'ostrand');
    assert.ok(tombTile.imageRef.includes('interior-floor'), `seed ${seed}: tomb not on floor`);

    const ids = campaign.creatures.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, `seed ${seed}: duplicate creature ids`);
  }
});

test('buildingTile finds the tile a town drew a building on, else its entry', () => {
  const palette = new TilePalette();
  const inn = /** @type {import('../src/map/TilePalette.js').PaletteEntry} */ (palette.get('inn'));
  const gen = {
    width: 3,
    height: 3,
    entry: '1,2',
    tiles: [createTile('0,0', 'grass-1.svg'), createTile('2,1', inn.imageRef)],
  };
  assert.equal(buildingTile(gen, palette, 'inn'), '2,1');
  // The town's layout is random, so a building may not come up at all. The NPC
  // who works there then stands at the town's entry instead.
  assert.equal(buildingTile(gen, palette, 'blacksmith'), '1,2');
  // An image id the palette does not carry falls back the same way.
  assert.equal(buildingTile(gen, palette, 'no-such-building'), '1,2');
});

test('campaignFromLiveState wraps live objects without re-parsing or re-defaulting', () => {
  const source = buildExampleCampaign(new TilePalette(), mulberry32(3));
  const nodes = [...source.grid.nodes.values()];
  const campaign = campaignFromLiveState({
    nodes,
    party: source.party,
    characters: source.characters,
    creatures: source.creatures,
    travelog: source.travelog,
    quests: source.quests,
    clock: source.clock,
    handouts: source.handouts,
    bestiary: source.bestiary,
    splitParty: source.splitParty,
    combat: source.combat,
  });
  for (const node of nodes) {
    assert.equal(campaign.grid.getNode(node.id), node, 'every node keeps its identity');
  }
  assert.equal(campaign.characters, source.characters);
  assert.equal(campaign.clock, source.clock);
  const bare = campaignFromLiveState({ nodes: [nodes[0]], party: null, clock: null, combat: null });
  assert.deepEqual(bare.party, { nodeId: nodes[0].id, tileId: '0,0' });
  assert.ok(bare.clock, 'a null clock gets a fresh one');
  assert.equal(bare.combat, null);
});

test('a campaign with one empty node and no characters is blank', () => {
  const grid = { nodes: new Map([['world', {}]]) };
  assert.equal(isBlankCampaign(grid, { tiles: [] }, []), true);
});

test('a painted tile, a second node, or a character makes the campaign not blank', () => {
  const oneNode = { nodes: new Map([['world', {}]]) };
  const twoNodes = {
    nodes: new Map([
      ['world', {}],
      ['town', {}],
    ]),
  };
  assert.equal(isBlankCampaign(oneNode, { tiles: [{}] }, []), false);
  assert.equal(isBlankCampaign(twoNodes, { tiles: [] }, []), false);
  assert.equal(isBlankCampaign(oneNode, { tiles: [] }, [{}]), false);
});

test('the blank campaign builder produces a blank campaign', () => {
  const campaign = buildBlankCampaign();
  const node = campaign.grid.getNode(campaign.party.nodeId);
  assert.ok(node);
  assert.equal(isBlankCampaign(campaign.grid, node, campaign.characters), true);
});

test('loadInitialCampaign moves a party on a missing node to the first root node', () => {
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [
        { id: 'cave', name: 'Cave', parentId: 'vale', width: 2, height: 2, tiles: [] },
        { id: 'vale', name: 'Vale', parentId: null, width: 2, height: 2, tiles: [] },
      ],
      party: { nodeId: 'world', tileId: '1,1' },
    }),
  );
  assert.deepEqual(loadInitialCampaign().party, { nodeId: 'vale', tileId: '0,0' });
  const { failed, navigator } = loadInitialCampaignSafe();
  assert.equal(failed, false);
  assert.equal(navigator.getCurrentNode().id, 'vale');
});

test('partyOnGrid keeps a party on a known node and throws on an empty grid', () => {
  const { grid } = buildBlankCampaign();
  const party = { nodeId: 'world', tileId: '2,1' };
  assert.equal(partyOnGrid(party, grid), party);
  assert.throws(() => partyOnGrid(null, new TileGrid()), /no map nodes/);
});

test('loadInitialCampaign boots a save with a parent loop and a malformed spellbook', () => {
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [
        { id: 'a', name: 'A', parentId: 'b', width: 2, height: 2, tiles: [] },
        { id: 'b', name: 'B', parentId: 'a', width: 2, height: 2, tiles: [] },
      ],
      party: { nodeId: 'a', tileId: '0,0' },
      characters: [{ id: 'c1', name: 'Hero', spellbook: 5 }],
    }),
  );
  const { campaign, navigator, failed } = loadInitialCampaignSafe();
  assert.equal(failed, false);
  assert.deepEqual(
    navigator.getBreadcrumb().map((n) => n.id),
    ['b', 'a'],
  );
  assert.deepEqual(campaign.characters[0].spellbook, { cantrips: [], known: [], prepared: [] });
});

test('example enemies reach their stat block AC, and beasts fight unarmored with natural attacks', () => {
  const campaign = buildExampleCampaign(new TilePalette(), mulberry32(1));
  const byId = (/** @type {string} */ id) => {
    const found = campaign.creatures.find((c) => c.id === id);
    assert.ok(found, id);
    return found;
  };
  const expected = {
    'goblin-scout': 13,
    'bandit-1': 12,
    'barrow-skeleton-1': 13,
    'gray-wolf-1': 13,
    'giant-scorpion': 15,
    snagtooth: 16,
    'grave-wight': 14,
    ostrand: 18,
  };
  for (const [id, ac] of Object.entries(expected)) {
    assert.equal(effectiveStatBlock(byId(id)).AC, ac, id);
  }
  for (const id of ['gray-wolf-1', 'hill-harpy', 'giant-scorpion', 'skalvyr', 'crypt-shade']) {
    const beast = byId(id);
    assert.equal(beast.armor, null, `${id} wears no armor`);
    assert.equal(beast.weapon?.category, null, `${id} attacks with a natural weapon`);
  }
  const wolf = campaign.bestiary.find((t) => t.id === 'gray-wolf');
  assert.equal(wolf?.armor, null);
  assert.equal(wolf?.weapon?.name, 'Bite');
});
