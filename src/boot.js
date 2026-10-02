/**
 * The before-paint script. `index.html` loads this as a plain, blocking
 * script at the top of `<body>`, ahead of the module graph, so it runs
 * before the browser paints anything. It has two jobs, in this order.
 *
 * First, it pins the saved theme, so a reload never flashes the wrong
 * scheme. The key and values mirror `src/view/Theme.js`.
 *
 * Second, it pins the viewer role. Mode and role each decide whether whole
 * regions of the layout are displayed: a mode hides an 18rem rail, a player
 * role hides the header actions. Letting `src/app/sessionControls.js` apply
 * them after the modules load lays the page out once and then jumps it.
 * Play mode is always the starting mode, so the body's class attribute
 * states it outright; only the role has to be read. The defaults mirror
 * `src/main.js` and the keys mirror `src/view/PlayerLock.js`.
 *
 * This file is a script, not a module, so the page's Content Security
 * Policy can name `'self'` alone for scripts and allow nothing inline. It
 * imports nothing and exports nothing. `tests/moduleLoad.test.js` skips it
 * for the same reason it skips `main.js`: loading it needs a document.
 */

try {
  const theme = localStorage.getItem('campaign-builder:theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Storage is unavailable: the OS preference stands.
}

try {
  const param = new URLSearchParams(location.search).get('role');
  const locked =
    (param !== null && param.toLowerCase() === 'player') ||
    sessionStorage.getItem('campaign-builder:player-lock') !== null;
  const role = locked ? 'player' : sessionStorage.getItem('campaign-builder:role') || 'gm';
  document.body.classList.toggle('role-gm', role === 'gm');
  document.body.classList.toggle('role-player', role === 'player');
  if (locked) document.body.classList.add('role-locked');
} catch {
  // Storage is unavailable: the GM default in the class attribute stands.
}
