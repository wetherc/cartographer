import { MapRenderer } from '../map/MapRenderer.js';
import { randomSeed } from '../util/Rng.js';
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

      /** @param {string} labelText @param {HTMLElement} input */
      const field = (labelText, input) => {
        const label = document.createElement('label');
        label.className = 'modal__field';
        label.textContent = labelText;
        input.classList.add('field');
        label.appendChild(input);
        body.push(label);
        return input;
      };

      const archetypeSelect = document.createElement('select');
      for (const a of options.archetypes) {
        const el = document.createElement('option');
        el.value = a.value;
        el.textContent = a.label;
        archetypeSelect.appendChild(el);
      }
      field('Archetype', archetypeSelect);

      const sizeSelect = document.createElement('select');
      for (const [value, label] of [
        ['small', 'Small'],
        ['medium', 'Medium'],
        ['large', 'Large'],
      ]) {
        const el = document.createElement('option');
        el.value = value;
        el.textContent = label;
        sizeSelect.appendChild(el);
      }
      sizeSelect.value = 'medium';
      field('Size', sizeSelect);

      const levelsInput = document.createElement('input');
      levelsInput.type = 'number';
      levelsInput.min = '1';
      levelsInput.value = '1';
      field('Levels (dungeon only)', levelsInput);

      // Seed row: the editable seed plus a Reroll button drawing a fresh one.
      // The preview canvas below always shows the layout this exact seed builds.
      const seedInput = document.createElement('input');
      seedInput.type = 'number';
      seedInput.value = String(randomSeed());
      const seedLabel = document.createElement('label');
      seedLabel.className = 'modal__field';
      seedLabel.textContent = 'Seed';
      seedInput.classList.add('field');
      const seedRow = document.createElement('div');
      seedRow.className = 'generate-dialog__seed';
      seedRow.appendChild(seedInput);
      const reroll = document.createElement('button');
      reroll.type = 'button';
      reroll.className = 'btn';
      reroll.textContent = 'Reroll';
      seedRow.appendChild(reroll);
      seedLabel.appendChild(seedRow);
      body.push(seedLabel);

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
        levels: Math.max(1, Number(levelsInput.value) || 1),
        seed: Math.floor(Number(seedInput.value)) || 0,
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
      reroll.addEventListener('click', () => {
        seedInput.value = String(randomSeed());
        renderPreview();
      });

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => close('cancel'));
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.className = 'btn btn--primary';
      submit.textContent = 'Generate';
      // Submitting sets returnValue to this; Escape leaves it '', so dismissal
      // (Escape or Cancel) resolves null rather than accidentally generating.
      submit.value = 'ok';

      renderPreview();
      return { body, actions: [cancel, submit], initialFocus: archetypeSelect };
    },
    result: (returnValue) => {
      closed = true;
      return returnValue === 'ok' ? readChoice() : null;
    },
  });
}
