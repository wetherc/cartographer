/**
 * HTML assembly for the developer guide. Every number and every name in the
 * prose below arrives as data. Nothing here is typed out by hand twice.
 */
import { CSS } from './styles.mjs';
import { CLIENT } from './client.mjs';

/** @param {string} text */
function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** @param {number} n */
function num(n) {
  return n.toLocaleString('en-US');
}

const KEYWORDS = [
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'from',
  'function', 'if', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null',
  'of', 'readonly', 'return', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
  'undefined', 'var', 'void', 'while', 'yield',
].join('|');

const TOKEN = new RegExp(
  '(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*)' + // 1: comment
    `|('(?:\\\\.|[^'\\\\\\n])*'|"(?:\\\\.|[^"\\\\\\n])*"|\`(?:\\\\.|[^\`\\\\])*\`)` + // 2: string
    '|\\b(0[xXbBoO][0-9a-fA-F]+|\\d[\\d_]*(?:\\.\\d+)?)\\b' + // 3: number
    `|(?<![.$])\\b(${KEYWORDS})\\b`, // 4: keyword, but not a property name
  'g',
);

/**
 * Every snippet on the page is JavaScript or a TypeScript declaration, so one
 * small tokenizer covers them all: comments, strings, numbers, and keywords.
 * Anything it does not recognize stays plain.
 * @param {string} code
 */
function highlight(code) {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    const cls = m[1] ? 'cm' : m[2] ? 'st' : m[3] ? 'num' : 'kw';
    out += esc(code.slice(last, m.index));
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(code.slice(last));
}

/**
 * @param {{ file: string, symbol: string, line: number, endLine: number, code: string }} snip
 * @param {string} [note]
 */
function block(snip, note) {
  const range = snip.endLine > snip.line ? `${snip.line}-${snip.endLine}` : String(snip.line);
  const name = snip.symbol ? '  |  ' + snip.symbol : '';
  return [
    '<figure class="snip">',
    `<figcaption class="snippet-label">${esc(snip.file)}:${range}${esc(name)}</figcaption>`,
    `<pre><code>${highlight(snip.code)}</code></pre>`,
    note ? `<p class="caption">${note}</p>` : '',
    '</figure>',
  ].join('\n');
}

const EXTRA_CSS = `
  .snip { margin-top: var(--sp-3); }
  .snippet-label {
    font-family: var(--f-mono);
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .snip pre { margin-top: var(--sp-1); }
  .step-call { font-family: var(--f-mono); font-size: 0.95rem; }
  .reg-line { margin-bottom: var(--sp-1); }
  .stamp { font-family: var(--f-mono); font-size: 0.7rem; letter-spacing: 0.08em; color: var(--text-muted); }
`;

export const SECTIONS = [
  { id: 'layers', short: 'One rule' },
  { id: 'root', short: 'Composition root' },
  { id: 'panels', short: 'Panel contract' },
  { id: 'map', short: 'Map model' },
  { id: 'save', short: 'Persistence' },
  { id: 'where', short: 'Where code goes' },
  { id: 'work', short: 'Working on it' },
  { id: 'review', short: 'Pre-flight' },
];

/**
 * @param {any} data the collected repository facts
 * @returns {string} the whole page
 */
