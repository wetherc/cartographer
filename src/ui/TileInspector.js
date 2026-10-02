import { emptyState, textButton } from './buttons.js';
import { el } from './dom.js';
import { labeled, select, setOptions, textareaField } from './formFields.js';
import { describeTile } from '../map/TileCoords.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').TileMetadata} TileMetadata */
/** @typedef {import('../types/map.js').POIType} POIType */

/** @type {(POIType | '')[]} */
const POI_TYPES = ['', 'settlement', 'landmark', 'dungeon', 'shop', 'quest', 'custom'];

/** Numbers the hint ids, so two inspectors on one page never share one. */
let hintCount = 0;

/**
 * Mount the tile inspector: a form over a single tile's TileMetadata, with
 * point-of-interest marker, discoverable flag, and notes. In Build mode, the fields are
 * editable, and each edit calls onChange with a metadata patch. In Play
 * mode, the same panel is read-only, so a GM can see a tile's notes
 * during a session without editing them. Call setTile(tile, editable) to
 * point the inspector at the selected tile, or setTile(null) to clear it.
 * @param {HTMLElement} container
 * @param {{
 *   onChange: (patch: Partial<TileMetadata>) => void,
 *   linking?: {
 *     getOptions: () => { id: string, name: string }[],
 *     onChange: (childNodeId: string | null) => void,
 *     onCreateNew: () => void,
 *   },
 *   onSetSpawn?: (tileId: string) => void,
 *   onAddHandout?: (tileId: string) => void,
 *   artName?: (imageRef: string) => string | null,
 * }} opts
 * @returns {{ setTile: (tile: Tile | null, editable?: boolean) => void }}
 */
export function mountTileInspector(container, opts) {
  const root = el('div', 'tile-inspector');
  container.appendChild(root);

  /** @type {Tile | null} */
  let tile = null;
  let editable = true;

  const empty = emptyState('Select a tile to inspect it.');

  const form = el('div', 'u-col u-g3');

  const coordLabel = el('div', 'tile-inspector__coord u-muted');
  // The head shows the art of the tile and its name, so the GM sees which
  // tile the fields below belong to. The image is decoration, since the name
  // beside it says the same thing.
  const artImage = el('img', 'tile-inspector__art');
  artImage.alt = '';
  artImage.width = 40;
  artImage.height = 40;
  const artLabel = el('div', 'tile-inspector__name');
  const head = el(
    'div',
    'tile-inspector__head u-row u-g2',
    artImage,
    el('div', 'u-col', artLabel, coordLabel),
  );

  // Point-of-interest marker
  const typeSelect = select(
    POI_TYPES.map((value) => ({ value, label: value === '' ? 'None' : capitalize(value) })),
    '',
  );
  typeSelect.addEventListener('change', () => {
    opts.onChange({
      poiType: typeSelect.value === '' ? null : /** @type {POIType} */ (typeSelect.value),
    });
  });
  const typeField = labeled('Marker', typeSelect, { className: 'tile-inspector__field' });

  // Discoverable
  const discInput = el('input');
  discInput.type = 'checkbox';
  discInput.addEventListener('change', () => opts.onChange({ discoverable: discInput.checked }));
  const discField = el(
    'label',
    'tile-inspector__field tile-inspector__field--inline u-row u-g2 u-muted',
    discInput,
    ' Discoverable',
  );
  // The hint names what the flag does, which the one word does not.
  const discHint = el('p', 'tile-inspector__hint u-muted', 'Hidden until the party steps here.');
  discHint.id = `tile-inspector-disc-hint-${++hintCount}`;
  discInput.setAttribute('aria-describedby', discHint.id);

  // Notes
  const notesInput = textareaField('', { rows: 4, className: 'tile-inspector__notes' });
  notesInput.addEventListener('input', () => opts.onChange({ notes: notesInput.value }));
  const notesField = labeled('Notes', notesInput, { className: 'tile-inspector__field' });

  form.append(head, typeField, el('div', 'u-col', discField, discHint), notesField);

  // The region link is optional. It names which child node this tile
  // zooms into. It shows only when the caller supplies linking, for
  // example in Build mode.
  const linkSelect = select([], '');
  const linkField = labeled('Zooms into', linkSelect, { className: 'tile-inspector__field' });
  const newRegionBtn = textButton('New region here', () => opts.linking?.onCreateNew(), {
    className: 'tile-inspector__new-region',
  });
  if (opts.linking) {
    const linking = opts.linking;
    linkSelect.addEventListener('change', () => {
      linking.onChange(linkSelect.value === '' ? null : linkSelect.value);
    });
    form.append(linkField, newRegionBtn);
  }

  // Set-spawn is optional, for Build mode. It makes the selected tile the
  // party's start position, so a GM can place where the party begins
  // while authoring a map. Both buttons, above and here, mount only when
  // their callback exists, so the optional call in each handler always
  // finds it present.
  const spawnBtn = textButton(
    'Set party start here',
    () => {
      if (tile) opts.onSetSpawn?.(tile.id);
    },
    { className: 'tile-inspector__spawn' },
  );
  if (opts.onSetSpawn) form.appendChild(spawnBtn);

  // A handout for this tile lists for players only while the party stands
  // here. The button opens the handout dialog with this tile chosen.
  const handoutBtn = textButton(
    'New handout on this tile',
    () => {
      if (tile) opts.onAddHandout?.(tile.id);
    },
    { className: 'tile-inspector__handout' },
  );
  if (opts.onAddHandout) form.appendChild(handoutBtn);

  function renderLinkOptions() {
    if (!opts.linking || !tile) return;
    setOptions(
      linkSelect,
      [
        { value: '', label: 'Nothing' },
        ...opts.linking.getOptions().map(({ id, name }) => ({ value: id, label: name })),
      ],
      tile.childNodeId ?? '',
    );
    linkSelect.disabled = !editable;
    newRegionBtn.disabled = !editable;
  }

  function render() {
    root.innerHTML = '';
    if (!tile) {
      root.appendChild(empty);
      return;
    }
    coordLabel.textContent = capitalize(describeTile(tile.id));
    artImage.hidden = !tile.imageRef;
    if (tile.imageRef) artImage.src = tile.imageRef;
    artLabel.textContent = artNameOf(tile);
    typeSelect.value = tile.metadata.poiType ?? '';
    discInput.checked = tile.metadata.discoverable;
    notesInput.value = tile.metadata.notes;

    typeSelect.disabled = !editable;
    discInput.disabled = !editable;
    notesInput.readOnly = !editable;
    spawnBtn.disabled = !editable;
    handoutBtn.disabled = !editable;

    renderLinkOptions();
    root.appendChild(form);
  }

  /**
   * The names of the base art and each overlay, as in "Grass, Road (h)".
   * @param {Tile} shown
   * @returns {string}
   */
  function artNameOf(shown) {
    const overlays = shown.overlayRef === null ? [] : [shown.overlayRef].flat();
    const names = [shown.imageRef, ...overlays]
      .filter((ref) => !!ref)
      .map((ref) => opts.artName?.(ref) ?? 'Custom art');
    return names.length ? names.join(', ') : 'No tile art';
  }

  /**
   * @param {Tile | null} next
   * @param {boolean} [isEditable]
   */
  function setTile(next, isEditable = true) {
    tile = next;
    editable = isEditable;
    render();
  }

  render();
  return { setTile };
}
