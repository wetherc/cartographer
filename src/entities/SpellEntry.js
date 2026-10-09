import { HEALING_TYPES } from './Equipment.js';
import { clampInt } from '../util/num.js';
import {
  MAX_TARGET_COUNT,
  normalizeMaterials,
  normalizeProjectiles,
  normalizeTargetCount,
} from './SpellNormalize.js';
import { parseCastingTime, parseDuration } from './SpellTiming.js';
import { normalizeRider } from './Riders.js';
import {
  attackExtras,
  buffExtras,
  normalizeLevelsPerStep,
  normalizeParts,
  normalizeRepeat,
  saveExtras,
} from './SpellFields.js';
import { cureFields } from './HealCure.js';
import { healTypeRules } from './SpellTypeRules.js';
import { stringList } from './LoadCoercion.js';
import { SPELL_SCHOOLS, SPELL_ABILITIES, SPELL_EFFECT_KINDS } from '../data/spells.js';

/**
 * The repair of one written spell into a valid Spell. The library import
 * calls `normalizeSpell` on each parsed entry, and the authoring form
 * (through `SpellDraft.js`) calls the same functions on its control values,
 * so a typed spell and an imported one go through one set of rules. Every
 * function here is pure.
 */

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/spell.js').SpellEffect} SpellEffect */

/**
 * Repair a written effect into one of the effect kinds. Each kind keeps its
 * own fields and drops the others. An unknown kind, and a summons that names
 * no creature, read as a utility effect that casts nothing. A rider rides a
 * chip, so a save keeps one only alongside a condition, while a buff always
 * has a chip to carry it. A repeated save (`saveEnds`) also needs a
 * condition to end.
 * @param {unknown} value
 * @returns {SpellEffect}
 */
export function normalizeSpellEffect(value) {
  const raw = /** @type {Record<string, any>} */ (value && typeof value === 'object' ? value : {});
  const kind = SPELL_EFFECT_KINDS.includes(raw.kind) ? raw.kind : 'utility';
  const condition = typeof raw.condition === 'string' ? raw.condition.trim() : '';
  if (kind === 'attack') {
    // Projectiles stay absent when the entry says nothing, which is a single
    // attack roll.
    const projectiles = normalizeProjectiles(raw.projectiles);
    return {
      kind: 'attack',
      damage: normalizeParts(raw.damage),
      ...(projectiles ? { projectiles } : {}),
      ...attackExtras(raw),
    };
  }
  if (kind === 'save') {
    const rider = condition ? normalizeRider(raw.rider) : null;
    const hpLimit = clampInt(raw.hpLimit, 0);
    return {
      kind: 'save',
      saveAbility: SPELL_ABILITIES.includes(raw.saveAbility) ? raw.saveAbility : 'DEX',
      damage: normalizeParts(raw.damage),
      halfOnSave: !!raw.halfOnSave,
      ...(condition ? { condition } : {}),
      // An entry with no repeated save reads as a condition that runs for
      // the spell's whole duration.
      ...(raw.saveEnds && condition ? { saveEnds: true } : {}),
      ...(hpLimit > 0 ? { hpLimit } : {}),
      ...(rider ? { rider } : {}),
      ...saveExtras(raw, condition),
    };
  }
  if (kind === 'heal') {
    return {
      kind: 'heal',
      healing: normalizeParts(raw.healing, HEALING_TYPES),
      ...(raw.addsModifier === true ? { addsModifier: true } : {}),
      ...(raw.revives === true ? { revives: true } : {}),
      ...(raw.stabilizes === true ? { stabilizes: true } : {}),
      ...cureFields(raw),
      ...healTypeRules(raw),
    };
  }
  if (kind === 'buff') {
    // An unnamed chip stays absent, and the cast falls back to the spell's
    // own name.
    const rider = normalizeRider(raw.rider);
    return {
      kind: 'buff',
      ...(condition ? { condition } : {}),
      ...(rider ? { rider } : {}),
      ...buffExtras(raw),
    };
  }
  const creature =
    kind === 'summons' && typeof raw.creature === 'string' ? raw.creature.trim() : '';
  if (creature) {
    // A count keeps to the same cap as a target count, because both put that
    // many creatures into one fight.
    const perStep = clampInt(raw.countPerStep, 0);
    return {
      kind: 'summons',
      creature,
      count: clampInt(raw.count, 1, MAX_TARGET_COUNT, 1),
      ...(perStep > 0 ? { countPerStep: Math.min(perStep, MAX_TARGET_COUNT) } : {}),
    };
  }
  return { kind: 'utility' };
}

