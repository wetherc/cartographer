import { fbm, valueNoise } from './GeneratorNoise.js';
import { shuffle } from './GeneratorRandom.js';
import { tileIdAt } from './MapGeometry.js';

/** @typedef {import('../types/map.js').POIType} POIType */
/** @typedef {import('./Autotile.js').ArmNetwork} ArmNetwork */

/**
 * Town building placement: the free blocks of a town, the order in which
 * each set of buildings takes them, and the fields and the windmill on the
 * outskirts. GeneratorTown.js lays the river, the streets, the wall, and the
 * plaza first, and passes them in as a lot.
 */

/**
 * The buildings that a town places first, nearest the crossroads. The
 * example campaign puts its innkeeper, smith, and priest in these.
 */
export const CORE_BUILDINGS = ['inn', 'tavern', 'blacksmith', 'general-store', 'temple'];

/**
 * The buildings a larger town adds after the core and civic sets. They take
 * half of the blocks that remain, and homes take the rest. A town that wants
 * more extras than there are kinds repeats the list, in a new random order
 * each time, so no kind appears twice before every kind appears once.
 */
export const EXTRA_BUILDINGS = [
  'alchemist',
  'shrine',
  'wizard-tower',
  'academy',
  'barracks',
  'guildhall',
  'bakery',
  'warehouse',
  'stables',
];

/**
 * The stand-in art for a home. `place` swaps it for a house near the
 * crossroads or a cottage at the edge of the core.
 */
export const HOME = 'home';

/**
 * @typedef {{ id: string, art: string, poi: POIType }} TownBuilding
 * `id` is the top-left cell of a 2x2 block, and `art` a palette marker id.
 */

/**
 * @typedef {{
 *   size: number,
 *   c: number,
 *   core: number,
 *   cells: string[],
 *   roads: ArmNetwork,
 *   rivers: ArmNetwork,
 *   walls: Map<string, string>,
 *   paved: (x: number, y: number) => boolean,
 *   sea?: (x: number, y: number) => boolean,
 * }} TownLot
 * The town that placement builds on. `c` is the center index, `core` the
 * core radius, and `paved` says whether a cell is plaza. `sea` marks the
 * cells of a port that the sea or its shoreline covers. Placement writes
 * into `cells`: grass under each building and farmland in the fields.
 */

/**
 * @typedef {{ x: number, y: number, d: number, river: boolean }} TownBlock
 * A free 2x2 block with its top-left cell at `x`, `y`. `d` is the distance
 * from the crossroads to the block center, and `river` says whether the
 * river runs beside the block.
 */

/**
 * @typedef {{
 *   street: TownBlock[],
 *   loose: TownBlock[],
 *   open: (x: number, y: number) => boolean,
 *   openBlock: (x: number, y: number) => boolean,
 *   place: (list: TownBlock[], arts: string[], poi: POIType) => void,
 *   buildings: TownBuilding[],
 * }} TownPlacer
 * `street` lists the free blocks beside a street or the plaza, and `loose`
 * the other free blocks. `place` fills `buildings`.
 */

/**
 * The free blocks of a lot and a `place` function that puts buildings on
 * them. A cell is open when no street, river, wall, plaza, building, sea,
 * or shore covers it, and a block is free when its four cells are open. A
 * building on the shore would hide the shoreline under its art.
 * @param {TownLot} lot
 * @returns {TownPlacer}
 */
export function townPlacer(lot) {
  const { size, c, core, cells, roads, rivers, walls, paved, sea = () => false } = lot;
  /** @type {Set<number>} cells that a building covers */
  const taken = new Set();
  /** @param {number} x @param {number} y */
  const open = (x, y) =>
    !roads.has(x, y) &&
    !rivers.has(x, y) &&
    !walls.has(tileIdAt(x, y)) &&
    !taken.has(y * size + x) &&
    !paved(x, y) &&
    !sea(x, y);
  /** @param {number} x @param {number} y */
  const openBlock = (x, y) => open(x, y) && open(x + 1, y) && open(x, y + 1) && open(x + 1, y + 1);
  /** @type {TownBlock[]} */ const street = [];
  /** @type {TownBlock[]} */ const loose = [];
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      if (!openBlock(x, y)) continue;
      const edge = [
        [x, y - 1],
        [x + 1, y - 1],
        [x + 2, y],
        [x + 2, y + 1],
        [x, y + 2],
        [x + 1, y + 2],
        [x - 1, y],
        [x - 1, y + 1],
      ];
      const d = Math.max(Math.abs(x + 0.5 - c), Math.abs(y + 0.5 - c));
      const block = { x, y, d, river: edge.some(([ex, ey]) => rivers.has(ex, ey)) };
      const beside = edge.some(([ex, ey]) => roads.has(ex, ey) || paved(ex, ey));
      (beside ? street : loose).push(block);
    }
  }
  /** @type {TownBuilding[]} */
  const buildings = [];
  /**
   * Put buildings on the first free blocks of `list`, one for each art. A
   * covered cell goes back to grass, which the scaled art hides.
   * @param {TownBlock[]} list @param {string[]} arts @param {POIType} poi
   */
  const place = (list, arts, poi) => {
    let i = 0;
    for (const { x, y } of list) {
      if (i >= arts.length) return;
      if (!openBlock(x, y)) continue;
      for (const [bx, by] of [
        [x, y],
        [x + 1, y],
        [x, y + 1],
        [x + 1, y + 1],
      ]) {
        taken.add(by * size + bx);
        cells[by * size + bx] = 'grass';
      }
      const edgeward = Math.max(Math.abs(x + 0.5 - c), Math.abs(y + 0.5 - c)) >= core - 0.5;
      const art = arts[i++];
      buildings.push({
        id: tileIdAt(x, y),
        art: art !== HOME ? art : edgeward ? 'cottage' : 'house',
        poi,
      });
    }
  };
  return { street, loose, open, openBlock, place, buildings };
}

