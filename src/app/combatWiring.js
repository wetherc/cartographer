import { mustGetElement } from '../ui/dom.js';
import { mountCombatScreen } from '../ui/CombatScreen.js';
import { buildCombatView, isDowned } from '../combat/CombatView.js';
import { buildLoadout, loadoutAccess } from '../combat/Loadout.js';
import { canOffhand, offhandWeapons } from '../combat/TwoWeapon.js';
import { opportunityWeapons, reactionSpells } from '../combat/Reactions.js';
import { drop as dropConcentration } from '../entities/Concentration.js';
import { isGM } from '../view/ViewRole.js';
import {
  applyToTarget,
  endSpellEffects,
  findCombatant,
  spellsOf,
  weaponsOf,
} from './combatants.js';
import { rollDeathSaveFor, stabilizeCharacter } from './deathSaves.js';
import { weaponAttack } from './weaponAttack.js';
import { castSpellAction } from './spellCast.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * This is the combat screen: the full-width board shown in combat mode. It
 * owns no combat state. encounterWiring holds the running fight and writes
 * `state.combat`. This module projects that state through `buildCombatView`,
 * routes the screen's turn controls to the actions encounterWiring
 * registers, and keeps only the transient choice of which combatant the
 * screen inspects. This module mounts before wireEncounters, so
 * `app.views.combatScreen` exists by the time the fight's refresh paths run.
 * @param {AppContext} app
 */
