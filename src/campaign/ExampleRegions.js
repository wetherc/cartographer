import { overlayList } from '../map/TileGrid.js';
import { tileKind } from '../map/TileKinds.js';
import {
  besideTile,
  isBareFloor,
  isOpenGround,
  isStandable,
  makeSpotPicker,
  noteTile,
  reachableFrom,
  stampMarker,
  tileDistance,
  tileXY,
} from './ExampleStaging.js';
import { paintRoadTo } from './ExampleRoads.js';

// The Briarwick Vale and the Barrowdowns share a border. A party that walks
// off the vale at VALE_EAST_GATE lands on DOWNS_WEST_GATE, and the reverse.
export const VALE_EAST_GATE = '26,23';
export const DOWNS_WEST_GATE = '0,16';
// The tiles where a party lands when it walks off the Briarwick Vale into
// the Barrowdowns, from the road gate and from the open border beside it.
export const DOWNS_VALE_ENTRIES = [DOWNS_WEST_GATE, '2,13', '3,11'];

/** @typedef {import('./ExampleWorld.js').RegionStage} RegionStage */
/** @typedef {import('../map/GeneratorTree.js').TreeNode} TreeNode */
/** @typedef {import('../map/TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('../types/map.js').Tile} Tile */

/**
 * The story of each region of the example world: which generated places
 * are story places, which landmarks the story stamps onto the region map,
 * and where the people and the monsters of the story stand. Each stage
 * function reads the generated tiles, so it chooses the same tiles for the
 * same seed. When a place that the story needs did not come up, the stage
 * stamps a marker for it on open ground.
 */

/**
 * The index of the first site whose label is in `labels`. When no site has
 * one, the stage stamps `marker` on open ground far from the entry and adds
 * a site for it that opens into `archetype`. With `away`, a site counts only
 * when each of its tiles lies at least `away.min` tiles from every tile in
 * `away.from` and off the road, and a stamped marker obeys the same rule.
 * @param {RegionStage} stage @param {string[]} labels @param {string} marker
 * @param {{ archetype: string, kind: import('../types/map.js').NodeKind, size: string }} inside
 * @param {{ from: string[], min: number }} [away]
 * @returns {number}
 */
function ensureSite(stage, labels, marker, { archetype, kind, size }, away) {
  const byId = new Map(stage.gen.tiles.map((t) => [t.id, t]));
  /** @param {string} id */
  const far = (id) =>
    !away ||
    (away.from.every((from) => tileDistance(id, from) >= away.min) &&
      !onRoad(/** @type {Tile} */ (byId.get(id))));
  const found = stage.gen.sites.findIndex((s) => labels.includes(s.label) && s.tileIds.every(far));
  if (found >= 0) return found;
  const tileId = outdoors(stage.gen, (t) => isOpenGround(t) && far(t.id))();
  stampMarker(stage.gen, stage.palette, tileId, marker, '');
  stage.gen.sites.push({
    tileIds: [tileId],
    archetype,
    kind,
    environ: archetype,
    size,
    label: marker,
  });
  return stage.gen.sites.length - 1;
}

/**
 * A spot picker for a region map that keeps two tiles off the border.
 * @param {import('./ExampleWorld.js').RegionStage['gen']} gen
 * @param {(t: Tile) => boolean} ok
 * @param {Parameters<typeof makeSpotPicker>[2]} [options]
 */
const outdoors = (gen, ok, options = {}) => makeSpotPicker(gen, ok, { margin: 2, ...options });

/** The marker tile of a site. @param {RegionStage} stage @param {number} i */
const siteTile = (stage, i) => stage.gen.sites[i].tileIds[0];

/**
 * The tile of the first landmark drawn with `imageId`, or a new stamp of it
 * on open ground from `pick` when the generator drew none.
 * @param {RegionStage} stage @param {string} imageId @param {() => string} pick
 * @returns {string}
 */
function landmark(stage, imageId, pick) {
  const ref = stage.palette.get(imageId)?.imageRef;
  const found = stage.gen.tiles.find((t) => t.imageRef === ref && !t.childNodeId);
  if (found) return found.id;
  const tileId = pick();
  stampMarker(stage.gen, stage.palette, tileId, imageId, '');
  return tileId;
}

/**
 * Record a place on the region map.
 * @param {RegionStage} stage @param {string} name @param {string} tileId
 */
function put(stage, name, tileId) {
  stage.places[name] = { nodeId: stage.regionId, tileId };
}

