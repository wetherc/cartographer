import { promptModal } from '../ui/Modal.js';
import { createNPC, dispositionOptions } from '../entities/NPC.js';
import { ABILITY_SCORES } from '../entities/Character.js';
import { withCasterFields } from '../entities/Caster.js';
import { isCasterClass } from '../entities/Classes.js';
import { isSlotPool } from '../entities/SpellSlots.js';
import { slugId, replaceById } from '../entities/Roster.js';
import { locationFields, readLocation } from './locationFields.js';
import { casterFields, readCasterOptions, refilterSpellsOnChange } from './casterFields.js';
import { statFields, readStats } from './statFields.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/npc.js').NPC} NPC */

/**
 * The shared create/edit dialog behind every NPC authoring flow — the Story
 * sidebar, the Build rail's NPC list, the Build-mode right-click menu, and
 * the Library rail's "Add to campaign". With an existing NPC it edits in
 * place; without one it creates at the given default placement, optionally
 * pre-filled from a library template. Either way the change lands in
 * `state.npcs`, the map markers and both NPC lists refresh, and an NPC put on
 * the party's own tile is met on the spot. Returns the stored NPC, or null on
 * cancel/blank name.
 * @param {AppContext} app
 * @param {NPC | null} existing
 * @param {import('../types/entities.js').EncounterLocation | null} defaultLocation
 *   placement preset for a new NPC
 * @param {import('../types/library.js').NPCTemplate | null} [template]
 *   blueprint pre-filling a new NPC's fields (ignored when editing)
 * @returns {Promise<NPC | null>}
 */
export async function npcForm(app, existing, defaultLocation, template = null) {
  const { state } = app;
  /** Whatever seeds the dialog's fields: the NPC being edited, or a template. */
  const seed = existing ?? template;
  // Two-column layout matching the encounter dialog: identity (name/role),
  // then disposition, full-width notes, the stat block, then placement — the
  // map picker's breadcrumb labels run long, so it spans the full width.
  const values = await promptModal(
    existing ? 'Edit NPC' : 'New NPC',
    [
      { name: 'name', label: 'Name', value: seed?.name ?? '' },
      { name: 'role', label: 'Role / faction', value: seed?.role ?? '' },
      {
        name: 'disposition',
        label: 'Disposition',
        type: 'select',
        value: seed?.disposition ?? 'neutral',
        options: dispositionOptions(),
      },
      { name: 'notes', label: 'Notes', value: seed?.notes ?? '', full: true },
      // One number field per ability score, so an NPC's modifiers (initiative,
      // future checks) derive from real stats rather than a flat default.
      ...statFields(ABILITY_SCORES, seed?.stats ?? {}),
      // Optional spellcaster section: a caster class gives the NPC spell slots
      // and a spellbook so it can cast in an encounter it joins.
      ...casterFields(seed),
      // Defaults to the caller's placement (the party's tile, the Build-mode
      // selected tile, the right-clicked tile), but any map/tile can be chosen.
      ...locationFields(app, existing ? existing.location : defaultLocation).map((field) =>
        field.name === 'nodeId' ? { ...field, full: true } : field,
      ),
    ],
    {
      submitLabel: existing ? 'Save' : 'Add',
      wide: true,
      // Refilter the spell picker to the chosen caster class and level.
      onChange: refilterSpellsOnChange,
    },
  );
  const name = values?.name.trim();
  if (!values || !name) return null;
  const caster = readCasterOptions(values);
  /** @type {NPC} */
  let stored;
  if (existing) {
    const base = {
      ...existing,
      name,
      role: values.role.trim(),
      disposition: /** @type {import('../types/npc.js').Disposition} */ (values.disposition),
      notes: values.notes.trim(),
      stats: readStats(ABILITY_SCORES, values),
      location: readLocation(app, values),
    };
    // A caster class rebuilds slots at full and stamps the picked spellbook;
    // choosing "None" sheds the caster fields and any slot pools.
    if (isCasterClass(caster.class)) {
      stored = withCasterFields(base, caster, caster.casterLevel);
    } else {
      const { class: _c, casterLevel: _l, spellbook: _b, ...rest } = base;
      stored = { ...rest, resources: (base.resources ?? []).filter((r) => !isSlotPool(r)) };
    }
    state.npcs = replaceById(state.npcs, stored);
  } else {
    stored = createNPC(
      slugId(
        name,
        state.npcs.map((n) => n.id),
      ),
      name,
      {
        role: values.role.trim(),
        disposition: /** @type {import('../types/npc.js').Disposition} */ (values.disposition),
        notes: values.notes.trim(),
        stats: readStats(ABILITY_SCORES, values),
        location: readLocation(app, values),
        ...caster,
      },
    );
    state.npcs = [...state.npcs, stored];
  }
  // An NPC dropped or moved onto the party's own tile is met on the spot.
  app.actions.meetNPCs();
  app.actions.syncNPCMarkers(); // also refreshes the Build-rail NPC list
  app.views.npcPanel.update();
  app.actions.markDirty();
  return stored;
}
