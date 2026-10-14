import { isGM } from '../view/ViewRole.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./mapWiring.js').MapEnv} MapEnv */

/**
 * Build the Play-mode hover handler for the map. It shows a tooltip for the
 * tile under the pointer or the keyboard cursor. The handler reads the
 * shared MapEnv late, after wiring assigns the mounted views.
 * @param {AppContext} app
 * @param {MapEnv} env
 */
export function createCellHover(app, env) {
  const { grid, navigator, state } = app;

  // Play-mode read side of the Build-mode tile inspector. Hovering over a
  // revealed tile with metadata shows what the GM authored there. Build mode
  // already shows the same data through the inspector, so hover stays quiet
  // there.
  /** @type {(tile: import('../types/map.js').Tile | null, clientX: number, clientY: number) => void} */
  return (tile, clientX, clientY) => {
    if (
      state.mode !== 'play' ||
      !tile ||
      !tile.revealed ||
      (tile.metadata.discoverable && !tile.metadata.discovered)
    ) {
      env.tileTooltip.hide();
      return;
    }
    const nodeId = navigator.getCurrentNode().id;
    // The POI outline and the NPC circle draw only within detection range of
    // the party or a character token. The tooltip follows the same rule, so
    // hovering a far tile, with the pointer or with the keyboard cursor, does
    // not name what the map keeps unmarked.
    const inRange = env.mapCanvas.markerVisible(tile.id);
    // The tooltip names the non-hostile creatures standing here. A hostile
    // one is the danger marker's business, and the alert names it.
    const npcNames = inRange
      ? state.creatures
          .filter(
            (c) =>
              c.disposition !== 'hostile' &&
              c.location &&
              c.location.nodeId === nodeId &&
              c.location.tileId === tile.id,
          )
          .map((c) => c.name)
      : [];
    const poiType = inRange ? tile.metadata.poiType : null;
    // Notes are the GM's secret. Players see the POI type and who stands
    // here.
    const gm = isGM(state.role);
    // A region whose name does not fit on the map at this zoom, such as a
    // small building in a town, is named here instead.
    const place =
      tile.childNodeId && env.mapCanvas.nameHidden(tile.childNodeId)
        ? grid.getNode(tile.childNodeId)?.name
        : undefined;
    const kind = poiType ? capitalize(poiType) : '';
    const title = place && kind ? `${place} (${kind})` : place || kind;
    const visible = title || npcNames.length > 0 || (gm && tile.metadata.notes);
    if (!visible) {
      env.tileTooltip.hide();
      return;
    }
    env.tileTooltip.show(
      {
        title,
        npcs: npcNames.join(', '),
        notes: gm ? tile.metadata.notes : '',
      },
      clientX,
      clientY,
    );
  };
}