/**
 * Whether a tile has a road overlay.
 * @param {Tile} t
 */
const onRoad = (t) => overlayList(t).some((ref) => ref.includes('/road/'));

/**
 * The sub-map that a town opens into through the building drawn with
 * `imageId`, or null when the town has no such building.
 * @param {TreeNode} town @param {TilePalette} palette @param {string} imageId
 * @param {(id: string) => TreeNode} node
 * @returns {TreeNode | null}
 */
function building(town, palette, imageId, node) {
  const ref = palette.get(imageId)?.imageRef;
  const id = town.tiles.find((t) => t.imageRef === ref && t.childNodeId)?.childNodeId;
  return id ? node(id) : null;
}

/**
 * Rename a building and the cellar under it, whose name repeats the name of
 * the building with a label.
 * @param {TreeNode} inside @param {string} name @param {(id: string) => TreeNode} node
 */
function rename(inside, name, node) {
  const old = inside.name;
  inside.name = name;
  for (const t of inside.tiles) {
    if (!t.childNodeId) continue;
    const below = node(t.childNodeId);
    below.name = below.name.replace(old, name);
  }
}

/**
 * The next level down from a level of a stack, through its stairs down, or
 * null on the last level.
 * @param {TreeNode} level @param {(id: string) => TreeNode} node
 * @returns {TreeNode | null}
 */
function levelBelow(level, node) {
  const stairs = level.tiles.find((t) => tileKind(t) === 'stairs-down' && t.childNodeId);
  return stairs?.childNodeId ? node(stairs.childNodeId) : null;
}

/**
 * Every level of a stack from `top` down.
 * @param {TreeNode} top @param {(id: string) => TreeNode} node
 * @returns {TreeNode[]}
 */
export function stackOf(top, node) {
  const levels = [top];
  for (let next = levelBelow(top, node); next; next = levelBelow(next, node)) levels.push(next);
  return levels;
}

/**
 * The sub-map a tile of `inside` leads to through a staircase of `kind`.
 * @param {TreeNode} inside @param {'stairs-up' | 'stairs-down'} kind
 * @param {(id: string) => TreeNode} node
 * @returns {TreeNode | null}
 */
function stairTo(inside, kind, node) {
  const id = inside.tiles.find((t) => tileKind(t) === kind && t.childNodeId)?.childNodeId;
  return id ? node(id) : null;
}

/**
 * Put the named people on bare floor inside a sub-map, deepest first, each
 * a few tiles from the last. Only floor that a walk from the entry reaches
 * counts, so no one stands in a sealed corner behind a wall or a row of
 * furnishings. `from` measures nearness from that tile instead of the
 * entry. A missing sub-map puts them at the fallback.
 * @param {RegionStage} stage @param {TreeNode | null} inside @param {string[]} names
 * @param {{ near?: boolean, from?: string, fallback: { nodeId: string, tileId: string } }} options
 */
function putInside(stage, inside, names, { near = false, from, fallback }) {
  if (!inside) {
    for (const name of names) stage.places[name] = fallback;
    return;
  }
  const reach = reachableFrom(inside, inside.entry);
  const ok = (/** @type {Tile} */ t) => isBareFloor(t) && reach.has(t.id);
  const pick = makeSpotPicker(inside, ok, { near, gap: 2, from: from ?? inside.entry });
  for (const name of names) stage.places[name] = { nodeId: inside.id, tileId: pick() };
}

