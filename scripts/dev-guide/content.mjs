/**
 * The authored half of the developer guide: the parts a person decides, not
 * the parts a scan can find. Every entry that names a file or a symbol is
 * checked against the repository when the guide is built, so a rename here
 * fails the build instead of going stale.
 */

/**
 * What each source area is for, and which side of the pure/glue split it
 * sits on. An area with no entry still appears in the guide, marked as
 * unclassified, so a new directory is visible rather than silently dropped.
 * @type {Record<string, { kind: string, role: string }>}
 */
export const DIRECTORY_META = {
  main: {
    kind: 'root',
    role: 'Builds the AppContext, then calls each wiring module in mount order.',
  },
  app: {
    kind: 'wiring',
    role: 'One wireX(app) module per feature area. Mounts panels, registers views and actions, and holds the per-feature UI state a save does not carry.',
  },
  ui: {
    kind: 'glue',
    role: 'DOM widgets: panels, dialogs, forms. Draws from callbacks and writes nothing.',
  },
  map: {
    kind: 'mixed',
    role: 'Tile grid, node hierarchy, fog, and region grouping, plus the canvas renderer. The renderer is the glue half. Everything else is pure.',
  },
  entities: {
    kind: 'pure',
    role: 'Characters, encounters, resources, equipment, and casting. Every writer returns a new object.',
  },
  storage: {
    kind: 'pure',
    role: 'Serialize, pack, migrate, and the delta history. Browser APIs are confined to thin wrappers.',
  },
  combat: { kind: 'pure', role: 'Initiative order, attack resolution, and loadout reads.' },
  dice: {
    kind: 'pure',
    role: 'roll(selection, rng). The generator is an argument, which is what makes the layer testable.',
  },
  party: { kind: 'pure', role: 'Party position and split-party tokens. Moving the party reveals fog.' },
  library: {
    kind: 'pure',
    role: 'Merges the built-in catalogs with the GM customs, tagging each entry default, override, or custom.',
  },
  campaign: { kind: 'pure', role: 'Blank and example campaign builders, and the initial load.' },
  handout: { kind: 'pure', role: 'Handout records and their defaults.' },
  time: { kind: 'pure', role: 'The in-game clock and rest handling.' },
  log: { kind: 'pure', role: 'Travelogue entries and the incremental read the panel renders from.' },
  view: { kind: 'pure', role: 'View rules that a widget reads: stat bars, the shortcut table.' },
  data: { kind: 'data', role: 'Frozen catalogs: classes, races, backgrounds, skills, spells.' },
  util: {
    kind: 'pure',
    role: 'Clamping, identity memos, deep freeze, seeded random. Imports nothing.',
  },
  types: {
    kind: 'types',
    role: 'Declaration files only, with no runtime code. The .js files point here through JSDoc, which is why no import edge leads to this directory.',
  },
  platform: { kind: 'pure', role: 'Storage and file adapters behind one interface.' },
};

export const KIND_GROUPS = [
  ['root', 'composition'],
  ['wiring', 'wiring'],
  ['glue', 'DOM glue'],
  ['mixed', 'pure + glue'],
  ['pure', 'pure logic'],
  ['data', 'catalogs'],
  ['types', 'declarations'],
  ['unclassified', 'unclassified'],
];

/** What each packing stage does. The sizes beside these come from measurement. */
export const STAGE_NOTES = {
  raw: 'Every tile and every entity written in full, the way they sit in memory.',
  tiles:
    'packTile deletes default-valued fields from a copy, so a field it has never heard of still survives the round trip. withTileDefaults puts the defaults back on load.',
  entities:
    'packEntity round-trips the entity through the real unpacker to verify the fidelity of the restore. A fixed table of defaults would mis-restore an encounter whose weapon comes from its level and tier.',
  assets:
    'Inline data: URLs move into an assets table keyed by content hash, and the tile keeps an asset: reference. The example campaign ships no uploaded art, so this layer is flat here. In later versions, custom map tile art is planned so this step is largely pre-emptive in advance of that. Until then, gains will likely still be seen in cases where a GM uploads asset art to associate with one or more Handouts.',
  codec:
    'Each node becomes an art palette plus a row-major run-length list of indices, plus a run-length fog track. It is opt-in per node and bails by returning the same object, so a node with ids it cannot parse is left alone.',
};

