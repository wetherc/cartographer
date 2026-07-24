import { mustGetElement } from '../ui/dom.js';
import { promptModal, confirmModal, alertModal } from '../ui/Modal.js';
import { mountEncounterPanel } from '../ui/EncounterPanel.js';
import { mountInitiativePanel } from '../ui/InitiativePanel.js';
import { combatSetupModal } from '../ui/CombatSetup.js';
import { createEncounter, editEncounter, effectiveStatBlock, encountersAt, encountersNear, encountersOnTile, discoveredEncounters, isDefeated, tickStatModifiers, toTemplate, fromTemplate } from '../entities/Encounter.js';
import { mountBuildEncounterPanel } from '../ui/BuildEncounterPanel.js';
import { createParticipant, startCombat, advanceTurn } from '../combat/Initiative.js';
import { roll, formatResult } from '../dice/DiceRoller.js';
import { abilityModifier, defaultEnemyStats, ENEMY_TIERS } from '../entities/Modifiers.js';
import { npcsOnTile } from '../entities/NPC.js';
import { tickConditions } from '../entities/Conditions.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
import { isGM, hpBand } from '../view/ViewRole.js';
import { locationFields, readLocation } from './locationFields.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The Encounters and Initiative panels, the bestiary workflow, and the
 * walked-into-an-encounter alert. Owns the transient combat state; registers
 * `maybeTriggerEncounter` on `app.actions` for the party-move paths.
 * @param {AppContext} app
 */
