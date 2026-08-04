import { tileIdAt } from '../map/MapGeometry.js';
import { mustGetElement } from '../ui/dom.js';
import { confirmDelete, alertModal } from '../ui/Modal.js';
import { openContextMenu } from '../ui/ContextMenu.js';
import { mountEncounterPanel } from '../ui/EncounterPanel.js';
import { mountInitiativePanel } from '../ui/InitiativePanel.js';
import { combatSetupModal } from '../ui/CombatSetup.js';
import {
  effectiveStatBlock,
  encountersAt,
  encountersAtTile,
  encountersNear,
  encountersOnTile,
  discoveredEncounters,
  tickStatModifiers,
  toTemplate,
} from '../entities/Encounter.js';
import { mountBuildEncounterPanel } from '../ui/BuildEncounterPanel.js';
import {
  createParticipant,
  startCombat,
  advanceTurn,
  currentParticipant,
  dropParticipant,
} from '../combat/Initiative.js';
import { abilityModifier } from '../entities/Modifiers.js';
import { hostileNPCsOnTile, npcsOnTile } from '../entities/NPC.js';
import { arrivalAlert } from '../combat/Arrival.js';
import { tickConditions } from '../entities/Conditions.js';
import { tick as tickConcentration } from '../entities/Concentration.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
import { isGM } from '../view/ViewRole.js';
import { encounterForm, deleteEncounter, addFromBestiary } from './encounterForm.js';
import {
  commitEncounters,
  describeCombatant,
  endSpellEffects,
  findCombatant,
  logDefeatTransition,
  retryImposedSaves,
} from './combatants.js';
import { skipsTurn } from '../combat/CombatView.js';
import { npcForm } from './npcForm.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * This module wires the Encounters panel, the Initiative panel, the bestiary
 * flow, and the walked-into-an-encounter alert. It is the only writer of
 * `state.combat`. It registers `maybeTriggerEncounter` on `app.actions` for
 * the party movement paths. The authoring dialogs are in encounterForm.js.
 * The attack resolution is in weaponAttack.js. This module connects them to
 * the panels.
 * @param {AppContext} app
 */
