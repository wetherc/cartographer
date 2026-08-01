import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBlankCampaign,
  buildExampleCampaign,
  loadInitialCampaign,
  loadInitialCampaignSafe,
} from '../src/campaign/Campaigns.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { createTile, getTile } from '../src/map/TileGrid.js';
import { buildingTile } from '../src/campaign/ExampleWorld.js';
import { createCharacter, getHP, getClasses } from '../src/entities/Character.js';
import { isHitDicePool } from '../src/entities/HitDice.js';
import { mulberry32 } from '../src/util/Rng.js';
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
  assert.deepEqual(campaign.npcs, []);
  assert.deepEqual(campaign.handouts, []);
  assert.deepEqual(campaign.bestiary, []);
  assert.equal(campaign.splitParty, false);
  // No demo character is injected into an authored-empty roster.
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({ nodes: [], party: null, characters: [], encounters: [] }),
  );
  assert.equal(loadInitialCampaign().characters.length, 0);
});

test('loadInitialCampaign passes through every present field of a full save', () => {
  const clock = { day: 3, minutes: 42 };
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
  assert.equal(campaign.npcs[0].name, 'Barkeep');
  assert.equal(campaign.handouts[0].title, 'Map');
  assert.equal(campaign.bestiary[0].id, 'b1');
  assert.equal(campaign.splitParty, true);
});

test('loadInitialCampaignSafe falls back to a blank campaign when a save is unreadable', () => {
  // Survives deserialize as a record, then throws in the character default-fill.
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [{ id: 'world', name: 'World', parentId: null, width: 2, height: 2, tiles: [] }],
      characters: [{ id: 'c1', name: 'Hero', inventory: 5 }],
    }),
  );
  assert.throws(loadInitialCampaign, 'the strict loader still reports the problem');
  const { campaign, failed } = loadInitialCampaignSafe();
  assert.equal(failed, true);
  assert.deepEqual(campaign, buildBlankCampaign());
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
  assert.ok(campaign.encounters.length > 0);
});

test('blank campaign has no demo content', () => {
  const campaign = buildBlankCampaign();
  assert.equal(campaign.characters.length, 0);
  assert.equal(campaign.encounters.length, 0);
  assert.equal(campaign.quests.length, 0);
  assert.equal(campaign.npcs.length, 0);
});

test('example campaign ships a full arc: quests, NPCs, bosses, field enemies', () => {
  const campaign = buildExampleCampaign(new TilePalette(), mulberry32(1));

  assert.ok(campaign.quests.length >= 5, 'expected a quest chain');
  assert.ok(campaign.quests.every((q) => q.status === 'active' && q.notes.length > 0));

  assert.ok(campaign.npcs.length >= 5, 'expected a staffed world');
  assert.ok(campaign.npcs.every((n) => n.location !== null && n.notes.length > 0));

  const legends = campaign.encounters.filter((e) => e.tier === 'legend');
  const mobs = campaign.encounters.filter((e) => e.tier === 'mob');
  assert.ok(legends.length >= 4, 'expected minor bosses plus a major boss');
  assert.ok(mobs.length >= 8, 'expected field enemies');
  const major = legends.reduce((a, b) => (b.level > a.level ? b : a));
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
    // The example party exercises the phase-2 character foundation: each member
    // is classed, has an origin, carries assembled proficiencies, and owns a
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

    for (const e of campaign.encounters) {
      assert.ok(e.location, `seed ${seed}: encounter ${e.id} unplaced`);
      assertPlaced(e.location, `encounter ${e.id}`);
    }
    for (const n of campaign.npcs) {
      assert.ok(n.location, `seed ${seed}: NPC ${n.id} unplaced`);
      assertPlaced(n.location, `NPC ${n.id}`);
    }
    for (const h of campaign.handouts) {
      if (h.nodeId !== null)
        assert.ok(campaign.grid.getNode(h.nodeId), `seed ${seed}: handout ${h.id}`);
    }

    // Story bosses stand on their stamped landmarks, and the barrow boss on
    // real dungeon floor rather than a wall or the void.
    const snagtooth = campaign.encounters.find((e) => e.id === 'snagtooth');
    const campTile = assertPlaced(/** @type {any} */ (snagtooth?.location), 'snagtooth');
    assert.equal(campTile.metadata.poiType, 'landmark', `seed ${seed}: camp not stamped`);
    const ostrand = campaign.encounters.find((e) => e.id === 'ostrand');
    const tombTile = assertPlaced(/** @type {any} */ (ostrand?.location), 'ostrand');
    assert.ok(tombTile.imageRef.includes('interior-floor'), `seed ${seed}: tomb not on floor`);

    const ids = campaign.encounters.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, `seed ${seed}: duplicate encounter ids`);
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
