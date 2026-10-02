import {
  MAX_TARGET_COUNT,
  normalizeMaterials,
  normalizeProjectiles,
  normalizeTargetCount,
} from './SpellNormalize.js';
import { normalizeRider } from './Riders.js';
import {
  attackExtras,
  buffExtras,
  normalizeLevelsPerStep,
  normalizeRepeat,
  saveExtras,
} from './SpellFields.js';
import { parseCastingTime, parseDuration } from './SpellTiming.js';
import { clampInt } from '../util/num.js';
import { cureFields } from './HealCure.js';
import { healTypeRules } from './SpellTypeRules.js';

/**
 * This module turns the spell form's raw control values into a Spell. It is
 * split out of `ui/SpellForm.js`, so the part that decides what a
 * submitted form means is testable without building the form. This covers
 * which effect fields survive the chosen kind, when a block drops out
 * entirely, and where the tolerant parsers that the library import path
 * uses get applied.
 *
 * Everything here takes the strings and booleans that a control holds, not
 * the controls. A caller passes `input.value` rather than the input.
 */

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/spell.js').SpellEffect} SpellEffect */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */

/**
 * The effect half of a submitted form: every control the effect section holds,
 * regardless of which kind is showing. `assembleEffect` keeps only what the kind
 * carries.
 * @typedef {object} EffectDraft
 * @property {string} kind
 * @property {DamagePart[]} damage the dice editor's terms, damage or healing
 * @property {string} [saveAbility]
 * @property {boolean} [halfOnSave]
 * @property {boolean} [saveEnds] whether the imposed condition ends on a
 *   save at the end of each of the target's turns
 * @property {unknown} [hpLimit] the save kind's HP limit, 0 or blank for none
 * @property {{ count: unknown, sides: unknown, perStep: unknown } | null} [hpPool]
 *   the HP pool the save kind rolls in place of a save, null for none
 * @property {boolean} [kills] whether a failed save of the save kind kills
 * @property {boolean} [endsOnDamage] whether damage ends the save's condition
 * @property {boolean} [addsModifier] whether the heal or the attack kind adds
 *   the spellcasting ability modifier
 * @property {boolean} [revives] whether the heal kind raises the dead
 * @property {boolean} [stabilizes] whether the heal kind stabilizes the dying
 * @property {string} [removes] the chips the heal kind ends, comma-separated
 * @property {string} [removesOneOf] the chips of which the heal kind ends one,
 *   comma-separated
 * @property {Record<string, string[]>} [typeRules] the creature-type rules of a
 *   save or a heal
 * @property {boolean} [melee] whether the attack kind is a melee spell attack
 * @property {boolean} [halfOnMiss] whether a miss of the attack kind deals half
 * @property {string} [until] the turn boundary that ends a save's condition
 *   or a buff's chip
 * @property {{
 *   ac?: unknown, acBase?: unknown, acMin?: unknown, maxHP?: unknown, immune?: string[],
 *   saveAdvantage?: string[], extraAction?: boolean, attacks?: string,
 *   attacksAgainst?: string, attackerTypes?: string[], once?: boolean,
 *   resist?: string[], resistNonmagical?: boolean,
 * }} [mods]
 *   what a buff's or a save's chip changes besides a roll
 * @property {string[]} [resistChoice] the damage types a buff's caster picks
 *   one of at the cast
 * @property {{ maxHP: unknown }} [modsPerStep] how much more HP raise a buff
 *   gives per scaling increment
 * @property {{ count: unknown, sides: unknown, flat: unknown, flatPerStep: unknown }} [tempHP]
 *   the temporary HP a buff grants at the cast
 * @property {boolean} [tempEachTurn] whether a buff's chip grants the spell
 *   modifier as temporary HP each turn
 * @property {{ damage: DamagePart[], perStep: DamagePart[], until: string } | null} [ongoing]
 *   the damage an attack or a save leaves for later turns, null for none
 * @property {{ condition: string, saveAbility: string, until: string, mods?: Record<string, unknown>, typed?: unknown } | null} [onHit]
 *   the save or chip an attack's hit brings, null for none. An empty
 *   `saveAbility` means no save
 * @property {string} [drain] the share of dealt damage an attack gives back
 *   to its caster, empty for none
 * @property {boolean} [dealsDamage] the save kind's damage gate
 * @property {string} [condition] empty for none
 * @property {boolean} [fires] whether the attack kind fires projectiles
 * @property {{ count: unknown, perStep: unknown, autoHit: boolean }} [projectiles]
 * @property {{ rolls: string[], dice: unknown, die: string, flat: unknown, once?: boolean }} [rider]
 *   what the imposed chip adds to the target's later rolls
 * @property {{ creature: string, count: unknown, countPerStep: unknown }} [summons]
 *   which library creature template the summons kind spawns, and how many
 */

