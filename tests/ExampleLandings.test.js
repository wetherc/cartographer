import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExampleCampaign } from '../src/campaign/Campaigns.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { getTile } from '../src/map/TileGrid.js';
import { NEIGHBORS4 } from '../src/map/MapGeometry.js';
import { isPassable } from '../src/map/MapPath.js';
import { computeParentReturnTile, computeRegionEntryTile } from '../src/map/EntryPoint.js';

// Every way into and out of a region of the example lands the party on a
// tile it can walk from. A landing on deep water strands a Player tab,
// because a walk does not cross deep water.

const { grid } = buildExampleCampaign(new TilePalette());
const nodes = [...grid.nodes.values()];

/**
 * Whether the party can walk off a landing: the tile is passable and at
 * least one side neighbour is passable too.
 * @param {import('../src/types/map.js').MapNode} node
 * @param {string} id
 */
function walkable(node, id) {
  const tile = getTile(node, id);
  if (!tile || !isPassable(tile, false)) return false;
  const [x, y] = id.split(',').map(Number);
  return NEIGHBORS4.some(([dx, dy]) => {
    const next = getTile(node, `${x + dx},${y + dy}`);
    return !!next && isPassable(next, false);
  });
}

test('every approach into a region of the example lands on walkable land', () => {
  let approaches = 0;
  for (const parent of nodes) {
    for (const tile of parent.tiles) {
      const child = tile.childNodeId ? grid.getNode(tile.childNodeId) : undefined;
      if (!child || child.kind !== 'region') continue;
      const [x, y] = tile.id.split(',').map(Number);
      for (const [dx, dy] of NEIGHBORS4) {
        const from = getTile(parent, `${x + dx},${y + dy}`);
        if (!from || from.childNodeId === child.id) continue;
        const party = { nodeId: parent.id, tileId: from.id };
        const id = computeRegionEntryTile(parent, child, child.id, party, tile.id);
        assert.ok(
          walkable(child, id),
          `${parent.id} -> ${child.id} from ${from.id} lands on ${id}`,
        );
        approaches++;
      }
    }
  }
  assert.ok(approaches > 500, `${approaches} approaches`);
});

test('every edge exit of a region of the example lands on walkable land', () => {
  let exits = 0;
  for (const child of nodes) {
    const parent = child.parentId ? grid.getNode(child.parentId) : undefined;
    if (!parent || child.kind !== 'region') continue;
    for (const tile of child.tiles) {
      const [x, y] = tile.id.split(',').map(Number);
      /** @type {import('../src/types/map.js').ExitSide[]} */
      const sides = [];
      if (y === 0) sides.push('north');
      if (y === child.height - 1) sides.push('south');
      if (x === 0) sides.push('west');
      if (x === child.width - 1) sides.push('east');
      for (const side of sides) {
        /** @type {import('../src/types/map.js').MapExit} */
        const exit = { kind: 'edge', side, targetNodeId: parent.id, targetName: parent.name };
        const position = { nodeId: child.id, tileId: tile.id };
        const id = computeParentReturnTile(parent, child, exit, position);
        assert.ok(walkable(parent, id), `${child.id} ${side} from ${tile.id} lands on ${id}`);
        exits++;
      }
    }
  }
  assert.ok(exits > 1000, `${exits} exits`);
});
