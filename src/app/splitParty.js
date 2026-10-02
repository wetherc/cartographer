/**
 * This module is the GM's "allow splitting the party" switch, and the
 * regroup step it forces on the way back. The switch is off by default: no
 * individual tokens or name labels appear, and every character moves with
 * the party marker. When on, each character can stand on its own tile, which
 * `party/CharacterTokens.js` tracks.
 */

import { el } from '../ui/dom.js';
import { promptModal } from '../ui/Modal.js';
import {
  isSplit,
  characterPosition,
  recallAll,
  regroupCandidates,
} from '../party/CharacterTokens.js';
import { describeTile } from '../map/TileCoords.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Mount the switch. `refreshRoster` redraws the roster, whose per-character
 * place buttons exist only while splitting is allowed. The panel owns that
 * list, so it passes the redraw function in instead of this module reaching
 * the panel directly.
 * @param {AppContext} app
 * @param {{ container: HTMLElement, refreshRoster: () => void }} deps
 * @returns {{ update: () => void }} `update` re-reads the switch from state,
 *   for a tab that follows another tab's saves
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

  /** Refresh everything the switch changes: tokens, labels, and roster place buttons. */
  function syncSplitViews() {
    app.actions.syncPartyMarker();
    refreshRoster();
    app.actions.markDirty();
  }

  /**
   * Gather the whole party at one member's position before disallowing the
   * split. The GM picks the character, and everyone teleports to where that
   * character stands. A member still with the party stands at the current
   * party tile. This resolves to false when the GM cancels, and the switch
   * stays on. A character placed on a node that no longer exists is left out
   * of the picker, and counts as standing with the party. When nobody is
   * left to pick, the party regroups at its own marker without a prompt.
   * @returns {Promise<boolean>}
   */
  async function regroupParty() {
    if (!isSplit(state.characters)) return true;
    /** @param {string} nodeId */
    const nodeExists = (nodeId) => Boolean(app.grid.getNode(nodeId));
    const party = app.partyTracker.getPosition();
    const candidates = regroupCandidates(state.characters, nodeExists);
    /** @type {import('../types/entities.js').Character | null} */
    let chosen = null;
    if (candidates.length) {
      const values = await promptModal(
        'Regroup the party',
        [
          {
            name: 'at',
            label: 'Teleport everyone to',
            type: 'select',
            options: candidates.map((c) => {
              const at = characterPosition(c, party);
              const node = app.grid.getNode(at.nodeId);
              return {
                value: c.id,
                label: c.location
                  ? `${c.name} — ${node?.name ?? at.nodeId} (${describeTile(at.tileId)})`
                  : `${c.name} — with the party`,
              };
            }),
          },
        ],
        { submitLabel: 'Regroup' },
      );
      if (!values) return false;
      chosen = candidates.find((c) => c.id === values.at) ?? null;
      if (!chosen) return false;
    }
    const target = chosen ? characterPosition(chosen, party, nodeExists) : party;
    app.partyTracker.moveTo(target.nodeId, target.tileId);
    state.characters = recallAll(state.characters);
    app.views.mapCanvas.refreshNode(app.navigator.getCurrentNode());
    app.views.regionTree.update();
    // Regrouping moves the party, and can carry it off a running fight's tile.
    app.actions.syncCombatLocation();
    app.views.encounterPanel.update();
    app.views.initiativePanel.update();
    app.views.npcPanel.update();
    app.views.handoutPanel.update();
    const node = app.grid.getNode(target.nodeId);
    app.actions.logEvent(
      'travel',
      `The party regroups ${chosen ? `at ${chosen.name}'s position ` : ''}in ${node?.name ?? target.nodeId} (${describeTile(target.tileId)}).`,
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
      toggle.checked = true; // cancelled, so the party stays split
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