export function wireEncounters(app) {
  const { state } = app;

  // The running fight lives only in `state.combat`. This module once kept a
  // mirrored copy. That copy went stale when another tab adopted its save,
  // because the re-hydrate writes `state.combat` directly. A follower tab
  // then still shows and opens an ended fight from its old sidebar card.
  // Reading state on every access has no cost and cannot go stale.
  const current = () => state.combat;

  /** @param {import('../types/combat.js').CombatState | null} next */
  function setCombat(next) {
    state.combat = next;
    app.actions.markDirty();
  }

  /**
   * Remove a deleted combatant from the running order. Every delete path
   * calls this function instead of writing `state.combat` directly. This
   * keeps the write, the dirty mark, and the panel refresh together in one
   * place. A combatant left in the order resolves to nothing, so its row
   * shows buttons that do nothing.
   * @param {string} id
   */
  app.actions.removeCombatant = (id) => {
    const combat = current();
    if (!combat) return;
    const next = dropParticipant(combat, id);
    if (next === combat) return;
    setCombat(next);
    app.views.initiativePanel.update();
  };

  /**
   * If the party's current tile holds a threat, show it in a modal over the
   * map. A threat is a live encounter staged there or a hostile NPC standing
   * there. Both get named. A friendly or neutral NPC is not a threat, and
   * the travelogue announces meeting one instead.
   *
   * The threat stays in place: a party that flees or ignores it still sees it
   * in the sidebar for that node. This is only a walk-into-something alert.
   * The readout follows the viewer role. The GM sees exact HP. A player sees
   * the coarse status band. The app calls this
   * after a real move, not on the initial render, so a fresh load does not
   * show a popup. It defaults to the whole party at its shared position. A
   * player who moves their own token passes that character's tile and name
   * instead.
   * @param {import('../types/map.js').PartyPosition} [position]
   * @param {string} [subject]
   */
  app.actions.maybeTriggerEncounter = (
    position = app.partyTracker.getPosition(),
    subject = 'The party',
  ) => {
    const here = encountersOnTile(state.encounters, position);
    const hostiles = hostileNPCsOnTile(state.npcs, position);
    if (here.length === 0 && hostiles.length === 0) return;
    const node = app.grid.getNode(position.nodeId);
    const region = node ? node.name : position.nodeId;
    // The travelogue logs each first meeting exactly once, using a persisted
    // `noticed` flag. Walking back onto the tile shows the alert again but
    // does not log it again. A hostile NPC needs no flag of its own, because
    // `meetNPCs` already logs the introduction.
    const fresh = here.filter((e) => !e.noticed);
    if (fresh.length > 0) {
      state.encounters = state.encounters.map((e) =>
        fresh.some((f) => f.id === e.id) ? { ...e, noticed: true } : e,
      );
      for (const e of fresh) {
        app.actions.logEvent(
          'combat',
          `${subject} encounters ${e.name} in ${region} (tile ${position.tileId}).`,
        );
      }
      app.actions.markDirty();
    }
    const alert = arrivalAlert([...here, ...hostiles], {
      gm: isGM(state.role),
      subject,
      region,
    });
    if (alert) alertModal(alert.message, { title: alert.title, label: 'Continue' });
  };

  app.views.encounterPanel = mountEncounterPanel(mustGetElement('encounter-container'), {
    // The panel shows only what is relevant to the party's current position,
    // split into two tabs. The Active tab lists live encounters on the
    // party's exact tile. This is what the party just walked into. Both
    // roles see it, because the alert already announced it. The Nearby tab
    // lists the rest within range. For the GM, this means encounters within
    // four times the fog reveal radius of the party, plus unbound
    // encounters. For a player, this means only discovered encounters: one
    // on a tile the fog has revealed, or an unbound one the party walked
    // into.
    getActiveEncounters: () => encountersOnTile(state.encounters, app.partyTracker.getPosition()),
    getNearbyEncounters: () => {
      const position = app.partyTracker.getPosition();
      const hereIds = new Set(encountersOnTile(state.encounters, position).map((e) => e.id));
      const list = isGM(state.role)
        ? encountersNear(state.encounters, position, app.partyTracker.revealRadius * 4)
        : discoveredEncounters(
            state.encounters,
            position,
            app.grid.getNode(position.nodeId) ?? null,
          );
      return list.filter((e) => !hereIds.has(e.id));
    },
    onUpdate: (next) => {
      // Log the transition into defeat exactly once. Compare against the
      // pre-update encounter so damage that keeps it down does not log again.
      const prev = state.encounters.find((e) => e.id === next.id);
      if (prev) logDefeatTransition(app, prev, next);
      state.encounters = replaceById(state.encounters, next);
      // The panel re-renders its own rows once this call resolves. It skips
      // that part of the refresh.
      commitEncounters(app, { panel: false });
    },
    onDelete: (id) => {
      state.encounters = removeById(state.encounters, id);
      app.actions.removeCombatant(id);
      commitEncounters(app, { panel: false });
    },
    // Authoring, including new encounters and spawning from the bestiary,
    // lives in the Build rail. The Play panel edits an existing encounter's
    // HP and placement, and saves one as a template mid-session.
    onEdit: (encounter) => encounterForm(app, encounter, null),
    // Save an encounter's blueprint (name, max HP, stat block) to the
    // bestiary. This avoids typing the next Goblin from scratch. Saves with
    // the same name stack as separate templates, because a template is a
    // snapshot, not a live link.
    onSaveTemplate: (encounter) => {
      state.bestiary = [
        ...state.bestiary,
        toTemplate(
          slugId(
            encounter.name,
            state.bestiary.map((t) => t.id),
          ),
          encounter,
        ),
      ];
      app.actions.markDirty();
      app.toasts.show(`Saved "${encounter.name}" to the bestiary.`);
    },
    confirmDelete: (encounter) => confirmDelete(encounter.name),
    // Only the GM can start combat. The button shows only to the GM, and
    // only while the party stands on a tile holding a live encounter or a
    // hostile NPC, with no fight running.
    canStartCombat: () => isGM(state.role) && current() === null && threatsHere(),
    // The Active tab holds the Start combat button, so a hostile NPC under
    // the party counts for the auto-switch even though the tab lists
    // encounters only.
    hasActive: threatsHere,
    onStartCombat: startCombatSetup,
    getRole: () => state.role,
  });

  // This is the Build rail's authoring list. It lists the encounters staged
  // in the node the GM is viewing, plus unplaced ones, and lets the GM edit
  // them without moving the party there. A new encounter defaults to the
  // Build-mode selected tile of the viewed node, so the GM can select a
  // tile and add an encounter there directly.
  app.views.buildEncounters = mountBuildEncounterPanel(
    mustGetElement('build-encounters-container'),
    {
      getEncounters: () =>
        encountersAt(state.encounters, {
          nodeId: app.navigator.getCurrentNode().id,
        }),
      onAdd: () =>
        encounterForm(app, null, {
          nodeId: app.navigator.getCurrentNode().id,
          tileId: app.actions.getSelectedTileId() ?? '0,0',
        }),
      onAddFromTemplate: () => addFromBestiary(app),
      onEdit: (encounter) => encounterForm(app, encounter, null),
      onDelete: (encounter) => deleteEncounter(app, encounter),
      // Persist base stat edits from the Build rail's chips. The Play panel
      // shows the same encounter and picks up the change.
      onUpdate: (next) => {
        state.encounters = replaceById(state.encounters, next);
        app.views.encounterPanel.update();
        app.actions.markDirty();
      },
      // Selecting a placed encounter moves the map view to its staged location.
      onFocus: (encounter) => {
        if (encounter.location) app.actions.focusLocation(encounter.location);
      },
    },
  );

  /**
   * This is the Build-mode right-click menu for a tile of the viewed node.
   * It opens at the pointer. It can create a new encounter or NPC on that
   * tile, or edit one already staged there. Each choice opens the matching
   * shared form.
   * @param {number} x
   * @param {number} y
   * @param {number} clientX
   * @param {number} clientY
   */
  app.actions.openEncounterContextMenu = (x, y, clientX, clientY) => {
    const location = {
      nodeId: app.navigator.getCurrentNode().id,
      tileId: tileIdAt(x, y),
    };
    const here = encountersOnTile(state.encounters, location);
    const folkHere = npcsOnTile(state.npcs, location);
    openContextMenu(
      [
        { label: 'New encounter here', onSelect: () => encounterForm(app, null, location) },
        { label: 'New NPC here', onSelect: () => npcForm(app, null, location) },
        ...here.map((e) => ({
          label: `Edit ${e.name}`,
          onSelect: () => encounterForm(app, e, null),
        })),
        ...folkHere.map((n) => ({
          label: `Edit ${n.name}`,
          onSelect: () => npcForm(app, n, null),
        })),
      ],
      { clientX, clientY },
    );
  };

  // "In an encounter" means the party stands on a tile with at least one
  // live encounter bound to it. This is the same condition the
  // walked-into-it alert uses.
  function encountersHere() {
    return encountersOnTile(state.encounters, app.partyTracker.getPosition());
  }

  // The hostile NPCs under the party. A hostile NPC is a foe in its own
  // right, so a tile holding one and nothing else is still a fight. Every
  // place that asks "is there anything to fight here" reads both this and
  // `encountersHere`.
  function hostilesHere() {
    return hostileNPCsOnTile(state.npcs, app.partyTracker.getPosition());
  }

  // Whether the party stands on anything worth fighting.
  function threatsHere() {
    return encountersHere().length + hostilesHere().length > 0;
  }

  // The combatants are everyone involved in this encounter: the whole
  // party, the live encounters on the party's tile, and any NPCs on that
  // tile. Hostile NPCs line up as foes. Friendly and neutral NPCs line up
  // with the party. Each combatant carries its DEX modifier. This modifier
  // seeds the default value (10 + modifier, the passive baseline), adds to
  // the d20 roll from Roll initiative, and shows beside the name. The GM
  // can edit every value by hand.
  function combatRoster() {
    /** @type {(id: string, stats: Record<string, number> | undefined) => import('../types/combat.js').Participant} */
    const withDex = (id, stats) => {
      const mod = abilityModifier(stats?.DEX ?? 10);
      return createParticipant(id, 10 + mod, mod);
    };
    return [
      ...state.characters.map((c) => withDex(c.id, c.stats)),
      ...encountersHere().map((e) => withDex(e.id, effectiveStatBlock(e))),
      ...npcsOnTile(state.npcs, app.partyTracker.getPosition()).map((n) => withDex(n.id, n.stats)),
    ];
  }

  /**
   * Resolve the name and side to show for a participant, from whatever
   * currently holds its id. Both panels use this function instead of
   * reading the order directly. This way a combatant renamed, or an NPC
   * whose disposition changes mid-fight, shows the change on the next
   * render.
   * @param {import('../types/combat.js').Participant} participant
   */
  const describe = (participant) => describeCombatant(app, participant.id);

  // This is the GM's entry into combat. It opens a setup dialog over the
  // map with the roster, a Roll initiative fill (d20 plus DEX modifier,
  // editable by hand after), and a Start control. Start changes the
  // initiative panel from hidden to the running order.
  async function startCombatSetup() {
    // This timestamp is taken when the setup opens, not when Start runs.
    // The dialog logs the "Initiative rolled" line, and it belongs to this
    // fight's log.
    const startedAt = Date.now();
    const participants = await combatSetupModal(combatRoster(), {
      describe,
      rollInitiative: (participant) =>
        Math.floor(Math.random() * 20) + 1 + (participant.modifier ?? 0),
      // The travelogue gets one line for each press of Roll initiative, and
      // records every result. A hand-edited override before Start does not
      // log again.
      onRolled: (results) =>
        app.actions.logEvent(
          'roll',
          `Initiative rolled: ${results.map((r) => `${r.name} ${r.value}`).join(', ')}.`,
        ),
    });
    if (!participants) return;
    setCombat(startCombat(participants, (p) => describe(p)?.name ?? '', startedAt));
    app.views.initiativePanel.update(); // shows the panel again
    app.views.encounterPanel.update(); // hides the Start combat button
    app.actions.setMode('combat'); // the fight runs on the full-width screen
  }

  // Leaving combat mode is tied to the fight ending, regardless of how it
  // ends: the End button, the last encounter dying, or the party walking
  // off the tile. Any other mode change is the operator's own choice, and
  // this function leaves it alone.
  function exitCombatMode() {
    if (state.mode === 'combat') app.actions.setMode('play');
  }

  // Turn advance and combat end are registered as actions. This lets the
  // combat screen drive the same fight through the same code as the
  // sidebar panel. This module stays the only writer of `combat`.
  app.actions.advanceCombatTurn = () => {
    const combat = current();
    if (!combat) return;
    // Read this before the turn pointer moves. A spell that lets its target
    // retry the save gets that retry at the end of the target's own turn,
    // the turn now ending.
    const acting = currentParticipant(combat);
    if (acting) retryImposedSaves(app, acting.id);
    // A defeated combatant keeps its place in the order but not its turn.
    // The pointer steps past it to the next combatant standing. A
    // participant that resolves to nothing, because it was deleted
    // mid-fight, also has no turn to take. A chip such as Stunned takes the
    // turn the same way, without taking the combatant out of the fight.
    const result = advanceTurn(combat, (p) => skipsTurn(findCombatant(app, p.id)));
    setCombat(result.state);
    // A new round elapsed. Tick down every combatant's timed conditions,
    // the enemies' timed stat modifiers, and the party's concentration
    // durations.
    if (result.wrapped) {
      /** @type {{ casterId: string, spellId: string }[]} */
      const expired = [];
      state.characters = state.characters.map((c) => {
        // Concentration ticks after the conditions, because it rewrites its
        // own chip's counter from the duration it owns.
        const ticked = tickConcentration({ ...c, conditions: tickConditions(c.conditions) });
        const held = c.concentration;
        if (ticked.expired && held) {
          app.actions.logEvent('combat', `${c.name}'s concentration on ${held.spellName} ends.`);
          expired.push({ casterId: c.id, spellId: held.spellId });
        }
        return ticked.character;
      });
      state.encounters = state.encounters.map((e) => ({
        ...e,
        conditions: tickConditions(e.conditions),
        statMods: tickStatModifiers(e.statMods ?? []),
      }));
      state.npcs = state.npcs.map((n) => ({ ...n, conditions: tickConditions(n.conditions) }));
      app.actions.refreshSelectedCharacter();
      app.views.encounterPanel.update();
      app.views.npcPanel.update();
      // The sweep runs only after both collections are reassigned. The
      // sweep writes to the same two collections. Run earlier, the tick's
      // own write restores its result.
      for (const { casterId, spellId } of expired) endSpellEffects(app, casterId, spellId);
    }
    // The sidebar panel redraws itself after its own button. The combat
    // screen must be told that the turn moved, in either case.
    app.views.combatScreen.update();
  };

  app.actions.endCombat = () => {
    setCombat(null);
    app.views.initiativePanel.update(); // hides the panel again
    app.views.encounterPanel.update(); // shows the Start combat button again
    exitCombatMode();
  };

  const initiativeContainer = mustGetElement('initiative-container');
  // The fight runs on the combat screen. The sidebar card is only the
  // status line and the link to it. Turn controls and the action strip
  // live on the screen.
  const initiativePanel = mountInitiativePanel(initiativeContainer, {
    getState: current,
    describe,
    onOpen: () => app.actions.setMode('combat'),
  });

  // Walking off the encounter's tile, or deleting the last encounter there,
  // drops the running combat, because its participants are no longer here.
  // Killing every foe does not drop it: the screen shows the foes as down
  // and waits for the GM to press End combat. This way a last hit does not
  // take the fight away from whoever landed it, and the party can still
  // heal up or read the log before leaving. The paths that move the party
  // or delete an encounter call this action directly, not the panel
  // refresh. The refresh also runs from the rehydrate loop, where a state
  // write conflicts with the save just adopted from another tab and
  // echoes a dirty write back at it.
  app.actions.syncCombatLocation = () => {
    if (!current()) return;
    // Defeated combatants count here. A foe at 0 HP is a turn in the fight,
    // not the end of it. Only walking away, or deleting everything to fight,
    // ends a fight this way.
    const stagedHere = encountersAtTile(state.encounters, app.partyTracker.getPosition());
    if (stagedHere.length > 0 || hostilesHere().length > 0) return;
    setCombat(null);
    exitCombatMode();
    app.views.initiativePanel.update();
  };

  // The Initiative card shows only while a fight is running. No setup or
  // idle state stays parked in the sidebar. This wrapper gives every
  // existing `initiativePanel.update()` call site, including party moves,
  // role switches, and the rehydrate loop, the visibility sync for free.
  // The combat screen shows the same fight, so it refreshes here too,
  // instead of duplicating every call site.
  app.views.initiativePanel = {
    update: () => {
      initiativeContainer.hidden = current() === null;
      initiativePanel.update();
      app.views.combatScreen.update();
    },
  };
  // A loaded save can carry a fight the party no longer stands in, because
  // the campaign was edited elsewhere. Reconcile this once at mount, then
  // refresh.
  app.actions.syncCombatLocation();
  app.views.initiativePanel.update();
}
