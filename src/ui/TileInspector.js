import { emptyState, textButton } from './buttons.js';
import { el } from './dom.js';
import { select, setOptions, textareaField } from './formFields.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').TileMetadata} TileMetadata */
/** @typedef {import('../types/map.js').POIType} POIType */

/** @type {(POIType | '')[]} */
const POI_TYPES = ['', 'settlement', 'landmark', 'dungeon', 'shop', 'quest', 'custom'];

/**
 * Mount the tile inspector: a form over a single tile's TileMetadata (POI type,
 * discoverable flag, notes). In Build mode the fields are editable and each
 * edit calls onChange with a metadata patch; in Play mode the same panel is
 * read-only so a GM can see a tile's notes during a session without being able
 * to edit them (the surface for playtesting gap #9). Call setTile(tile,
 * editable) to point it at the selected tile, or setTile(null) to clear it.
 * @param {HTMLElement} container
 * @param {{
 *   onChange: (patch: Partial<TileMetadata>) => void,
 *   linking?: {
 *     getOptions: () => { id: string, name: string }[],
 *     onChange: (childNodeId: string | null) => void,
 *     onCreateNew: () => void,
 *   },
 *   onSetSpawn?: (tileId: string) => void,
 * }} opts
 * @returns {{ setTile: (tile: Tile | null, editable?: boolean) => void }}
 */
export function mountTileInspector(container, opts) {
  const root = document.createElement('div');
  root.className = 'tile-inspector';
  container.appendChild(root);

  /** @type {Tile | null} */
  let tile = null;
  let editable = true;

  const empty = emptyState('Select a tile to inspect it.');

  const form = document.createElement('div');
  form.className = 'tile-inspector__form';

  const coordLabel = document.createElement('div');
  coordLabel.className = 'tile-inspector__coord';

  // POI type
  const typeSelect = select(
    POI_TYPES.map((value) => ({ value, label: value === '' ? 'None' : capitalize(value) })),
    '',
  );
  typeSelect.addEventListener('change', () => {
    opts.onChange({
      poiType: typeSelect.value === '' ? null : /** @type {POIType} */ (typeSelect.value),
    });
  });
  const typeField = el('label', 'tile-inspector__field', 'POI type', typeSelect);

  // Discoverable
  const discInput = el('input');
  discInput.type = 'checkbox';
  discInput.addEventListener('change', () => opts.onChange({ discoverable: discInput.checked }));
  const discField = el(
    'label',
    'tile-inspector__field tile-inspector__field--inline',
    discInput,
    ' Discoverable',
  );

  // Notes
  const notesInput = textareaField('', { rows: 4, className: 'tile-inspector__notes' });
  notesInput.addEventListener('input', () => opts.onChange({ notes: notesInput.value }));
  const notesField = el('label', 'tile-inspector__field', 'Notes', notesInput);

  form.append(coordLabel, typeField, discField, notesField);

  // Region link (optional): which child node this tile zooms into. Only shown
  // when the caller supplies linking, i.e. in Build mode.
  const linkSelect = select([], '');
  const linkField = el('label', 'tile-inspector__field', 'Zooms into', linkSelect);
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

  // Set-spawn (optional, Build mode): make the selected tile the party's start
  // position, so a GM can place where the party begins while authoring a map.
  // Both buttons above and here are only mounted when their callback exists, so
  // the optional call in each handler can never find it missing.
  const spawnBtn = textButton(
    'Set party start here',
    () => {
      if (tile) opts.onSetSpawn?.(tile.id);
    },
    { className: 'tile-inspector__spawn' },
  );
  if (opts.onSetSpawn) form.appendChild(spawnBtn);

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
    coordLabel.textContent = `Tile ${tile.id}`;
    typeSelect.value = tile.metadata.poiType ?? '';
    discInput.checked = tile.metadata.discoverable;
    notesInput.value = tile.metadata.notes;

    typeSelect.disabled = !editable;
    discInput.disabled = !editable;
    notesInput.readOnly = !editable;
    spawnBtn.disabled = !editable;

    renderLinkOptions();
    root.appendChild(form);
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
