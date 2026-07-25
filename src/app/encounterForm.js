import { promptModal, confirmModal, alertModal } from '../ui/Modal.js';
import {
  createEncounter,
  defaultEnemyGear,
  editEncounter,
  fromTemplate,
} from '../entities/Encounter.js';
import {
  activeWeapons,
  activeArmors,
  activeEnemyArmor,
  activeBestiary,
} from '../library/Library.js';
import { defaultEnemyStats, ENEMY_TIERS, STAT_KEYS } from '../entities/Modifiers.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';
import { locationFields, readLocation } from './locationFields.js';
import { casterFields, readCasterOptions, spellPickerOptions } from './casterFields.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The shared create/edit dialog behind every encounter authoring flow: name,
 * HP, level/tier, and the same map/tile placement fields the NPC dialogs
 * use. With an existing encounter it edits in place — live state (current
 * HP, stat block, conditions) survives, so placement is finally editable
 * without deleting and recreating. Without one it creates, with a stat
 * block pre-filled from the tier's level-appropriate defaults and editable
 * in place. Returns the stored encounter, or null on cancel/blank name.
 * @param {AppContext} app
 * @param {import('../types/entities.js').Encounter | null} existing
 * @param {import('../types/entities.js').EncounterLocation | null} defaultLocation placement preset for a new encounter
 * @returns {Promise<import('../types/entities.js').Encounter | null>}
 */
