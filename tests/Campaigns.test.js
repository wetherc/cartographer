import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBlankCampaign, buildExampleCampaign } from '../src/campaign/Campaigns.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { getTile } from '../src/map/TileGrid.js';
import { getHP } from '../src/entities/Character.js';

/** @param {number} seed @returns {() => number} deterministic rng */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
      assert.ok(tile, `seed ${seed}: ${what} on missing tile ${location.nodeId}/${location.tileId}`);
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
      if (h.nodeId !== null) assert.ok(campaign.grid.getNode(h.nodeId), `seed ${seed}: handout ${h.id}`);
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