/**
 * The whole submitted form.
 * @typedef {object} SpellDraft
 * @property {string} name
 * @property {string | number} level
 * @property {string} school
 * @property {string[]} classes the ticked class ids
 * @property {unknown} castingTime whatever the timing controls held
 * @property {unknown} duration the same for the duration controls
 * @property {string} range
 * @property {string[]} components the ticked component letters
 * @property {{ text: string, costGP: unknown, consumed: boolean } | null} materials
 *   null when the M component is unticked
 * @property {boolean} concentration
 * @property {boolean} ritual
 * @property {string} description
 * @property {unknown} targetCount
 * @property {EffectDraft} effect
 * @property {{ damagePerLevel: DamagePart[], targetsPerLevel: unknown, levelsPerStep?: unknown } | null} scaling
 *   null when "Scales per level" is unticked
 * @property {{ cost: string, damage: DamagePart[] } | null} [repeat] how the
 *   caster repeats the spell on later turns, null when it does not
 */

/**
 * The effect a submitted form describes. Each kind keeps its own fields and
 * silently drops the others, so switching kind before submission cannot
 * leave a save ability on an attack. A save can deal no damage at all (a
 * condition-only spell), which is what its damage gate expresses. Attack
 * and heal always carry their dice. An unusable projectile block drops out,
 * instead of becoming a spell that fires nothing. A rider rides a chip, so
 * a save keeps one only alongside a condition, while a buff always has a
 * chip to carry it. A repeated save (`saveEnds`) also needs a condition to
 * end.
 * @param {EffectDraft} draft
 * @returns {SpellEffect}
 */
export function assembleEffect(draft) {
  if (draft.kind === 'attack') {
    const projectiles = draft.fires ? normalizeProjectiles(draft.projectiles) : null;
    return {
      kind: 'attack',
      damage: draft.damage,
      ...(projectiles ? { projectiles } : {}),
      ...attackExtras(draft),
    };
  }
  if (draft.kind === 'save') {
    const condition = (draft.condition ?? '').trim();
    const hpLimit = clampInt(draft.hpLimit, 0);
    const rider = condition ? normalizeRider(draft.rider) : null;
    return {
      kind: 'save',
      saveAbility: /** @type {import('../types/spell.js').Ability} */ (draft.saveAbility),
      damage: draft.dealsDamage ? draft.damage : [],
      halfOnSave: Boolean(draft.halfOnSave),
      ...(condition ? { condition } : {}),
      ...(condition && draft.saveEnds ? { saveEnds: true } : {}),
      ...(hpLimit > 0 ? { hpLimit } : {}),
      ...(rider ? { rider } : {}),
      ...saveExtras(draft, condition),
    };
  }
  if (draft.kind === 'heal') {
    return {
      kind: 'heal',
      healing: draft.damage,
      ...(draft.addsModifier ? { addsModifier: true } : {}),
      ...(draft.revives ? { revives: true } : {}),
      ...(draft.stabilizes ? { stabilizes: true } : {}),
      ...cureFields(draft),
      ...healTypeRules(draft),
    };
  }
  // A summons with no template names nothing to spawn, so it casts nothing and
  // reads as a utility spell. This is the same rule the library import applies.
  if (draft.kind === 'summons' && (draft.summons?.creature ?? '').trim()) {
    const summons = /** @type {NonNullable<EffectDraft['summons']>} */ (draft.summons);
    const perStep = clampInt(summons.countPerStep, 0);
    return {
      kind: 'summons',
      creature: summons.creature.trim(),
      count: clampInt(summons.count, 1, MAX_TARGET_COUNT, 1),
      ...(perStep > 0 ? { countPerStep: Math.min(perStep, MAX_TARGET_COUNT) } : {}),
    };
  }
  if (draft.kind === 'buff') {
    const condition = (draft.condition ?? '').trim();
    const rider = normalizeRider(draft.rider);
    return {
      kind: 'buff',
      ...(condition ? { condition } : {}),
      ...(rider ? { rider } : {}),
      ...buffExtras(draft),
    };
  }
  return { kind: 'utility' };
}

