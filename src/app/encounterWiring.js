import { mustGetElement } from '../ui/dom.js';
import { promptModal, confirmModal, alertModal } from '../ui/Modal.js';
import { mountEncounterPanel } from '../ui/EncounterPanel.js';
import { mountInitiativePanel } from '../ui/InitiativePanel.js';
import { createEncounter, encountersAt, encountersOnTile, isDefeated, toTemplate, fromTemplate } from '../entities/Encounter.js';
import { createParticipant, startCombat, advanceTurn } from '../combat/Initiative.js';
import { tickConditions } from '../entities/Conditions.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
import { isGM, hpBand } from '../view/ViewRole.js';

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
   */
  app.actions.maybeTriggerEncounter = () => {
    const position = app.partyTracker.getPosition();
    const here = encountersOnTile(state.encounters, position);
    if (here.length === 0) return;
    const node = app.grid.getNode(position.nodeId);
    const region = node ? node.name : position.nodeId;
    const gm = isGM(state.role);
    const list = here
      .map((e) => (gm ? `${e.name} (${e.currentHP}/${e.maxHP})` : `${e.name} — ${hpBand(e.currentHP, e.maxHP)}`))
      .join(', ');
    alertModal(`${list} — here in ${region}, tile (${position.tileId}).`, {
      title: here.length > 1 ? 'Encounters!' : 'Encounter!',
      label: 'Continue',
    });
  };

  app.views.encounterPanel = mountEncounterPanel(mustGetElement('encounter-container'), {
    // The panel shows only what's relevant where the party stands: encounters
    // staged in the current node, plus unbound ones from older saves.
    getEncounters: () => encountersAt(state.encounters, app.partyTracker.getPosition()),
    onUpdate: (next) => {
      // Log the transition into defeat exactly once (damage that keeps it down
      // shouldn't re-log), by comparing against the pre-update encounter.
      const prev = state.encounters.find((e) => e.id === next.id);
      if (prev && !isDefeated(prev) && isDefeated(next)) app.actions.logEvent('combat', `Defeated ${next.name}.`);
      state.encounters = replaceById(state.encounters, next);
      app.actions.syncEncounterMarkers(); // a defeat or move should update the map marker
      app.actions.markDirty();
    },
    onDelete: (id) => {
      state.encounters = removeById(state.encounters, id);
      app.actions.syncEncounterMarkers();
      app.actions.markDirty();
    },
    onAdd: async () => {
      const values = await promptModal('New encounter', [
        { name: 'name', label: 'Name', value: '' },
        { name: 'maxHP', label: 'Max HP', type: 'number', value: 10, min: 1 },
      ]);
      if (!values) return null;
      const name = values.name.trim();
      if (!name) return null;
      const maxHP = Math.max(1, Number(values.maxHP) || 1);
      // New encounters are staged where the party currently is, so the GM
      // authors them in place and they scope to that node from then on.
      const created = createEncounter(
        slugId(name, state.encounters.map((e) => e.id)),
        name,
        maxHP,
        {},
        { ...app.partyTracker.getPosition() },
      );
      state.encounters = [...state.encounters, created];
      app.actions.syncEncounterMarkers();
      app.actions.markDirty();
      return created;
    },
    // Save an encounter's blueprint (name, max HP, stat block) to the bestiary,
    // so the next Goblin isn't typed from scratch. Same-named saves stack as
    // separate templates — a template is a snapshot, not a live link.
    onSaveTemplate: (encounter) => {
      state.bestiary = [...state.bestiary, toTemplate(slugId(encounter.name, state.bestiary.map((t) => t.id)), encounter)];
      app.actions.markDirty();
      app.toasts.show(`Saved "${encounter.name}" to the bestiary.`);
    },
    // Spawn a fresh, full-health encounter from a saved template at the party's
    // location; the same dialog can also prune a stale template instead.
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
              { value: 'spawn', label: 'Spawn at party location' },
              { value: 'delete', label: 'Delete this template' },
            ],
          },
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
      const created = fromTemplate(template, slugId(template.name, state.encounters.map((e) => e.id)), {
        ...app.partyTracker.getPosition(),
      });
      state.encounters = [...state.encounters, created];
      app.actions.syncEncounterMarkers();
      app.actions.markDirty();
      return created;
    },
    confirmDelete: (encounter) =>
      confirmModal(`Delete "${encounter.name}"?`, { danger: true, confirmLabel: 'Delete' }),
    getRole: () => state.role,
  });

  app.views.initiativePanel = mountInitiativePanel(mustGetElement('initiative-container'), {
    getState: () => combat,
    // Candidate combatants: the whole party plus the living encounters where the
    // party stands. Initiative defaults to 10 and is edited in the setup list.
    getRoster: () => [
      ...state.characters.map((c) => createParticipant(c.id, c.name, 'party', 10)),
      ...encountersAt(state.encounters, app.partyTracker.getPosition())
        .filter((e) => !isDefeated(e))
        .map((e) => createParticipant(e.id, e.name, 'foe', 10)),
    ],
    onStart: (participants) => {
      combat = startCombat(participants);
    },
    onNext: () => {
      if (!combat) return;
      const result = advanceTurn(combat);
      combat = result.state;
      // A new round elapsed, so tick every combatant's timed conditions down.
      if (result.wrapped) {
        state.characters = state.characters.map((c) => ({ ...c, conditions: tickConditions(c.conditions) }));
        state.encounters = state.encounters.map((e) => ({ ...e, conditions: tickConditions(e.conditions) }));
        app.actions.refreshSelectedCharacter();
        app.views.encounterPanel.update();
      }
    },
    onEnd: () => {
      combat = null;
    },
    // Straight d20 per combatant; the field stays editable for manual override.
    rollInitiative: () => Math.floor(Math.random() * 20) + 1,
  });
}
