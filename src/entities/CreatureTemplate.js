import { coerceCR } from '../data/challenge.js';
import { normalizeStatBlock } from './Modifiers.js';
import { copyEnemyWeapon } from './EquipmentPresets.js';
import { copySpellbook } from './CharacterSpellbook.js';
import { casterTemplateFields } from './Caster.js';
import { creatureProficiencyFields } from './Proficiencies.js';
import { defenseFields } from './DamageDefenses.js';
import { creatureTypeFields } from './CreatureType.js';
import { attackTraitFields } from './CreatureAttacks.js';
import { DISPOSITIONS, createCreature } from './Creature.js';
import { slugId } from './Roster.js';
import { capitalize } from '../util/text.js';

/**
 * Creature templates: the reusable blueprint of a creature that the library
 * keeps and that the GM saves from an encounter row. Every function here is
 * pure.
 */

/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */
/** @typedef {import('../types/creature.js').Disposition} Disposition */

/**
 * Capture a creature as a reusable template: its blueprint (name,
 * disposition, max HP, stat block, gear), not its live state (current HP,
 * location, conditions, met).
 * @param {string} id
 * @param {Creature} creature
 * @returns {CreatureTemplate}
 */
export function toTemplate(id, creature) {
  const cr = coerceCR(creature.cr);
  return {
    id,
    name: creature.name,
    disposition: creature.disposition ?? 'neutral',
    maxHP: creature.maxHP,
    stats: normalizeStatBlock(creature.stats ?? {}),
    weapon: creature.weapon ?? null,
    armor: creature.armor ?? null,
    ...(creature.level != null ? { level: creature.level, tier: creature.tier ?? 'mob' } : {}),
    ...(cr === undefined ? {} : { cr }),
    ...creatureProficiencyFields(creature.proficiencies),
    ...defenseFields(creature.defenses),
    ...creatureTypeFields(creature),
    ...attackTraitFields(creature),
    ...(creature.role !== undefined ? { role: creature.role } : {}),
    ...(creature.notes !== undefined ? { notes: creature.notes } : {}),
    ...casterTemplateFields(creature),
  };
}

/**
 * Spawn a fresh, full-health creature from a template. Every field carried
 * over is copied, not aliased. A template is shared library data (the
 * built-in list hands out the same entry object to every spawn), so two
 * creatures from one template must not edit one weapon, armor, or
 * spellbook through each other.
 *
 * The read is tolerant on purpose: a library file has no version field, so
 * an imported or hand-edited template can carry an older shape. A
 * `statBlock` field reads as `stats`. A missing disposition reads as
 * hostile, because only foe templates predate the field. Absent gear takes
 * the level default on a leveled template and null on an unleveled one,
 * which is what absence meant in each older shape.
 * @param {CreatureTemplate & { statBlock?: Record<string, number> }} template
 * @param {string} id
 * @param {EncounterLocation | null} [location]
 * @returns {Creature}
 */
export function fromTemplate(template, id, location = null) {
  const level = Number(template.level);
  return createCreature(id, template.name, {
    disposition: DISPOSITIONS.includes(template.disposition) ? template.disposition : 'hostile',
    maxHP: template.maxHP,
    stats: { ...(template.stats ?? template.statBlock ?? {}) },
    location,
    ...(Number.isFinite(level) ? { level, tier: template.tier ?? 'mob' } : {}),
    cr: template.cr,
    // The normalizer builds fresh lists, so a spawn never shares the arrays of
    // the shared template entry.
    proficiencies: template.proficiencies,
    defenses: template.defenses,
    creatureType: template.creatureType,
    conditionImmunities: template.conditionImmunities,
    multiattack: template.multiattack,
    packTactics: template.packTactics,
    surpriseAttack: template.surpriseAttack,
    multiattackDisadvantage: template.multiattackDisadvantage,
    redirectAttack: template.redirectAttack,
    turnResistance: template.turnResistance,
    legendaryActions: template.legendaryActions,
    legendaryResistance: template.legendaryResistance,
    ...(template.weapon !== undefined
      ? { weapon: template.weapon ? copyEnemyWeapon(template.weapon) : template.weapon }
      : {}),
    ...(template.armor !== undefined
      ? { armor: template.armor ? { ...template.armor } : template.armor }
      : {}),
    ...(template.role !== undefined ? { role: template.role } : {}),
    ...(template.notes !== undefined ? { notes: template.notes } : {}),
    class: template.class,
    subclass: template.subclass,
    casterLevel: template.casterLevel,
    spellbook: template.spellbook ? copySpellbook(template.spellbook) : template.spellbook,
  });
}