export function renderGuide(data) {
  const { pkg, dirs, steps, snippets, measured, densest, tests, generatedAt } = data;
  const totals = dirs.reduce(
    (acc, d) => ({ files: acc.files + d.files, lines: acc.lines + d.lines }),
    { files: 0, lines: 0 },
  );
  const finalStage = measured.stages[measured.stages.length - 1];
  const shrink = Math.round((1 - finalStage.size / measured.stages[0].size) * 100);
  const registered = steps.reduce((sum, s) => sum + s.regs.length, 0);

  const payload = JSON.stringify({
    sections: SECTIONS,
    kindGroups: data.kindGroups,
    dirs,
    steps,
    stages: measured.stages,
    storageKeys: data.storageKeys,
    commands: data.commands,
    checklist: data.checklist,
    routerTree: data.routerTree,
    routerAnswers: data.routerAnswers,
    revealRadius: data.revealRadius,
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Campaign Builder: developer guide</title>
<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}img{display:block;max-width:100%}</style>
<style>${CSS}${EXTRA_CSS}</style>
</head>
<body>

<div class="shell">
  <nav class="rail" aria-label="Contents">
    <div class="rail-title">Contents</div>
    <ul class="rail-list" id="rail"></ul>
  </nav>

  <main>
    <header class="masthead">
      <div class="eyebrow">Campaign Builder / v${esc(pkg.version)}</div>
      <h1>A developer guide to a codebase with no framework in it.</h1>
      <p class="lede">
        Plain HTML, CSS, and ES modules. No runtime dependency, and no compile step for
        development. Every rule below exists so the code stays readable at this size.
        The panels on this page are live: click them.
      </p>
      <div class="facts">
        <div><span class="fact-n">${num(totals.lines)}</span><span class="fact-l">lines of source</span></div>
        <div><span class="fact-n">${num(totals.files)}</span><span class="fact-l">source files</span></div>
        <div><span class="fact-n">${num(tests.suites)}</span><span class="fact-l">test suites</span></div>
        <div><span class="fact-n">${num(pkg.runtimeDependencies)}</span><span class="fact-l">runtime dependencies</span></div>
      </div>
    </header>

    <section id="layers">
      <div class="sec-head"><span class="sec-num">01</span><h2>One rule holds the codebase up</h2></div>
      <div class="prose">
        <p>
          Every module is one of two kinds. <strong>Pure logic</strong> takes its inputs as
          arguments, including the random number generator and the current time, and returns
          new values. It never touches the DOM. <strong>DOM glue</strong> connects that logic
          to elements and events.
        </p>
        <p>
          Glue calls down into pure logic. Pure logic never calls up. That single direction is
          why most of the tree can be tested with <code>node --test</code> and nothing else.
        </p>
      </div>

      <div class="plate">
        <div class="plate-label">Import map: pick a directory to see what it imports</div>
        <div class="layers" id="layerBoard"></div>
        <div class="verdict" id="layerVerdict"></div>
      </div>
      <p class="caption">
        Counts and edges are read from the working tree. An edge is a real
        <code>import</code> statement, so a JSDoc type reference does not create one.
      </p>
    </section>

    <section id="root">
      <div class="sec-head"><span class="sec-num">02</span><h2>The composition root</h2></div>
      <div class="prose">
        <p>
          <code>src/main.js</code> builds one <code>AppContext</code> and hands it to each
          wiring module in turn. The context carries the engine objects, the campaign state a
          save serializes, and two registries that start empty: <code>views</code> for mounted
          panels and <code>actions</code> for cross-module operations.
        </p>
        <p>
          The wiring modules fill those registries with ${num(registered)} entries between them.
          Handlers read the registries at call time, never during wiring. That late read is what
          lets an early module call a late one, and it is why <code>partyWiring.js</code> can
          trigger an encounter without importing <code>encounterWiring.js</code>.
        </p>
      </div>

      ${block(snippets.appContext)}

      <div class="plate">
        <div class="plate-label">Mount order: step through the ${steps.length} calls in main.js</div>
        <div class="step-grid">
          <div>
            <ul class="step-list" id="stepList"></ul>
            <div class="toolbar" style="margin-top: var(--sp-2)">
              <button class="btn" id="stepPrev">Back</button>
              <button class="btn" id="stepNext">Next</button>
              <button class="btn" id="stepReset">Restart</button>
            </div>
          </div>
          <div class="step-detail" id="stepDetail"></div>
        </div>
      </div>
      <p class="caption">
        Order, roles, and reasons are read from the call site. Each registry entry is found by
        scanning <code>src/app/</code> for what the module assigns.
      </p>

      ${block(snippets.mountOrder, 'The same lines, straight out of the composition root.')}
    </section>

    <section id="panels">
      <div class="sec-head"><span class="sec-num">03</span><h2>The panel contract</h2></div>
      <div class="prose">
        <p>
          A panel is a function <code>mount&lt;Name&gt;(container, callbacks)</code>. It creates
          its own root, draws once, and returns <code>{ update }</code>. A wiring module stores
          that handle on <code>app.views</code>. Callers only ever call <code>.update()</code>.
        </p>
        <p>
          A panel holds no campaign data. Everything it draws comes from a <code>get*</code>
          callback that runs at render time, so <code>update()</code> always re-reads current
          state. Every mutation leaves through a callback. Panels never write state and never
          open dialogs.
        </p>
      </div>

      ${block(snippets.panel, 'Most list panels get this shape from <code>mountListPanel</code> in <code>src/ui/listPanel.js</code> instead of hand-rolling it.')}

      <h3>Why identity comparison is enough</h3>
      <div class="prose">
        <p>
          A repaint is skipped when the rows are the same objects in the same order. That check
          is sound only because the entity layer never mutates in place. Every writer returns a
          new object, so a changed row is always a different object.
        </p>
      </div>

      ${block(snippets.repaint)}
      ${block(snippets.sameRows)}

      <h3>The same rule, three more places</h3>
      <div class="prose">
        <ul>
          <li><strong>Tile lookups.</strong> <code>src/map/TileIndex.js</code> gives O(1) <code>tileAt(node, id)</code>. Safe because a tile write replaces the node.</li>
          <li><strong>Derived map data.</strong> <code>findRegionGroups</code> and <code>spanBlocks</code> cache in a WeakMap keyed on the node. A mutated node would serve a stale answer forever.</li>
          <li><strong>Frozen catalogs.</strong> The built-in tables run through <code>deepFreeze</code>. A path that copies one into campaign state has to say so, such as <code>Encounter.fromTemplate</code>.</li>
        </ul>
      </div>

      ${block(snippets.memoize)}
    </section>

    <section id="map">
      <div class="sec-head"><span class="sec-num">04</span><h2>The map is one node type</h2></div>
      <div class="prose">
        <p>
          There is no world type, region type, or dungeon type. Every map is a
          <code>MapNode</code>. A node points up through <code>parentId</code>. A tile points
          down through <code>childNodeId</code>. Several tiles can share one
          <code>childNodeId</code> when a landmark covers more than one cell.
        </p>
        <p>
          The tile id <em>is</em> the position. There are no x and y fields on a tile. Fog is one
          boolean per tile, and moving the party is the only thing that clears it. The example
          campaign holds ${num(measured.nodes)} nodes and ${num(measured.tiles)} tiles.
        </p>
      </div>

      ${block(snippets.tile)}

      <div class="plate">
        <div class="plate-label">Move the party: click a cell</div>
        <div class="tilewrap"><div class="tilegrid" id="tileGrid" role="grid" aria-label="Demo map, 14 by 9 cells"></div></div>
        <div class="readout" id="tileReadout"></div>
        <div class="toolbar" style="margin-top: var(--sp-2)">
          <button class="btn" id="fogRadius">Reveal radius</button>
          <button class="btn" id="fogReset">Hide all</button>
        </div>
      </div>
      <p class="caption">
        The demo starts at the party tracker's own default radius of ${data.revealRadius}.
      </p>

      ${block(snippets.reveal, 'Reveal is monotonic, and the function returns the same node when nothing new was revealed.')}
    </section>

    <section id="save">
      <div class="sec-head"><span class="sec-num">05</span><h2>A campaign is one string</h2></div>
      <div class="prose">
        <p>
          Saving flattens live state into a <code>CampaignState</code>, then runs it through four
          packing layers before <code>JSON.stringify</code>. Loading reverses the chain, with
          migrations first. Browser storage caps near 5 MB, so each layer earns its place. On the
          example campaign the chain removes ${shrink}% of the string.
        </p>
      </div>

      <div class="plate">
        <div class="plate-label">Packing layers, measured on the example campaign</div>
        <div class="bars" id="packBars"></div>
        <div class="verdict" id="packDetail"></div>
      </div>
      <p class="caption">
        Measured at build time by running the real packing functions over
        <code>buildExampleCampaign</code> with seed ${measured.seed}. Layers 1 and 2 are measured
        with the generic <code>packEntity</code> against the same defaults the loader restores;
        <code>serialize</code> uses the specialized tile packer and lands at
        ${num(measured.serialized)} characters. On the densest node
        (${esc(densest.name)}, ${densest.width}x${densest.height},
        ${num(densest.tiles)} tiles) the codec alone saves ${num(densest.saved)} characters.
      </p>

      ${block(snippets.packTile, 'Fields are deleted from a copy, so a field this function has never heard of still survives the round trip.')}

      <h3>Undo without snapshots</h3>
      <div class="prose">
        <p>
          History stores one invertible delta per step, not a copy of the campaign.
          <code>diffState</code> records the old and the new value of each change, and
          <code>invertOps</code> swaps them. The canonical save is the base, so no snapshot is
          needed.
        </p>
        <p>
          Two rules keep it safe. A history write always follows the campaign write. A delta is
          never migrated, so an index written by an older version is discarded whole.
        </p>
      </div>

      <div class="plate">
        <div class="plate-label">localStorage keys, with where each one is defined</div>
        <div class="cmds" id="keyList"></div>
      </div>
      <p class="caption">All file input and output is confined to <code>src/storage/fileIO.js</code>.</p>
    </section>

    <section id="where">
      <div class="sec-head"><span class="sec-num">06</span><h2>Where does my change go?</h2></div>
      <div class="prose">
        <p>Answer two or three questions. The result names the directory, the test you owe, and the trap that catches people there.</p>
      </div>
      <div class="plate">
        <div class="plate-label" id="routerCrumbs">Start</div>
        <div class="router" id="router"></div>
      </div>
    </section>

    <section id="work">
      <div class="sec-head"><span class="sec-num">07</span><h2>Working on it</h2></div>
      <div class="prose">
        <p>
          Tests run against the source files, not the build. Use one file while iterating and the
          whole suite before a commit. The pre-commit hook runs the formatter, the linter, the
          suite, and the typecheck, and it blocks on any failure.
        </p>
      </div>
      <div class="plate">
        <div class="plate-label">Commands</div>
        <div class="cmds" id="cmdList"></div>
      </div>
      <p class="caption">Anything with a package script is read out of <code>package.json</code>.</p>

      <h3>Checking the DOM and the canvas</h3>
      <div class="prose">
        <p>
          Code that touches the DOM or the canvas is checked in a real browser, not in a mock.
          Serve the project, open the change, and read the console for 404s on asset paths.
          Playwright can drive and screenshot that check when you want it automated.
          Manual preview pages live in <code>tests/</code> and stay out of the automated
          run because they do not end in <code>.test.js</code>:
          ${tests.previews.map((p) => `<code>${esc(p)}</code>`).join(', ')}.
          Each one mounts the real modules the way <code>main.js</code> does.
        </p>
        <p>
          Coverage counts every module, because <code>tests/moduleLoad.test.js</code> imports all
          of <code>src/</code> except <code>main.js</code>. A low row under <code>src/ui/</code>
          or <code>src/app/</code> is expected. A low row anywhere else means the module needs tests.
        </p>
      </div>
    </section>

    <section id="review">
      <div class="sec-head"><span class="sec-num">08</span><h2>Pre-flight</h2></div>
      <div class="prose">
        <p>Run down this list before you make a commit or open a pull request.</p>
      </div>
      <div class="plate">
        <div class="plate-label">Conventions checklist</div>
        <div class="checks" id="checkList"></div>
        <div class="progress" id="checkProgress"></div>
      </div>
      <p class="caption">Deeper detail lives in <code>docs/architecture/conventions.md</code>. <code>docs/architecture.md</code> is authoritative for design questions.</p>
    </section>

    <footer>
      <div class="stamp">Generated from the source tree by scripts/build-dev-guide.mjs at ${esc(generatedAt)}. Run pnpm run guide to rebuild.</div>
    </footer>
  </main>
</div>

<script>window.__GUIDE_DATA__ = ${payload};</script>
<script>${CLIENT}</script>
</body>
</html>
`;
}
