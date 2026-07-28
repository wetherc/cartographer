import { MapRenderer } from '../map/MapRenderer.js';
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
 * The Generate dialog: archetype/size/levels fields plus a live preview of the
 * candidate layout and its seed. Every field change re-renders the preview
 * through `makeCandidate` (a pure seeded build the caller memoizes), Reroll
 * draws a new seed, and the seed field is editable so a liked layout is
 * reproducible later. Resolves with the accepted choice, or null on cancel —
 * nothing is stamped into the node until the caller applies the result.
 * @param {{
 *   archetypes: { value: string, label: string }[],
 *   makeCandidate: (choice: GenerateChoice) => { width: number, height: number, tiles: import('../types/map.js').Tile[] },
 * }} options
 * @returns {Promise<GenerateChoice | null>}
 */
export function generateDialog(options) {
  // Set once the dialog closes, so an image finishing its load can no longer
  // draw into the detached preview canvas.
  let closed = false;
  /** @type {() => GenerateChoice} */
  let readChoice;

  return openDialog({
    className: 'modal modal--generate',
    title: 'Generate map',
    form: true,
    build: (close) => {
      /** @type {Node[]} */
      const body = [];

      /** @template {HTMLElement} T @param {string} caption @param {T} control @returns {T} */
      const field = (caption, control) => {
        body.push(el('label', 'modal__field', caption, control));
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

      // Seed row: the editable seed plus a Reroll button drawing a fresh one.
      // The preview canvas below always shows the layout this exact seed builds.
      const seedInput = numberField(randomSeed());
      // renderPreview is declared below, so the handler reaches it at click time.
      const reroll = textButton('Reroll', () => {
        seedInput.value = String(randomSeed());
        renderPreview();
      });
      body.push(
        el('label', 'modal__field', 'Seed', el('div', 'generate-dialog__seed', seedInput, reroll)),
      );

      const canvas = document.createElement('canvas');
      canvas.className = 'generate-dialog__preview';
      canvas.width = 480;
      canvas.height = 480;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Preview of the generated map');
      body.push(canvas);

      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      // tileSize is per-render (it depends on the candidate's grid size), so the
      // renderer is rebuilt per draw; its image cache is module-level in effect
      // only for the dialog's lifetime, which is fine for a preview.
      /** @type {Map<string, HTMLImageElement>} */
      const imageCache = new Map();

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
        const renderer = new MapRenderer(ctx, { tileSize, onImageLoad: renderPreview });
        renderer.imageCache = imageCache; // share loads across re-renders
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
      // Submitting sets returnValue to the submit button's value; Escape leaves
      // it '', so dismissal (Escape or Cancel) resolves null rather than
      // accidentally generating.
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