/** @type {Record<string, (stage: RegionStage) => void>} */
export const REGION_STAGES = {
  'briarwick-vale'(stage) {
    const { gen, palette } = stage;
    const town = ensureSite(stage, ['settlement', 'city', 'village'], 'settlement', {
      archetype: 'town',
      kind: 'region',
      size: 'medium',
    });
    stage.overrides.set(town, {
      id: 'briarwick',
      name: 'Briarwick',
      environ: 'grassland',
      depth: 1,
    });
    const gate = siteTile(stage, town);
    noteTile(
      gen,
      gate,
      'Briarwick, the market town of the vale. The Waystation inn hears all the news of the road.',
    );
    // The party starts on the road outside the town, and Dorn's caravan
    // waits a few tiles down the same road.
    const road = outdoors(gen, (t) => onRoad(t) && isStandable(t), {
      from: gate,
      near: true,
      gap: 2,
    });
    put(stage, 'start', road());
    put(stage, 'dorn', road());
    const near = outdoors(gen, (t) => isOpenGround(t) && tileDistance(t.id, gate) >= 2, {
      from: gate,
      near: true,
      gap: 3,
    });
    const graveyard = near();
    stampMarker(
      gen,
      palette,
      graveyard,
      'graveyard',
      "Briarwick's burial ground. Three graves stand open, dug out from the inside.",
    );
    put(stage, 'graveyard', graveyard);
    const farm = near();
    stampMarker(
      gen,
      palette,
      farm,
      'burned-farm',
      'A farmstead burned in the goblin raids. The roof of the house lies in ash on the floor, and only the stone chimney and the blackened walls still stand. The charred door frame is scored with claw marks far too orderly to be animal.',
    );
    put(stage, 'farm', farm);
    // The scout lurks near the farm but out of the party's encounter range
    // (one tile on every side) at the start, so the first fight waits until
    // the party walks over.
    const start = tileXY(stage.places.start.tileId);
    const clear = (/** @type {Tile} */ t) => {
      const [x, y] = tileXY(t.id);
      return Math.max(Math.abs(x - start[0]), Math.abs(y - start[1])) >= 2;
    };
    const lurk = makeSpotPicker(gen, (t) => isStandable(t) && !t.metadata.poiType && clear(t), {
      from: farm,
      near: true,
    });
    put(stage, 'goblinScout', lurk());
    const village = stage.gen.sites.findIndex(
      (s, i) => i !== town && ['village', 'settlement'].includes(s.label),
    );
    const steadingFrom = village >= 0 ? siteTile(stage, village) : gate;
    const steading = outdoors(gen, isOpenGround, { from: steadingFrom, near: true })();
    stampMarker(
      gen,
      palette,
      steading,
      'farm',
      "Hedda's steading, the largest working farm in the vale. Sells provisions and hears what the field hands hear.",
    );
    put(stage, 'hedda', besideTile(gen, steading));
    // A group of foes shares one tile, so a party that walks onto it meets
    // the whole group in one encounter. The wolf pack hunts the road itself,
    // the first stretch of it past the edge of town.
    const pack = outdoors(gen, (t) => onRoad(t) && isStandable(t) && tileDistance(t.id, gate) > 6, {
      from: gate,
      near: true,
    })();
    put(stage, 'wolf1', pack);
    const wild = outdoors(gen, (t) => isOpenGround(t) && tileDistance(t.id, gate) > 6, { gap: 2 });
    const tower = landmark(stage, 'watchtower', wild);
    noteTile(
      gen,
      tower,
      'A broken watchtower on the vale road. Bandits use it to watch for caravans.',
    );
    put(stage, 'bandit1', besideTile(gen, tower));

    // The road east to the Barrowdowns leaves the vale at the border cell
    // that crosses into the start of the Barrowdowns road.
    paintRoadTo(gen, palette, VALE_EAST_GATE, 'e');
    stage.after.push((node) => {
      const briarwick = node('briarwick');
      const fallback = { nodeId: 'briarwick', tileId: briarwick.entry };
      const inn = building(briarwick, palette, 'inn', node);
      if (inn) rename(inn, 'The Waystation', node);
      putInside(stage, inn, ['bram'], { near: true, fallback });
      putInside(stage, building(briarwick, palette, 'blacksmith', node), ['sella'], {
        near: true,
        fallback,
      });
      // Sister Alwyn tends the altar at the head of the nave.
      const temple = building(briarwick, palette, 'temple', node);
      const altar = temple?.tiles.find((t) => overlayList(t).some((r) => r.includes('altar')));
      putInside(stage, temple, ['alwyn'], { near: true, from: altar?.id, fallback });
      const plaza = makeSpotPicker(
        briarwick,
        (t) => t.imageRef.includes('/plaza/') && isStandable(t),
      )();
      stage.places.maera = { nodeId: 'briarwick', tileId: plaza };
    });
  },

  saltreach(stage) {
    const { gen, palette } = stage;
    const town = ensureSite(stage, ['port', 'settlement', 'city', 'village'], 'port', {
      archetype: 'town',
      kind: 'region',
      size: 'medium',
    });
    stage.overrides.set(town, {
      id: 'saltmere',
      name: 'Saltmere',
      environ: 'coast',
      size: 'medium',
      depth: 1,
    });
    noteTile(
      gen,
      siteTile(stage, town),
      'Saltmere, a fishing port. Half its trade is honest; the harbormaster keeps count of the other half.',
    );
    stage.after.push((node) => {
      const saltmere = node('saltmere');
      const fallback = { nodeId: 'saltmere', tileId: saltmere.entry };
      const tavern = building(saltmere, palette, 'tavern', node);
      if (tavern) rename(tavern, 'The Drowned Lantern', node);
      putInside(stage, tavern, ['corvin'], { fallback });
      const docks = saltmere.tiles.filter((t) => overlayList(t).some((r) => r.includes('/dock/')));
      const quay = docks.find((t) => overlayList(t).some((r) => r.includes('quay')));
      const pier = (/** @type {Tile} */ t) => overlayList(t).some((r) => r.includes('pier'));
      const heads = docks.filter((t) => overlayList(t).some((r) => r.includes('pier-head')));
      stage.places.petra = { nodeId: 'saltmere', tileId: quay?.id ?? saltmere.entry };
      // The drowned walk up out of the sea onto the piers.
      const piers = [...new Set([...heads, ...docks.filter(pier)].map((t) => t.id))];
      stage.places.drowned1 = { nodeId: 'saltmere', tileId: piers[0] ?? saltmere.entry };
      stage.places.drowned2 = {
        nodeId: 'saltmere',
        tileId:
          piers.find((id) => id !== piers[0]) ?? besideTile(saltmere, quay?.id ?? saltmere.entry),
      };
    });
  },

  northmarch(stage) {
    const { gen, palette } = stage;
    const spots = outdoors(gen, isOpenGround);
    const camp = spots();
    stampMarker(
      gen,
      palette,
      camp,
      'camp',
      "Snagtooth's raiding camp. Too orderly for goblins: dug latrines, posted watches, written orders.",
    );
    // The whole war band stands in the camp, so the party meets it as one
    // fight.
    for (const name of [
      'snagtooth',
      'raider1',
      'raider2',
      'campBugbear',
      'campGoblin1',
      'campGoblin2',
    ]) {
      put(stage, name, camp);
    }
    const stones = landmark(stage, 'standing-stones', spots);
    noteTile(
      gen,
      stones,
      'The Wardstone Circle, where the ward over the barrow was sworn. Four stones stand, one lies toppled, and no moss grows on the fallen one.',
    );
    put(stage, 'wardstones', stones);
  },

  graypeak(stage) {
    const { gen, palette } = stage;
    const mine = ensureSite(stage, ['mine'], 'mine', {
      archetype: 'cave',
      kind: 'interior',
      size: 'medium',
    });
    stage.overrides.set(mine, {
      id: 'hollowvein',
      name: 'The Hollowvein',
      archetype: 'cave',
      environ: 'cave',
      levels: 2,
    });
    noteTile(
      gen,
      siteTile(stage, mine),
      'The Hollowvein, the silver mine that crowned Ostrand. Abandoned mid-shift: tools downed, lamps left burning, and a knocking from below.',
    );
    const high = outdoors(
      gen,
      (t) => isOpenGround(t) && /\/(hills|snow-hills|mountain)\//.test(t.imageRef),
      { gap: 5 },
    );
    const eyrie = high();
    stampMarker(
      gen,
      palette,
      eyrie,
      'cave-entrance',
      "Skalvyr's eyrie. Gnawed livestock bones on the scree; the wyvern circles anything that moves below.",
    );
    put(stage, 'skalvyr', eyrie);
    put(stage, 'harpy', besideTile(gen, eyrie));
    const hermitage = outdoors(gen, (t) => isOpenGround(t) && tileDistance(t.id, eyrie) >= 5, {
      from: eyrie,
      near: true,
    })();
    stampMarker(
      gen,
      palette,
      hermitage,
      'ruins',
      "Odo's hermitage, built into a fallen shrine below the eyrie. The warding key hangs at his belt.",
    );
    put(stage, 'odo', hermitage);
    stage.after.push((node) => {
      const levels = stackOf(node('hollowvein'), node);
      putInside(stage, levels[levels.length - 1], ['knocker'], { fallback: stage.places.skalvyr });
    });
  },

  barrowdowns(stage) {
    const { gen } = stage;
    const keep = ensureSite(stage, ['castle'], 'castle', {
      archetype: 'castle',
      kind: 'interior',
      size: 'medium',
    });
    stage.overrides.set(keep, { id: 'thornhold', name: 'Thornhold Keep' });
    noteTile(
      gen,
      siteTile(stage, keep),
      'Thornhold, seat of House Vane, sworn wardens of the barrow. Its crypt keeps the ledger of the sealing.',
    );
    paintRoadTo(gen, stage.palette, DOWNS_WEST_GATE, 'w');
    // The barrow lies a long walk from the keep, from each place where a
    // party from the vale comes in, and off the road. A party that follows
    // the caravan to Thornhold does not find it on the way.
    const tomb = ensureSite(
      stage,
      ['dungeon'],
      'dungeon',
      {
        archetype: 'dungeon',
        kind: 'interior',
        size: 'medium',
      },
      { from: [siteTile(stage, keep), ...DOWNS_VALE_ENTRIES], min: 12 },
    );
    stage.overrides.set(tomb, {
      id: 'barrow',
      name: 'Barrow of the Old King',
      archetype: 'dungeon',
      environ: 'dungeon',
      levels: 3,
    });
    noteTile(
      gen,
      siteTile(stage, tomb),
      'The Barrow of the Old King. Warded shut for four hundred years; the ward is failing.',
    );
    // A generated dungeon beside the keep reads as the barrow, so it becomes
    // the old crypt of House Vane, with nothing that the story needs.
    const near = (/** @type {number} */ i) =>
      tileDistance(siteTile(stage, i), siteTile(stage, keep));
    const crypt = stage.gen.sites
      .map((s, i) => i)
      .filter((i) => i !== tomb && stage.gen.sites[i].label === 'dungeon' && near(i) <= 6)
      .sort((a, b) => near(a) - near(b))[0];
    if (crypt !== undefined) {
      stage.overrides.set(crypt, { id: 'vane-crypt', name: 'Old Vane Crypt', levels: 1 });
      noteTile(
        gen,
        siteTile(stage, crypt),
        'The old crypt of House Vane, sealed when the family built the new one under Thornhold. Dust, broken urns, and rats. Nothing here bears on the story.',
      );
    }
    stage.after.push((node) => {
      const hall = node('thornhold');
      putInside(stage, hall, ['shade'], { fallback: { nodeId: 'thornhold', tileId: hall.entry } });
      // The lord holds court before his throne.
      const throne = hall.tiles.find((t) => overlayList(t).some((r) => r.includes('throne')));
      stage.places.aldemar = {
        nodeId: 'thornhold',
        tileId: besideTile(hall, throne?.id ?? hall.entry),
      };
      const levels = stackOf(node('barrow'), node);
      const [first] = levels;
      stage.places.barrowDoor = { nodeId: first.id, tileId: first.entry };
      putInside(stage, first, ['skeleton1'], {
        near: true,
        fallback: stage.places.barrowDoor,
      });
      putInside(stage, levels[1] ?? first, ['wight'], { fallback: stage.places.barrowDoor });
      putInside(stage, levels[levels.length - 1], ['ostrand'], {
        fallback: stage.places.barrowDoor,
      });
      putInside(stage, stairTo(hall, 'stairs-up', node), ['irenne'], {
        fallback: stage.places.aldemar,
      });
      putInside(stage, stairTo(hall, 'stairs-down', node), ['cultist1', 'cultist2'], {
        fallback: stage.places.shade,
      });
    });
  },

  mirefen(stage) {
    const { gen, palette } = stage;
    const deep = outdoors(gen, (t) => isOpenGround(t) && t.imageRef.includes('/swamp/'), {
      gap: 3,
    });
    const hut = deep();
    stampMarker(
      gen,
      palette,
      hut,
      'ruins',
      "Grelka's hut, raised on the bones of a drowned chapel. Charms of hair and pale silver wire hang from the eaves.",
    );
    put(stage, 'grelka', hut);
    put(stage, 'bogZombie1', deep());
    put(stage, 'bogZombie2', besideTile(gen, stage.places.bogZombie1.tileId));
  },

  rimewold(stage) {
    const snow = outdoors(stage.gen, (t) => isOpenGround(t) && t.imageRef.includes('/snow'), {
      gap: 2,
    });
    put(stage, 'winterWolf', snow());
  },

  'ashen-reach'(stage) {
    const { gen, palette } = stage;
    const sand = outdoors(gen, (t) => isOpenGround(t) && t.imageRef.includes('/desert/'), {
      gap: 4,
    });
    const road = sand();
    stampMarker(
      gen,
      palette,
      road,
      'ruins',
      "A waystation of Ostrand's Silver Road, half under the sand. Tithe carts rot in the yard, still loaded with lead-sealed chests.",
    );
    put(stage, 'silverRoad', road);
    put(stage, 'scorpion', besideTile(gen, road));
  },
};
