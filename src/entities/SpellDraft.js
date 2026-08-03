import { normalizeMaterials, normalizeProjectiles, normalizeTargetCount } from './Casting.js';
import { normalizeRider } from './Riders.js';
import { parseCastingTime, parseDuration } from './SpellTiming.js';
import { clampInt } from '../util/num.js';

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
 * @property {boolean} [dealsDamage] the save kind's damage gate
 * @property {string} [condition] empty for none
 * @property {boolean} [fires] whether the attack kind fires projectiles
 * @property {{ count: unknown, perStep: unknown, autoHit: boolean }} [projectiles]
 * @property {{ rolls: string[], dice: unknown, die: string, flat: unknown }} [rider]
 *   what the imposed chip adds to the target's later rolls
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
 * @property {{ damagePerLevel: DamagePart[], targetsPerLevel: unknown } | null} scaling
 *   null when "Scales per level" is unticked
 */

/**
 * The effect a submitted form describes. Each kind keeps its own fields and
 * silently drops the others, so switching kind before submission cannot
 * leave a save ability on an attack. A save can deal no damage at all (a
 * condition-only spell), which is what its damage gate expresses. Attack
 * and heal always carry their dice. An unusable projectile block drops out,
 * instead of becoming a spell that fires nothing. A rider rides a chip, so
 * a save keeps one only alongside a condition, while a buff always has a
 * chip to carry it.
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
    };
  }
  if (draft.kind === 'save') {
    const condition = (draft.condition ?? '').trim();
    const rider = condition ? normalizeRider(draft.rider) : null;
    return {
      kind: 'save',
      saveAbility: /** @type {import('../types/spell.js').Ability} */ (draft.saveAbility),
      damage: draft.dealsDamage ? draft.damage : [],
      halfOnSave: Boolean(draft.halfOnSave),
      ...(condition ? { condition } : {}),
      ...(rider ? { rider } : {}),
    };
  }
  if (draft.kind === 'heal') return { kind: 'heal', healing: draft.damage };
  if (draft.kind === 'buff') {
    const condition = (draft.condition ?? '').trim();
    const rider = normalizeRider(draft.rider);
    return {
      kind: 'buff',
      ...(condition ? { condition } : {}),
      ...(rider ? { rider } : {}),
    };
  }
  return { kind: 'utility' };
}

/**
 * The scaling block a submitted form describes, or undefined when it describes
 * none. Ticking "Scales per level" without filling either field is the same as
 * not ticking it, since a block with neither half scales nothing.
 * @param {{ damagePerLevel: DamagePart[], targetsPerLevel: unknown } | null} draft
 * @returns {Spell['scaling']}
 */
export function assembleScaling(draft) {
  if (!draft) return undefined;
  const targets = clampInt(draft.targetsPerLevel, 0);
  const scaling = {
    ...(draft.damagePerLevel.length ? { damagePerLevel: draft.damagePerLevel } : {}),
    ...(targets > 0 ? { targetsPerLevel: targets } : {}),
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
