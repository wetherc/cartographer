import { promptModal, confirmDelete, alertModal } from '../ui/Modal.js';
import { createCreature, editCreature, fromTemplate } from '../entities/Creature.js';
import { activeCreatures } from '../library/Library.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
import { locationFields, readLocation } from './locationFields.js';
import { encounterFields, encounterFieldsChange, readEncounterFields } from './encounterFields.js';
import { gearOptions } from './gearFields.js';
import { commitCreatures } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * The shared create and edit dialog for every foe authoring flow. It
 * collects the name, HP, level, tier, and the same map and tile placement
 * fields that the NPC dialog uses.
 * With an existing creature, this dialog edits it in place. The live state
 * (current HP, stat block, conditions) survives, so the GM can edit
 * placement without deleting and recreating the foe.
 * Without an existing creature, this dialog creates a hostile one, with a
 * stat block pre-filled from the tier's level-appropriate defaults, or from
 * a library template, and editable in place. The function returns the
 * stored creature, or null if the GM cancels or leaves the name blank.
 * @param {AppContext} app
 * @param {Creature | null} existing
 * @param {import('../types/entities.js').EncounterLocation | null} defaultLocation placement preset for a new foe
 * @param {import('../types/creature.js').CreatureTemplate | null} [template]
 *   template that fills a new foe's fields (ignored when editing)
 * @returns {Promise<Creature | null>}
 */
export async function encounterForm(app, existing, defaultLocation, template = null) {
  const { state } = app;
  /** The source that seeds the dialog's fields: the creature being edited, or a template. */
  const seed = existing ?? template;
  // The gear choice is the merged library list: the 5e presets plus the GM
  // overrides and custom entries. A hand-tuned entry that is not in the
  // library stays offered as-is. "None" marks a creature with no weapon and
  // no armor by design (for example a non-bipedal beast or an ooze), and
  // that creature gets no attack button in combat. The bestiary template
  // form shares this code.
  const gear = gearOptions(seed);
  // Creation shows the stat block too, pre-filled with the tier's
  // level-appropriate defaults. A plain mob needs no stat typing, but every
  // score stays overridable. Edits to an existing creature omit the block,
  // because it lives on the Build-rail row's chips.
  const stats = !existing;
  // The layout uses two columns, with fields paired by theme: identity
  // (name, tier), then vitals (level, HP), then gear (weapon, armor), then
  // stats, then the caster section, then placement. The map picker's
  // breadcrumb labels run long, so the map picker spans the full width.
  const values = await promptModal(
    existing ? 'Edit encounter' : 'New encounter',
    [
      ...encounterFields(seed, gear, { stats }),
      ...locationFields(app, existing ? existing.location : defaultLocation).map((field) =>
        field.name === 'nodeId' ? { ...field, full: true } : field,
      ),
    ],
    {
      submitLabel: existing ? 'Save' : 'Add',
      wide: true,
      // A template's stat block is authoritative, so a level change does not
      // re-stamp over it.
      onChange: encounterFieldsChange({ restampStats: stats && !template }),
    },
  );
  if (!values) return null;
  const fields = readEncounterFields(values, gear, { stats });
  if (!fields.name) return null;
  const location = readLocation(app, values);
  let stored;
  if (existing) {
    // A level or tier edit does not re-stamp the stat block. The GM can
    // tune it by hand on the row, and it stays editable there. This dialog
    // has no disposition field yet, so the stored one survives the edit.
    stored = editCreature(existing, {
      ...fields,
      disposition: existing.disposition,
      location,
    });
    state.creatures = replaceById(state.creatures, stored);
  } else {
    const { name, ...options } = fields;
    stored = createCreature(
      slugId(
        name,
        state.creatures.map((c) => c.id),
      ),
      name,
      { ...options, disposition: 'hostile', location },
    );
    state.creatures = [...state.creatures, stored];
  }
  commitCreatures(app);
  return stored;
}

/**
 * The confirm-and-delete flow shared by both foe lists. Resolves to true if
 * the creature is deleted.
 * @param {AppContext} app
 * @param {Creature} creature
 */
export async function deleteEncounter(app, creature) {
  const { state } = app;
  const ok = await confirmDelete(creature.name);
  if (!ok) return false;
  state.creatures = removeById(state.creatures, creature.id);
  app.actions.removeCombatant(creature.id);
  commitCreatures(app);
  return true;
}

/**
 * Spawn a fresh, full-health creature from a saved template. The template
 * source is the campaign bestiary plus the hostile entries of the built-in
 * and custom library. The new creature appears at a chosen map and tile,
 * and defaults to the Build-mode selected tile of the viewed node.
 * This same dialog can remove a stale campaign template. The GM manages
 * library entries in the Library tab instead.
 * @param {AppContext} app
 * @returns {Promise<Creature | null>}
 */
export async function addFromBestiary(app) {
  const { state } = app;
  const library = activeCreatures().filter((t) => t.disposition === 'hostile');
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
      // dialog. It defaults to the tile that the GM selected in the node
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
      state.creatures.map((c) => c.id),
    ),
    readLocation(app, values),
  );
  state.creatures = [...state.creatures, created];
  commitCreatures(app);
  return created;
}
