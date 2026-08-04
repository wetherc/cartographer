import { promptModal, confirmDelete, alertModal } from '../ui/Modal.js';
import { createCreature, editCreature, fromTemplate } from '../entities/Creature.js';
import { activeCreatures } from '../library/Library.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
import { locationFields, readLocation } from './locationFields.js';
import { creatureFields, creatureFieldsChange, readCreatureFields } from './creatureFields.js';
import { gearOptions } from './gearFields.js';
import { commitCreatures } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * This is the shared create/edit dialog behind every creature authoring
 * flow: the Encounters panel, the Story sidebar, the Build rail lists, the
 * Build-mode right-click menu, and the Library rail's "Add to campaign".
 * With an existing creature it edits in place, and the live state (current
 * HP, conditions) survives, so the GM can re-tune a fight in progress. Every
 * other caller passes a seed: a library template, or a partial preset such
 * as `{ disposition: 'hostile', level: 1 }` from the "New foe here" menu
 * item, and the dialog creates the creature at the given default placement.
 * Either way, the change lands in `state.creatures`, the map markers and the
 * lists refresh, and a creature placed on the party's own tile is met on the
 * spot. The function returns the stored creature, or null on cancel or a
 * blank name.
 * @param {AppContext} app
 * @param {Creature | null} existing
 * @param {import('../types/entities.js').EncounterLocation | null} defaultLocation
 *   placement preset for a new creature
 * @param {import('./creatureFields.js').CreatureSeed} [seed]
 *   template or preset that fills a new creature's fields (ignored when
 *   editing)
 * @returns {Promise<Creature | null>}
 */
export async function creatureForm(app, existing, defaultLocation, seed = null) {
  const { state } = app;
  /** The source that seeds the dialog's fields: the creature being edited, or the seed. */
  const source = existing ?? seed;
  // The gear choice is the merged library list: the 5e presets plus the GM
  // overrides and custom entries. A hand-tuned entry that is not in the
  // library stays offered as-is. "None" marks a creature with no weapon and
  // no armor by design (for example a non-bipedal beast or an ooze), and
  // that creature gets no attack button in combat. The Library rail's
  // template form shares this code.
  const gear = gearOptions(source);
  // Creation shows the stat block, pre-filled from the seed or from the
  // level's defaults. An edit of a live foe omits the block, because it
  // lives on the Build-rail row's chips. An edit of any other creature
  // shows it, because no other surface owns it.
  const stats = !(existing && existing.disposition === 'hostile');
  // The layout uses two columns, with fields paired by theme: identity
  // (name, role), then disposition and hit points, full-width notes, the
  // level and tier, gear, stats, the caster section, then placement. The
  // map picker's breadcrumb labels run long, so it spans the full width.
  const values = await promptModal(
    existing ? 'Edit creature' : 'New creature',
    [
      ...creatureFields(source, gear, { stats }),
      ...locationFields(app, existing ? existing.location : defaultLocation).map((field) =>
        field.name === 'nodeId' ? { ...field, full: true } : field,
      ),
    ],
    {
      submitLabel: existing ? 'Save' : 'Add',
      wide: true,
      // A template's stat block is authoritative, so a level change does
      // not re-stamp over it. A bare preset seed carries no block, and the
      // defaults keep re-stamping until a stat is hand-edited.
      onChange: creatureFieldsChange({ restampStats: !existing && !seed?.stats }),
    },
  );
  if (!values) return null;
  const fields = readCreatureFields(values, gear, { stats });
  if (!fields.name) return null;
  const location = readLocation(app, values);
  /** @type {Creature} */
  let stored;
  if (existing) {
    // editCreature keeps the live state: a cut to the maximum takes the
    // current hit points down with it, conditions survive, and the caster
    // reconciliation rebuilds or strips slots as the class fields say.
    stored = editCreature(existing, { ...fields, location });
    state.creatures = replaceById(state.creatures, stored);
  } else {
    const { name, ...options } = fields;
    stored = createCreature(
      slugId(
        name,
        state.creatures.map((c) => c.id),
      ),
      name,
      { ...options, location },
    );
    state.creatures = [...state.creatures, stored];
  }
  // A creature placed or moved onto the party's own tile is met on the spot.
  app.actions.meetNPCs();
  commitCreatures(app);
  return stored;
}

/**
 * The confirm-and-delete flow shared by the creature lists. Resolves to true
 * if the creature is deleted.
 * @param {AppContext} app
 * @param {Creature} creature
 */
export async function deleteCreature(app, creature) {
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
export async function addFromLibrary(app) {
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
      // This uses the same node picker and tile X/Y group as the creature
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