/**
 * Spawn `count` fresh copies of one template. A lone copy keeps the template
 * name. Two or more copies are numbered ("Wolf 1" to "Wolf 4"), so the Foes
 * list and the combat screen can tell them apart. The numbers continue past
 * the highest "Wolf N" in `takenNames`, so a second spawn of wolves starts at
 * "Wolf 5". Each copy gets its own id, made from its name and kept apart from
 * `takenIds` and from the ids of the copies before it. `locations` gives the
 * place of each copy in turn, and a list shorter than the count places the
 * rest at its last entry. A count below 1 spawns one copy.
 * @param {CreatureTemplate} template
 * @param {number} count
 * @param {EncounterLocation | null | (EncounterLocation | null)[]} locations
 * @param {Iterable<string>} takenIds
 * @param {Iterable<string>} [takenNames]
 * @returns {Creature[]}
 */
export function spawnCopies(template, count, locations, takenIds, takenNames = []) {
  const taken = new Set(takenIds);
  const total = Math.max(1, Math.floor(count) || 1);
  const places = Array.isArray(locations) ? locations : [locations];
  const first = total === 1 ? 0 : highestNumber(template.name, takenNames) + 1;
  return Array.from({ length: total }, (_, i) => {
    const name = total === 1 ? template.name : `${template.name} ${first + i}`;
    const id = slugId(name, taken);
    taken.add(id);
    const copy = fromTemplate(template, id, places[Math.min(i, places.length - 1)] ?? null);
    return name === template.name ? copy : { ...copy, name };
  });
}

/**
 * The highest N among names of the form "<base> N", or 0 when none has it.
 * @param {string} base
 * @param {Iterable<string>} names
 * @returns {number}
 */
function highestNumber(base, names) {
  let highest = 0;
  for (const name of names) {
    if (!name.startsWith(`${base} `)) continue;
    const rest = name.slice(base.length + 1);
    if (/^\d+$/.test(rest)) highest = Math.max(highest, Number(rest));
  }
  return highest;
}

/**
 * The options of the "Add from bestiary" picker, grouped by disposition and
 * then by source ("Hostile, this campaign", "Hostile, library", ...). Each
 * group is sorted by name. The `prefer` disposition comes first, so the Foes
 * list opens on hostile templates and the NPC lists on neutral ones. A
 * non-empty `query` keeps only the templates whose name contains it, ignoring
 * case. Each value is `source:id`, so a campaign template and a library entry
 * with one id stay apart. A template with no known disposition counts as
 * hostile, as `fromTemplate` reads it.
 * @param {CreatureTemplate[]} campaign
 * @param {CreatureTemplate[]} library
 * @param {string} [query]
 * @param {Disposition} [prefer]
 * @returns {{ value: string, label: string, group: string }[]}
 */
export function templateOptions(campaign, library, query = '', prefer = 'hostile') {
  const needle = query.trim().toLowerCase();
  /** @param {CreatureTemplate} t */
  const dispositionOf = (t) => (DISPOSITIONS.includes(t.disposition) ? t.disposition : 'hostile');
  /** @param {CreatureTemplate[]} list @param {string} source @param {string} group @param {Disposition} d */
  const options = (list, source, group, d) =>
    list
      .filter((t) => dispositionOf(t) === d && t.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({
        value: `${source}:${t.id}`,
        label: `${t.name} (${t.maxHP} HP)`,
        group: `${capitalize(d)}, ${group}`,
      }));
  const order = [prefer, ...DISPOSITIONS.filter((d) => d !== prefer)];
  return order.flatMap((d) => [
    ...options(campaign, 'campaign', 'this campaign', d),
    ...options(library, 'library', 'library', d),
  ]);
}
