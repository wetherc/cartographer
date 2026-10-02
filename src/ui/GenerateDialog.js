import { previewFrame, previewRegionTiles } from '../map/GeneratePreview.js';
import { MapRenderer } from '../map/MapRenderer.js';
import { findRegionGroups } from '../map/RegionGroups.js';
import { TileRaster } from '../map/TileRaster.js';
import { randomSeed } from '../util/Rng.js';
import { clampInt } from '../util/num.js';
import { textButton } from './buttons.js';
import { el } from './dom.js';
import { labeled, numberField, select } from './formFields.js';
import { openDialog } from './Modal.js';

/**
 * @typedef {{
 *   archetype: string,
 *   size: string,
 *   levels: number,
 *   depth: number,
 *   seed: number,
 * }} GenerateChoice
 * `depth` is how many levels of sub-maps to build under the map, where 0
 * builds the map alone.
 */

/**
 * The Sub-maps choices. "Every level" is deeper than any stack of places
 * goes: a world opens into regions, a region into towns, and a town into
 * buildings.
 */
const SUBMAP_DEPTHS = [
  { value: '0', label: 'None' },
  { value: '1', label: 'One level down' },
  { value: '9', label: 'Every level' },
];

/**
 * The Generate dialog: archetype, size, levels, and sub-maps fields, plus a live
 * preview of the candidate layout and its seed. Every field change
 * rerenders the preview through `makeCandidate`, a pure seeded build the
 * caller memoizes. Reroll draws a new seed. The seed field is editable,
 * so a GM can reproduce a liked layout later. The dialog resolves with
 * the accepted choice, or null on cancel. Nothing stamps into the node
 * until the caller applies the result.
 *
 * `imageCache` is the live map's decoded art. The preview copies it in,
 * so opening the dialog fetches and decodes nothing the map has already
 * drawn. Without it the first preview of a large wilderness redraws once
 * per distinct ref as each SVG arrives.
 *
 * `size` is the preset that the Size field starts on, and it defaults to
 * medium.
 *
 * `archetype` and `depth` are the presets of the Archetype and Sub-maps
 * fields. The Welcome card passes the world archetype and every level, so
 * "Generate a world" builds a world with its regions and towns.
 *
 * `levels` and `seed` preset those fields. When the GM cancels the replace
 * confirm, the dialog opens again with the choice the GM made.
 *
 * `returnFocus` is the element that takes focus back when the dialog closes.
 * The Generate button passes itself: Safari does not focus a button on
 * click, so without this the dismissal lands wherever focus was before the
 * click, which is the map canvas during painting.
 * @param {{
 *   archetypes: { value: string, label: string }[],
 *   sizes: { value: string, label: string }[],
 *   size?: string,
 *   archetype?: string,
 *   depth?: string,
 *   levels?: number,
 *   seed?: number,
 *   stacked?: string[],
 *   maxLevels?: number,
 *   nested?: string[],
 *   makeCandidate: (choice: GenerateChoice) => { width: number, height: number, tiles: import('../types/map.js').Tile[], sites?: import('../types/map.js').GeneratedSite[] },
 *   imageCache?: Map<string, HTMLImageElement>,
 *   returnFocus?: HTMLElement | null,
 * }} options
 * @returns {Promise<GenerateChoice | null>}
 */