export function wireCombatScreen(app) {
  const { state } = app;

  /** The ribbon-picked combatant that the left column details, or null for
   * whoever's turn it is. This value is per tab and is never persisted. */
  let inspectedId = /** @type {string | null} */ (null);

  /** The board-picked target that the next attack or cast opens on, or
   * null for none. This value is as transient as the inspection. The
   * refresh that shows the target defeated or gone releases it (see
   * `releaseStaleTarget`). The dialogs also ignore an id that matches no
   * living foe, so a race between the two has no cost. */
  let selectedTargetId = /** @type {string | null} */ (null);

  /**
   * Release the held target once it stops being attackable: defeated,
   * removed from the order, or the fight over. Without this step the dead
   * foe's card kept its pressed ring and the active column kept naming it,
   * while the attack dialog had already stopped honoring the pick.
   */
  function releaseStaleTarget() {
    if (!selectedTargetId) return;
    const inOrder = state.combat?.order.some((p) => p.id === selectedTargetId) ?? false;
    const found = inOrder ? findCombatant(app, selectedTargetId) : null;
    if (!found || isDowned(found)) selectedTargetId = null;
  }

  const screen = mountCombatScreen(mustGetElement('combat-screen'), {
    getView: () => {
      if (!state.combat) return null;
      return buildCombatView(state.combat, (id) => findCombatant(app, id), {
        gm: isGM(state.role),
        // partyWiring registers this and mounts later, so a reload with a
        // fight running draws its first frame before the binding reader
        // exists. That frame treats the tab as unbound, and the next
        // refresh corrects it. InitiativePanel's canAttack makes the same
        // allowance.
        boundCharacterId: app.actions.getBoundCharacterId?.() ?? null,
      });
    },
    isGM: () => isGM(state.role),
    onNext: () => app.actions.advanceCombatTurn(),
    onEnd: () => app.actions.endCombat(),
    // Leaving is a view change only. The fight keeps running, and the Play
    // sidebar's status card offers the way back in.
    onLeave: () => app.actions.setMode('play'),
    getInspectedId: () => inspectedId,
    onInspect: (id) => {
      inspectedId = id;
    },
    getSelectedTargetId: () => selectedTargetId,
    // Clicking the held card releases it, so the toggle acts like a checkbox.
    onSelectTarget: (id) => {
      selectedTargetId = selectedTargetId === id ? null : id;
    },
    // These are the current turn's weapons and spells, the same
    // derivations the sidebar strip used. The screen decides whether to
    // offer them, based on whether the viewer can act.
    getActions: () => {
      const active = state.combat ? state.combat.order[state.combat.index] : null;
      if (!active) return { weapons: [], spells: [], offhand: [] };
      const weapons = weaponsOf(app, active.id);
      return {
        weapons,
        spells: spellsOf(app, active.id),
        // The off-hand group appears only on a turn that can take the swing:
        // two light melee weapons in hand, the Attack action already spent, and
        // the bonus action still free.
        offhand: canOffhand(active, weapons) ? offhandWeapons(weapons) : [],
      };
    },
    // This is what one combatant brings, trimmed to what this tab is
    // allowed to know. The GM sees every sheet. A player sees their own
    // character in full, and only the armor and weapons of everyone else.
    // The spell list is resolved here, where the merged library is
    // reachable, and only when the viewer is allowed to have it. This way a
    // player tab never assembles another player's prepared spells.
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
    // What one combatant can spend a reaction on: a melee swing at whoever is
    // acting, and any spell that casts as a reaction. The screen asks only for a
    // card it already decided can react, so this reads the lists whole.
    getReaction: (id) => ({
      weapons: opportunityWeapons(weaponsOf(app, id)),
      spells: reactionSpells(spellsOf(app, id)),
    }),
    onWeaponAttack: (weapon) => {
      const combat = state.combat;
      if (!combat) return;
      weaponAttack(app, combat, combat.order[combat.index], weapon, {
        defenderId: selectedTargetId,
      });
    },
    onOffhandAttack: (weapon) => {
      const combat = state.combat;
      if (!combat) return;
      weaponAttack(app, combat, combat.order[combat.index], weapon, {
        defenderId: selectedTargetId,
        offhand: true,
      });
    },
    // A reaction comes from a combatant that is not taking the turn, so both of
    // these look the participant up by id. The swing defaults to the combatant
    // whose turn it is, because that is who the reaction interrupts. A card the
    // GM picked on the board wins over that default.
    onOpportunityAttack: (id, weapon) => {
      const combat = state.combat;
      const participant = combat?.order.find((p) => p.id === id);
      if (!combat || !participant) return;
      weaponAttack(app, combat, participant, weapon, {
        defenderId: selectedTargetId ?? combat.order[combat.index]?.id ?? null,
        reaction: true,
      });
    },
    // The cast dialog reads the caster's own participant for the budget, so a
    // reaction spell spends the reaction without this path saying so.
    onReactionCast: (id, spell) => {
      const combat = state.combat;
      const participant = combat?.order.find((p) => p.id === id);
      if (!combat || !participant) return;
      castSpellAction(app, combat, participant, spell, { targetId: selectedTargetId });
    },
    onCastSpell: (spell) => {
      const combat = state.combat;
      if (!combat) return;
      castSpellAction(app, combat, combat.order[combat.index], spell, {
        targetId: selectedTargetId,
      });
    },
    // This is the one write path every hit uses. It stores the result,
    // logs the transitions, and refreshes this screen along with the other
    // panels. The amount field has no roll behind it, so the write path logs
    // the amount and the resulting HP for it.
    onApplyHP: (id, amount, isHeal) => applyToTarget(app, id, amount, isHeal, { manual: true }),
    getConcentration: (id) => {
      const found = findCombatant(app, id);
      return found?.kind === 'character' ? (found.entity.concentration ?? null) : null;
    },
    // This is the character sheet's Drop path. It stores the released
    // caster, then removes the spell's chips from everyone it affected.
    onDropConcentration: (id) => {
      const found = findCombatant(app, id);
      if (found?.kind !== 'character') return;
      const held = found.entity.concentration;
      if (!held) return;
      found.store(dropConcentration(found.entity));
      app.actions.markDirty();
      endSpellEffects(app, id, held.spellId);
    },
    // A death save is the player's roll, so it comes from this button rather
    // than from the turn advance. The tray throws the d20, and the write path
    // refreshes this screen along with the sheet.
    onRollDeathSave: (id) => rollDeathSaveFor(app, id),
    onStabilize: (id) => stabilizeCharacter(app, id),
    // The log column shows the fight's slice of the travelogue: the combat
    // lines and dice rolls logged since this fight's setup opened, newest
    // first. Without the time bound, the column replayed every battle the
    // campaign ever logged. An older save's fight carries startedAt 0 and
    // still shows everything.
    getLogEntries: () => {
      const since = state.combat?.startedAt ?? 0;
      return state.travelog.filter(
        (entry) => entry.at >= since && (entry.kind === 'combat' || entry.kind === 'roll'),
      );
    },
  });

  // The app has one dice tray, and the screen borrows it whole. The tray's
  // card moves into the log column while combat mode is active, and back to
  // its below-map spot on exit. Moving the element keeps diceWiring's
  // handle valid, because the tray is mounted once and never re-resolved.
  // This code captures the home position here, before anything can move it.
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

  // Every refresh path lands here, including the mode switch itself:
  // sessionControls updates this view on every mode change. This keeps the
  // dock in step without a second observer. While the tab is on another
  // mode with the fight still running, for example a player looking at the
  // map mid-fight, the rebuild is skipped, because nothing is visible, and
  // the mode switch back is itself a refresh that redraws everything. The
  // fight-over case still falls through, so the screen empties instead of
  // holding the ended fight's DOM.
  app.views.combatScreen = {
    update: () => {
      syncDiceDock();
      releaseStaleTarget();
      if (state.mode !== 'combat' && state.combat) return;
      screen.update();
    },
  };
}
