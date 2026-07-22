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

  const empty = document.createElement('p');
  empty.className = 'tile-inspector__empty';
  empty.textContent = 'Select a tile to inspect it.';

  const form = document.createElement('div');
  form.className = 'tile-inspector__form';

  const coordLabel = document.createElement('div');
  coordLabel.className = 'tile-inspector__coord';

  // POI type
  const typeField = document.createElement('label');
  typeField.className = 'tile-inspector__field';
  typeField.textContent = 'POI type';
  const typeSelect = document.createElement('select');
  typeSelect.className = 'field';
  for (const value of POI_TYPES) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === '' ? 'None' : value[0].toUpperCase() + value.slice(1);
    typeSelect.appendChild(option);
  }
  typeSelect.addEventListener('change', () => {
    opts.onChange({ poiType: typeSelect.value === '' ? null : /** @type {POIType} */ (typeSelect.value) });
  });
  typeField.appendChild(typeSelect);

  // Discoverable
  const discField = document.createElement('label');
  discField.className = 'tile-inspector__field tile-inspector__field--inline';
  const discInput = document.createElement('input');
  discInput.type = 'checkbox';
  discInput.addEventListener('change', () => opts.onChange({ discoverable: discInput.checked }));
  discField.append(discInput, document.createTextNode(' Discoverable'));

  // Notes
  const notesField = document.createElement('label');
  notesField.className = 'tile-inspector__field';
  notesField.textContent = 'Notes';
  const notesInput = document.createElement('textarea');
  notesInput.className = 'field tile-inspector__notes';
  notesInput.rows = 4;
  notesInput.addEventListener('input', () => opts.onChange({ notes: notesInput.value }));
  notesField.appendChild(notesInput);

  form.append(coordLabel, typeField, discField, notesField);

  // Region link (optional): which child node this tile zooms into. Only shown
  // when the caller supplies linking, i.e. in Build mode.
  const linkField = document.createElement('label');
  linkField.className = 'tile-inspector__field';
  linkField.textContent = 'Zooms into';
  const linkSelect = document.createElement('select');
  linkSelect.className = 'field';
  const newRegionBtn = document.createElement('button');
  newRegionBtn.type = 'button';
  newRegionBtn.className = 'btn tile-inspector__new-region';
  newRegionBtn.textContent = 'New region here';
  if (opts.linking) {
    const linking = opts.linking;
    linkSelect.addEventListener('change', () => {
      linking.onChange(linkSelect.value === '' ? null : linkSelect.value);
    });
    newRegionBtn.addEventListener('click', () => linking.onCreateNew());
    linkField.appendChild(linkSelect);
    form.append(linkField, newRegionBtn);
  }

  function renderLinkOptions() {
    if (!opts.linking || !tile) return;
    linkSelect.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Nothing';
    linkSelect.appendChild(none);
    for (const opt of opts.linking.getOptions()) {
      const option = document.createElement('option');
      option.value = opt.id;
      option.textContent = opt.name;
      linkSelect.appendChild(option);
    }
    linkSelect.value = tile.childNodeId ?? '';
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
