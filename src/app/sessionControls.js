import { mustGetElement } from '../ui/dom.js';
import { mountThemeToggle } from '../ui/ThemeToggle.js';
import { wireTabs } from '../ui/Tabs.js';
import { GM_LOCK_KEY, createHeartbeatLock } from '../storage/GMLock.js';
import { isPlayerLocked, PLAYER_LOCK_SESSION_KEY } from '../view/PlayerLock.js';
import { confirmModal } from '../ui/Modal.js';
import { iconButton, segSwitch } from '../ui/buttons.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/app.js').AppMode} AppMode */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * This wires the header's two view switches (Play/Build mode, and GM/Player
 * role, the latter guarded by the cross-tab GM lock), the sidebar tab
 * group, and the sidebar collapse toggle. It registers `setMode` on
 * `app.actions`. It delegates the map-specific consequences of a switch to
 * mapWiring's onModeChanged and onRoleChanged.
 * @param {AppContext} app
 */
export function wireSessionControls(app) {
  // A tab locked to the Player view, through a `?role=player` URL or the
  // header's lock control, can never show the GM's truth. The role is
  // forced to player, the role switch is hidden, and the switch callback
  // refuses GM as a backstop. This is for a shared table display that a
  // stray tap must not flip.
  let playerLocked = isPlayerLocked(
    location.search,
    sessionStorage.getItem(PLAYER_LOCK_SESSION_KEY),
  );
  if (playerLocked) {
    app.state.role = 'player';
    document.body.classList.add('role-locked');
  }

  // Play, Build, and Library mode drive which rails the layout shows,
  // through a body class toggled by CSS, and default to Play so a
  // first-run visitor lands on the live view. All three are the same app
  // over the same campaign data. Play is the live-session view, Build is
  // the campaign-authoring view, and Library edits the reusable template
  // collection that lives outside any campaign.
  const modeSwitch = segSwitch({
    ariaLabel: 'App mode',
    options: [
      { value: /** @type {AppMode} */ ('play'), icon: 'dice', label: 'Play' },
      { value: /** @type {AppMode} */ ('build'), icon: 'edit', label: 'Build' },
      { value: /** @type {AppMode} */ ('library'), icon: 'scroll', label: 'Library' },
    ],
    value: app.state.mode,
    onChange: (mode) => {
      // Combat mode is the full-width fight view. The app enters it while
      // a fight is running, not through the switch, which has no button
      // for it here. A request for it with no fight lands on Play instead,
      // so a stale setMode can never show an empty combat screen. The code
      // syncs the switch itself afterwards, because during the initial
      // mount it is still being constructed.
      if (mode === 'combat' && app.state.combat === null) {
        mode = 'play';
        queueMicrotask(() => modeSwitch.sync('play'));
      }
      app.state.mode = mode;
      document.body.classList.toggle('mode-play', mode === 'play');
      document.body.classList.toggle('mode-build', mode === 'build');
      document.body.classList.toggle('mode-library', mode === 'library');
      document.body.classList.toggle('mode-combat', mode === 'combat');
      app.actions.onModeChanged(mode);
      // The combat screen moves the dice tray to a new home on entry and
      // exit, so every mode change must reach it, not only the fight's own
      // refresh paths.
      app.views.combatScreen.update();
    },
  });
  mustGetElement('mode-switch-container').appendChild(modeSwitch.element);
  // Apply the starting mode's body classes. Do not assume the markup
  // already carries them.
  modeSwitch.setValue(app.state.mode);
  app.actions.setMode = (mode) => modeSwitch.setValue(mode);

  // The light/dark toggle is a per-browser viewer preference. It lives
  // outside the GM-only header actions and stays visible in the Player role.
  mountThemeToggle(mustGetElement('theme-toggle-container'));

  // Viewer role (GM versus player) is independent of Play/Build. It
  // changes what the panels show, not what the operator can do. Player
  // role is read-only, so it forces Play mode, and a body class hides the
  // authoring and header controls through CSS. The panels re-render
  // against the new role.
  function applyRole() {
    const role = app.state.role;
    document.body.classList.toggle('role-player', role === 'player');
    document.body.classList.toggle('role-gm', role === 'gm');
    // Build and Library are authoring, so the Player view leaves them.
    // Combat is not authoring: a player takes their own turn on that
    // screen, and moving them to the map takes the fight away from
    // them.
    if (role === 'player' && app.state.mode !== 'combat') modeSwitch.setValue('play');
    app.actions.onRoleChanged(role);
    // Re-render the party panels. Their edit controls depend on the role,
    // and, in the Player view, on this tab's character binding.
    app.actions.refreshSelectedCharacter();
    app.views.encounterPanel.update();
    // A fight already running has GM-only controls in it, the turn flow
    // and the action strip, so the role change must reach it. Do not wait
    // for the next event that refreshes the panel.
    app.views.initiativePanel.update();
    app.views.handoutPanel.update();
    app.views.npcPanel.update();
    app.views.questPanel.update();
  }

  // Only one tab at a time can hold the GM view. The GM tab keeps a
  // heartbeat lock in localStorage. Any other tab that opens as GM, or
  // switches to GM, while that lock is live is forced into the Player view
  // instead. The lock expires on its own if the GM tab crashes, and is
  // released on a clean close or a switch to Player. Its onYield covers the
  // case where this tab was frozen past the TTL and another tab took over
  // GM: this tab yields rather than run two GM views.
  const gmLock = createHeartbeatLock({
    onYield: () => {
      app.toasts.show('Another tab took over the GM view; this one switched to the Player view.');
      roleSwitch.setValue('player');
    },
  });

  // Viewer role is independent of the mode switch above. Mode is what the
  // operator is doing, authoring or running. Role is who the screen is
  // for. The change callback references roleSwitch, but only through
  // queueMicrotask or later events, so the const is initialized before any
  // read.
  const roleSwitch = segSwitch({
    ariaLabel: 'Viewer',
    options: [
      { value: /** @type {ViewRole} */ ('gm'), icon: 'shield', label: 'GM' },
      { value: /** @type {ViewRole} */ ('player'), icon: 'eye', label: 'Player' },
    ],
    value: app.state.role,
    onChange: (next) => {
      let role = next;
      if (role === 'gm' && playerLocked) {
        // This is a backstop. The switch is hidden while locked, but
        // nothing else can claim GM in this tab either, for example a
        // programmatic setValue.
        role = 'player';
        queueMicrotask(() => roleSwitch.setValue('player'));
      }
      if (role === 'gm' && !gmLock.claim(GM_LOCK_KEY)) {
        app.toasts.show('Another tab is running the GM view; this one stays on the Player view.');
        role = 'player';
        // During the initial mount the switch is still being constructed.
        // Sync its buttons to the forced role once it exists. setValue
        // re-enters this callback, which settles immediately on the player
        // branch.
        queueMicrotask(() => roleSwitch.setValue('player'));
      }
      if (role === 'player') gmLock.release();
      app.state.role = role;
      sessionStorage.setItem('campaign-builder:role', role);
      applyRole();
    },
  });
  mustGetElement('role-switch-container').appendChild(roleSwitch.element);
  // Run the consequences for the starting role, exactly as a click does.
  roleSwitch.setValue(app.state.role);

  // A settled Player tab, for example a shared table display, can be
  // locked so a stray tap cannot flip it to GM once the GM tab closes and
  // frees the GM lock. This lock is per tab and deliberately one-way: to
  // unlock, close the tab, or drop the ?role=player URL parameter. The
  // lock button shows only while already in the Player role.
  const lockBtn = iconButton('lock', 'Lock this tab to the Player view', async () => {
    const ok = await confirmModal(
      'Lock this tab to the Player view? The GM view stays unavailable in this tab until it is closed.',
      { confirmLabel: 'Lock' },
    );
    if (!ok) return;
    sessionStorage.setItem(PLAYER_LOCK_SESSION_KEY, '1');
    playerLocked = true;
    document.body.classList.add('role-locked');
    app.toasts.show('This tab is locked to the Player view. Close the tab to unlock it.');
  });
  // The stylesheet hides this button outside the Player role, by id.
  lockBtn.id = 'player-lock-btn';
  mustGetElement('role-switch-container').appendChild(lockBtn);

  // Group the Play sidebar panels into Session, Story, and Log tabs. This
  // gives the story panels (quests, NPCs, handouts) and the travelogue
  // their own space instead of one long scroll.
  wireTabs(mustGetElement('sidebar-tabs'));

  // Collapse the Play sidebar to give the map the full width during a
  // session.
  const sidebarToggle = /** @type {HTMLButtonElement} */ (mustGetElement('sidebar-toggle'));
  sidebarToggle.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    sidebarToggle.textContent = collapsed ? 'Show panels' : 'Hide panels';
  });
}
