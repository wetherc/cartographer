import { MapRenderer } from '../map/MapRenderer.js';
import { TileRaster } from '../map/TileRaster.js';
import { randomSeed } from '../util/Rng.js';
import { clampInt } from '../util/num.js';
import { textButton } from './buttons.js';
import { el } from './dom.js';
import { numberField, select } from './formFields.js';
import { openDialog } from './Modal.js';

/**
 * @typedef {{ archetype: string, size: string, levels: number, seed: number }} GenerateChoice
 */

/**
 * The Generate dialog: archetype, size, and levels fields, plus a live
 * preview of the candidate layout and its seed. Every field change
 * rerenders the preview through `makeCandidate`, a pure seeded build the
 * caller memoizes. Reroll draws a new seed. The seed field is editable,
 * so a GM can reproduce a liked layout later. The dialog resolves with
 * the accepted choice, or null on cancel. Nothing stamps into the node
 * until the caller applies the result.
 * @param {{
 *   archetypes: { value: string, label: string }[],
 *   makeCandidate: (choice: GenerateChoice) => { width: number, height: number, tiles: import('../types/map.js').Tile[] },
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
    title: 'Generate map',
    form: true,
    build: (close) => {
      /** @type {Node[]} */
      const body = [];

      /** @template {HTMLElement} T @param {string} caption @param {T} control @returns {T} */
      const field = (caption, control) => {
        body.push(el('label', 'modal__field u-col u-g1 u-muted', caption, control));
        return control;
      };

      const archetypeSelect = field(
        'Archetype',
        select(options.archetypes, options.archetypes[0]?.value ?? ''),
      );

      const sizeSelect = field(
        'Size',
        select(
          [
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
          ],
          'medium',
        ),
      );

      const levelsInput = field('Levels (dungeon only)', numberField(1, { min: 1 }));

      // This is the seed row: the editable seed plus a Reroll button that
      // draws a fresh one. The preview canvas below always shows the
      // layout this exact seed builds.
      const seedInput = numberField(randomSeed());
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
      // tileSize depends on the candidate's grid size, so it is set per
      // render, and the renderer rebuilds per draw. The image and raster
      // caches live as long as the dialog, so a rerender neither reloads art
      // nor rasterizes it again.
      const raster = new TileRaster({ onLoad: () => renderPreview() });

      readChoice = () => ({
        archetype: archetypeSelect.value,
        size: sizeSelect.value,
        levels: clampInt(levelsInput.value, 1),
        seed: clampInt(seedInput.value),
      });

      function renderPreview() {
        if (closed) return;
        const candidate = options.makeCandidate(readChoice());
        const tileSize = Math.max(
          1,
          Math.floor(canvas.width / Math.max(candidate.width, candidate.height)),
        );
        const renderer = new MapRenderer(ctx, { tileSize, raster });
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderer.render({
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          node: /** @type {any} */ ({ ...candidate, id: 'preview', name: 'preview' }),
          regionGroups: [],
          offsetX: Math.floor((canvas.width - candidate.width * tileSize) / 2),
          offsetY: Math.floor((canvas.height - candidate.height * tileSize) / 2),
          scale: 1,
          revealAll: true,
          markerRange: 0,
          partyTileId: null,
          encounterTileIds: [],
          selectedTileId: null,
          cursorCellId: null,
          focused: false,
          marquee: null,
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
