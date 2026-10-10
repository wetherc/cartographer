import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExampleCampaign } from '../src/campaign/Campaigns.js';
import { REGIONS, WARDING_KEY, WORLD_SEED } from '../src/campaign/ExampleWorld.js';
import { isStandable, tileDistance } from '../src/campaign/ExampleStaging.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { getTile, overlayList } from '../src/map/TileGrid.js';
import { hasOpenPath } from '../src/map/MapPath.js';
import { tileKind } from '../src/map/TileKinds.js';
import { authoringWarning, findExits } from '../src/map/MapExits.js';
import { buildState, serialize } from '../src/storage/SaveManager.js';
import { QUOTA_WARN_BYTES } from '../src/storage/SaveStorage.js';
import { getHP, getClasses } from '../src/entities/Character.js';
import { isHitDicePool } from '../src/entities/HitDice.js';
import { coerceCR, crXP } from '../src/data/challenge.js';
import { difficultyLine } from '../src/entities/EncounterDifficulty.js';
import { effectiveStatBlock } from '../src/entities/Creature.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { DEFAULT_CREATURES } from '../src/data/creatures.js';
import { attackAbility } from '../src/entities/Weapons.js';
import { abilityModifier } from '../src/entities/Modifiers.js';
import { creatureProficiencyBonus } from '../src/entities/CreatureChecks.js';
import { computeCrossingEntryTile, computeRegionEntryTile } from '../src/map/EntryPoint.js';
import { NEIGHBORS4 } from '../src/map/MapGeometry.js';
import { roadArms } from '../src/campaign/ExampleRoads.js';
import {
  DOWNS_VALE_ENTRIES,
  DOWNS_WEST_GATE,
  VALE_EAST_GATE,
} from '../src/campaign/ExampleRegions.js';

const campaign = buildExampleCampaign(new TilePalette());
const { grid } = campaign;

/** @param {string} id */
const nodeOf = (id) => {
  const node = grid.getNode(id);
  assert.ok(node, `missing node ${id}`);
  return node;
};

/** @param {string} id */
const creature = (id) => {
  const found = campaign.creatures.find((c) => c.id === id);
  assert.ok(found, id);
  return found;
};

/** The ids of a node and every node above it. @param {string} id */
const lineage = (id) => {
  const ids = [];
  for (let n = grid.getNode(id); n; n = n.parentId ? grid.getNode(n.parentId) : undefined) {
    ids.push(n.id);
  }
  return ids;
};

test('the example campaign is the same on every load', () => {
  const again = buildExampleCampaign(new TilePalette());
  assert.equal(serialize(buildState(again)), serialize(buildState(campaign)));
});

