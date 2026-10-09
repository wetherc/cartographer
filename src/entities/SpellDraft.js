import { normalizeTargetCount } from './SpellNormalize.js';
import { normalizeSpellBody, normalizeSpellEffect, normalizeSpellScaling } from './SpellEntry.js';

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
 * The written effect a form's control values describe, ready for
 * `SpellEntry.normalizeSpellEffect`. The form keeps one dice editor for every
 * kind, so its terms become a heal's `healing` or the `damage` of the other
 * kinds. The two form gates apply here. A save keeps its dice only when
 * "Deals damage" is ticked (a save can be condition-only), and an attack
 * fires projectiles only when "Fires projectiles" is ticked.
 * @param {EffectDraft} draft
 * @returns {Record<string, unknown>}
 */
function writtenEffect(draft) {
  const { damage, summons, projectiles, ...rest } = draft;
  if (draft.kind === 'heal') return { ...rest, healing: damage };
  if (draft.kind === 'summons') return { ...rest, ...summons };
  return {
    ...rest,
    damage: draft.kind === 'save' && !draft.dealsDamage ? [] : damage,
    ...(draft.kind === 'attack' && draft.fires ? { projectiles } : {}),
  };
}

/**
 * The effect a submitted form describes. The library import repairs its
 * entries through the same `normalizeSpellEffect`, so switching kind before
 * submission cannot leave a save ability on an attack, and an unusable
 * projectile block drops out instead of becoming a spell that fires nothing.
 * @param {EffectDraft} draft
 * @returns {SpellEffect}
 */
export function assembleEffect(draft) {
  return normalizeSpellEffect(writtenEffect(draft));
}

/**
 * The scaling block a submitted form describes, or undefined when it describes
 * none. Ticking "Scales per level" without filling either field is the same as
 * not ticking it, since a block with neither half scales nothing.
 * @param {{ damagePerLevel: DamagePart[], targetsPerLevel: unknown, levelsPerStep?: unknown } | null} draft
 * @param {SpellEffect['kind']} [kind] the effect kind the dice add to
 * @returns {Spell['scaling']}
 */
export function assembleScaling(draft, kind = undefined) {
  return draft ? normalizeSpellScaling(draft, kind) : undefined;
}

/**
 * The spell a submitted form describes, minus its id. The caller owns
 * identity and the library's merge key. Text fields are trimmed, an empty
 * range falls back to Self (the value that means "no range to state"), and a
 * blank target count reads as one creature. Everything else goes through
 * `SpellEntry.normalizeSpellBody`, the repair an imported library file uses,
 * so a typed spell and an imported one can never disagree about what a value
 * means.
 * @param {SpellDraft} draft
 * @returns {Omit<Spell, 'id'>}
 */
export function assembleSpell(draft) {
  return normalizeSpellBody({
    ...draft,
    range: draft.range.trim() || 'Self',
    description: draft.description.trim(),
    targetCount: normalizeTargetCount(draft.targetCount),
    effect: writtenEffect(draft.effect),
  });
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
