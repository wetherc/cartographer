/** @typedef {import('./Autotile.js').ArmNetwork} ArmNetwork */
/** @typedef {import('./Autotile.js').Arm} Arm */

/**
 * The town wall: a square ring of wall pieces around the core, with a gate
 * where a street goes through and a water gate where the river goes through.
 * The ring of a port can open on the sea side and end at the shore.
 * The pieces are town-wall-*, town-gate-*, and town-water-gate-* overlays. A
 * corner piece is named for its open edges, so the north-west corner of the
 * ring is `wall-corner-se`.
 */

/**
 * The piece for one cell of a ring of radius `r` around the center `c`.
 * @param {number} dx @param {number} dy the offset from the center
 * @param {number} r
 * @param {'wall' | 'gate' | 'water-gate'} kind what goes through the cell
 * @returns {string}
 */
function ringPiece(dx, dy, r, kind) {
  if (Math.abs(dx) === r && Math.abs(dy) === r) {
    return `wall-corner-${dy < 0 ? 's' : 'n'}${dx < 0 ? 'e' : 'w'}`;
  }
  return `${kind}-${Math.abs(dy) === r ? 'h' : 'v'}`;
}

/**
 * Whether the network goes straight through a ring cell and nowhere else.
 * @param {ArmNetwork} network
 * @param {number} x @param {number} y
 * @param {boolean} across whether the cell is on the north or south side
 * @returns {boolean}
 */
function straightThrough(network, x, y, across) {
  const arms = network.at(x, y);
  /** @type {Arm[]} */
  const through = across ? ['n', 's'] : ['e', 'w'];
  return arms.size === 2 && through.every((arm) => arms.has(arm));
}

/**
 * @typedef {{
 *   size: number,
 *   roads: ArmNetwork,
 *   rivers: ArmNetwork,
 *   sea?: (x: number, y: number) => boolean,
 *   side?: Arm,
 * }} WallGround
 * `sea` marks the cells of a port that the sea or its shoreline covers. A
 * wall piece there would draw over the shoreline overlay. `side` is the
 * border side of the sea of a port.
 */

/**
 * The piece kind for one wall cell, or null when a street or the river
 * meets the cell in a way that no piece can draw.
 * @param {WallGround} plan
 * @param {number} x @param {number} y
 * @param {boolean} across whether the wall runs west to east at the cell
 * @param {boolean} corner whether the cell is a corner tower
 * @returns {'wall' | 'gate' | 'water-gate' | null}
 */
function cellKind({ roads, rivers }, x, y, across, corner) {
  const street = roads.has(x, y);
  const river = rivers.has(x, y);
  if (!street && !river) return 'wall';
  if ((street && river) || corner) return null;
  if (!straightThrough(street ? roads : rivers, x, y, across)) return null;
  return street ? 'gate' : 'water-gate';
}

/** The step toward the sea for each side that a sea can take. */
const SEAWARD = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

/**
 * Plan a wall ring of radius `r` around the center, or return null when a
 * street or the river meets the ring at a corner, runs along it, or turns
 * on it, or when a street crosses the ring on a bridge. A gate or a water
 * gate takes only a street or a river that goes straight through the wall.
 *
 * A ring that meets the sea or its shore returns null in an inland town.
 * In a port (`plan.side` set) it opens on the sea side instead: the side
 * of the ring that faces the sea has no wall, and the two sides that run
 * toward the sea go on until the cell before the shore. The sea then
 * closes the town on that side. The open ring returns null when the far
 * side of the ring or one of its far corners meets the shore, or when a
 * side toward the sea reaches the map border before the shore.
 * @param {WallGround} plan
 * @param {number} c the center index @param {number} r the ring radius
 * @returns {Map<string, string> | null} wall piece per tile id
 */
export function wallRing(plan, c, r) {
  const { sea = () => false, side } = plan;
  /** @type {Map<string, string>} */
  const walls = new Map();
  let wet = false;
  for (let y = c - r; y <= c + r && !wet; y++) {
    for (let x = c - r; x <= c + r; x++) {
      const dx = x - c;
      const dy = y - c;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (sea(x, y)) {
        wet = true;
        break;
      }
      const across = Math.abs(dy) === r;
      const kind = cellKind(plan, x, y, across, across && Math.abs(dx) === r);
      if (!kind) return null;
      walls.set(`${x},${y}`, ringPiece(dx, dy, r, kind));
    }
  }
  if (!wet) return walls;
  return side ? openRing(plan, c, r, side, sea) : null;
}

/**
 * The wall ring of a port that opens on the sea side (see `wallRing`).
 * @param {WallGround} plan
 * @param {number} c the center index @param {number} r the ring radius
 * @param {Arm} side the border side of the sea
 * @param {(x: number, y: number) => boolean} sea the cells of the sea and its shore
 * @returns {Map<string, string> | null} wall piece per tile id
 */
function openRing(plan, c, r, side, sea) {
  const { size } = plan;
  const [sx, sy] = SEAWARD[side];
  // Work along the sea direction (a) and across it (t).
  /** @param {number} t @param {number} a */
  const at = (t, a) => [c + t * Math.abs(sy) + a * sx, c + t * Math.abs(sx) + a * sy];
  // The wall runs west to east where it goes across the sea direction.
  const farAcross = sx === 0;
  /** @type {Map<string, string>} */
  const walls = new Map();
  for (let t = -r + 1; t < r; t++) {
    const [x, y] = at(t, -r);
    const kind = sea(x, y) ? null : cellKind(plan, x, y, farAcross, false);
    if (!kind) return null;
    walls.set(`${x},${y}`, `${kind}-${farAcross ? 'h' : 'v'}`);
  }
  for (const t of [-r, r]) {
    for (let a = -r; ; a++) {
      const [x, y] = at(t, a);
      if (x < 0 || y < 0 || x >= size || y >= size) return null;
      if (sea(x, y)) {
        if (a === -r) return null;
        break;
      }
      const kind = cellKind(plan, x, y, !farAcross, a === -r);
      if (!kind) return null;
      const piece =
        a === -r ? ringPiece(x - c, y - c, r, kind) : `${kind}-${farAcross ? 'v' : 'h'}`;
      walls.set(`${x},${y}`, piece);
    }
  }
  return walls;
}

/**
 * The ring radii that a town wall tries, in order: one cell past the core,
 * two cells past, then on the core edge. A ring keeps at least two cells
 * from the map border, so the streets have room to leave the map. A town
 * under 22 cells gets no wall and so has no radii.
 * @param {number} size @param {number} c the center index
 * @param {number} core the core radius
 * @returns {number[]}
 */
export function wallRadii(size, c, core) {
  if (size < 22) return [];
  return [core + 1, core + 2, core].filter((r) => c + r <= size - 3);
}

/**
 * Plan the wall of a town of 22 cells or more, with a chance of one in two.
 * The wall takes the first ring from `wallRadii` that the streets and the
 * river allow. `townRiver` keeps the first ring clear, so a river alone
 * never stops a wall. A port passes the side of its sea, so a ring that
 * meets the shore opens on that side (see `wallRing`). A town whose
 * streets, river, and sea fit no ring gets no wall.
 * @param {WallGround} plan
 * @param {number} c the center index @param {number} core the core radius
 * @param {() => number} rng
 * @returns {Map<string, string>} wall piece per tile id, empty for no wall
 */
export function planWall(plan, c, core, rng) {
  if (plan.size < 22 || rng() >= 0.5) return new Map();
  for (const r of wallRadii(plan.size, c, core)) {
    const walls = wallRing(plan, c, r);
    if (walls) return walls;
  }
  return new Map();
}