/** The decision tree behind "where does my change go?". */
export const ROUTER_TREE = {
  start: {
    q: 'Does the change need the DOM, a canvas, or a browser API?',
    opts: [
      { label: 'No', note: 'Rules, math, data shapes, save format.', next: 'pure' },
      { label: 'Yes', note: 'Elements, events, drawing, storage APIs.', next: 'glue' },
    ],
  },
  pure: {
    q: 'What does it operate on?',
    opts: [
      { label: 'Tiles, nodes, fog', note: 'Geometry, hierarchy, reveal.', answer: 'map' },
      { label: 'Characters or foes', note: 'Stats, gear, spells, damage.', answer: 'entities' },
      { label: 'The save format', note: 'New field, new shape, packing.', answer: 'storage' },
      { label: 'Randomness', note: 'Dice, rolls, checks.', answer: 'dice' },
    ],
  },
  glue: {
    q: 'Is it one panel, or a behaviour that crosses features?',
    opts: [
      { label: 'One panel', note: 'A list, a form, a card.', answer: 'ui' },
      {
        label: 'Crosses features',
        note: 'A move triggers an encounter, a cast writes the log.',
        answer: 'app',
      },
      { label: 'Drawing on the map', note: 'A new render pass or marker.', answer: 'canvas' },
    ],
  },
};

export const ROUTER_ANSWERS = {
  map: {
    where: 'src/map/',
    test: 'tests/<Module>.test.js, with no DOM. Take the node as an argument and return a new node.',
    trap: 'Return the same node object when nothing changed. TileIndex and every WeakMap cache are keyed on node identity, so a mutated node serves stale data forever.',
    refs: [
      ['src/map/TileIndex.js', 'tileAt'],
      ['src/map/FogOfWar.js', 'revealAround'],
    ],
  },
  entities: {
    where: 'src/entities/, with any catalog data in src/data/',
    test: 'tests/<Module>.test.js. Inject the generator so the result is deterministic.',
    trap: 'Never mutate in place. A writer returns a new object, which is what makes the panel repaint guard sound. Catalogs in src/data/ are deep-frozen, so copy before you write one into campaign state.',
    refs: [
      ['src/util/deepFreeze.js', 'deepFreeze'],
      ['src/entities/Encounter.js', 'fromTemplate'],
    ],
  },
  storage: {
    where: 'src/storage/',
    test: 'A round trip through serialize and deserialize, plus a migration test if the meaning of a field changed.',
    trap: 'A new field needs no migration, because withDefaults absorbs absence. Only a change of meaning goes in Migrations.js. Add the field to SYNCED_STATE_KEYS as well, which a test asserts against the Campaign shape.',
    refs: [
      ['src/storage/Migrations.js', 'migrateState'],
      ['src/app/rehydrate.js', 'SYNCED_STATE_KEYS'],
    ],
  },
  dice: {
    where: 'src/dice/, or src/combat/ if it resolves an attack',
    test: 'Pass a stub generator and assert the exact output, the way tests/DiceRoller.test.js does.',
    trap: 'The generator and the clock are arguments, never module state. That is the whole reason this layer is testable.',
    refs: [
      ['src/dice/DiceRoller.js', 'roll'],
      ['src/combat/AttackResolve.js', 'resolveAttack'],
    ],
  },
  ui: {
    where: 'src/ui/',
    test: 'None automatically. Extract the rules into a pure module and test that. Check the widget itself in a browser.',
    trap: 'Reach for mountListPanel, buttons.js, and the tokens in styles/base.css before writing new markup. Never write an inline token fallback such as var(--border, #ccc): a missing token has to render as nothing so the mistake shows.',
    refs: [
      ['src/ui/listPanel.js', 'mountListPanel'],
      ['src/ui/buttons.js', 'iconButton'],
    ],
  },
  app: {
    where: 'src/app/<feature>Wiring.js, or a helper beside it',
    test: 'Split the rule out as a pure function and test that half. The wiring stays thin.',
    trap: 'Read app.views and app.actions inside the handler, never during wiring. Capturing a registry entry at mount time breaks the mount order and brings back import cycles.',
    refs: [['src/app/mapTravel.js', 'createMapTravel']],
  },
  canvas: {
    where: 'src/map/MapRenderer.js and friends, with pure helpers alongside',
    test: 'Visual. Use tests/map-canvas-preview.html and read the console.',
    trap: 'render() only schedules a frame. Add derived data to the shared frame object rather than re-scanning node.tiles, and iterate the visible cell range only.',
    refs: [
      ['src/map/MapCanvas.js', 'render'],
      ['src/map/MapRenderer.js', 'anyRevealed'],
    ],
  },
};

