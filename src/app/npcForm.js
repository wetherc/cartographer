import { promptModal } from '../ui/Modal.js';
import { createNPC, DISPOSITIONS } from '../entities/NPC.js';
import { ABILITY_SCORES } from '../entities/Character.js';
import { slugId, replaceById } from '../entities/Roster.js';
import { locationFields, readLocation } from './locationFields.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/npc.js').NPC} NPC */

const dispositionOptions = DISPOSITIONS.map((d) => ({
  value: d,
  label: d[0].toUpperCase() + d.slice(1),
}));

// One number field per ability score, so an NPC's modifiers (initiative,
// future checks) derive from real stats rather than a flat default.
/** @type {(stats: Record<string, number>) => import('../ui/Modal.js').ModalField[]} */
const statFields = (stats) =>
  ABILITY_SCORES.map((key) => ({
    name: `stat-${key}`,
    label: key,
    type: 'number',
    value: stats[key] ?? 10,
    min: 1,
  }));

/** @type {(values: Record<string, string>) => Record<string, number>} */
const readStats = (values) =>
  Object.fromEntries(
    ABILITY_SCORES.map((key) => [key, Math.max(1, Number(values[`stat-${key}`]) || 10)]),
  );

/**
 * The shared create/edit dialog behind every NPC authoring flow — the Story
 * sidebar, the Build rail's NPC list, and the Build-mode right-click menu.
 * With an existing NPC it edits in place; without one it creates at the given
 * default placement. Either way the change lands in `state.npcs`, the map
 * markers and both NPC lists refresh, and an NPC put on the party's own tile
 * is met on the spot. Returns the stored NPC, or null on cancel/blank name.
 * @param {AppContext} app
 * @param {NPC | null} existing
 * @param {import('../types/entities.js').EncounterLocation | null} defaultLocation
 *   placement preset for a new NPC
 * @returns {Promise<NPC | null>}
 */
export async function npcForm(app, existing, defaultLocation) {
  const { state } = app;
  // Two-column layout matching the encounter dialog: identity (name/role),
  // then disposition, full-width notes, the stat block, then placement — the
  // map picker's breadcrumb labels run long, so it spans the full width.
  const values = await promptModal(
    existing ? 'Edit NPC' : 'New NPC',
    [
      { name: 'name', label: 'Name', value: existing?.name ?? '' },
      { name: 'role', label: 'Role / faction', value: existing?.role ?? '' },
      {
        name: 'disposition',
        label: 'Disposition',
        type: 'select',
        value: existing?.disposition ?? 'neutral',
        options: dispositionOptions,
      },
      { name: 'notes', label: 'Notes', value: existing?.notes ?? '', full: true },
      ...statFields(existing?.stats ?? {}),
      // Defaults to the caller's placement (the party's tile, the Build-mode
      // selected tile, the right-clicked tile), but any map/tile can be chosen.
      ...locationFields(app, existing ? existing.location : defaultLocation).map((field) =>
        field.name === 'nodeId' ? { ...field, full: true } : field,
      ),
    ],
    { submitLabel: existing ? 'Save' : 'Add', wide: true },
  );
  const name = values?.name.trim();
  if (!values || !name) return null;
  /** @type {NPC} */
  let stored;
  if (existing) {
    stored = {
      ...existing,
      name,
      role: values.role.trim(),
      disposition: /** @type {import('../types/npc.js').Disposition} */ (values.disposition),
      notes: values.notes.trim(),
      stats: readStats(values),
      location: readLocation(app, values),
    };
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
        stats: readStats(values),
        location: readLocation(app, values),
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