export async function encounterForm(app, existing, defaultLocation) {
  const { state } = app;
  // Weapon choice is the merged library list — the 5e presets plus the GM's
  // overrides and custom entries (structured damage, no dice text); an
  // existing weapon whose name isn't in it (a hand-tuned save) stays offered
  // as-is so editing other fields doesn't clobber it. "None" (the empty
  // value) marks a deliberately weaponless creature — a non-bipedal beast,
  // an ooze — which then gets no attack button in combat.
  const weaponChoices = activeWeapons();
  const currentWeapon = existing?.weapon;
  const customWeapon = currentWeapon && !weaponChoices.some((p) => p.name === currentWeapon.name);
  const weaponOptions = [
    { value: '', label: 'None (unarmed)' },
    ...(customWeapon
      ? [
          {
            value: currentWeapon.name,
            label: `${currentWeapon.name} (custom)`,
          },
        ]
      : []),
    ...weaponChoices.map((p) => ({ value: p.name, label: p.name })),
  ];
  // Armor mirrors the weapon picker: the merged library's body armors
  // (bonus = the armor's margin over the unarmored 10), an existing
  // non-library armor kept offered as-is, and "None" for the unarmored.
  const currentArmor = existing?.armor;
  const armorChoices = activeArmors();
  const customArmor = currentArmor && !armorChoices.some((a) => a.name === currentArmor.name);
  const armorOptions = [
    { value: '', label: 'None (unarmored)' },
    ...(customArmor
      ? [
          {
            value: currentArmor.name,
            label: `${currentArmor.name} (+${currentArmor.acBonus} AC) (custom)`,
          },
        ]
      : []),
    ...armorChoices.map((a) => ({ value: a.name, label: `${a.name} (+${a.acBonus} AC)` })),
  ];
  // Creation shows the stat block too, pre-filled with the tier's
  // level-appropriate defaults so a plain mob needs no stat typing but every
  // score stays overridable. Changing level or tier re-stamps the defaults
  // until a stat is hand-edited, after which the GM's numbers stand. Edits
  // omit the block — it lives on the Build-rail row's chips.
  const defaults = defaultEnemyStats(1, 'mob');
  const statFields = existing
    ? []
    : STAT_KEYS.map((key) => ({
        name: `stat-${key}`,
        label: key,
        type: /** @type {'number'} */ ('number'),
        value: defaults[key],
        min: 1,
      }));
  let statsTouched = false;
  // Two-column layout, fields paired by theme: identity (name/tier), then
  // vitals (HP/level), then gear (weapon/armor), then stats, then placement
  // — the map picker's breadcrumb labels run long, so it spans the full
  // width.
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
        // Editing an unarmed enemy (weapon null) shows None; a new enemy
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
      ...statFields,
      // Optional spellcaster section: a caster class turns the mob into a
      // combatant that can cast in initiative; "None" leaves it a plain fighter.
      ...casterFields(existing),
      ...locationFields(app, existing ? existing.location : defaultLocation).map((field) =>
        field.name === 'nodeId' ? { ...field, full: true } : field,
      ),
    ],
    {
      submitLabel: existing ? 'Save' : 'Add',
      wide: true,
      onChange: (name, form) => {
        // Refilter the spell picker to the chosen caster class and level (both
        // when creating and editing).
        if (name === 'casterClass' || name === 'casterLevel') {
          form.setOptions(
            'spells',
            spellPickerOptions(form.get('casterClass'), Number(form.get('casterLevel')) || 1),
          );
          return;
        }
        // Re-stamp the stat defaults on level/tier change, but only for a new
        // encounter and only until a stat is hand-edited.
        if (existing) return;
        if (name.startsWith('stat-')) {
          statsTouched = true;
          return;
        }
        if (statsTouched || (name !== 'level' && name !== 'tier')) return;
        const stats = defaultEnemyStats(
          Math.max(1, Number(form.get('level')) || 1),
          /** @type {import('../types/entities.js').EnemyTier} */ (form.get('tier')),
        );
        for (const key of STAT_KEYS) form.set(`stat-${key}`, stats[key]);
      },
    },
  );
  if (!values) return null;
  const name = values.name.trim();
  if (!name) return null;
  const maxHP = Math.max(1, Number(values.maxHP) || 1);
  const level = Math.max(1, Number(values.level) || 1);
  const tier = /** @type {import('../types/entities.js').EnemyTier} */ (values.tier);
  const location = readLocation(app, values);
  const preset = weaponChoices.find((p) => p.name === values.weapon);
  // The empty value is the explicit "None" choice and stores null, which
  // suppresses the default-gear stamping downstream.
  const weapon =
    values.weapon === ''
      ? null
      : preset
        ? {
            name: preset.name,
            handling: preset.handling ?? /** @type {const} */ ('melee'),
            damage: (preset.damage ?? []).map((d) => ({ ...d })),
          }
        : (currentWeapon ?? defaultEnemyGear(level, tier).weapon);
  const armor =
    values.armor === ''
      ? null
      : (activeEnemyArmor(values.armor) ?? currentArmor ?? defaultEnemyGear(level, tier).armor);
  let stored;
  if (existing) {
    // Level/tier edits don't re-stamp the stat block — the GM may have tuned
    // it by hand on the row, and it stays editable there.
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
      Object.fromEntries(
        STAT_KEYS.map((key) => [key, Math.max(1, Number(values[`stat-${key}`]) || 10)]),
      ),
      location,
      { level, tier, weapon, armor, ...readCasterOptions(values) },
    );
    state.encounters = [...state.encounters, stored];
  }
  app.actions.syncEncounterMarkers(); // also refreshes the Build-rail list
  app.views.encounterPanel.update();
  app.views.initiativePanel.update(); // authoring/moving one here starts or ends an encounter
  app.actions.markDirty();
  return stored;
}

/**
 * Confirm-and-delete shared by both encounter lists. Resolves true if deleted.
 * @param {AppContext} app
 * @param {import('../types/entities.js').Encounter} encounter
 */
export async function deleteEncounter(app, encounter) {
  const { state } = app;
  const ok = await confirmModal(`Delete "${encounter.name}"?`, {
    danger: true,
    confirmLabel: 'Delete',
  });
  if (!ok) return false;
  state.encounters = removeById(state.encounters, encounter.id);
  app.actions.syncEncounterMarkers();
  app.views.encounterPanel.update();
  app.views.initiativePanel.update();
  app.actions.markDirty();
  return true;
}

/**
 * Spawn a fresh, full-health encounter from a saved template — the
 * campaign's bestiary plus the built-in/custom library — at a chosen
 * map/tile, defaulting to the Build-mode selected tile of the viewed node.
 * The same dialog can prune a stale campaign template; library entries are
 * managed in the Library tab instead.
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
      // Same node-picker + tile X/Y group the NPC dialogs use; defaults to
      // the tile the GM has selected in the node being viewed.
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
  app.actions.syncEncounterMarkers();
  app.views.encounterPanel.update();
  app.views.initiativePanel.update(); // a spawn on the party's tile starts an encounter
  app.actions.markDirty();
  return created;
}
