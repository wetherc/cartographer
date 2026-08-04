import { promptModal } from '../ui/Modal.js';
import { createCreature, editCreature } from '../entities/Creature.js';
import { slugId, replaceById } from '../entities/Roster.js';
import { locationFields, readLocation } from './locationFields.js';
import { refilterSpellsOnChange } from './casterFields.js';
import { gearOptions } from './gearFields.js';
import { npcFields, readNPCFields } from './npcFields.js';
import { commitCreatures } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * This is the shared create/edit dialog behind every NPC authoring flow: the
 * Story sidebar, the Build rail's NPC list, the Build-mode right-click menu,
 * and the Library rail's "Add to campaign". With an existing creature it
 * edits in place. Without one it creates the creature at the given default
 * placement, optionally pre-filled from a library template. Either way, the
 * change lands in `state.creatures`, the map markers and both NPC lists
 * refresh, and a creature placed on the party's own tile is met on the spot.
 * The function returns the stored creature, or null on cancel or a blank
 * name.
 * @param {AppContext} app
 * @param {Creature | null} existing
 * @param {import('../types/entities.js').EncounterLocation | null} defaultLocation
 *   placement preset for a new creature
 * @param {import('../types/creature.js').CreatureTemplate | null} [template]
 *   template that fills a new creature's fields (ignored when editing)
 * @returns {Promise<Creature | null>}
 */
export async function npcForm(app, existing, defaultLocation, template = null) {
  const { state } = app;
  /** The source that seeds the dialog's fields: the creature being edited, or a template. */
  const seed = existing ?? template;
  // The gear choice is the merged library list, the same one the foe dialog
  // offers. "None" marks a creature that carries no weapon or armor, which
  // is what most townsfolk are.
  const gear = gearOptions(seed);
  // This uses a two-column layout matching the foe dialog: identity
  // (name/role), then disposition, full-width notes, hit points, gear, the
  // stat block, the caster section, then placement. The map picker's
  // breadcrumb labels run long, so it spans the full width.
  const values = await promptModal(
    existing ? 'Edit NPC' : 'New NPC',
    [
      ...npcFields(seed, gear),
      // This field defaults to the caller's placement (the party's tile, the
      // Build-mode selected tile, or the right-clicked tile), but the GM can
      // choose any map or tile.
      ...locationFields(app, existing ? existing.location : defaultLocation).map((field) =>
        field.name === 'nodeId' ? { ...field, full: true } : field,
      ),
    ],
    {
      submitLabel: existing ? 'Save' : 'Add',
      wide: true,
      // Refilter the spell picker for the chosen caster class and level.
      onChange: refilterSpellsOnChange,
    },
  );
  if (!values) return null;
  const fields = readNPCFields(values, gear);
  if (!fields.name) return null;
  /** @type {Creature} */
  let stored;
  if (existing) {
    // editCreature keeps the live state: a cut to the maximum takes the
    // current hit points down with it, conditions survive, and the caster
    // reconciliation rebuilds or strips slots as the class fields say.
    stored = editCreature(existing, { ...fields, location: readLocation(app, values) });
    state.creatures = replaceById(state.creatures, stored);
  } else {
    const { name: _name, ...options } = fields;
    stored = createCreature(
      slugId(
        fields.name,
        state.creatures.map((c) => c.id),
      ),
      fields.name,
      { ...options, location: readLocation(app, values) },
    );
    state.creatures = [...state.creatures, stored];
  }
  // A creature placed or moved onto the party's own tile is met on the spot.
  app.actions.meetNPCs();
  commitCreatures(app);
  return stored;
}
