import { mustGetElement } from '../ui/dom.js';
import { mountModeSwitch } from '../ui/ModeSwitch.js';
import { mountRoleSwitch } from '../ui/RoleSwitch.js';
import { wireTabs } from '../ui/Tabs.js';
import {
  GM_LOCK_KEY,
  GM_LOCK_HEARTBEAT,
  claimLock,
  isHeldByOther,
  loadLock,
  saveLock,
  releaseLock,
} from '../storage/GMLock.js';
import { isPlayerLocked, PLAYER_LOCK_SESSION_KEY } from '../view/PlayerLock.js';
import { confirmModal } from '../ui/Modal.js';
import { icon } from '../ui/icons.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The header's two view switches (Play/Build mode, GM/Player role, the latter
 * guarded by the cross-tab GM lock), the sidebar tab group, and the sidebar
 * collapse toggle. Registers `setMode` on `app.actions`; delegates the
 * map-specific consequences of a switch to mapWiring's onModeChanged /
 * onRoleChanged.
 * @param {AppContext} app
 */
export function wireSessionControls(app) {
  // A tab locked to the Player view (a `?role=player` URL or the header's lock
  // control) can never show the GM's truth: the role is forced to player, the
  // role switch is hidden, and the switch callback refuses GM as a backstop.
  // Meant for a shared table display that a stray tap must not flip.
  let playerLocked = isPlayerLocked(location.search, sessionStorage.getItem(PLAYER_LOCK_SESSION_KEY));
  if (playerLocked) {
    app.state.role = 'player';
    document.body.classList.add('role-locked');
  }

  // Play/Build mode drives which rails the layout shows (a body class toggled
  // by CSS), and defaults to Play so a first-run visitor lands on the live view.
  const modeSwitch = mountModeSwitch(mustGetElement('mode-switch-container'), app.state.mode, (mode) => {
    app.state.mode = mode;
    document.body.classList.toggle('mode-play', mode === 'play');
    document.body.classList.toggle('mode-build', mode === 'build');
    app.actions.onModeChanged(mode);
  });
  app.actions.setMode = (mode) => modeSwitch.setMode(mode);

  // Viewer role (GM vs player) is orthogonal to Play/Build: it changes what the
  // panels reveal, not what the operator can do. Player role is read-only, so it
  // forces Play mode and a body class hides the authoring/header affordances via
  // CSS; the panels re-render against the new role.
  function applyRole() {
    const role = app.state.role;
    document.body.classList.toggle('role-player', role === 'player');
    document.body.classList.toggle('role-gm', role === 'gm');
    if (role === 'player') modeSwitch.setMode('play');
    app.actions.onRoleChanged(role);
    app.views.encounterPanel.update();
    app.views.handoutPanel.update();
    app.views.npcPanel.update();
    app.views.questPanel.update();
  }

  // Only one tab at a time may hold the GM view: the GM tab keeps a heartbeat
  // lock in localStorage, and any other tab that opens as (or switches to) GM
  // while it's live is forced into the Player view instead. The lock expires on
  // its own if the GM tab crashes, and is released on a clean close or a switch
  // to Player.
  const gmTabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  /** @type {ReturnType<typeof setInterval> | null} */
  let gmHeartbeat = null;

  function tryClaimGM() {
    const next = claimLock(loadLock(), gmTabId, Date.now());
    if (!next) return false;
    saveLock(next);
    if (gmHeartbeat === null) {
      gmHeartbeat = setInterval(() => saveLock({ id: gmTabId, at: Date.now() }), GM_LOCK_HEARTBEAT);
    }
    return true;
  }

  function dropGMClaim() {
    if (gmHeartbeat !== null) clearInterval(gmHeartbeat);
    gmHeartbeat = null;
    releaseLock(gmTabId);
  }

  // The change callback references roleSwitch, but only via queueMicrotask /
  // later events, so the const is initialized before any read.
  const roleSwitch = mountRoleSwitch(mustGetElement('role-switch-container'), app.state.role, (role) => {
    if (role === 'gm' && playerLocked) {
      // Backstop: the switch is hidden while locked, but nothing else may
      // claim GM in this tab either (e.g. a programmatic setRole).
      role = 'player';
      queueMicrotask(() => roleSwitch.setRole('player'));
    }
    if (role === 'gm' && !tryClaimGM()) {
      app.toasts.show('Another tab is running the GM view; this one stays on the Player view.');
      role = 'player';
      // During the initial mount the switch is still being constructed; sync its
      // buttons to the forced role once it exists. setRole re-enters this
      // callback, which settles immediately on the player branch.
      queueMicrotask(() => roleSwitch.setRole('player'));
    }
    if (role === 'player') dropGMClaim();
    app.state.role = role;
    sessionStorage.setItem('campaign-builder:role', role);
    applyRole();
  });

  // A settled Player tab (a shared table display) can be locked so a stray tap
  // can't flip it to GM once the GM tab closes and frees the GM lock. Per-tab
  // and deliberately one-way: unlock by closing the tab (or dropping the
  // ?role=player URL parameter). Only visible while already in the Player role.
  const lockBtn = document.createElement('button');
  lockBtn.type = 'button';
  lockBtn.id = 'player-lock-btn';
  lockBtn.className = 'btn btn--icon';
  lockBtn.title = 'Lock this tab to the Player view';
  lockBtn.setAttribute('aria-label', 'Lock this tab to the Player view');
  lockBtn.appendChild(icon('lock'));
  lockBtn.addEventListener('click', async () => {
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
  mustGetElement('role-switch-container').appendChild(lockBtn);

  // Free the lock when the GM tab goes away so a follower can take over without
  // waiting out the TTL. pagehide also covers tab discard and navigation.
  window.addEventListener('pagehide', () => {
    if (app.state.role === 'gm') dropGMClaim();
  });

  // Belt and braces: if another tab somehow claims the lock while this tab is
  // GM (e.g. this tab was frozen past the TTL and its lock was taken over),
  // yield to it rather than run two GM views.
  window.addEventListener('storage', (event) => {
    if (event.key !== GM_LOCK_KEY || app.state.role !== 'gm') return;
    if (isHeldByOther(loadLock(), gmTabId, Date.now())) {
      if (gmHeartbeat !== null) clearInterval(gmHeartbeat);
      gmHeartbeat = null;
      app.toasts.show('Another tab took over the GM view; this one switched to the Player view.');
      roleSwitch.setRole('player');
    }
  });

  // Group the Play sidebar panels into Session / Story / Log tabs so the story
  // panels (quests, NPCs, handouts) and travelogue get their own space instead
  // of a single long scroll.
  wireTabs(mustGetElement('sidebar-tabs'));

  // Collapse the Play sidebar to give the map the full width during a session.
  const sidebarToggle = /** @type {HTMLButtonElement} */ (mustGetElement('sidebar-toggle'));
  sidebarToggle.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    sidebarToggle.textContent = collapsed ? 'Show panels' : 'Hide panels';
  });
}
