/**
 * The GM's "allow splitting the party" switch and the regroup it forces on the
 * way back. Off by default: no individual tokens or name labels, and everyone
 * moves with the party marker. On, each character can stand on its own tile,
 * which is what `party/CharacterTokens.js` tracks.
 */

import { el } from '../ui/dom.js';
import { promptModal } from '../ui/Modal.js';
import { isSplit, characterPosition, recallAll } from '../party/CharacterTokens.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Mount the switch. `refreshRoster` redraws the roster, whose per-character
 * place buttons only exist while splitting is allowed; the panel owns that list,
 * so it hands the redraw in rather than being reached from here.
 * @param {AppContext} app
 * @param {{ container: HTMLElement, refreshRoster: () => void }} deps
 * @returns {{ update: () => void }} `update` re-reads the switch from state, for
 *   a tab following another tab's saves
 */
export function wireSplitParty(app, { container, refreshRoster }) {
  const { state } = app;

  const toggle = el('input');
  toggle.type = 'checkbox';
  toggle.checked = state.splitParty;
  toggle.setAttribute('aria-label', 'Allow splitting the party');
  const field = el(
    'label',
    'party-split u-row u-g2 u-muted',
    toggle,
    el('span', '', 'Allow splitting the party'),
  );
  container.appendChild(field);

  /** Refresh everything the switch changes: tokens/labels, roster place buttons. */
  function syncSplitViews() {
    app.actions.syncPartyMarker();
    refreshRoster();
    app.actions.markDirty();
  }

  /**
   * Gather the whole party at one member's position before disallowing the
   * split: the GM picks the character, everyone teleports to where they stand
   * (a member still with the party means the current party tile). Resolves
   * false when the GM cancels, leaving the switch on.
   * @returns {Promise<boolean>}
   */
  async function regroupParty() {
    if (!isSplit(state.characters)) return true;
    const values = await promptModal(
      'Regroup the party',
      [
        {
          name: 'at',
          label: 'Teleport everyone to',
          type: 'select',
          options: state.characters.map((c) => {
            const at = characterPosition(c, app.partyTracker.getPosition());
            const node = app.grid.getNode(at.nodeId);
            return {
              value: c.id,
              label: c.location
                ? `${c.name} — ${node?.name ?? at.nodeId} (tile ${at.tileId})`
                : `${c.name} — with the party`,
            };
          }),
        },
      ],
      { submitLabel: 'Regroup' },
    );
    if (!values) return false;
    const chosen = state.characters.find((c) => c.id === values.at);
    if (!chosen) return false;
    const target = characterPosition(chosen, app.partyTracker.getPosition());
    app.partyTracker.moveTo(target.nodeId, target.tileId);
    state.characters = recallAll(state.characters);
    app.views.mapCanvas.refreshNode(app.navigator.getCurrentNode());
    app.views.regionTree.update();
    // Regrouping moves the party, which can carry it off a running fight's tile.
    app.actions.syncCombatLocation();
    app.views.encounterPanel.update();
    app.views.initiativePanel.update();
    app.views.npcPanel.update();
    app.views.handoutPanel.update();
    const node = app.grid.getNode(target.nodeId);
    app.actions.logEvent(
      'travel',
      `The party regroups at ${chosen.name}'s position in ${node?.name ?? target.nodeId} (tile ${target.tileId}).`,
    );
    app.actions.maybeTriggerEncounter();
    return true;
  }

  toggle.addEventListener('change', async () => {
    if (toggle.checked) {
      state.splitParty = true;
      app.actions.logEvent('note', 'The GM allows the party to split up.');
      syncSplitViews();
      return;
    }
    const regrouped = await regroupParty();
    if (!regrouped) {
      toggle.checked = true; // cancelled: the party stays split
      return;
    }
    state.splitParty = false;
    app.actions.logEvent('note', 'The GM gathers the party; splitting up is no longer allowed.');
    syncSplitViews();
  });

  return {
    update: () => {
      toggle.checked = state.splitParty;
    },
  };
}