/**
 * The art of the main building set of a town, in two parts. `first` is the
 * core set in random order and then the civic set: a well or a fountain,
 * and on a map of 22 cells or more a market and a town hall. `rest` is the
 * extra buildings, which take half of what remains, and then homes. The two
 * parts together have one building for each thirty cells of map area, and
 * never fewer than three.
 * @param {number} size @param {() => number} rng
 * @returns {{ first: string[], rest: string[] }}
 */
export function buildingList(size, rng) {
  const wanted = Math.max(3, Math.round((size * size) / 30));
  const civic = [rng() < 0.5 ? 'well' : 'fountain', ...(size >= 22 ? ['market', 'town-hall'] : [])];
  const first = [...shuffle(CORE_BUILDINGS, rng), ...civic].slice(0, wanted);
  const count = Math.floor((wanted - first.length) / 2);
  /** @type {string[]} */
  const extras = [];
  while (extras.length < count) extras.push(...shuffle(EXTRA_BUILDINGS, rng));
  const homes = new Array(wanted - first.length - count).fill(HOME);
  return { first, rest: [...extras.slice(0, count), ...homes] };
}

/**
 * Put the buildings on a lot and plant its fields. The main set takes the
 * street blocks nearest the crossroads, with some jitter, and falls back to
 * the other free blocks nearest the crossroads when the street blocks run
 * out. The first part of the main set comes first. A town of 14 cells or
 * more then gets a watermill on a block beside its river, beside a street
 * when one is free. It also gets a graveyard at the edge of the core with a
 * chance of three in five. The watermill and the graveyard go before the
 * rest of the main set, which would otherwise take every block beside the
 * river or at the edge of the core. Past the edge of the core, one farm for
 * each ten cells of map side takes a street block, and fields cover patches
 * of the open ground. Then a windmill takes the outlying block with the
 * most fields around it.
 * @param {TownLot} lot @param {() => number} rng
 * @returns {TownBuilding[]}
 */
export function placeBuildings(lot, rng) {
  const { size, core } = lot;
  const placer = townPlacer(lot);
  const { street, loose, place } = placer;
  /** @param {TownBlock} a @param {TownBlock} b */
  const byDistance = (a, b) => a.d - b.d;
  // Nearest first, with some jitter, so the buildings crowd around the
  // crossroads and reach past the core only when it runs out of blocks.
  const nearest = [
    ...street.map((b) => ({ ...b, d: b.d + rng() * 3 })).sort(byDistance),
    ...[...loose].sort(byDistance),
  ];
  const { first, rest } = buildingList(size, rng);
  place(nearest, first, 'settlement');
  if (size >= 14) {
    /** @param {TownBlock[]} list */
    const riverside = (list) =>
      shuffle(
        list.filter((b) => b.river),
        rng,
      );
    place([...riverside(street), ...riverside(loose)], ['watermill'], 'settlement');
    if (rng() < 0.6) {
      const rim = street.filter((b) => b.d > core - 1 && b.d <= core + 2);
      place(shuffle(rim, rng), ['graveyard'], 'landmark');
    }
  }
  place(nearest, rest, 'settlement');
  const outskirts = street.filter((b) => b.d > core + 1);
  place(shuffle(outskirts, rng), new Array(Math.floor(size / 10)).fill('farm'), 'settlement');
  plantFields(lot, placer, outskirts, rng);
  return placer.buildings;
}

/**
 * Turn patches of open ground past the core into farmland, then put a
 * windmill on a town of 14 cells or more. The windmill takes the outlying
 * block with the most farmland in the ring of cells around it, and needs at
 * least four such cells.
 * @param {TownLot} lot @param {TownPlacer} placer
 * @param {TownBlock[]} outskirts @param {() => number} rng
 */
function plantFields(lot, { open, openBlock, place }, outskirts, rng) {
  const { size, c, core, cells } = lot;
  const noise = valueNoise(rng);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const far = Math.max(Math.abs(x - c), Math.abs(y - c)) > core + 1;
      if (far && open(x, y) && fbm(noise, x / 4, y / 4, 3) > 0.45) cells[y * size + x] = 'farmland';
    }
  }
  if (size < 14) return;
  /** @param {number} x @param {number} y */
  const fields = (x, y) => {
    let n = 0;
    for (let yy = Math.max(0, y - 1); yy <= Math.min(size - 1, y + 2); yy++) {
      for (let xx = Math.max(0, x - 1); xx <= Math.min(size - 1, x + 2); xx++) {
        const inside = xx - x >= 0 && xx - x <= 1 && yy - y >= 0 && yy - y <= 1;
        if (!inside && cells[yy * size + xx] === 'farmland') n++;
      }
    }
    return n;
  };
  const farmed = outskirts
    .filter((b) => openBlock(b.x, b.y))
    .map((b) => ({ ...b, n: fields(b.x, b.y) + rng() }))
    .filter((b) => b.n >= 4)
    .sort((a, b) => b.n - a.n);
  place(farmed, ['windmill'], 'settlement');
}
