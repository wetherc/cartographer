import { mustGetElement } from '../ui/dom.js';
import { mountCombatScreen } from '../ui/CombatScreen.js';
import { buildCombatView } from '../combat/CombatView.js';
import { buildLoadout, loadoutAccess } from '../combat/Loadout.js';
import { drop as dropConcentration } from '../entities/Concentration.js';
import { isGM } from '../view/ViewRole.js';
import {
  applyToTarget,
  endSpellEffects,
  findCombatant,
  spellsOf,
  weaponsOf,
} from './combatants.js';
import { weaponAttack } from './weaponAttack.js';
import { castSpellAction } from './spellCast.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The combat screen: the full-width board shown in combat mode. Owns no
 * combat state (encounterWiring holds the running fight and writes
 * `state.combat`); this module projects it through `buildCombatView`, routes
 * the screen's turn controls to the actions encounterWiring registers, and
 * keeps only the transient choice of which combatant the screen is
 * inspecting. Mounted before wireEncounters so `app.views.combatScreen`
 * exists by the time the fight's refresh paths run.
 * @param {AppContext} app
 */
export function wireCombatScreen(app) {
  const { state } = app;

  /** The ribbon-picked combatant the left column details, or null for
   * whoever's turn it is. Per tab and never persisted. */
  let inspectedId = /** @type {string | null} */ (null);

  /** The board-picked target the next attack or cast opens on, or null for
   * none. As transient as the inspection; a stale id (target defeated, fight
   * over) matches nothing and the dialogs fall back to their own defaults. */
  let selectedTargetId = /** @type {string | null} */ (null);

  const screen = mountCombatScreen(mustGetElement('combat-screen'), {
    getView: () => {
      if (!state.combat) return null;
      return buildCombatView(state.combat, (id) => findCombatant(app, id), {
        gm: isGM(state.role),
        // Registered by partyWiring, which mounts later, so a reload with a
        // fight running draws its first frame before the binding reader
        // exists; that frame treats the tab as unbound, and the next refresh
        // corrects it. Same allowance InitiativePanel's canAttack makes.
        boundCharacterId: app.actions.getBoundCharacterId?.() ?? null,
      });
    },
    isGM: () => isGM(state.role),
    onNext: () => app.actions.advanceCombatTurn(),
    onEnd: () => app.actions.endCombat(),
    // Leaving is a view change only: the fight keeps running, and the Play
    // sidebar's status card offers the way back in.
    onLeave: () => app.actions.setMode('play'),
    getInspectedId: () => inspectedId,
    onInspect: (id) => {
      inspectedId = id;
    },
    getSelectedTargetId: () => selectedTargetId,
    // Clicking the held card releases it, so the toggle reads like a checkbox.
    onSelectTarget: (id) => {
      selectedTargetId = selectedTargetId === id ? null : id;
    },
    // The current turn's weapons and spells, the same derivations the sidebar
    // strip used; the screen decides whether to offer them (viewer may act).
    getActions: () => {
      const active = state.combat ? state.combat.order[state.combat.index] : null;
      if (!active) return { weapons: [], spells: [] };
      return { weapons: weaponsOf(app, active.id), spells: spellsOf(app, active.id) };
    },
    // What one combatant brings, trimmed to what this tab is allowed to know:
    // the GM sees every sheet, a player sees their own character in full and
    // everyone else's armor and weapons only. The spell list is resolved here,
    // where the merged library is reachable, and only when the viewer may have
    // it, so a player tab never assembles another player's prepared spells.
    getLoadout: (id) => {
      const found = findCombatant(app, id);
      const access = loadoutAccess(
        found,
        {
          gm: isGM(state.role),
          boundCharacterId: app.actions.getBoundCharacterId?.() ?? null,
        },
        id,
      );
      return buildLoadout(found, access === 'full' ? spellsOf(app, id) : [], access);
    },
    onWeaponAttack: (weapon) => {
      const combat = state.combat;
      if (!combat) return;
      weaponAttack(app, combat, combat.order[combat.index], weapon, {
        defenderId: selectedTargetId,
      });
    },
    onCastSpell: (spell) => {
      const combat = state.combat;
      if (!combat) return;
      castSpellAction(app, combat, combat.order[combat.index], spell, {
        targetId: selectedTargetId,
      });
    },
    // The one write path every hit uses; it stores, logs the transitions, and
    // refreshes this screen along with the other panels.
    onApplyHP: (id, amount, isHeal) => applyToTarget(app, id, amount, isHeal),
    getConcentration: (id) => {
      const found = findCombatant(app, id);
      return found?.kind === 'character' ? (found.entity.concentration ?? null) : null;
    },
    // The character sheet's Drop path: store the released caster, then sweep
    // the spell's chips off everyone it was affecting.
    onDropConcentration: (id) => {
      const found = findCombatant(app, id);
      if (found?.kind !== 'character') return;
      const held = found.entity.concentration;
      if (!held) return;
      found.store(dropConcentration(found.entity));
      app.actions.markDirty();
      endSpellEffects(app, id, held.spellId);
    },
    // The log column shows the fight's slice of the travelogue: the combat
    // lines and dice rolls logged since this fight's setup opened, newest
    // first. Without the time bound the column replayed every battle the
    // campaign ever logged. An older save's fight carries startedAt 0 and
    // still shows everything.
    getLogEntries: () => {
      const since = state.combat?.startedAt ?? 0;
      return state.travelog.filter(
        (entry) => entry.at >= since && (entry.kind === 'combat' || entry.kind === 'roll'),
      );
    },
  });

  // The app has one dice tray, and the screen borrows it whole: the tray's
  // card moves into the log column while combat mode is active and back to
  // its below-map spot on exit. Moving the element keeps diceWiring's handle
  // valid — the tray is mounted once and never re-resolved. The home position
  // is captured here, before anything can have moved it.
  const trayCard = mustGetElement('dice-tray-container');
  const trayHome = { parent: trayCard.parentElement, next: trayCard.nextSibling };
  function syncDiceDock() {
    const docked = trayCard.parentElement === screen.diceDock;
    if (state.mode === 'combat' && !docked) {
      screen.diceDock.appendChild(trayCard);
    } else if (state.mode !== 'combat' && docked) {
      trayHome.parent?.insertBefore(trayCard, trayHome.next);
    }
  }

  // Every refresh path lands here, including the mode switch itself
  // (sessionControls updates this view on every mode change), so the dock
  // stays in step without a second observer.
  app.views.combatScreen = {
    update: () => {
      syncDiceDock();
      screen.update();
    },
  };
}