/** The pre-flight list, with the file that carries each rule. */
export const CHECKLIST = [
  [
    'Every new writer returns a new object',
    'No in-place mutation in entities/ or map/. The repaint guard and the WeakMap caches both depend on it.',
    [['src/util/memoize.js', 'memoizeByIdentity']],
  ],
  [
    'New pure logic has a test',
    'One tests/<Module>.test.js per source module. Side effects arrive as arguments.',
    [],
  ],
  [
    'New save fields are absorbed, not migrated',
    'withDefaults covers absence. Migrations.js is only for a change of meaning. Add the field to SYNCED_STATE_KEYS.',
    [['src/app/rehydrate.js', 'SYNCED_STATE_KEYS']],
  ],
  [
    'Handlers read app.views and app.actions at call time',
    'Capturing a registry entry during wiring breaks the mount order.',
    [],
  ],
  [
    'Colour, spacing, radius, and type come from tokens',
    'styles/base.css only, and never an inline var() fallback.',
    [],
  ],
  [
    'Destructive actions confirm first',
    'confirmDelete for a plain entity delete, confirmModal with danger: true for anything else.',
    [['src/ui/Modal.js', 'confirmDelete']],
  ],
  [
    'Buttons and empty states come from ui/buttons.js',
    'iconButton, textButton, emptyState, segSwitch. An icon-only button always carries an aria-label.',
    [['src/ui/buttons.js', 'emptyState']],
  ],
  ['Dismiss on the left, primary on the right', 'Every modal, inline form, and action bar.', []],
  ['The file is under 500 lines', 'Split it by responsibility when it is not.', []],
  [
    'DOM and canvas changes were opened in a browser',
    'Screenshot the change and read the console for 404s on asset paths.',
    [],
  ],
  [
    'Lint, suite, and typecheck all pass',
    'The pre-commit hook runs all three, plus the formatter.',
    [],
  ],
];

/**
 * Commands worth knowing. An entry with `script` is read out of
 * package.json, so a renamed script shows up here or fails the build.
 */
export const COMMANDS = [
  { command: 'pnpm install', note: 'Development tools only.' },
  { script: 'dev', note: 'Live-reloading dev server. Rebuilds on every source change.' },
  {
    command: 'node --test tests/Character.test.js',
    note: 'One file while you iterate. Much faster than the suite.',
  },
  { script: 'test', note: 'The whole suite. Run it before every commit.' },
  { script: 'coverage', note: 'Line, branch, and function coverage across all of src/.' },
  {
    command: 'pnpm --package=typescript dlx tsc --noEmit',
    note: 'The real typecheck. Not pnpx tsc, which resolves a placeholder package and checks nothing.',
  },
  { script: 'lint', note: 'ESLint over the tree.' },
  { script: 'build', note: 'Minified production output in dist/.' },
  { script: 'guide', note: 'Rebuilds this page from the source tree.' },
  { command: 'git config core.hooksPath hooks', note: 'Once per clone. Turns on the pre-commit gate.' },
];

/** Snippets, named by file and symbol so they follow the code when it moves. */
export const SNIPPETS = {
  appContext: { file: 'src/types/app.ts', symbol: 'AppContext' },
  mountOrder: {
    file: 'src/main.js',
    region: { from: 'wireCampaignActions(app)', to: 'wireShortcuts(app)' },
  },
  panel: { file: 'src/ui/TimePanel.js', symbol: 'mountTimePanel' },
  repaint: { file: 'src/ui/listPanel.js', symbol: 'repaintNeeded' },
  sameRows: { file: 'src/ui/listPanel.js', symbol: 'sameRows' },
  tile: { file: 'src/types/map.ts', symbol: 'Tile' },
  reveal: { file: 'src/map/FogOfWar.js', symbol: 'revealAround' },
  packTile: { file: 'src/storage/SaveManager.js', symbol: 'packTile' },
  memoize: { file: 'src/util/memoize.js', symbol: 'memoizeByIdentity' },
};

/** Names the prose mentions. Each one is checked before the page is written. */
export const PROSE_REFERENCES = [
  ['src/main.js', 'AppContext'],
  ['src/types/app.ts', 'AppViews'],
  ['src/types/app.ts', 'AppActions'],
  ['src/ui/listPanel.js', 'mountListPanel'],
  ['src/map/TileIndex.js', 'tileAt'],
  ['src/map/RegionGroups.js', 'findRegionGroups'],
  ['src/map/TilePaint.js', 'spanBlocks'],
  ['src/storage/StateDiff.js', 'diffState'],
  ['src/storage/StateDiff.js', 'invertOps'],
  ['src/storage/HistoryLog.js', 'HISTORY_BYTE_CAP'],
  ['src/storage/fileIO.js', 'downloadJSON'],
  ['src/entities/Encounter.js', 'fromTemplate'],
  ['src/util/deepFreeze.js', 'deepFreeze'],
  ['src/party/PartyTracker.js', 'moveTo'],
];