export function wireEncounters(app) {
  const { state } = app;

  /** @type {import('../types/combat.js').CombatState | null} running combat, transient (not persisted) */
  let combat = null;

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
  app.actions.maybeTriggerEncounter = (position = app.partyTracker.getPosition(), subject = 'The party') => {
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
        app.actions.logEvent('combat', `${subject} encounters ${e.name} in ${region} (tile ${position.tileId}).`);
      }
      app.actions.markDirty();
    }
    const gm = isGM(state.role);
    const names = here.map((e) =>
      gm ? `${e.name} (${e.currentHP}/${e.maxHP} HP)` : `${e.name} (${hpBand(e.currentHP, e.maxHP)})`,
    );
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    alertModal(`${subject} has come upon ${list} here in ${region}.`, {
      title: here.length > 1 ? 'Encounters!' : 'Encounter!',
      label: 'Continue',
    });
  };

  /**
   * The shared create/edit dialog behind every encounter authoring flow: name,
   * HP, level/tier, and the same map/tile placement fields the NPC dialogs
   * use. With an existing encounter it edits in place — live state (current
   * HP, stat block, conditions) survives, so placement is finally editable
   * without deleting and recreating. Without one it creates, stamping the
   * tier's level-appropriate default stats. Returns the stored encounter, or
   * null on cancel/blank name.
   * @param {import('../types/entities.js').Encounter | null} existing
   * @param {import('../types/entities.js').EncounterLocation | null} defaultLocation placement preset for a new encounter
   * @returns {Promise<import('../types/entities.js').Encounter | null>}
   */
  async function encounterForm(existing, defaultLocation) {
    const values = await promptModal(existing ? 'Edit encounter' : 'New encounter', [
      { name: 'name', label: 'Name', value: existing?.name ?? '' },
      { name: 'maxHP', label: 'Max HP', type: 'number', value: existing?.maxHP ?? 10, min: 1 },
      { name: 'level', label: 'Level', type: 'number', value: existing?.level ?? 1, min: 1 },
      {
        name: 'tier',
        label: 'Tier',
        type: 'select',
        value: existing?.tier ?? 'mob',
        options: ENEMY_TIERS.map((t) => ({ value: t, label: t === 'mob' ? 'Mob' : 'Legend' })),
      },
      ...locationFields(app, existing ? existing.location : defaultLocation),
    ], { submitLabel: existing ? 'Save' : 'Add' });
    if (!values) return null;
    const name = values.name.trim();
    if (!name) return null;
    const maxHP = Math.max(1, Number(values.maxHP) || 1);
    const level = Math.max(1, Number(values.level) || 1);
    const tier = /** @type {import('../types/entities.js').EnemyTier} */ (values.tier);
    const location = readLocation(app, values);
    let stored;
    if (existing) {
      // Level/tier edits don't re-stamp the stat block — the GM may have tuned
      // it by hand on the row, and it stays editable there.
      stored = editEncounter(existing, { name, maxHP, level, tier, location });
      state.encounters = replaceById(state.encounters, stored);
    } else {
      stored = createEncounter(
        slugId(name, state.encounters.map((e) => e.id)),
        name,
        maxHP,
        defaultEnemyStats(level, tier),
        location,
        { level, tier },
      );
      state.encounters = [...state.encounters, stored];
    }
    app.actions.syncEncounterMarkers(); // also refreshes the Build-rail list
    app.views.encounterPanel.update();
    app.views.initiativePanel.update(); // authoring/moving one here starts or ends an encounter
    app.actions.markDirty();
    return stored;
  }

  /** Confirm-and-delete shared by both encounter lists. Resolves true if deleted. */
  async function deleteEncounter(/** @type {import('../types/entities.js').Encounter} */ encounter) {
    const ok = await confirmModal(`Delete "${encounter.name}"?`, { danger: true, confirmLabel: 'Delete' });
    if (!ok) return false;
    state.encounters = removeById(state.encounters, encounter.id);
    app.actions.syncEncounterMarkers();
    app.views.encounterPanel.update();
    app.views.initiativePanel.update();
    app.actions.markDirty();
    return true;
  }

  app.views.encounterPanel = mountEncounterPanel(mustGetElement('encounter-container'), {
    // The panel shows only what's relevant where the party stands. The GM
    // sees encounters within four times the fog reveal radius of the party
    // (plus unbound ones); players see only what's been discovered — an
    // encounter whose tile the fog has revealed, or an unbound one the party
    // has already walked into.
    getEncounters: () => {
      const position = app.partyTracker.getPosition();
      if (isGM(state.role)) {
        return encountersNear(state.encounters, position, app.partyTracker.revealRadius * 4);
      }
      return discoveredEncounters(state.encounters, position, app.grid.getNode(position.nodeId) ?? null);
    },
    onUpdate: (next) => {
      // Log the transition into defeat exactly once (damage that keeps it down
      // shouldn't re-log), by comparing against the pre-update encounter.
      const prev = state.encounters.find((e) => e.id === next.id);
      if (prev && !isDefeated(prev) && isDefeated(next)) app.actions.logEvent('combat', `Defeated ${next.name}.`);
      state.encounters = replaceById(state.encounters, next);
      app.actions.syncEncounterMarkers(); // a defeat or move should update the map marker
      app.views.initiativePanel.update(); // defeating the last one here ends the encounter
      app.actions.markDirty();
    },
    onDelete: (id) => {
      state.encounters = removeById(state.encounters, id);
      app.actions.syncEncounterMarkers();
      app.views.initiativePanel.update();
      app.actions.markDirty();
    },
    // New encounters default to where the party currently is (the common
    // case), but the shared form's placement fields let the GM stage one
    // anywhere — or leave it unplaced.
    onAdd: () => encounterForm(null, { ...app.partyTracker.getPosition() }),
    onEdit: (encounter) => encounterForm(encounter, null),
    // Save an encounter's blueprint (name, max HP, stat block) to the bestiary,
    // so the next Goblin isn't typed from scratch. Same-named saves stack as
    // separate templates — a template is a snapshot, not a live link.
    onSaveTemplate: (encounter) => {
      state.bestiary = [...state.bestiary, toTemplate(slugId(encounter.name, state.bestiary.map((t) => t.id)), encounter)];
      app.actions.markDirty();
      app.toasts.show(`Saved "${encounter.name}" to the bestiary.`);
    },
    // Spawn a fresh, full-health encounter from a saved template at a chosen
    // map/tile (defaulting to where the party stands); the same dialog can
    // also prune a stale template instead.
    onAddFromTemplate: async () => {
      if (state.bestiary.length === 0) {
        await alertModal('The bestiary is empty. Save an encounter as a template first (the save icon on its row).', {
          title: 'Bestiary',
        });
        return null;
      }
      const values = await promptModal(
        'Add from bestiary',
        [
          {
            name: 'template',
            label: 'Template',
            type: 'select',
            options: state.bestiary.map((t) => ({ value: t.id, label: `${t.name} (${t.maxHP} HP)` })),
          },
          {
            name: 'action',
            label: 'Action',
            type: 'select',
            value: 'spawn',
            options: [
              { value: 'spawn', label: 'Spawn at the location below' },
              { value: 'delete', label: 'Delete this template' },
            ],
          },
          // Same node-picker + tile X/Y group the NPC dialogs use; defaults to
          // the party's position so the common case is unchanged.
          ...locationFields(app, { ...app.partyTracker.getPosition() }),
        ],
        { submitLabel: 'Apply' },
      );
      const template = values ? state.bestiary.find((t) => t.id === values.template) : undefined;
      if (!values || !template) return null;
      if (values.action === 'delete') {
        state.bestiary = removeById(state.bestiary, template.id);
        app.actions.markDirty();
        app.toasts.show(`Deleted "${template.name}" from the bestiary.`);
        return null;
      }
      const created = fromTemplate(
        template,
        slugId(template.name, state.encounters.map((e) => e.id)),
        readLocation(app, values),
      );
      state.encounters = [...state.encounters, created];
      app.actions.syncEncounterMarkers();
      app.views.initiativePanel.update(); // a spawn on the party's tile starts an encounter
      app.actions.markDirty();
      return created;
    },
    confirmDelete: (encounter) =>
      confirmModal(`Delete "${encounter.name}"?`, { danger: true, confirmLabel: 'Delete' }),
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
  app.views.buildEncounters = mountBuildEncounterPanel(mustGetElement('build-encounters-container'), {
    getEncounters: () => encountersAt(state.encounters, { nodeId: app.navigator.getCurrentNode().id }),
    onAdd: () =>
      encounterForm(null, {
        nodeId: app.navigator.getCurrentNode().id,
        tileId: app.actions.getSelectedTileId() ?? '0,0',
      }),
    onEdit: (encounter) => encounterForm(encounter, null),
    onDelete: deleteEncounter,
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
  });

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
    /** @type {(id: string, name: string, side: 'party' | 'foe', stats: Record<string, number> | undefined) => import('../types/combat.js').Participant} */
    const withDex = (id, name, side, stats) => {
      const mod = abilityModifier(stats?.DEX ?? 10);
      return createParticipant(id, name, side, 10 + mod, mod);
    };
    return [
      ...state.characters.map((c) => withDex(c.id, c.name, 'party', c.stats)),
      ...encountersHere().map((e) => withDex(e.id, e.name, 'foe', effectiveStatBlock(e))),
      ...npcsOnTile(state.npcs, app.partyTracker.getPosition()).map((n) =>
        withDex(n.id, n.name, n.disposition === 'hostile' ? 'foe' : 'party', n.stats),
      ),
    ];
  }

  // The GM's entry into combat: a setup dialog over the map with the roster,
  // a "Roll initiative" fill (d20 + DEX modifier, hand-editable after), and a
  // Start that flips the initiative panel from hidden to the running order.
  async function startCombatSetup() {
    const participants = await combatSetupModal(combatRoster(), {
      rollInitiative: (participant) => Math.floor(Math.random() * 20) + 1 + (participant.modifier ?? 0),
      // One travelogue line per "Roll initiative" press, recording every
      // result; hand-edited overrides before Start aren't re-logged.
      onRolled: (results) =>
        app.actions.logEvent('roll', `Initiative rolled: ${results.map((r) => `${r.name} ${r.value}`).join(', ')}.`),
    });
    if (!participants) return;
    combat = startCombat(participants);
    app.views.initiativePanel.update(); // un-hides the panel
    app.views.encounterPanel.update(); // hides the Start combat button
  }

  const initiativeContainer = mustGetElement('initiative-container');
  const initiativePanel = mountInitiativePanel(initiativeContainer, {
    getState: () => combat,
    onNext: () => {
      if (!combat) return;
      const result = advanceTurn(combat);
      combat = result.state;
      // A new round elapsed, so tick every combatant's timed conditions down,
      // along with the enemies' timed stat modifiers.
      if (result.wrapped) {
        state.characters = state.characters.map((c) => ({ ...c, conditions: tickConditions(c.conditions) }));
        state.encounters = state.encounters.map((e) => ({
          ...e,
          conditions: tickConditions(e.conditions),
          statMods: tickStatModifiers(e.statMods ?? []),
        }));
        app.actions.refreshSelectedCharacter();
        app.views.encounterPanel.update();
      }
    },
    onEnd: () => {
      combat = null;
      app.views.initiativePanel.update(); // re-hides the panel
      app.views.encounterPanel.update(); // brings the Start combat button back
    },
    // The GM rolls the dice tray's current selection on the active enemy's
    // behalf; the result lands in the travelogue under the enemy's name (and
    // in a toast, since the tray's own readout stays untouched).
    onEnemyRoll: (participant) => {
      const text = formatResult(roll(app.actions.getDiceSelection()));
      app.actions.logEvent('roll', `${participant.name} rolls ${text}.`);
      app.toasts.show(`${participant.name}: ${text}`);
    },
    getRole: () => state.role,
  });

  // The Initiative card only shows while a fight is actually running — no
  // setup or idle state parked in the sidebar. Walking off the encounter's
  // tile (or defeating/deleting the last encounter there) drops the running
  // combat, since its participants are no longer "here", which hides the card
  // again. Wrapped so every existing `initiativePanel.update()` call site
  // (party moves, role switches) gets the visibility sync for free.
  app.views.initiativePanel = {
    update: () => {
      if (combat && encountersHere().length === 0) combat = null;
      initiativeContainer.hidden = combat === null;
      initiativePanel.update();
    },
  };
  app.views.initiativePanel.update();
}
