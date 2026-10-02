import { INVOCATIONS, PACT_BOONS } from '../data/invocations.js';
import { getSpellbook } from './Character.js';
import { classLevelOf } from './Multiclass.js';
import { getProficiencies } from './Proficiencies.js';
import { featureKey, getFeatureChoices, undoFeatureGrant } from './FeatureGrants.js';
import { compactGrants, grantDiff, mergeGrants, requestedGrants } from './GrantLedger.js';
import { settleTome } from './PactTome.js';

/**
 * The eldritch invocations and the pact boon of a warlock. A character
 * stores the ids it picked in `invocations` and its boon in `pactBoon`. The
 * reads below keep only the picks the character still qualifies for, so a
 * warlock that loses a level or changes its boon loses the invocations that
 * no longer apply. Casts through an invocation run in `app/spellCast.js`,
 * which asks `invocationCast` how the cast is paid. Every function here is
 * pure.
 */

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/invocation.js').Invocation} Invocation */
/** @typedef {import('../types/invocation.js').PactBoon} PactBoon */
/** @typedef {import('../types/invocation.js').InvocationCast} InvocationCast */

/** The warlock level at which the count of invocations goes up, and the new count. */
const COUNTS = [
  [18, 8],
  [15, 7],
  [12, 6],
  [9, 5],
  [7, 4],
  [5, 3],
  [2, 2],
];

/** The warlock level that grants the pact boon. */
export const PACT_BOON_LEVEL = 3;

/**
 * How many invocations a warlock of this level knows.
 * @param {number} level the warlock level
 * @returns {number}
 */
export function invocationCount(level) {
  return COUNTS.find(([at]) => level >= at)?.[1] ?? 0;
}

/**
 * The catalog entry with this id, or undefined.
 * @param {string} id
 * @returns {Invocation | undefined}
 */
export function getInvocation(id) {
  return INVOCATIONS.find((inv) => inv.id === id);
}

/**
 * The display name of a pact boon.
 * @param {PactBoon} boon
 * @returns {string}
 */
export function pactBoonName(boon) {
  return PACT_BOONS.find((b) => b.id === boon)?.name ?? boon;
}

/**
 * The character's pact boon, or null before 3rd warlock level or with none
 * picked.
 * @param {Character} character
 * @returns {PactBoon | null}
 */
export function getPactBoon(character) {
  const boon = character.pactBoon;
  if (classLevelOf(character, 'warlock') < PACT_BOON_LEVEL) return null;
  return PACT_BOONS.some((b) => b.id === boon) ? /** @type {PactBoon} */ (boon) : null;
}

/**
 * Whether the character meets an invocation's prerequisites: the warlock
 * level, a known cantrip, and a pact boon.
 * @param {Character} character
 * @param {Invocation} invocation
 * @returns {boolean}
 */
function qualifies(character, invocation) {
  if (classLevelOf(character, 'warlock') < invocation.level) return false;
  if (invocation.cantrip && !getSpellbook(character).cantrips.includes(invocation.cantrip)) {
    return false;
  }
  return !invocation.pact || getPactBoon(character) === invocation.pact;
}

/**
 * The invocations the character can pick, in catalog order.
 * @param {Character} character
 * @returns {Invocation[]}
 */
export function eligibleInvocations(character) {
  return INVOCATIONS.filter((inv) => qualifies(character, inv));
}

/**
 * The invocations that apply to the character: the stored picks it still
 * qualifies for, up to the count of its warlock level.
 * @param {Character} character
 * @returns {Invocation[]}
 */
export function getInvocations(character) {
  if (!character.invocations?.length) return [];
  const count = invocationCount(classLevelOf(character, 'warlock'));
  return character.invocations
    .flatMap((id) => {
      const inv = getInvocation(id);
      return inv && qualifies(character, inv) ? [inv] : [];
    })
    .slice(0, count);
}

/**
 * Record the skills of each picked invocation that grants skills (Beguiling
 * Influence) in the grant ledger, and undo the skills of each one no longer
 * picked. The record sits under the 2nd warlock level, where the first
 * invocations come. The ledger undo keeps a skill that a feat or a class
 * feature also asks for.
 * @param {Character} character
 * @param {string[]} picked the invocation ids
 * @returns {Character}
 */
function withSkillGrants(character, picked) {
  let next = character;
  for (const inv of INVOCATIONS) {
    if (inv.effect?.kind !== 'skills') continue;
    const key = featureKey({ classId: 'warlock', classLevel: 2, name: inv.name });
    const choices = getFeatureChoices(next);
    if (!picked.includes(inv.id)) {
      next = undoFeatureGrant(next, key);
      continue;
    }
    if (key in choices) continue;
    const before = getProficiencies(next);
    const request = requestedGrants({ skills: inv.effect.skills });
    const merged = mergeGrants(before, [request]);
    const requested = compactGrants(request);
    const granted = grantDiff(merged, before);
    const order = Object.values(choices).reduce((max, c) => Math.max(max, c.order + 1), 0);
    /** @type {import('../types/entities.js').FeatureChoice} */
    const choice = {
      classId: 'warlock',
      classLevel: 2,
      name: inv.name,
      order,
      ...(requested ? { requested } : {}),
      ...(granted ? { granted } : {}),
    };
    next = { ...next, proficiencies: merged, featureChoices: { ...choices, [key]: choice } };
  }
  return next;
}

/**
 * The character with this list of invocations. Unknown ids, repeats, and
 * invocations the character does not qualify for drop, and the list stops at
 * the count of its warlock level. An invocation that grants skills records
 * or undoes them to match, and a lost Pact of the Tome or Book of Ancient
 * Secrets takes back what the book granted (see `PactTome.settleTome`).
 * @param {Character} character
 * @param {string[]} ids
 * @returns {Character}
 */