/**
 * The scaling block a submitted form describes, or undefined when it describes
 * none. Ticking "Scales per level" without filling either field is the same as
 * not ticking it, since a block with neither half scales nothing.
 * @param {{ damagePerLevel: DamagePart[], targetsPerLevel: unknown, levelsPerStep?: unknown } | null} draft
 * @returns {Spell['scaling']}
 */
export function assembleScaling(draft) {
  if (!draft) return undefined;
  const targets = clampInt(draft.targetsPerLevel, 0);
  const levelsPerStep = normalizeLevelsPerStep(draft.levelsPerStep);
  const scaling = {
    ...(draft.damagePerLevel.length ? { damagePerLevel: draft.damagePerLevel } : {}),
    ...(targets > 0 ? { targetsPerLevel: targets } : {}),
    ...(levelsPerStep ? { levelsPerStep } : {}),
  };
  return Object.keys(scaling).length ? scaling : undefined;
}

/**
 * The spell a submitted form describes, minus its id. The caller owns
 * identity and the library's merge key. Text fields are trimmed, and an
 * empty range falls back to Self (the value that means "no range to
 * state"). The timing, material, and target-count fields go through the
 * same parsers that an imported library file uses, so a typed spell and an
 * imported one can never disagree about what a value means.
 * @param {SpellDraft} draft
 * @returns {Omit<Spell, 'id'>}
 */
export function assembleSpell(draft) {
  const materials = draft.materials ? normalizeMaterials(draft.materials) : null;
  const scaling = assembleScaling(draft.scaling);
  const repeat = draft.repeat ? normalizeRepeat(draft.repeat) : null;
  return {
    name: draft.name.trim(),
    level: Number(draft.level),
    school: /** @type {import('../types/spell.js').SpellSchool} */ (draft.school),
    classes: draft.classes,
    castingTime: parseCastingTime(draft.castingTime),
    range: draft.range.trim() || 'Self',
    components: draft.components,
    ...(materials ? { materials } : {}),
    duration: parseDuration(draft.duration),
    concentration: Boolean(draft.concentration),
    ritual: Boolean(draft.ritual),
    description: draft.description.trim(),
    targetCount: normalizeTargetCount(draft.targetCount),
    effect: assembleEffect(draft.effect),
    ...(scaling ? { scaling } : {}),
    ...(repeat ? { repeat } : {}),
  };
}

/**
 * The damage or healing dice already on an effect, or null when it carries none.
 * The form seeds one dice editor from this and reuses it across kinds, so an
 * empty list must read as "nothing to seed from" rather than as zero dice.
 * @param {SpellEffect | undefined} effect
 * @returns {DamagePart[] | null}
 */
export function effectDamageOf(effect) {
  if (!effect) return null;
  if (effect.kind === 'attack' || effect.kind === 'save') {
    return effect.damage.length ? effect.damage : null;
  }
  if (effect.kind === 'heal') return effect.healing.length ? effect.healing : null;
  return null;
}