export function generateDialog(options) {
  // This is set once the dialog closes, so an image that finishes
  // loading can no longer draw into the detached preview canvas.
  let closed = false;
  /** @type {() => GenerateChoice} */
  let readChoice;

  return openDialog({
    className: 'modal--generate',
    returnFocus: options.returnFocus,
    title: 'Generate map',
    form: true,
    build: (close) => {
      /** @type {Node[]} */
      const body = [];

      /** @template {HTMLElement} T @param {string} caption @param {T} control @returns {T} */
      const field = (caption, control) => {
        body.push(labeled(caption, control, { className: 'modal__field' }));
        return control;
      };

      const archetypeSelect = field(
        'Archetype',
        select(options.archetypes, options.archetype ?? options.archetypes[0]?.value ?? ''),
      );

      const sizeSelect = field('Size', select(options.sizes, options.size ?? 'medium'));

      // Only the archetypes in `stacked`, such as a dungeon, stack levels, so
      // the field shows for those alone. A region lists none of them, so
      // there it never shows. `maxLevels` limits the field, because each
      // level is a node of its own.
      const maxLevels = options.maxLevels ?? Infinity;
      const levelsInput = field(
        'Levels',
        numberField(options.levels ?? 1, { min: 1, max: options.maxLevels }),
      );
      const levelsField = /** @type {HTMLElement} */ (levelsInput.closest('.modal__field'));
      const syncLevels = () =>
        levelsField.classList.toggle(
          'modal__field--hidden',
          !(options.stacked ?? []).includes(archetypeSelect.value),
        );
      syncLevels();
      archetypeSelect.addEventListener('change', syncLevels);

      // The Sub-maps field shows for the archetypes in `nested` alone, whose
      // maps have places that open into maps of their own.
      const depthSelect = field('Sub-maps', select(SUBMAP_DEPTHS, options.depth ?? '0'));
      const depthField = /** @type {HTMLElement} */ (depthSelect.closest('.modal__field'));
      const syncDepth = () =>
        depthField.classList.toggle(
          'modal__field--hidden',
          !(options.nested ?? []).includes(archetypeSelect.value),
        );
      syncDepth();
      archetypeSelect.addEventListener('change', syncDepth);

      // This is the seed row: the editable seed plus a Reroll button that
      // draws a fresh one. The preview canvas below always shows the
      // layout this exact seed builds.
      const seedInput = numberField(options.seed ?? randomSeed());
      // renderPreview is declared below, so the handler reaches it at click time.
      const reroll = textButton('Reroll', () => {
        seedInput.value = String(randomSeed());
        renderPreview();
      });
      body.push(
        el(
          'label',
          'modal__field u-col u-g1 u-muted',
          'Seed',
          el('div', 'generate-dialog__seed u-row u-g2', seedInput, reroll),
        ),
      );

      const canvas = el('canvas', 'generate-dialog__preview');
      canvas.width = 480;
      canvas.height = 480;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Preview of the generated map');
      body.push(canvas);

      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

      // Image loads arrive one per ref, and each one used to redraw the
      // whole preview at once. One animation frame collects every load
      // that lands before it, so a burst of arrivals costs one draw.
      let frame = 0;
      const scheduleRender = () => {
        if (frame || closed) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          renderPreview();
        });
      };
      // tileSize depends on the candidate's grid size, so it is set per
      // render, and the renderer rebuilds per draw. The image and raster
      // caches live as long as the dialog, so a rerender neither reloads art
      // nor rasterizes it again.
      const raster = new TileRaster({ onLoad: scheduleRender });
      raster.seedImages(options.imageCache);

      readChoice = () => ({
        archetype: archetypeSelect.value,
        size: sizeSelect.value,
        levels: clampInt(levelsInput.value, 1, maxLevels),
        depth: (options.nested ?? []).includes(archetypeSelect.value)
          ? clampInt(depthSelect.value)
          : 0,
        seed: clampInt(seedInput.value),
      });

      // The preview node for the current choice. The renderer keys its
      // per-node caches on the node object, so an image load that redraws
      // an unchanged choice must hand the renderer the same node again, not
      // a fresh copy of it.
      /** @type {{ key: string, node: import('../types/map.js').MapNode } | null} */
      let preview = null;
      const previewNode = () => {
        const choice = readChoice();
        const key = JSON.stringify(choice);
        if (preview?.key !== key) {
          const candidate = options.makeCandidate(choice);
          preview = {
            key,
            node: /** @type {any} */ ({
              ...candidate,
              tiles: previewRegionTiles(candidate.tiles, candidate.sites),
              id: 'preview',
              name: 'preview',
            }),
          };
        }
        return preview.node;
      };

      function renderPreview() {
        if (closed) return;
        const node = previewNode();
        const { tileSize, offsetX, offsetY } = previewFrame(canvas.width, node.width, node.height);
        const renderer = new MapRenderer(ctx, { tileSize, raster });
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderer.render({
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          node,
          regionGroups: findRegionGroups(node),
          offsetX,
          offsetY,
          scale: 1,
          revealAll: true,
          markerRange: 0,
          partyTileId: null,
          encounterTileIds: [],
          selectedTileId: null,
          cursorCellId: null,
          focused: false,
        });
      }

      for (const input of [archetypeSelect, sizeSelect, levelsInput, seedInput]) {
        input.addEventListener('change', renderPreview);
      }
      const cancel = textButton('Cancel', () => close('cancel'));
      // A submit sets returnValue to the submit button's value. Escape
      // leaves returnValue empty, so a dismissal, by Escape or Cancel,
      // resolves null instead of generating by accident.
      const submit = textButton('Generate', undefined, {
        variant: 'primary',
        type: 'submit',
        value: 'ok',
      });

      renderPreview();
      return { body, actions: [cancel, submit], initialFocus: archetypeSelect };
    },
    result: (returnValue) => {
      closed = true;
      return returnValue === 'ok' ? readChoice() : null;
    },
  });
}
