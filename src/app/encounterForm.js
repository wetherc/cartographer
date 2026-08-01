import { promptModal, confirmDelete, alertModal } from '../ui/Modal.js';
import {
  createEncounter,
  defaultEnemyGear,
  editEncounter,
  fromTemplate,
} from '../entities/Encounter.js';
import { activeBestiary } from '../library/Library.js';
import { defaultEnemyStats, ENEMY_TIERS, STAT_KEYS } from '../entities/Modifiers.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
import { clampInt } from '../util/num.js';
import { locationFields, readLocation } from './locationFields.js';
import { casterFields, readCasterOptions, refilterSpellsOnChange } from './casterFields.js';
import { gearOptions, readGear } from './gearFields.js';
import { statFields, readStats } from './statFields.js';
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
  const { currentWeapon, currentArmor, weaponOptions, armorOptions } = gear;
  // Creation shows the stat block too, pre-filled with the tier's
  // level-appropriate defaults. A plain mob needs no stat typing, but every
  // score stays overridable. A change to level or tier re-stamps the
  // defaults until the GM hand-edits a stat. After that edit, the GM's
  // numbers stay. Edits to an existing encounter omit the block, because it
  // lives on the Build-rail row's chips.
  const statBlockFields = existing ? [] : statFields(STAT_KEYS, defaultEnemyStats(1, 'mob'));
  let statsTouched = false;
  // The layout uses two columns, with fields paired by theme: identity
  // (name, tier), then vitals (HP, level), then gear (weapon, armor), then
  // stats, then placement. The map picker's breadcrumb labels run long, so
  // the map picker spans the full width.
  const values = await promptModal(
    existing ? 'Edit encounter' : 'New encounter',
    [
      { name: 'name', label: 'Name', value: existing?.name ?? '' },
      {
        name: 'tier',
        label: 'Tier',
        type: 'select',
        value: existing?.tier ?? 'mob',
        options: ENEMY_TIERS.map((t) => ({
          value: t,
          label: t === 'mob' ? 'Mob' : 'Legend',
        })),
      },
      {
        name: 'maxHP',
        label: 'Max HP',
        type: 'number',
        value: existing?.maxHP ?? 10,
        min: 1,
      },
      {
        name: 'level',
        label: 'Level',
        type: 'number',
        value: existing?.level ?? 1,
        min: 1,
      },
      {
        name: 'weapon',
        label: 'Weapon',
        type: 'select',
        // Editing an unarmed enemy (weapon is null) shows None. A new enemy
        // still defaults to armed, the common humanoid case.
        value: existing ? (currentWeapon?.name ?? '') : defaultEnemyGear(1, 'mob').weapon.name,
        options: weaponOptions,
      },
      {
        name: 'armor',
        label: 'Armor',
        type: 'select',
        value: existing ? (currentArmor?.name ?? '') : defaultEnemyGear(1, 'mob').armor.name,
        options: armorOptions,
      },
      ...statBlockFields,
      // The spellcaster section is optional. A caster class turns the mob
      // into a combatant that can cast during initiative. "None" leaves it
      // a plain fighter.
      ...casterFields(existing),
      ...locationFields(app, existing ? existing.location : defaultLocation).map((field) =>
        field.name === 'nodeId' ? { ...field, full: true } : field,
      ),
    ],
    {
      submitLabel: existing ? 'Save' : 'Add',
      wide: true,
      onChange: (name, form) => {
        // Refilter the spell picker to the chosen caster class and level.
        // This applies both when creating and when editing.
        if (refilterSpellsOnChange(name, form)) return;
        // Re-stamp the stat defaults when level or tier changes. This
        // applies only to a new encounter, and only until a stat is
        // hand-edited.
        if (existing) return;
        if (name.startsWith('stat-')) {
          statsTouched = true;
          return;
        }
        if (statsTouched || (name !== 'level' && name !== 'tier')) return;
        const stats = defaultEnemyStats(
          clampInt(form.get('level'), 1),
          /** @type {import('../types/entities.js').EnemyTier} */ (form.get('tier')),
        );
        for (const key of STAT_KEYS) form.set(`stat-${key}`, stats[key]);
      },
    },
  );
  if (!values) return null;
  const name = values.name.trim();
  if (!name) return null;
  const maxHP = clampInt(values.maxHP, 1);
  const level = clampInt(values.level, 1);
  const tier = /** @type {import('../types/entities.js').EnemyTier} */ (values.tier);
  const location = readLocation(app, values);
  // The empty value is the explicit "None" choice. It stores null, which
  // suppresses the default-gear stamping that follows.
  const { weapon, armor } = readGear(
    values.weapon,
    values.armor,
    gear,
    defaultEnemyGear(level, tier),
  );
  let stored;
  if (existing) {
    // A level or tier edit does not re-stamp the stat block. The GM can
    // tune it by hand on the row, and it stays editable there.
    stored = editEncounter(existing, {
      name,
      maxHP,
      level,
      tier,
      location,
      weapon,
      armor,
      ...readCasterOptions(values),
    });
    state.encounters = replaceById(state.encounters, stored);
  } else {
    stored = createEncounter(
      slugId(
        name,
        state.encounters.map((e) => e.id),
      ),
      name,
      maxHP,
      readStats(STAT_KEYS, values),
      location,
      { level, tier, weapon, armor, ...readCasterOptions(values) },
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
