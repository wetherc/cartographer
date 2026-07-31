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
import { npcsOnTile } from '../entities/NPC.js';
import { tickConditions } from '../entities/Conditions.js';
import { tick as tickConcentration } from '../entities/Concentration.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
import { isGM, hpBand } from '../view/ViewRole.js';
import { encounterForm, deleteEncounter, addFromBestiary } from './encounterForm.js';
import { weaponAttack } from './weaponAttack.js';
import { castSpellAction } from './spellCast.js';
import {
  commitEncounters,
  describeCombatant,
  endSpellEffects,
  logDefeatTransition,
  retryImposedSaves,
  spellsOf,
  weaponsOf,
} from './combatants.js';
import { npcForm } from './npcForm.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The Encounters and Initiative panels, the bestiary workflow, and the
 * walked-into-an-encounter alert. Owns the transient combat state; registers
 * `maybeTriggerEncounter` on `app.actions` for the party-move paths. The
 * authoring dialogs live in encounterForm.js and the attack resolution in
 * weaponAttack.js; this module wires them to the panels.
 * @param {AppContext} app
 */
export function wireEncounters(app) {
  const { state } = app;

  // The running fight. Seeded from the persisted campaign state so a page
  // refresh mid-combat resumes it, and mirrored back on every change (with a
  // dirty mark) so the autosave keeps it.
  /** @type {import('../types/combat.js').CombatState | null} */
  let combat = state.combat;

  /** @param {import('../types/combat.js').CombatState | null} next */
  function setCombat(next) {
    combat = next;
    state.combat = next;
    app.actions.markDirty();
  }

  /**
   * Drop a deleted combatant out of the running order. Every delete path goes
   * through here rather than writing `state.combat` itself, because this
   * module holds the live copy of the combat and a direct write would leave it
   * stale. A participant left behind resolves to nothing, so its row would sit
   * in the order with buttons that quietly do nothing.
   * @param {string} id
   */
  app.actions.removeCombatant = (id) => {
    if (!combat) return;
    const next = dropParticipant(combat, id);
    if (next === combat) return;
    setCombat(next);
    app.views.initiativePanel.update();
  };

  /**
   * If the party's current tile holds a live encounter, announce it in a modal
   * over the map. The encounter isn't removed — a party that flees or ignores it
   * leaves it in the sidebar for the current node — so this is purely a "you walk
   * into something" alert. The readout respects the viewer role: the GM sees
   * exact HP, players see the coarse status band. Called after a real move, not
   * on initial render, so the app doesn't greet a fresh load with a popup.
   * Defaults to the whole party at its shared position; a player moving their
   * own token passes that character's tile and name instead.
   * @param {import('../types/map.js').PartyPosition} [position]
   * @param {string} [subject]
   */
  app.actions.maybeTriggerEncounter = (
    position = app.partyTracker.getPosition(),
    subject = 'The party',
  ) => {
    const here = encountersOnTile(state.encounters, position);
    if (here.length === 0) return;
    const node = app.grid.getNode(position.nodeId);
    const region = node ? node.name : position.nodeId;
    // First meetings go in the travelogue exactly once, keyed by a persisted
    // `noticed` flag — walking back onto the tile re-alerts but doesn't re-log.
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
    const gm = isGM(state.role);
    const names = here.map((e) =>
      gm
        ? `${e.name} (${e.currentHP}/${e.maxHP} HP)`
        : `${e.name} (${hpBand(e.currentHP, e.maxHP)})`,
    );
    const list =
      names.length > 1
        ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
        : names[0];
    alertModal(`${subject} has come upon ${list} here in ${region}.`, {
      title: here.length > 1 ? 'Encounters!' : 'Encounter!',
      label: 'Continue',
    });
  };

  app.views.encounterPanel = mountEncounterPanel(mustGetElement('encounter-container'), {
    // The panel shows only what's relevant where the party stands, split into
    // the panel's two tabs. Active: the live encounters on the party's exact
    // tile — what a step just walked into (both roles; the alert already
    // announced it). Nearby: the rest in range — for the GM, encounters
    // within four times the fog reveal radius of the party (plus unbound
    // ones); for players, only what's been discovered — an encounter whose
    // tile the fog has revealed, or an unbound one the party walked into.
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
      // Log the transition into defeat exactly once (damage that keeps it down
      // shouldn't re-log), by comparing against the pre-update encounter.
      const prev = state.encounters.find((e) => e.id === next.id);
      if (prev) logDefeatTransition(app, prev, next);
      state.encounters = replaceById(state.encounters, next);
      // The panel re-renders its own rows once this resolves, so it opts out of
      // that half of the refresh.
      commitEncounters(app, { panel: false });
    },
    onDelete: (id) => {
      state.encounters = removeById(state.encounters, id);
      app.actions.removeCombatant(id);
      commitEncounters(app, { panel: false });
    },
    // Authoring (new encounters, spawning from the bestiary) lives in the
    // Build rail; the Play panel keeps editing an existing encounter (HP,
    // placement) and snapshotting one as a template mid-session.
    onEdit: (encounter) => encounterForm(app, encounter, null),
    // Save an encounter's blueprint (name, max HP, stat block) to the bestiary,
    // so the next Goblin isn't typed from scratch. Same-named saves stack as
    // separate templates — a template is a snapshot, not a live link.
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
    // Opening combat is the GM's call: the button shows only to the GM, only
    // while the party stands on a live encounter's tile with no fight running.
    canStartCombat: () => isGM(state.role) && combat === null && encountersHere().length > 0,
    onStartCombat: startCombatSetup,
    getRole: () => state.role,
  });

  // The Build rail's authoring list: the encounters staged in whatever node
  // the GM is looking at (plus unplaced ones), editable without moving the
  // party there. New encounters default onto the Build-mode selected tile of
  // the viewed node, so "select a tile, add an encounter" places it there.
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
      // Base stat edits from the Build rail's chips: persist and let the Play
      // panel (which shows the same encounter) pick the change up.
      onUpdate: (next) => {
        state.encounters = replaceById(state.encounters, next);
        app.views.encounterPanel.update();
        app.actions.markDirty();
      },
      // Selecting a placed encounter jumps the map to where it's staged.
      onFocus: (encounter) => {
        if (encounter.location) app.actions.focusLocation(encounter.location);
      },
    },
  );

  /**
   * The Build-mode right-click menu for a tile of the viewed node, floated at
   * the pointer: create a new encounter or NPC placed there, or edit one
   * already staged on that tile. Each choice opens the matching shared form.
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

  // "In an encounter" means the party stands on a tile with at least one live
  // encounter bound to it — the same trigger the walked-into-it alert uses.
  function encountersHere() {
    return encountersOnTile(state.encounters, app.partyTracker.getPosition());
  }

  // Combatants are whoever is involved in *this* encounter: the whole party,
  // the live encounters on the party's tile, and any NPCs standing on that
  // tile (hostile ones line up as foes, friendly/neutral ones with the
  // party). Each carries its DEX modifier: seeded into the default value
  // (10 + mod, the passive baseline), added on top of the d20 by "Roll
  // initiative", and shown beside the name. Values stay hand-editable.
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
   * The name and side to show for a participant, resolved from whatever holds
   * its id right now. Both panels take this instead of reading the order, so
   * renaming a combatant or flipping an NPC's disposition mid-fight shows up
   * on the next render.
   * @param {import('../types/combat.js').Participant} participant
   */
  const describe = (participant) => describeCombatant(app, participant.id);

  // The GM's entry into combat: a setup dialog over the map with the roster,
  // a "Roll initiative" fill (d20 + DEX modifier, hand-editable after), and a
  // Start that flips the initiative panel from hidden to the running order.
  async function startCombatSetup() {
    const participants = await combatSetupModal(combatRoster(), {
      describe,
      rollInitiative: (participant) =>
        Math.floor(Math.random() * 20) + 1 + (participant.modifier ?? 0),
      // One travelogue line per "Roll initiative" press, recording every
      // result; hand-edited overrides before Start aren't re-logged.
      onRolled: (results) =>
        app.actions.logEvent(
          'roll',
          `Initiative rolled: ${results.map((r) => `${r.name} ${r.value}`).join(', ')}.`,
        ),
    });
    if (!participants) return;
    setCombat(startCombat(participants, (p) => describe(p)?.name ?? ''));
    app.views.initiativePanel.update(); // un-hides the panel
    app.views.encounterPanel.update(); // hides the Start combat button
    app.actions.setMode('combat'); // the fight runs on the full-width screen
  }

  // Leaving combat mode is tied to the fight ending, however it ends: the End
  // button, the last encounter dying, or the party walking off the tile. Any
  // other mode is the operator's own choice and is left alone.
  function exitCombatMode() {
    if (state.mode === 'combat') app.actions.setMode('play');
  }

  // Turn advance and combat end, registered as actions so the combat screen
  // drives the same fight through the same code as the sidebar panel; this
  // module stays the only writer of `combat`.
  app.actions.advanceCombatTurn = () => {
    if (!combat) return;
    // Read before the pointer moves: a spell that lets its target retry the
    // save gets that retry at the end of the target's own turn, which is the
    // turn now ending.
    const acting = currentParticipant(combat);
    if (acting) retryImposedSaves(app, acting.id);
    const result = advanceTurn(combat);
    setCombat(result.state);
    // A new round elapsed, so tick every combatant's timed conditions down,
    // along with the enemies' timed stat modifiers and the party's
    // concentration durations.
    if (result.wrapped) {
      /** @type {{ casterId: string, spellId: string }[]} */
      const expired = [];
      state.characters = state.characters.map((c) => {
        // Concentration ticks after the conditions do, since it rewrites its
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
      app.actions.refreshSelectedCharacter();
      app.views.encounterPanel.update();
      // Swept only once both collections have been reassigned: the sweep writes
      // to the same two, and the tick's own write would put its result back.
      for (const { casterId, spellId } of expired) endSpellEffects(app, casterId, spellId);
    }
    // The sidebar panel redraws itself after its own button; the combat
    // screen has to be told the turn moved either way.
    app.views.combatScreen.update();
  };

  app.actions.endCombat = () => {
    setCombat(null);
    app.views.initiativePanel.update(); // re-hides the panel
    app.views.encounterPanel.update(); // brings the Start combat button back
    exitCombatMode();
  };

  const initiativeContainer = mustGetElement('initiative-container');
  const initiativePanel = mountInitiativePanel(initiativeContainer, {
    getState: () => combat,
    describe,
    onNext: () => app.actions.advanceCombatTurn(),
    onEnd: () => app.actions.endCombat(),
    // The active combatant's weapons, as one-click attack rolls, and their
    // castable spells as Cast buttons; both derivations live in combatants.js
    // (`weaponsOf`/`spellsOf`) so the combat screen reads the same lists. The
    // GM can drive anyone's turn; a player only their bound character's; foe
    // turns are the GM's alone.
    getWeapons: (participant) => weaponsOf(app, participant.id),
    onWeaponAttack: (participant, weapon) => {
      if (combat) weaponAttack(app, combat, participant, weapon);
    },
    getSpells: (participant) => spellsOf(app, participant.id),
    onCastSpell: (participant, spell) => {
      if (combat) castSpellAction(app, combat, participant, spell);
    },
    canAttack: (participant) =>
      describe(participant)?.side === 'foe'
        ? isGM(state.role)
        : isGM(state.role) ||
          // The party panels register the binding reader after this panel is
          // mounted, and a save reloaded with a fight in it draws its rows
          // during that mount, so the first render can precede it.
          app.actions.getBoundCharacterId?.() === participant.id,
    getRole: () => state.role,
  });

  // The Initiative card only shows while a fight is actually running — no
  // setup or idle state parked in the sidebar. Walking off the encounter's
  // tile (or defeating/deleting the last encounter there) drops the running
  // combat, since its participants are no longer "here", which hides the card
  // again. Wrapped so every existing `initiativePanel.update()` call site
  // (party moves, role switches, the rehydrate loop) gets the visibility sync
  // for free. The combat screen shows the same fight, so it refreshes here
  // too rather than growing its own copy of every call site.
  app.views.initiativePanel = {
    update: () => {
      if (combat && encountersHere().length === 0) {
        setCombat(null);
        exitCombatMode();
      }
      initiativeContainer.hidden = combat === null;
      initiativePanel.update();
      app.views.combatScreen.update();
    },
  };
  app.views.initiativePanel.update();
}