/**
 * Repair a written scaling block, or return undefined when it scales
 * nothing. Scaling dice add to whatever the effect deals, so a heal spell's
 * per-level dice are restorative too.
 * @param {unknown} value
 * @param {SpellEffect['kind']} [kind] the effect kind the dice add to
 * @returns {Spell['scaling']}
 */
export function normalizeSpellScaling(value, kind = undefined) {
  const raw = /** @type {Record<string, unknown>} */ (
    value && typeof value === 'object' ? value : {}
  );
  const damage = normalizeParts(raw.damagePerLevel, kind === 'heal' ? HEALING_TYPES : undefined);
  const targets = clampInt(raw.targetsPerLevel, 0);
  const levelsPerStep = normalizeLevelsPerStep(raw.levelsPerStep);
  const scaling = {
    ...(damage.length > 0 ? { damagePerLevel: damage } : {}),
    ...(targets > 0 ? { targetsPerLevel: targets } : {}),
    ...(levelsPerStep ? { levelsPerStep } : {}),
  };
  return Object.keys(scaling).length > 0 ? scaling : undefined;
}

/**
 * Repair one written spell, minus its id. Descriptive fields default, and the
 * effect repairs into one of its kinds. An unrecognized effect kind falls
 * back to a text-only utility effect, so a malformed import still loads as a
 * spell that casts nothing instead of being dropped.
 * @param {Record<string, any>} raw
 * @returns {Omit<Spell, 'id'>}
 */
export function normalizeSpellBody(raw) {
  const effect = normalizeSpellEffect(raw.effect);
  const scaling = normalizeSpellScaling(raw.scaling, effect.kind);
  const repeat = normalizeRepeat(raw.repeat);

  // An absent target count stays absent. The resolver reads this as one
  // creature, so an entry that says nothing never becomes an area spell.
  const targetCount =
    raw.targetCount === undefined || raw.targetCount === null
      ? undefined
      : normalizeTargetCount(raw.targetCount);

  // A named material is an M component, even when the entry did not list the
  // letter. The repair runs here, not in the form, so an imported entry does
  // not lose its material the next time a GM edits it.
  const materials = normalizeMaterials(raw.materials);
  const letters = stringList(raw.components);
  if (materials && !letters.includes('M')) letters.push('M');

  return {
    name: String(raw.name ?? '').trim(),
    level: clampInt(raw.level, 0, 9),
    school: SPELL_SCHOOLS.includes(raw.school) ? raw.school : SPELL_SCHOOLS[0],
    classes: stringList(raw.classes),
    // Timing is structured, but an entry can contain either the object or the
    // printed string. The parsers read both forms, and keep anything
    // unclassified as plain text.
    castingTime: parseCastingTime(raw.castingTime ?? '1 action'),
    range: typeof raw.range === 'string' ? raw.range : 'Self',
    components: letters,
    ...(materials ? { materials } : {}),
    duration: parseDuration(raw.duration ?? 'Instantaneous'),
    concentration: !!raw.concentration,
    ritual: !!raw.ritual,
    description: typeof raw.description === 'string' ? raw.description : '',
    ...(targetCount === undefined ? {} : { targetCount }),
    effect,
    ...(scaling ? { scaling } : {}),
    ...(repeat ? { repeat } : {}),
  };
}

/**
 * Repair one parsed library entry into a valid Spell with the given id.
 * @param {Record<string, any>} raw
 * @param {string} id
 * @returns {Spell}
 */
export function normalizeSpell(raw, id) {
  return { id, ...normalizeSpellBody(raw) };
}