export function setInvocations(character, ids) {
  const count = invocationCount(classLevelOf(character, 'warlock'));
  const kept = [...new Set(ids)]
    .filter((id) => {
      const inv = getInvocation(id);
      return inv !== undefined && qualifies(character, inv);
    })
    .slice(0, count);
  const { invocations: _old, ...rest } = character;
  const next = kept.length > 0 ? { ...rest, invocations: kept } : rest;
  return settleTome(withSkillGrants(next, kept));
}

/**
 * The character with this pact boon, or with none for null. The picks that
 * needed the old boon drop, and a switch away from the Pact of the Tome
 * removes the Book of Shadows and its cantrips.
 * @param {Character} character
 * @param {PactBoon | null} boon
 * @returns {Character}
 */
export function setPactBoon(character, boon) {
  const { pactBoon: _old, ...rest } = character;
  const next = boon ? { ...rest, pactBoon: boon } : rest;
  return setInvocations(next, character.invocations ?? []);
}

/**
 * The spell as the character's invocations change it. Eldritch Blast takes
 * the blast invocations. A spell cast at will on the warlock alone reads its
 * range as Self, and one cast with no material drops the component. A spell
 * no invocation changes comes back as it was. A cast of the same spell with
 * a slot, which a warlock that also knows the spell can pick, passes
 * `atWill: false` and keeps the range and the material.
 * @param {Character} character
 * @param {Spell} spell
 * @param {{ atWill?: boolean }} [options]
 * @returns {Spell}
 */
export function invokedSpell(character, spell, { atWill: viaInvocation = true } = {}) {
  const effects = getInvocations(character).flatMap((inv) => (inv.effect ? [inv.effect] : []));
  let next = spell;
  if (spell.id === 'eldritch-blast' && spell.effect.kind === 'attack') {
    const blasts = effects.flatMap((e) => (e.kind === 'blast' ? [e] : []));
    const range = blasts.find((e) => e.range)?.range;
    if (blasts.some((e) => e.addsModifier)) {
      next = { ...next, effect: { ...spell.effect, addsModifier: true } };
    }
    if (range) next = { ...next, range };
  }
  const atWill = effects.find((e) => e.kind === 'atWill' && e.spellId === spell.id);
  if (viaInvocation && atWill?.kind === 'atWill') {
    if (atWill.self) next = { ...next, range: 'Self' };
    if (atWill.noMaterial) {
      const { materials: _materials, ...rest } = next;
      next = { ...rest, components: next.components.filter((c) => c !== 'M') };
    }
  }
  return next;
}

/**
 * The invocation that lets each Eldritch Blast beam that hits push a
 * creature, with the feet of one push, or null.
 * @param {Character} character
 * @returns {{ name: string, feet: number } | null}
 */
export function blastPush(character) {
  for (const inv of getInvocations(character)) {
    if (inv.effect?.kind === 'blast' && inv.effect.push) {
      return { name: inv.name, feet: inv.effect.push };
    }
  }
  return null;
}

/**
 * The ids of the spells the character casts through its invocations.
 * @param {Character} character
 * @returns {string[]}
 */
export function invocationSpellIds(character) {
  const ids = getInvocations(character).flatMap((inv) =>
    inv.effect?.kind === 'atWill' || inv.effect?.kind === 'oncePerRest' ? [inv.effect.spellId] : [],
  );
  return [...new Set(ids)];
}

/**
 * How the character casts a spell through an invocation, or null when no
 * invocation casts it. An at-will invocation wins over a once-per-rest one.
 * @param {Character} character
 * @param {string} spellId
 * @returns {InvocationCast | null}
 */
export function invocationCast(character, spellId) {
  const casts = getInvocations(character).filter(
    (inv) =>
      (inv.effect?.kind === 'atWill' || inv.effect?.kind === 'oncePerRest') &&
      inv.effect.spellId === spellId,
  );
  const invocation = casts.find((inv) => inv.effect?.kind === 'atWill') ?? casts[0];
  if (!invocation) return null;
  const oncePerRest = invocation.effect?.kind === 'oncePerRest';
  return {
    invocation,
    oncePerRest,
    spent: oncePerRest && (character.invocationUses ?? []).includes(invocation.id),
  };
}

/**
 * The character with a once-per-rest invocation spent until a long rest.
 * @param {Character} character
 * @param {string} id
 * @returns {Character}
 */
export function markInvocationUsed(character, id) {
  const uses = character.invocationUses ?? [];
  return uses.includes(id) ? character : { ...character, invocationUses: [...uses, id] };
}

/**
 * The character with the skill grants of its invocations matched to the
 * invocations that apply. A warlock that drops below the level of Beguiling
 * Influence loses its skills, and gets them back when the level returns and
 * the pick still stands. `Progression.derive` calls this on every reconcile.
 * A character whose grants already match returns unchanged.
 * @param {Character} character
 * @returns {Character}
 */
export function settleInvocationSkills(character) {
  return withSkillGrants(
    character,
    getInvocations(character).map((inv) => inv.id),
  );
}

/**
 * Whether the character's invocations or pact boon claim this warlock level:
 * a level whose loss would drop an invocation, by the count or by an
 * invocation's own level, or drop the pact boon. The donor path of
 * `LevelAssign` reads this beside the other choice records.
 * @param {Character} character
 * @param {number} level the warlock level
 * @returns {boolean}
 */
export function invocationsClaim(character, level) {
  const picks = getInvocations(character);
  if (picks.length > invocationCount(level - 1)) return true;
  if (picks.some((inv) => inv.level >= level)) return true;
  return level <= PACT_BOON_LEVEL && getPactBoon(character) !== null;
}
