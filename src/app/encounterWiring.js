import { tileIdAt } from '../map/MapGeometry.js';
import { mustGetElement } from '../ui/dom.js';
import { confirmDelete, alertModal } from '../ui/Modal.js';
import { openContextMenu } from '../ui/ContextMenu.js';
import { mountEncounterPanel } from '../ui/EncounterPanel.js';
import { mountInitiativePanel } from '../ui/InitiativePanel.js';
import { combatSetupModal } from '../ui/CombatSetup.js';
import {
  effectiveStatBlock,
  isDefeated,
  tickStatModifiers,
  toTemplate,
} from '../entities/Creature.js';
import {
  creaturesAt,
  creaturesNear,
  creaturesOnTile,
  discoveredHostiles,
  hostileCreaturesOnTile,
  liveCreaturesOnTile,
} from '../entities/CreatureMap.js';
import { mountBuildEncounterPanel } from '../ui/BuildEncounterPanel.js';
import {
  addParticipant,
  createParticipant,
  startCombat,
  advanceTurn,
  currentParticipant,
  dropParticipant,
} from '../combat/Initiative.js';
import { abilityModifier } from '../entities/Modifiers.js';
import { arrivalAlert } from '../combat/Arrival.js';
import { tickConditions } from '../entities/Conditions.js';
import { tick as tickConcentration } from '../entities/Concentration.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
import { isGM } from '../view/ViewRole.js';
import { creatureForm, deleteCreature, addFromLibrary } from './creatureForm.js';
import {
  commitCreatures,
  describeCombatant,
  endSpellEffects,
  findCombatant,
  logDefeatTransition,
  retryImposedSaves,
} from './combatants.js';
import { setCombatantExhaustion } from './exhaustion.js';
import { skipsTurn } from '../combat/CombatView.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * This module wires the Encounters panel, the Initiative panel, the bestiary
 * flow, and the walked-into-an-encounter alert. It is the only writer of
 * `state.combat`. It registers `maybeTriggerEncounter` on `app.actions` for
 * the party movement paths. The authoring dialog is in creatureForm.js.
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
   * Put a new combatant into the running order. A creature that a spell
   * summons mid-fight joins this way. With no fight running there is no order
   * to join, and the creature simply stands on the tile until a fight starts,
   * which stages it like any other creature there.
   * @param {import('../types/combat.js').Participant} participant
   */
  app.actions.addCombatant = (participant) => {
    const combat = current();
    if (!combat) return;
    const nameOf = (/** @type {import('../types/combat.js').Participant} */ p) =>
      describeCombatant(app, p.id)?.name ?? '';
    const next = addParticipant(combat, participant, nameOf);
    if (next === combat) return;
    setCombat(next);
    app.views.initiativePanel.update();
  };

  /**
   * If the party's current tile holds a threat, show it in a modal over the
   * map. A threat is an undefeated hostile creature standing there. A
   * friendly or neutral creature is not a threat: it lists in the panel and
   * the travelogue announces meeting it, but no modal opens. The
   * first-meeting travelogue line lives in `meetCreaturesHere`
   * (mapTravel.js), on the same arrival path.
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
    const here = hostileCreaturesOnTile(state.creatures, position);
    if (here.length === 0) return;
    const node = app.grid.getNode(position.nodeId);
    const region = node ? node.name : position.nodeId;
    const alert = arrivalAlert(here, {
      gm: isGM(state.role),
      subject,
      region,
    });
    if (alert) alertModal(alert.message, { title: alert.title, label: 'Continue' });
  };

  app.views.encounterPanel = mountEncounterPanel(mustGetElement('encounter-container'), {
    // The panel shows only what is relevant to the party's current position,
    // split into two tabs. The Active tab lists every live creature on the
    // party's exact tile, bystanders included. This is who the party stands
    // with, and it is what a fight started here would draw in. Only the
    // hostile ones raised the arrival alert. The Nearby tab lists the
    // remaining hostiles within range. For the GM, this means hostile
    // creatures within four times the fog reveal radius of the party, plus
    // unplaced ones. For a player, this means only discovered hostiles: one
    // on a tile the fog has revealed, or an unplaced one the party walked
    // into.
    getActiveEncounters: () => liveCreaturesOnTile(state.creatures, app.partyTracker.getPosition()),
    getNearbyEncounters: () => {
      const position = app.partyTracker.getPosition();
      const hereIds = new Set(liveCreaturesOnTile(state.creatures, position).map((c) => c.id));
      const list = isGM(state.role)
        ? creaturesNear(state.creatures, position, app.partyTracker.revealRadius * 4).filter(
            (c) => c.disposition === 'hostile',
          )
        : discoveredHostiles(state.creatures, position, app.grid.getNode(position.nodeId) ?? null);
      return list.filter((c) => !hereIds.has(c.id));
    },
    onUpdate: (next) => {
      // Log the transition into defeat exactly once. Compare against the
      // pre-update creature so damage that keeps it down does not log again.
      const prev = state.creatures.find((c) => c.id === next.id);
      if (prev) logDefeatTransition(app, prev, next);
      state.creatures = replaceById(state.creatures, next);
      // The panel re-renders its own rows once this call resolves. It skips
      // that part of the refresh.
      commitCreatures(app, { panel: false });
    },
    onDelete: (id) => {
      state.creatures = removeById(state.creatures, id);
      app.actions.removeCombatant(id);
      commitCreatures(app, { panel: false });
    },
    // Exhaustion goes through the app write, not through onUpdate, because the
    // sixth level takes the creature to 0 HP and logs both facts.
    onSetExhaustion: (encounter, level) => setCombatantExhaustion(app, encounter.id, level),
    // Authoring, including new foes and spawning from the bestiary, lives
    // in the Build rail. The Play panel edits an existing creature's HP and
    // placement, and saves one as a template mid-session.
    onEdit: (creature) => creatureForm(app, creature, null),
    // Save a creature's blueprint (name, max HP, stat block) to the
    // bestiary. This avoids typing the next Goblin from scratch. Saves with
    // the same name stack as separate templates, because a template is a
    // snapshot, not a live link.
    onSaveTemplate: (creature) => {
      state.bestiary = [
        ...state.bestiary,
        toTemplate(
          slugId(
            creature.name,
            state.bestiary.map((t) => t.id),
          ),
          creature,
        ),
      ];
      app.actions.markDirty();
      app.toasts.show(`Saved "${creature.name}" to the bestiary.`);
    },
    confirmDelete: (creature) => confirmDelete(creature.name),
    // Only the GM can start combat. The button shows only to the GM, and
    // only while the party stands on a tile holding a live creature, with
    // no fight running. A non-hostile creature is enough: a party that
    // turns on a bystander is not stopped, it only gets no arrival alert.
    canStartCombat: () => isGM(state.role) && current() === null && creaturesHere(),
    onStartCombat: startCombatSetup,
    getRole: () => state.role,
  });

  // This is the Build rail's foe authoring list. It lists the hostile
  // creatures staged in the node the GM is viewing, plus unplaced ones, and
  // lets the GM edit them without moving the party there. A new foe
  // defaults to the Build-mode selected tile of the viewed node, so the GM
  // can select a tile and add a foe there directly.
  app.views.buildFoes = mountBuildEncounterPanel(mustGetElement('build-encounters-container'), {
    getEncounters: () =>
      creaturesAt(state.creatures, {
        nodeId: app.navigator.getCurrentNode().id,
      }).filter((c) => c.disposition === 'hostile'),
    onAdd: () =>
      creatureForm(
        app,
        null,
        {
          nodeId: app.navigator.getCurrentNode().id,
          tileId: app.actions.getSelectedTileId() ?? '0,0',
        },
        { disposition: 'hostile', level: 1 },
      ),
    onAddFromTemplate: () => addFromLibrary(app),
    onEdit: (creature) => creatureForm(app, creature, null),
    onDelete: (creature) => deleteCreature(app, creature),
    // Persist base stat edits from the Build rail's chips. The Play panel
    // shows the same creature and picks up the change.
    onUpdate: (next) => {
      state.creatures = replaceById(state.creatures, next);
      app.views.encounterPanel.update();
      app.actions.markDirty();
    },
    // Selecting a placed creature moves the map view to its staged location.
    onFocus: (creature) => {
      if (creature.location) app.actions.focusLocation(creature.location);
    },
  });

  /**
   * This is the Build-mode right-click menu for a tile of the viewed node.
   * It opens at the pointer. It can create a new foe or NPC on that tile,
   * or edit one already staged there. Every choice opens the one shared
   * creature dialog. The two "New" items differ only in their seed: a foe
   * starts as a level-1 hostile, and an NPC starts as an unleveled neutral.
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
    const here = creaturesOnTile(state.creatures, location);
    openContextMenu(
      [
        {
          label: 'New foe here',
          onSelect: () => creatureForm(app, null, location, { disposition: 'hostile', level: 1 }),
        },
        {
          label: 'New NPC here',
          onSelect: () => creatureForm(app, null, location, { disposition: 'neutral' }),
        },
        ...here.map((c) => ({
          label: `Edit ${c.name}`,
          onSelect: () => creatureForm(app, c, null),
        })),
      ],
      { clientX, clientY },
    );
  };

  // Whether the party stands on anything a fight could involve: at least
  // one live creature on its exact tile, whatever its disposition. The
  // arrival alert keeps its own, hostile-only read.
  function creaturesHere() {
    return liveCreaturesOnTile(state.creatures, app.partyTracker.getPosition()).length > 0;
  }

  // The combatants are everyone involved in this encounter: the whole
  // party, plus every creature on the party's tile. Hostile creatures line
  // up as foes. Friendly and neutral ones line up with the party. Each
  // combatant carries its DEX modifier. This modifier seeds the default
  // value (10 + modifier, the passive baseline), adds to the d20 roll from
  // Roll initiative, and shows beside the name. The GM can edit every value
  // by hand.
  function combatRoster() {
    /** @type {(id: string, stats: Record<string, number> | undefined) => import('../types/combat.js').Participant} */
    const withDex = (id, stats) => {
      const mod = abilityModifier(stats?.DEX ?? 10);
      return createParticipant(id, 10 + mod, mod);
    };
    // A defeated hostile stays staged but takes no part in a new fight. A
    // bystander joins whatever its condition.
    const position = app.partyTracker.getPosition();
    const roster = creaturesOnTile(state.creatures, position).filter(
      (c) => c.disposition !== 'hostile' || !isDefeated(c),
    );
    return [
      ...state.characters.map((c) => withDex(c.id, c.stats)),
      ...roster.map((c) => withDex(c.id, effectiveStatBlock(c))),
    ];
  }

  /**
   * Resolve the name and side to show for a participant, from whatever
   * currently holds its id. Both panels use this function instead of
   * reading the order directly. This way a combatant renamed, or a creature
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
      // Initiative is a DEX check in 5e, but the fill rolls a straight d20.
      // No slant reaches it yet: neither condition chips nor the
      // untrained-armor rule, which slant attacks, checks, and saves. The
      // GM edits the value by hand until initiative shares the slanted roll
      // path.
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
      // Every creature ticks the same way, so a bystander's timed stat
      // modifier counts down too. A creature that carries no statMods field
      // does not gain an empty one here.
      state.creatures = state.creatures.map((c) => ({
        ...c,
        conditions: tickConditions(c.conditions),
        ...(c.statMods ? { statMods: tickStatModifiers(c.statMods) } : {}),
      }));
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

  // Walking off the fight's tile, or deleting the last creature there,
  // drops the running combat, because its participants are no longer
  // here. Killing every foe does not drop it: the screen shows the foes as
  // down and waits for the GM to press End combat. This way a last hit does
  // not take the fight away from whoever landed it, and the party can still
  // heal up or read the log before leaving. The paths that move the party
  // or delete a creature call this action directly, not the panel
  // refresh. The refresh also runs from the rehydrate loop, where a state
  // write conflicts with the save just adopted from another tab and
  // echoes a dirty write back at it.
  app.actions.syncCombatLocation = () => {
    if (!current()) return;
    // Defeated combatants count here. A combatant at 0 HP is a turn in the
    // fight, not the end of it. Only walking away, or deleting everyone in
    // the fight, ends a fight this way. Non-hostile creatures count too,
    // because a fight the party picked with one has no hostiles at all.
    const stagedHere = creaturesOnTile(state.creatures, app.partyTracker.getPosition());
    if (stagedHere.length > 0) return;
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
