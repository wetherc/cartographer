/** The stylesheet for the developer guide, emitted verbatim into the page. */
export const CSS = String.raw`
  :root {
    --ink: #131a18;
    --paper: #e8ebe7;
    --surface: #f3f5f1;
    --surface-2: #dfe4de;
    --text: #1b2422;
    --text-muted: #5b6a65;
    --rule: #c5ccc6;
    --rule-strong: #a9b3ac;
    --accent: #2c6f5c;
    --accent-soft: #d5e4dd;
    --ochre: #9a6a1f;
    --ochre-soft: #eee1c9;
    --danger: #9c3b30;

    --f-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    --f-body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --f-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;

    --step--1: 0.8125rem;
    --step-0: 1.0rem;
    --step-1: 1.1875rem;
    --step-2: 1.4375rem;
    --step-3: 1.8125rem;
    --step-4: 2.375rem;
    --step-5: 3.25rem;

    --sp-1: 0.375rem;
    --sp-2: 0.75rem;
    --sp-3: 1.25rem;
    --sp-4: 2rem;
    --sp-5: 3.25rem;
    --sp-6: 5rem;

    --col: 40rem;
    --plate-radius: 2px;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --ink: #0d1211;
      --paper: #0f1514;
      --surface: #161e1c;
      --surface-2: #1e2826;
      --text: #dde4e0;
      --text-muted: #8d9c96;
      --rule: #2a3532;
      --rule-strong: #3d4b47;
      --accent: #5cbfa0;
      --accent-soft: #16302a;
      --ochre: #cfa059;
      --ochre-soft: #2e2618;
      --danger: #d6796c;
    }
  }

  :root[data-theme="dark"] {
    --ink: #0d1211;
    --paper: #0f1514;
    --surface: #161e1c;
    --surface-2: #1e2826;
    --text: #dde4e0;
    --text-muted: #8d9c96;
    --rule: #2a3532;
    --rule-strong: #3d4b47;
    --accent: #5cbfa0;
    --accent-soft: #16302a;
    --ochre: #cfa059;
    --ochre-soft: #2e2618;
    --danger: #d6796c;
  }

  :root[data-theme="light"] {
    --ink: #131a18;
    --paper: #e8ebe7;
    --surface: #f3f5f1;
    --surface-2: #dfe4de;
    --text: #1b2422;
    --text-muted: #5b6a65;
    --rule: #c5ccc6;
    --rule-strong: #a9b3ac;
    --accent: #2c6f5c;
    --accent-soft: #d5e4dd;
    --ochre: #9a6a1f;
    --ochre-soft: #eee1c9;
    --danger: #9c3b30;
  }

  body {
    background: var(--paper);
    color: var(--text);
    font-family: var(--f-body);
    font-size: var(--step-0);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  *:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* ---------- shell ---------- */

  .shell {
    display: grid;
    grid-template-columns: 15rem minmax(0, 1fr);
    gap: var(--sp-5);
    max-width: 76rem;
    margin: 0 auto;
    padding: 0 var(--sp-3) var(--sp-6);
  }

  .rail {
    position: sticky;
    top: 0;
    align-self: start;
    max-height: 100vh;
    overflow-y: auto;
    padding: var(--sp-4) 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .rail-title {
    font-family: var(--f-mono);
    font-size: var(--step--1);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .rail-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .rail-link {
    display: grid;
    grid-template-columns: 1.9rem 1fr;
    align-items: baseline;
    gap: var(--sp-1);
    padding: var(--sp-1) var(--sp-2) var(--sp-1) 0;
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.9rem;
    border-left: 2px solid transparent;
    padding-left: var(--sp-2);
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .rail-link span:first-child {
    font-family: var(--f-mono);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: var(--ochre);
  }

  .rail-link:hover { color: var(--text); }
  .rail-link[aria-current="true"] {
    color: var(--text);
    border-left-color: var(--accent);
  }

  main { padding-top: var(--sp-4); min-width: 0; }

  /* ---------- masthead ---------- */

  .masthead {
    padding: var(--sp-5) 0 var(--sp-4);
    border-bottom: 1px solid var(--rule);
    position: relative;
  }

  .masthead::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 11rem;
    background-image:
      linear-gradient(to right, var(--rule) 1px, transparent 1px),
      linear-gradient(to bottom, var(--rule) 1px, transparent 1px);
    background-size: 2.25rem 2.25rem;
    opacity: 0.4;
    mask-image: linear-gradient(to bottom, black, transparent 78%);
    -webkit-mask-image: linear-gradient(to bottom, black, transparent 78%);
    pointer-events: none;
  }

  .eyebrow {
    font-family: var(--f-mono);
    font-size: var(--step--1);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    position: relative;
  }

  h1 {
    font-family: var(--f-display);
    font-size: var(--step-5);
    line-height: 1.02;
    letter-spacing: -0.02em;
    font-weight: 600;
    text-wrap: balance;
    margin-top: var(--sp-2);
    position: relative;
  }

  .lede {
    max-width: var(--col);
    margin-top: var(--sp-3);
    font-size: var(--step-1);
    color: var(--text-muted);
    position: relative;
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-4);
    margin-top: var(--sp-4);
    position: relative;
  }

  .fact-n {
    font-family: var(--f-mono);
    font-size: var(--step-3);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.03em;
    display: block;
  }

  .fact-l {
    font-family: var(--f-mono);
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  /* ---------- sections ---------- */

  section { padding-top: var(--sp-6); scroll-margin-top: var(--sp-3); }

  .sec-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    border-bottom: 1px solid var(--rule);
    padding-bottom: var(--sp-2);
    margin-bottom: var(--sp-3);
  }

  .sec-num {
    font-family: var(--f-mono);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    color: var(--ochre);
  }

  h2 {
    font-family: var(--f-display);
    font-size: var(--step-3);
    font-weight: 600;
    letter-spacing: -0.015em;
    text-wrap: balance;
  }

  h3 {
    font-family: var(--f-mono);
    font-size: var(--step--1);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-top: var(--sp-4);
    margin-bottom: var(--sp-2);
  }

  p, ul, ol { max-width: var(--col); }
  p + p { margin-top: var(--sp-2); }
  .prose > * + * { margin-top: var(--sp-2); }

  ul, ol { padding-left: 1.15rem; }
  li + li { margin-top: var(--sp-1); }

  a { color: var(--accent); text-underline-offset: 2px; }

  code {
    font-family: var(--f-mono);
    font-size: 0.86em;
    background: var(--surface-2);
    padding: 0.1em 0.34em;
    border-radius: var(--plate-radius);
  }

  strong { font-weight: 650; }

  /* ---------- plates ---------- */

  .plate {
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--plate-radius);
    padding: var(--sp-3);
    margin-top: var(--sp-3);
    position: relative;
  }

  .plate::after {
    content: "";
    position: absolute;
    top: 6px;
    right: 6px;
    width: 9px;
    height: 9px;
    border-top: 1px solid var(--rule-strong);
    border-right: 1px solid var(--rule-strong);
    pointer-events: none;
  }

  .plate-label {
    font-family: var(--f-mono);
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: var(--sp-2);
  }

  pre {
    font-family: var(--f-mono);
    font-size: 0.8rem;
    line-height: 1.55;
    background: var(--ink);
    color: #cfd8d4;
    border-radius: var(--plate-radius);
    padding: var(--sp-3);
    overflow-x: auto;
    margin-top: var(--sp-2);
  }

  pre code { background: none; padding: 0; font-size: inherit; }
  /* Token colors follow Zed's default One Dark palette. Weight and slant act
     as second cues, so the classes stay apart for red-green color blindness. */
  .cm { color: #747d8a; font-style: italic; }
  .kw { color: #c187d6; font-weight: 600; }
  .st { color: #a8cc7c; }
  .num { color: #cf9469; }
  .type { color: #ebc175; }
  .fn { color: #73ade9; }
  .prop { color: #d07277; }
  .var { color: #dbe1e8; }

  .caption {
    font-family: var(--f-mono);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    margin-top: var(--sp-1);
  }

  /* ---------- generic controls ---------- */

  button {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    cursor: pointer;
  }

  .btn {
    font-family: var(--f-mono);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 1px solid var(--rule-strong);
    border-radius: var(--plate-radius);
    padding: var(--sp-1) var(--sp-2);
    background: var(--surface);
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .btn:hover:not(:disabled) { background: var(--accent-soft); border-color: var(--accent); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .toolbar { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; }

  /* ---------- 1. layer explorer ---------- */

  .layers { display: flex; flex-direction: column; gap: var(--sp-2); }

  .layer-row {
    display: grid;
    grid-template-columns: 8.5rem minmax(0, 1fr);
    gap: var(--sp-2);
    align-items: start;
  }

  .layer-kind {
    font-family: var(--f-mono);
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding-top: 0.45rem;
  }

  .chips { display: flex; flex-wrap: wrap; gap: var(--sp-1); }

  .chip {
    font-family: var(--f-mono);
    font-size: 0.78rem;
    border: 1px solid var(--rule-strong);
    border-radius: var(--plate-radius);
    padding: 0.25rem 0.5rem;
    background: var(--surface);
    display: flex;
    gap: 0.45rem;
    align-items: baseline;
    transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
  }

  .chip small {
    font-size: 0.66rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .chip[aria-pressed="true"] {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--paper);
  }
  .chip[aria-pressed="true"] small { color: var(--paper); opacity: 0.75; }

  .chip.allowed { border-color: var(--accent); background: var(--accent-soft); }
  .chip.forbidden { opacity: 0.32; }

  .verdict {
    margin-top: var(--sp-3);
    border-top: 1px dashed var(--rule-strong);
    padding-top: var(--sp-2);
    max-width: var(--col);
  }

  .verdict-title { font-family: var(--f-mono); font-size: 0.85rem; color: var(--accent); }

  /* ---------- 2. mount stepper ---------- */

  .step-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: var(--sp-3);
  }

  .step-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 1px; }

  .step-btn {
    width: 100%;
    text-align: left;
    display: grid;
    grid-template-columns: 1.6rem 1fr;
    gap: var(--sp-2);
    align-items: baseline;
    font-family: var(--f-mono);
    font-size: 0.82rem;
    padding: 0.3rem var(--sp-2);
    border-left: 2px solid transparent;
    color: var(--text-muted);
  }

  .step-btn span:first-child { font-size: 0.7rem; color: var(--ochre); }
  .step-btn:hover { color: var(--text); background: var(--surface-2); }
  .step-btn[aria-current="true"] {
    border-left-color: var(--accent);
    color: var(--text);
    background: var(--surface-2);
  }
  .step-btn.done { color: var(--text); }

  .step-detail { display: flex; flex-direction: column; gap: var(--sp-2); }
  .step-why {
    border-left: 2px solid var(--ochre);
    padding-left: var(--sp-2);
    font-size: 0.92rem;
  }
  .step-why em { color: var(--ochre); font-style: normal; font-family: var(--f-mono); font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; display: block; }

  .registry { display: flex; flex-direction: column; gap: var(--sp-2); }
  .reg-line { font-family: var(--f-mono); font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }
  .reg-chip {
    font-family: var(--f-mono);
    font-size: 0.72rem;
    padding: 0.15rem 0.4rem;
    border-radius: var(--plate-radius);
    background: var(--surface-2);
    border: 1px solid var(--rule);
  }
  .reg-chip.fresh { background: var(--accent); border-color: var(--accent); color: var(--paper); }

  /* ---------- 3. tile demo ---------- */

  .tilewrap { overflow-x: auto; }

  .tilegrid {
    display: grid;
    gap: 2px;
    width: max-content;
    margin: 0 auto;
  }

  .cell {
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--rule);
    border-radius: 1px;
    background: var(--surface-2);
    font-family: var(--f-mono);
    font-size: 0.55rem;
    color: transparent;
    display: grid;
    place-items: center;
    transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
  }

  .cell.revealed { background: var(--accent-soft); border-color: var(--accent); color: var(--text-muted); }
  .cell.party { background: var(--accent); border-color: var(--accent); color: var(--paper); }
  .cell:hover { color: var(--text); border-color: var(--rule-strong); }

  .readout {
    font-family: var(--f-mono);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
    margin-top: var(--sp-2);
  }
  .readout b { color: var(--accent); font-weight: 600; }

  /* ---------- 4. pipeline ---------- */

  .bars { display: flex; flex-direction: column; gap: var(--sp-2); }

  .bar-row {
    display: grid;
    grid-template-columns: 9.5rem minmax(0, 1fr) 5.5rem;
    gap: var(--sp-2);
    align-items: center;
    width: 100%;
    text-align: left;
    padding: 0.2rem 0;
  }

  .bar-name { font-family: var(--f-mono); font-size: 0.76rem; letter-spacing: 0.05em; }
  .bar-track { height: 1.15rem; background: var(--surface-2); border-radius: 1px; position: relative; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--accent); width: 0; transition: width 0.5s cubic-bezier(0.2, 0.7, 0.2, 1); }
  .bar-row[aria-pressed="true"] .bar-fill { background: var(--ochre); }
  .bar-row:hover .bar-track { outline: 1px solid var(--rule-strong); }
  .bar-val { font-family: var(--f-mono); font-size: 0.76rem; font-variant-numeric: tabular-nums; text-align: right; color: var(--text-muted); }

  /* ---------- 5. router ---------- */

  .router { display: flex; flex-direction: column; gap: var(--sp-3); }
  .q { font-family: var(--f-display); font-size: var(--step-2); text-wrap: balance; }
  .opts { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .opt {
    border: 1px solid var(--rule-strong);
    border-radius: var(--plate-radius);
    padding: var(--sp-2) var(--sp-3);
    background: var(--surface);
    text-align: left;
    max-width: 20rem;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .opt:hover { border-color: var(--accent); background: var(--accent-soft); }
  .opt b { display: block; }
  .opt small { color: var(--text-muted); }

  .answer { border-left: 3px solid var(--accent); padding-left: var(--sp-3); }
  .answer dt { font-family: var(--f-mono); font-size: 0.7rem; letter-spacing: 0.13em; text-transform: uppercase; color: var(--text-muted); margin-top: var(--sp-2); }
  .answer dd { font-size: 0.95rem; }
  .answer dd code { font-size: 0.85em; }

  .breadcrumbs { font-family: var(--f-mono); font-size: 0.72rem; color: var(--text-muted); }

  /* ---------- 6. commands ---------- */

  .cmds { display: flex; flex-direction: column; gap: 1px; }
  .cmd {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--sp-2);
    align-items: center;
    padding: var(--sp-2);
    border-bottom: 1px solid var(--rule);
  }
  .cmd:last-child { border-bottom: none; }
  .cmd-code { font-family: var(--f-mono); font-size: 0.8rem; overflow-x: auto; white-space: nowrap; }
  .cmd-note { font-size: 0.82rem; color: var(--text-muted); }
  .warn { color: var(--danger); }

  /* ---------- 7. checklist ---------- */

  .checks { display: flex; flex-direction: column; gap: 1px; max-width: var(--col); }
  .check {
    display: grid;
    grid-template-columns: 1.4rem minmax(0, 1fr);
    gap: var(--sp-2);
    align-items: start;
    padding: var(--sp-2) 0;
    border-bottom: 1px solid var(--rule);
    text-align: left;
    width: 100%;
  }
  .check-box {
    width: 1rem;
    height: 1rem;
    border: 1px solid var(--rule-strong);
    border-radius: 1px;
    margin-top: 0.28rem;
    display: grid;
    place-items: center;
    font-size: 0.7rem;
    color: transparent;
  }
  .check[aria-pressed="true"] .check-box { background: var(--accent); border-color: var(--accent); color: var(--paper); }
  .check[aria-pressed="true"] .check-text { color: var(--text-muted); text-decoration: line-through; text-decoration-color: var(--rule-strong); }
  .check-text { font-size: 0.93rem; }
  .check-text small { display: block; color: var(--text-muted); font-size: 0.8rem; text-decoration: none; }

  .progress { font-family: var(--f-mono); font-size: 0.8rem; color: var(--accent); margin-top: var(--sp-2); }

  footer {
    margin-top: var(--sp-6);
    padding-top: var(--sp-3);
    border-top: 1px solid var(--rule);
    font-family: var(--f-mono);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  @media (max-width: 62rem) {
    .shell { grid-template-columns: minmax(0, 1fr); gap: 0; }
    .rail { position: static; max-height: none; border-bottom: 1px solid var(--rule); }
    .rail-list { flex-direction: row; flex-wrap: wrap; }
    .rail-link { border-left: none; border-bottom: 2px solid transparent; }
    .rail-link[aria-current="true"] { border-left-color: transparent; border-bottom-color: var(--accent); }
    .step-grid { grid-template-columns: minmax(0, 1fr); }
    h1 { font-size: var(--step-4); }
  }

  @media (prefers-reduced-motion: reduce) {
    * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
  }
`;
