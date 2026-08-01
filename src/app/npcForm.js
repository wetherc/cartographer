import { promptModal } from '../ui/Modal.js';
import { createNPC } from '../entities/NPC.js';
import { withCasterFields } from '../entities/Caster.js';
import { isCasterClass } from '../entities/Classes.js';
import { isSlotPool } from '../entities/SpellSlots.js';
import { slugId, replaceById } from '../entities/Roster.js';
import { locationFields, readLocation } from './locationFields.js';
import { refilterSpellsOnChange } from './casterFields.js';
import { npcFields, readNPCFields } from './npcFields.js';
import { commitNPCs } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/npc.js').NPC} NPC */

/**
 * This is the shared create/edit dialog behind every NPC authoring flow: the
 * Story sidebar, the Build rail's NPC list, the Build-mode right-click menu,
 * and the Library rail's "Add to campaign". With an existing NPC it edits in
 * place. Without one it creates the NPC at the given default placement,
 * optionally pre-filled from a library template. Either way, the change
 * lands in `state.npcs`, the map markers and both NPC lists refresh, and an
 * NPC placed on the party's own tile is met on the spot. The function
 * returns the stored NPC, or null on cancel or a blank name.
 * @param {AppContext} app
 * @param {NPC | null} existing
 * @param {import('../types/entities.js').EncounterLocation | null} defaultLocation
 *   placement preset for a new NPC
 * @param {import('../types/library.js').NPCTemplate | null} [template]
 *   template that fills a new NPC's fields (ignored when editing)
 * @returns {Promise<NPC | null>}
 */
export async function npcForm(app, existing, defaultLocation, template = null) {
  const { state } = app;
  /** The source that seeds the dialog's fields: the NPC being edited, or a template. */
  const seed = existing ?? template;
  // This uses a two-column layout matching the encounter dialog: identity
  // (name/role), then disposition, full-width notes, the stat block, the
  // caster section, then placement. The map picker's breadcrumb labels run
  // long, so it spans the full width.
  const values = await promptModal(
    existing ? 'Edit NPC' : 'New NPC',
    [
      ...npcFields(seed),
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
  const fields = readNPCFields(values);
  if (!fields.name) return null;
  /** @type {NPC} */
  let stored;
  if (existing) {
    const base = { ...existing, ...fields, location: readLocation(app, values) };
    // A caster class rebuilds slots at full and stamps the picked spellbook.
    // Choosing "None" removes the caster fields and any slot pools.
    if (isCasterClass(fields.class)) {
      stored = withCasterFields(base, fields, fields.casterLevel);
    } else {
      const { class: _c, casterLevel: _l, spellbook: _b, ...rest } = base;
      stored = { ...rest, resources: (base.resources ?? []).filter((r) => !isSlotPool(r)) };
    }
    state.npcs = replaceById(state.npcs, stored);
  } else {
    const { name: _name, ...options } = fields;
    stored = createNPC(
      slugId(
        fields.name,
        state.npcs.map((n) => n.id),
      ),
      fields.name,
      { ...options, location: readLocation(app, values) },
    );
    state.npcs = [...state.npcs, stored];
  }
  // An NPC placed or moved onto the party's own tile is met on the spot.
  app.actions.meetNPCs();
  commitNPCs(app);
  return stored;
}
