import { promptModal, confirmDelete, alertModal } from '../ui/Modal.js';
import { createEncounter, editEncounter, fromTemplate } from '../entities/Encounter.js';
import { activeBestiary } from '../library/Library.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
import { locationFields, readLocation } from './locationFields.js';
import { encounterFields, encounterFieldsChange, readEncounterFields } from './encounterFields.js';
import { gearOptions } from './gearFields.js';
import { commitEncounters } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The shared create and edit dialog for every encounter authoring flow. It
 * collects the name, HP, level, tier, and the same map and tile placement
 * fields that the NPC dialogs use.
 * With an existing encounter, this dialog edits it in place. The live state
 * (current HP, stat block, conditions) survives, so the GM can now edit
 * placement without deleting and recreating the encounter.
 * Without an existing encounter, this dialog creates one, with a stat block
 * pre-filled from the tier's level-appropriate defaults and editable in
 * place. The function returns the stored encounter, or null if the GM
 * cancels or leaves the name blank.
 * @param {AppContext} app
 * @param {import('../types/entities.js').Encounter | null} existing
 * @param {import('../types/entities.js').EncounterLocation | null} defaultLocation placement preset for a new encounter
 * @returns {Promise<import('../types/entities.js').Encounter | null>}
 */
export async function encounterForm(app, existing, defaultLocation) {
  const { state } = app;
  // The gear choice is the merged library list: the 5e presets plus the GM
  // overrides and custom entries. A hand-tuned entry that is not in the
  // library stays offered as-is. "None" marks a creature with no weapon and
  // no armor by design (for example a non-bipedal beast or an ooze), and
  // that creature gets no attack button in combat. The bestiary template
  // form shares this code.
  const gear = gearOptions(existing);
  // Creation shows the stat block too, pre-filled with the tier's
  // level-appropriate defaults. A plain mob needs no stat typing, but every
  // score stays overridable. Edits to an existing encounter omit the block,
  // because it lives on the Build-rail row's chips.
  const stats = !existing;
  // The layout uses two columns, with fields paired by theme: identity
  // (name, tier), then vitals (level, HP), then gear (weapon, armor), then
  // stats, then the caster section, then placement. The map picker's
  // breadcrumb labels run long, so the map picker spans the full width.
  const values = await promptModal(
    existing ? 'Edit encounter' : 'New encounter',
    [
      ...encounterFields(existing, gear, { stats }),
      ...locationFields(app, existing ? existing.location : defaultLocation).map((field) =>
        field.name === 'nodeId' ? { ...field, full: true } : field,
      ),
    ],
    {
      submitLabel: existing ? 'Save' : 'Add',
      wide: true,
      onChange: encounterFieldsChange({ restampStats: stats }),
    },
  );
  if (!values) return null;
  const fields = readEncounterFields(values, gear, { stats });
  const { name, maxHP, level, tier, statBlock, ...blueprint } = fields;
  if (!name) return null;
  const location = readLocation(app, values);
  let stored;
  if (existing) {
    // A level or tier edit does not re-stamp the stat block. The GM can
    // tune it by hand on the row, and it stays editable there.
    stored = editEncounter(existing, { name, maxHP, level, tier, location, ...blueprint });
    state.encounters = replaceById(state.encounters, stored);
  } else {
    stored = createEncounter(
      slugId(
        name,
        state.encounters.map((e) => e.id),
      ),
      name,
      maxHP,
      statBlock ?? {},
      location,
      { level, tier, ...blueprint },
    );
    state.encounters = [...state.encounters, stored];
  }
  commitEncounters(app);
  return stored;
}

/**
 * The confirm-and-delete flow shared by both encounter lists. Resolves to
 * true if the encounter is deleted.
 * @param {AppContext} app
 * @param {import('../types/entities.js').Encounter} encounter
 */
export async function deleteEncounter(app, encounter) {
  const { state } = app;
  const ok = await confirmDelete(encounter.name);
  if (!ok) return false;
  state.encounters = removeById(state.encounters, encounter.id);
  app.actions.removeCombatant(encounter.id);
  commitEncounters(app);
  return true;
}

/**
 * Spawn a fresh, full-health encounter from a saved template. The template
 * source is the campaign bestiary plus the built-in and custom library. The
 * new encounter appears at a chosen map and tile, and defaults to the
 * Build-mode selected tile of the viewed node.
 * This same dialog can remove a stale campaign template. The GM manages
 * library entries in the Library tab instead.
 * @param {AppContext} app
 * @returns {Promise<import('../types/entities.js').Encounter | null>}
 */
export async function addFromBestiary(app) {
  const { state } = app;
  const library = activeBestiary();
  if (state.bestiary.length === 0 && library.length === 0) {
    await alertModal(
      'The bestiary is empty. Save an encounter as a template first (the save icon on its row).',
      { title: 'Bestiary' },
    );
    return null;
  }
  const values = await promptModal(
    'Add from bestiary',
    [
      {
        name: 'template',
        label: 'Template',
        type: 'select',
        options: [
          ...state.bestiary.map((t) => ({
            value: `campaign:${t.id}`,
            label: `${t.name} (${t.maxHP} HP) — campaign`,
          })),
          ...library.map((t) => ({
            value: `library:${t.id}`,
            label: `${t.name} (${t.maxHP} HP) — library`,
          })),
        ],
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
      // This uses the same node picker and tile X/Y group as the NPC
      // dialogs. It defaults to the tile that the GM selected in the node
      // being viewed.
      ...locationFields(app, {
        nodeId: app.navigator.getCurrentNode().id,
        tileId: app.actions.getSelectedTileId() ?? '0,0',
      }),
    ],
    { submitLabel: 'Apply' },
  );
  if (!values) return null;
  const [source, templateId] = [
    values.template.slice(0, values.template.indexOf(':')),
    values.template.slice(values.template.indexOf(':') + 1),
  ];
  const template =
    source === 'campaign'
      ? state.bestiary.find((t) => t.id === templateId)
      : library.find((t) => t.id === templateId);
  if (!template) return null;
  if (values.action === 'delete') {
    if (source === 'library') {
      app.toasts.show('Built-in and custom library entries are managed in the Library tab.');
      return null;
    }
    state.bestiary = removeById(state.bestiary, template.id);
    app.actions.markDirty();
    app.toasts.show(`Deleted "${template.name}" from the bestiary.`);
    return null;
  }
  const created = fromTemplate(
    template,
    slugId(
      template.name,
      state.encounters.map((e) => e.id),
    ),
    readLocation(app, values),
  );
  state.encounters = [...state.encounters, created];
  commitEncounters(app);
  return created;
}
