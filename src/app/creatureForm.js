import { promptModal, confirmDelete, confirmModal, alertModal } from '../ui/Modal.js';
import { createCreature, editCreature } from '../entities/Creature.js';
import { spawnCopies, templateOptions } from '../entities/CreatureTemplate.js';
import { activeCreatures } from '../library/Library.js';
import { slugId, applyFresh, removeById } from '../entities/Roster.js';
import {
  locationFields,
  moveToPartyChange,
  pickOnMapChange,
  placementChange,
  readLocation,
  viewedPlacement,
} from './locationFields.js';
import { creatureFields, creatureFieldsChange, readCreatureFields } from './creatureFields.js';
import { gearOptions } from './gearFields.js';
import { clearableDefeated, moveCreature, nameTally } from '../entities/CreatureMap.js';
import { commitCreatures, rosterIds } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */

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
 * spot. The submit button stays disabled while the name is blank. The
 * function returns the stored creature, or null on cancel.
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
  // A template's stat block is authoritative, so a level change does not
  // re-stamp over it. A bare preset seed carries no block, and the defaults
  // keep re-stamping until a stat is hand-edited.
  const statsChange = creatureFieldsChange({ restampStats: !existing && !seed?.stats });
  const partyChange = moveToPartyChange(app);
  const placeChange = placementChange(app);
  const mapPick = pickOnMapChange(app);
  // The layout uses two columns under section headings: Basics, Combat,
  // Proficiencies, the collapsed damage and condition defenses,
  // Spellcasting, then Placement. The map picker's breadcrumb labels run
  // long, so it spans the full width.
  const values = await promptModal(
    existing ? 'Edit creature' : 'New creature',
    [
      ...creatureFields(source, gear, { stats }).map((field) =>
        field.name === 'name' ? { ...field, label: 'Name (required)' } : field,
      ),
      ...locationFields(app, existing ? existing.location : defaultLocation, {
        partyButton: true,
        pickButton: true,
        warn: true,
      }).map((field, i) => ({
        ...field,
        ...(field.name === 'nodeId' ? { full: true } : {}),
        ...(i === 0 ? { section: 'Placement' } : {}),
      })),
    ],
    {
      submitLabel: existing ? 'Save' : 'Add',
      wide: true,
      advancedLabel: 'Damage and condition defenses',
      // A blank name keeps Add disabled, so the dialog never closes on a
      // form that the code below then throws away.
      submitRequires: ['name'],
      onChange: (name, form) => {
        if (!partyChange(name, form) && !mapPick(name, form)) statsChange(name, form);
        placeChange(name, form);
      },
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
    // reconciliation rebuilds or strips slots as the class fields say. The
    // live state comes from the creature as it is now, read again by id.
    // The `existing` copy is from before the dialog opened, and a heal or a
    // cross-tab save may have changed the creature since then.
    // A move onto the party tile goes through moveCreature, which keeps
    // `met`, so the party does not meet a known NPC a second time.
    const party = app.partyTracker.getPosition();
    const toParty = location?.nodeId === party.nodeId && location.tileId === party.tileId;
    const fresh = applyFresh(state.creatures, existing.id, (current) =>
      editCreature(current, { ...fields, location: toParty ? current.location : location }),
    );
    if (!fresh.entity) {
      app.toasts.show(`${existing.name} was removed while the dialog was open.`);
      return null;
    }
    state.creatures = toParty ? moveCreature(fresh.list, existing.id, location) : fresh.list;
    stored = state.creatures.find((c) => c.id === existing.id) ?? fresh.entity;
  } else {
    const { name, ...options } = fields;
    stored = createCreature(slugId(name, rosterIds(state)), name, { ...options, location });
    state.creatures = [...state.creatures, stored];
  }
  // A creature placed or moved onto the party's own tile is met on the spot.
  app.actions.meetCreatures();
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
 * Remove the defeated foes placed in the node `nodeId` that no running fight
 * lists, after one confirm. The removal goes through `commitCreatures`, as a
 * single delete does, so quest links to the removed foes go too. One
 * travelogue line names what went, and Undo brings the foes back. Resolves
 * to true if foes were removed.
 * @param {AppContext} app
 * @param {string} nodeId
 * @returns {Promise<boolean>}
 */
export async function clearDefeated(app, nodeId) {
  const { state } = app;
  const gone = clearableDefeated(state.creatures, state.combat, nodeId);
  if (gone.length === 0) return false;
  const noun = gone.length === 1 ? 'foe' : 'foes';
  const tally = nameTally(gone);
  const ok = await confirmModal(`Remove ${gone.length} defeated ${noun} from this map? ${tally}.`, {
    title: 'Clear defeated',
    variant: 'danger',
    confirmLabel: 'Remove',
  });
  if (!ok) return false;
  const ids = new Set(gone.map((c) => c.id));
  state.creatures = state.creatures.filter((c) => !ids.has(c.id));
  app.actions.logEvent('note', `Cleared ${gone.length} defeated ${noun}: ${tally}.`);
  commitCreatures(app);
  return true;
}

/** The most copies one "From bestiary" spawn places on a tile. */
const MAX_SPAWN = 20;

/**
 * Spawn fresh, full-health creatures from a saved template. The template
 * source is the campaign bestiary plus the hostile entries of the built-in
 * and custom library, grouped by source and sorted by name. The copies
 * appear at a chosen map and tile, which defaults to the Build-mode selected
 * tile of the viewed node. Removing a campaign template is a separate flow
 * (`removeTemplate`), so this dialog only adds.
 * @param {AppContext} app
 * @returns {Promise<Creature[] | null>}
 */
export async function addFromLibrary(app) {
  const { state } = app;
  const library = activeCreatures().filter((t) => t.disposition === 'hostile');
  if (state.bestiary.length === 0 && library.length === 0) {
    await alertModal(
      'The bestiary is empty. Save a creature as a template first (the save icon on its row).',
      { title: 'Bestiary' },
    );
    return null;
  }
  const placeChange = placementChange(app);
  const mapPick = pickOnMapChange(app);
  const values = await promptModal(
    'Add from bestiary',
    [
      { name: 'filter', label: 'Filter by name', type: 'search', placeholder: 'Wolf' },
      {
        name: 'template',
        label: 'Template',
        type: 'select',
        options: templateOptions(state.bestiary, library),
      },
      { name: 'count', label: 'Count', type: 'number', value: 1, min: 1, max: MAX_SPAWN },
      // This uses the same node picker and tile X/Y group as the creature
      // dialog. It defaults to the tile that the GM selected in the node
      // being viewed.
      ...locationFields(app, viewedPlacement(app), { pickButton: true, warn: true }),
    ],
    {
      submitLabel: 'Add',
      onChange: (name, form) => {
        mapPick(name, form);
        placeChange(name, form);
        if (name === 'filter')
          form.setOptions('template', templateOptions(state.bestiary, library, form.get('filter')));
      },
      validate: (get) => (get('template') ? '' : 'No template matches the filter.'),
    },
  );
  if (!values) return null;
  const at = values.template.indexOf(':');
  const [source, templateId] = [values.template.slice(0, at), values.template.slice(at + 1)];
  const template = (source === 'campaign' ? state.bestiary : library).find(
    (t) => t.id === templateId,
  );
  if (!template) return null;
  const count = Math.min(MAX_SPAWN, Number(values.count));
  const created = spawnCopies(template, count, readLocation(app, values), rosterIds(state));
  state.creatures = [...state.creatures, ...created];
  commitCreatures(app);
  return created;
}

/**
 * Remove one template from the campaign bestiary, after a pick and one
 * danger confirm. Library entries are not offered, because Library mode manages
 * them. Resolves to true if a template is removed.
 * @param {AppContext} app
 * @returns {Promise<boolean>}
 */
export async function removeTemplate(app) {
  const { state } = app;
  if (state.bestiary.length === 0) return false;
  const options = [...state.bestiary]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({ value: t.id, label: `${t.name} (${t.maxHP} HP)` }));
  /** @type {string | undefined} */
  let picked;
  // The pick dialog opens with focus on the select, so Enter submits it at
  // once. The danger confirm opens with focus on Cancel. Cancel on the
  // confirm opens the pick dialog again with the same template selected.
  for (;;) {
    const values = await promptModal(
      'Remove a bestiary template',
      [{ name: 'template', label: 'Template', type: 'select', options, value: picked }],
      { submitLabel: 'Remove' },
    );
    const template = values && state.bestiary.find((t) => t.id === values.template);
    if (!template) return false;
    if (await confirmDelete(template.name, 'Creatures already placed from it stay on the map.'))
      return dropTemplate(app, template);
    picked = template.id;
  }
}

/**
 * Remove a confirmed template from the campaign bestiary and say so.
 * @param {AppContext} app
 * @param {{ id: string, name: string }} template
 * @returns {true}
 */
function dropTemplate(app, template) {
  const { state } = app;
  state.bestiary = removeById(state.bestiary, template.id);
  app.actions.markDirty();
  app.toasts.show(`Removed "${template.name}" from the bestiary.`);
  return true;
}
