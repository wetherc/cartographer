/**
 * The before-paint script. `index.html` loads this as a plain, blocking
 * script at the top of `<body>`, ahead of the module graph, so it runs
 * before the browser paints anything.
 *
 * It first pins the saved theme, so a reload never flashes the wrong
 * scheme. The key and values mirror `src/view/Theme.js`.
 *
 * It then pins the viewer role. Mode and role each decide whether whole
 * regions of the layout are displayed: a mode hides an 18rem rail, a player
 * role hides the header actions. Letting `src/app/sessionControls.js` apply
 * them after the modules load lays the page out once and then jumps it.
 * Play mode is always the starting mode, so the body's class attribute
 * states it outright; only the role has to be read. The defaults mirror
 * `src/main.js` and the keys mirror `src/view/PlayerLock.js`.
 *
 * Last, it shows a notice when the module graph fails to load, because the
 * page is otherwise blank with no message.
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

// A module script fires `error` when it or any module it imports fails to
// load. A server that resets connections under load, such as
// `python3 -m http.server`, causes this. The event does not bubble, so a
// capture listener on window catches it. The Content Security Policy blocks
// inline handlers, so the listener lives here, in the script that runs
// before the module graph.
window.addEventListener(
  'error',
  (event) => {
    const script = event.target;
    if (!(script instanceof HTMLScriptElement) || script.type !== 'module') return;
    if (document.getElementById('load-error')) return;
    const notice = document.createElement('div');
    notice.id = 'load-error';
    notice.className = 'load-error';
    notice.setAttribute('role', 'alert');
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'btn';
    reload.textContent = 'Reload';
    reload.addEventListener('click', () => location.reload());
    const text = document.createElement('p');
    text.textContent =
      'Campaign Builder could not load all of its files. Reload the page to try again.';
    notice.append(text, reload);
    document.body.prepend(notice);
  },
  true,
);