test('a party that walks into a region of the example lands on a painted tile', () => {
  const world = nodeOf('world');
  let approaches = 0;
  for (const tile of world.tiles) {
    if (!tile.childNodeId) continue;
    const region = nodeOf(tile.childNodeId);
    const [x, y] = tile.id.split(',').map(Number);
    for (const [dx, dy] of NEIGHBORS4) {
      const from = getTile(world, `${x + dx},${y + dy}`);
      if (!from || from.childNodeId === region.id) continue;
      const party = { nodeId: 'world', tileId: from.id };
      const id = computeRegionEntryTile(world, region, region.id, party, tile.id);
      const landing = getTile(region, id);
      assert.ok(landing, `${region.id} from ${from.id}: ${id} is painted`);
      if (!/\/(water|deep-water)\//.test(from.imageRef)) {
        assert.doesNotMatch(landing.imageRef, /\/(water|deep-water)\//, `${region.id} ${id}`);
      }
      approaches++;
    }
  }
  assert.ok(approaches > 100);
});

test('the example world takes its regions from the seeded world generator', () => {
  const world = nodeOf('world');
  assert.equal(world.width, 48, `world seed ${WORLD_SEED}`);
  const anchors = new Set();
  for (const region of REGIONS) {
    const tile = getTile(world, region.anchor);
    // A failure here means a generator change moved the regions of the
    // seed: pick the anchors again, then refresh the docs and screenshots.
    assert.equal(tile?.childNodeId, region.id, `anchor ${region.anchor} of ${region.id}`);
    assert.ok(tile?.metadata.notes, `${region.id} has a GM note on its anchor`);
    anchors.add(tile?.childNodeId);
    assert.equal(nodeOf(region.id).parentId, 'world');
  }
  assert.equal(anchors.size, REGIONS.length, 'each anchor names its own region');
});

test('the start region is revealed on the world map and the party stands in it', () => {
  const world = nodeOf('world');
  const block = world.tiles.filter((t) => t.childNodeId === 'briarwick-vale');
  assert.ok(block.length > 0 && block.every((t) => t.revealed));
  assert.ok(
    world.tiles.filter((t) => t.childNodeId !== 'briarwick-vale').every((t) => !t.revealed),
  );
  assert.equal(campaign.party.nodeId, 'briarwick-vale');
  const start = getTile(nodeOf('briarwick-vale'), campaign.party.tileId);
  assert.ok(start && isStandable(start));
});

test('every example node has a way in and a way out', () => {
  for (const node of grid.nodes.values()) {
    const parent = node.parentId ? nodeOf(node.parentId) : null;
    assert.equal(authoringWarning(node, parent), null, `${node.id} (${node.name})`);
  }
});

test('every linked tile names a node, and every node but the world is linked', () => {
  const linked = new Set();
  for (const node of grid.nodes.values()) {
    for (const t of node.tiles) {
      if (!t.childNodeId) continue;
      assert.ok(grid.getNode(t.childNodeId), `${node.id}/${t.id} links to ${t.childNodeId}`);
      assert.equal(nodeOf(t.childNodeId).parentId, node.id);
      linked.add(t.childNodeId);
    }
  }
  assert.equal(linked.size, grid.nodes.size - 1);
});

test('only the barrow starts locked, and both routes to its key name the key item', () => {
  const locked = [...grid.nodes.values()].filter((n) => n.lock);
  assert.deepEqual(
    locked.map((n) => n.id),
    ['barrow'],
  );
  assert.deepEqual(nodeOf('barrow').lock, { requires: WARDING_KEY, open: false });
  for (const id of ['hermit-odo', 'sella-the-smith']) {
    assert.ok(creature(id).notes.includes(`an item named ${WARDING_KEY}`), id);
  }
});

test('the story places are the expected generated maps', () => {
  assert.equal(nodeOf('briarwick').parentId, 'briarwick-vale');
  assert.equal(nodeOf('saltmere').parentId, 'saltreach');
  assert.equal(nodeOf('thornhold').parentId, 'barrowdowns');
  assert.equal(nodeOf('barrow').parentId, 'barrowdowns');
  assert.equal(nodeOf('vane-crypt').name, 'Old Vane Crypt');
  assert.equal(nodeOf('vane-crypt').parentId, 'barrowdowns');
  assert.equal(nodeOf('hollowvein').parentId, 'graypeak');
  // Saltmere is a port: its sea has piers.
  assert.ok(nodeOf('saltmere').tiles.some((t) => String(t.overlayRef).includes('/dock/')));
  // The two story towns have furnished buildings, and the inn has its name.
  const names = [...grid.nodes.values()]
    .filter((n) => n.parentId === 'briarwick')
    .map((n) => n.name);
  assert.ok(names.includes('The Waystation'));
  assert.equal(
    nodeOf('thornhold').tiles.filter((t) => t.childNodeId).length,
    2,
    'upper floor and dungeons',
  );
});

test('the save of the example stays well under the storage warning', () => {
  const bytes = serialize(buildState(campaign)).length * 2;
  assert.ok(bytes < QUOTA_WARN_BYTES / 3, `${bytes} bytes`);
});

test('every creature stands where the party can meet it', () => {
  const ids = campaign.creatures.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate creature ids');
  for (const c of campaign.creatures) {
    assert.ok(c.location, `${c.id} unplaced`);
    const tile = getTile(nodeOf(c.location.nodeId), c.location.tileId);
    assert.ok(tile, `${c.id} on missing tile ${c.location.nodeId}/${c.location.tileId}`);
    assert.ok(
      !tile.childNodeId && tileKind(tile) !== 'wall' && tileKind(tile) !== 'obstacle',
      c.id,
    );
  }
  const camp = getTile(nodeOf('northmarch'), creature('snagtooth').location?.tileId ?? '');
  assert.equal(camp?.metadata.poiType, 'landmark', 'Snagtooth stands on a stamped camp');
  const tomb = creature('ostrand').location;
  const deepest = nodeOf(tomb?.nodeId ?? '');
  assert.ok(lineage(deepest.id).includes('barrow'), 'Ostrand lies in the barrow');
  assert.ok(!deepest.tiles.some((t) => tileKind(t) === 'stairs-down'), 'on its last level');
  assert.equal(tileKind(/** @type {any} */ (getTile(deepest, tomb?.tileId ?? ''))), 'floor');
  assert.ok(lineage(creature('innkeeper-bram').location?.nodeId ?? '').includes('briarwick'));
});

test('each group of foes shares one tile, so the party meets it as one encounter', () => {
  /** @param {string} id */
  const spot = (id) => JSON.stringify(creature(id).location);
  assert.equal(spot('gray-wolf-2'), spot('gray-wolf-1'));
  assert.equal(spot('bandit-2'), spot('bandit-1'));
  for (const id of ['goblin-raider-1', 'goblin-raider-2'])
    assert.equal(spot(id), spot('snagtooth'));
  const den = getTile(nodeOf('briarwick-vale'), creature('gray-wolf-1').location?.tileId ?? '');
  assert.ok(den && overlayList(den).some((r) => r.includes('/road/')), 'the pack hunts the road');
});

test('no hostile creature stands within one tile of the party at the start', () => {
  const [px, py] = campaign.party.tileId.split(',').map(Number);
  for (const c of campaign.creatures) {
    if (c.location?.nodeId !== campaign.party.nodeId || c.disposition !== 'hostile') continue;
    const [x, y] = c.location.tileId.split(',').map(Number);
    assert.ok(Math.max(Math.abs(x - px), Math.abs(y - py)) >= 2, c.id);
  }
  const farm = nodeOf('briarwick-vale').tiles.find((t) =>
    String(t.metadata.notes).startsWith('A farmstead burned in the goblin raids'),
  );
  assert.match(farm?.imageRef ?? '', /burned-farm\.svg$/, 'the farm shows the burned-farm art');
  const scout = creature('goblin-scout').location?.tileId ?? '';
  assert.ok(farm && tileDistance(scout, farm.id) <= 2, 'the scout stays near the farm');
});

test('Sister Alwyn stands beside the altar, on floor that a walk from the door reaches', () => {
  const place = creature('sister-alwyn').location;
  const temple = nodeOf(place?.nodeId ?? '');
  assert.equal(temple.name, 'Temple');
  const door = temple.tiles.find(
    (t) => tileKind(t) === 'door' && t.id.endsWith(`,${temple.height - 1}`),
  );
  assert.ok(door && hasOpenPath(temple, door.id, place?.tileId ?? ''));
  const altar = temple.tiles.find((t) => overlayList(t).some((r) => r.includes('altar')));
  assert.ok(altar && tileDistance(altar.id, place?.tileId ?? '') <= 2);
});

test('the handouts name real nodes, and a bound handout a real tile', () => {
  for (const h of campaign.handouts) {
    if (h.nodeId === null) {
      assert.equal(h.tileId, null, h.id);
      continue;
    }
    const node = nodeOf(h.nodeId);
    if (h.tileId !== null) assert.ok(getTile(node, h.tileId), `${h.id} on ${h.tileId}`);
  }
});

test('example campaign ships a full arc: quests, NPCs, bosses, field enemies', () => {
  assert.ok(campaign.quests.length >= 5, 'expected a quest chain');
  assert.ok(campaign.quests.every((q) => q.status === 'active' && q.notes.length > 0));

  const folk = campaign.creatures.filter((c) => c.disposition !== 'hostile');
  assert.ok(folk.length >= 5, 'expected a staffed world');
  assert.ok(folk.every((n) => (n.notes ?? '').length > 0));

  const legends = campaign.creatures.filter((e) => e.tier === 'legend');
  const mobs = campaign.creatures.filter((e) => e.tier === 'mob');
  assert.ok(legends.length >= 4, 'expected minor bosses plus a major boss');
  assert.ok(mobs.length >= 8, 'expected field enemies');
  const major = legends.reduce((a, b) => ((b.level ?? 0) > (a.level ?? 0) ? b : a));
  assert.equal(major.id, 'ostrand');

  assert.ok(campaign.bestiary.length >= 6, 'expected reusable mob templates');
  assert.ok(campaign.handouts.length >= 4, 'expected lore handouts');
  assert.ok(campaign.handouts.every((h) => h.revealed === Boolean(h.audience)));

  assert.deepEqual(
    campaign.characters.map((c) => c.id),
    ['aldric', 'mirelle', 'wren', 'brannoc'],
  );
  for (const character of campaign.characters) {
    const hp = getHP(character);
    assert.ok(hp && hp.current === hp.max && hp.max > 0, `${character.name} needs an HP pool`);
    assert.ok(character.inventory.length > 0, `${character.name} needs starting kit`);
    // The example party exercises the whole character model: each member is
    // classed, has an origin, has assembled proficiencies, and owns a
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
  const hostiles = campaign.creatures.filter((c) => c.disposition === 'hostile');
  assert.ok(hostiles.length > 0);
  for (const entry of [...hostiles, ...campaign.bestiary]) {
    assert.ok(crXP(entry.cr) > 0, `${entry.name} needs a rating worth XP`);
    // A rating stamped by hand must be one of the defined steps, or the write
    // paths would drop it and the hint would silently read short.
    assert.equal(coerceCR(entry.cr), entry.cr, `${entry.name} names no defined rating`);
  }
  assert.match(
    difficultyLine(campaign.characters, [creature('ostrand')]),
    /^Deadly: /,
    'the major boss alone is deadly for the example party',
  );
});

test('example enemies reach their stat block AC, and beasts fight unarmored with natural attacks', () => {
  const expected = {
    'goblin-scout': 15,
    'camp-bugbear': 16,
    'bandit-1': 12,
    'barrow-skeleton-1': 13,
    'gray-wolf-1': 13,
    'giant-scorpion': 15,
    snagtooth: 17,
    'grave-wight': 14,
    ostrand: 18,
  };
  for (const [id, ac] of Object.entries(expected)) {
    assert.equal(effectiveStatBlock(creature(id)).AC, ac, id);
  }
  for (const id of ['gray-wolf-1', 'hill-harpy', 'giant-scorpion', 'skalvyr', 'crypt-shade']) {
    const beast = creature(id);
    assert.equal(beast.armor, null, `${id} wears no armor`);
    assert.equal(beast.weapons[0]?.category, null, `${id} attacks with a natural weapon`);
  }
  const wolf = campaign.bestiary.find((t) => t.id === 'gray-wolf');
  assert.equal(wolf?.armor, null);
  assert.equal(wolf?.weapons[0]?.name, 'Bite');
});

test('the world build refuses a region table that does not match the generated regions', () => {
  const palette = new TilePalette();
  REGIONS.push({ anchor: '0,0', id: 'nowhere', name: 'Nowhere', notes: '' });
  assert.throws(
    () => buildExampleCampaign(palette),
    /No world region covers the anchor of nowhere/,
  );
  REGIONS.pop();
  const [first] = REGIONS.splice(0, 1);
  assert.throws(() => buildExampleCampaign(palette), /has no entry in REGIONS/);
  REGIONS.unshift(first);
});

test('every quest link names a real place or creature', () => {
  const creatures = new Set(campaign.creatures.map((c) => c.id));
  for (const quest of campaign.quests) {
    for (const link of quest.links) {
      if (link.kind === 'creature') {
        assert.ok(creatures.has(link.creatureId), `${quest.id}: ${link.creatureId}`);
      } else {
        const node = nodeOf(link.nodeId);
        if (link.tileId !== null)
          assert.ok(getTile(node, link.tileId), `${quest.id}: ${link.tileId}`);
      }
    }
  }
});

test('the example party shows a feat, an ability increase, expertise, subclasses, and a multiclass', () => {
  const [aldric, mirelle, wren, brannoc] = campaign.characters;
  for (const c of campaign.characters) assert.equal(c.level, 4, c.name);
  const choice = (/** @type {any} */ c) => Object.values(c.asiChoices ?? {})[0];
  assert.equal(choice(aldric)?.featId, 'resilient');
  assert.ok(aldric.proficiencies.saves.includes('WIS'));
  assert.deepEqual(choice(mirelle)?.increases, { WIS: 2 });
  assert.equal(choice(wren)?.featId, 'skill-expert');
  assert.deepEqual(wren.proficiencies.expertise, ['stealth', 'sleight-of-hand', 'perception']);
  assert.equal(getClasses(wren)[0].subclass, 'Arcane Trickster');
  assert.deepEqual(
    getClasses(brannoc).map((c) => [c.classId, c.level, c.subclass ?? null]),
    [
      ['fighter', 3, 'Eldritch Knight'],
      ['wizard', 1, null],
    ],
  );
  for (const c of [mirelle, wren, brannoc]) {
    assert.ok(
      c.resources.some((r) => r.id === 'slots-1'),
      `${c.name} casts`,
    );
  }
  // Every equipped item is in the character's own inventory.
  for (const c of campaign.characters) {
    const owned = new Set(c.inventory.map((i) => i.id));
    for (const id of Object.values(c.equipment))
      if (id) assert.ok(owned.has(id), `${c.name}: ${id}`);
  }
});

test('every example caster knows only spells of a level it has slots for', () => {
  const levels = new Map(DEFAULT_SPELLS.map((s) => [s.id, s.level]));
  for (const c of campaign.characters) {
    const top = Math.max(0, ...c.resources.map((r) => Number(/^slots-(\d)$/.exec(r.id)?.[1] ?? 0)));
    for (const id of [...(c.spellbook?.cantrips ?? []), ...(c.spellbook?.known ?? [])]) {
      assert.ok(levels.has(id), `${c.name}: unknown spell ${id}`);
      assert.ok((levels.get(id) ?? 0) <= top, `${c.name}: ${id} is above slot level ${top}`);
    }
  }
});

test('the wolves bite with DEX at the SRD +4, and the camp around Snagtooth rates Medium', () => {
  const wolves = [creature('gray-wolf-1'), campaign.bestiary.find((t) => t.id === 'gray-wolf')];
  for (const wolf of wolves) {
    assert.ok(wolf?.weapons[0]);
    assert.equal(wolf.packTactics, true, wolf.name);
    assert.deepEqual(wolf.weapons[0].onHitSave, { ability: 'STR', dc: 11, condition: 'Prone' });
    assert.equal(attackAbility(wolf.weapons[0], wolf.stats), 'DEX', wolf.name);
    assert.equal(abilityModifier(wolf.stats.DEX) + creatureProficiencyBonus(wolf), 4, wolf.name);
  }
  const library = DEFAULT_CREATURES.find((t) => t.id === 'wolf');
  assert.ok(library?.weapons[0]);
  assert.equal(attackAbility(library.weapons[0], library.stats), 'DEX');

  assert.deepEqual(creature('camp-bugbear').surpriseAttack, { count: 2, sides: 6 });
  const boss = creature('snagtooth');
  assert.equal(boss.multiattack, 2);
  assert.equal(boss.multiattackDisadvantage, 2);
  assert.equal(boss.redirectAttack, true);
  assert.doesNotMatch(boss.notes ?? '', /disadvantage|use his reaction/);
  const camp = ['camp-bugbear', 'camp-goblin1', 'camp-goblin2'].map(creature);
  for (const guard of camp) assert.deepEqual(guard.location, boss.location, guard.id);
  assert.match(difficultyLine(campaign.characters, [boss, ...camp]), /^Medium: 1000 XP/);
  const raiders = [creature('goblin-raider-1'), creature('goblin-raider-2')];
  assert.match(
    difficultyLine(campaign.characters, [boss, ...camp, ...raiders]),
    /^Medium: /,
    'the camp stays Medium with the two outlying raiders',
  );
});

test('each staged fight of the main line rates as the story needs', () => {
  /** @param {string} id */
  const group = (id) =>
    campaign.creatures
      .filter((c) => spotOf(c) === spotOf(creature(id)))
      .map((c) => ({ ...c, disposition: /** @type {const} */ ('hostile') }));
  /** @param {import('../src/types/creature.js').Creature} c */
  const spotOf = (c) => JSON.stringify(c.location);
  const rate = (id) => difficultyLine(campaign.characters, group(id));
  assert.equal(group('gray-wolf-1').length, 6, 'four wolves and two dire wolves');
  assert.match(rate('gray-wolf-1'), /^Medium: /);
  assert.match(rate('bandit-captain'), /^Medium: /);
  assert.match(rate('crypt-shade'), /^Hard: /);
  assert.deepEqual(
    group('castellan-irenne').map((c) => c.id),
    ['thornhold-guard-1', 'thornhold-guard-2', 'castellan-irenne'],
  );
  assert.match(rate('castellan-irenne'), /^Hard: /);
  assert.equal(spotOf(creature('barrow-skeleton-2')), spotOf(creature('barrow-skeleton-1')));
  assert.match(rate('ostrand'), /^Deadly: /);
  const guard = campaign.bestiary.find((t) => t.id === 'thornhold-guard');
  assert.equal(guard?.multiattack, 2);
});

test('the example spellcasters follow the school rules of their subclasses', () => {
  const school = new Map(DEFAULT_SPELLS.map((s) => [s.id, s.school]));
  /** @param {string[]} ids @param {string[]} schools */
  const inSchools = (ids, schools) => ids.filter((id) => schools.includes(school.get(id) ?? ''));
  const wren = campaign.characters.find((c) => c.id === 'wren')?.spellbook;
  assert.ok(wren?.cantrips.includes('mage-hand'), 'an Arcane Trickster knows Mage Hand');
  assert.equal(wren.cantrips.length, 3);
  assert.equal(wren.known.length, 4);
  assert.ok(inSchools(wren.known, ['enchantment', 'illusion']).length >= 3);

  const book = campaign.characters.find((c) => c.id === 'brannoc')?.spellbook;
  const sources = book?.sources;
  assert.ok(book && sources);
  /** @param {string} classId @param {string[]} ids */
  const from = (classId, ids) => ids.filter((id) => sources[id] === classId);
  const knight = from('fighter', book.known);
  assert.equal(knight.length, 3, 'an Eldritch Knight 3 knows three spells');
  assert.ok(inSchools(knight, ['abjuration', 'evocation']).length >= 2);
  assert.equal(from('fighter', book.cantrips).length, 2);
  assert.equal(from('wizard', book.cantrips).length, 3);
  assert.equal(from('wizard', book.known).length, 6, 'a wizard 1 keeps six spells in the book');
  assert.deepEqual(from('wizard', book.prepared), book.prepared);
  assert.equal(book.prepared.length, 2);
  for (const id of [...book.cantrips, ...book.known]) assert.ok(sources[id], id);
});

test('a road crosses the border from the Briarwick Vale into the Barrowdowns', () => {
  const world = nodeOf('world');
  /** @param {string} from @param {string} gate @param {string} side */
  const landing = (from, gate, side) => {
    const [x, y] = gate.split(',').map(Number);
    const exit = findExits(nodeOf(from), world, null, { at: { x, y }, nodeById: nodeOf }).find(
      (e) => e.side === side,
    );
    assert.ok(exit?.targetNodeId && exit.crossTileId, `${from} crosses at ${gate}`);
    return computeCrossingEntryTile(world, nodeOf(exit.targetNodeId), exit.crossTileId);
  };
  assert.equal(landing('briarwick-vale', VALE_EAST_GATE, 'east'), DOWNS_WEST_GATE);
  assert.equal(landing('barrowdowns', DOWNS_WEST_GATE, 'west'), VALE_EAST_GATE);
  assert.ok(roadArms(getTile(nodeOf('briarwick-vale'), VALE_EAST_GATE)).includes('e'));
  assert.ok(roadArms(getTile(nodeOf('barrowdowns'), DOWNS_WEST_GATE)).includes('w'));
});

test('the barrow lies far from the keep and from each way in from the vale, off the road', () => {
  const world = nodeOf('world');
  const vale = nodeOf('briarwick-vale');
  const downs = nodeOf('barrowdowns');
  /** @param {string} id */
  const link = (id) => downs.tiles.find((t) => t.childNodeId === id);
  const keep = link('thornhold');
  const barrow = link('barrow');
  assert.ok(keep && barrow);
  // Every tile where a party that walks off the vale lands on the downs.
  const entries = new Set(
    vale.tiles.flatMap((t) => {
      const [x, y] = t.id.split(',').map(Number);
      return findExits(vale, world, null, { at: { x, y }, nodeById: nodeOf })
        .filter((e) => e.targetNodeId === 'barrowdowns' && e.crossTileId)
        .map((e) => computeCrossingEntryTile(world, downs, e.crossTileId ?? ''));
    }),
  );
  assert.deepEqual([...entries].sort(), [...DOWNS_VALE_ENTRIES].sort());
  for (const from of [keep.id, ...entries]) {
    assert.ok(tileDistance(from, barrow.id) >= 12, `${from} to ${barrow.id}`);
    assert.ok(hasOpenPath(downs, from, barrow.id), `a walk from ${from} to ${barrow.id}`);
  }
  assert.equal(roadArms(barrow).length, 0);
});
