/**
 * Concentration: the one spell effect a caster holds open, what breaks it, and
 * when it runs out. Pure — every function takes a character and hands back a
 * new one, and the d20 for a concentration save comes from the injected RNG.
 *
 * A character holds at most one, in `character.concentration`. The
 * `Concentrating` chip beside it is display: `begin` writes it, `drop` removes
 * it, and `tick` keeps its counter equal to the state's own `remaining`, which
 * is the authoritative number.
 */

import { CONCENTRATING, addCondition, removeCondition } from './Conditions.js';
import { savingThrow } from './Checks.js';
import { durationInRounds } from './SpellTiming.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ConcentrationState} ConcentrationState */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/dice.js').RollMode} RollMode */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */

/** The ability a concentration save is made in. */
export const CONCENTRATION_ABILITY = 'CON';

/**
 * The DC to hold concentration through damage: 10, or half the damage taken
 * when that is higher.
 * @param {number} damage
 * @returns {number}
 */
export function concentrationDC(damage) {
  return Math.max(10, Math.floor(damage / 2));
}

/**
 * @param {Character} character
 * @returns {boolean} whether this character is holding a spell open.
 */
export function isConcentrating(character) {
  return Boolean(character.concentration);
}

/**
 * Start concentrating on a spell, replacing whatever was held — a caster gets
 * one effect at a time, and beginning a second ends the first. The countdown
 * comes from the spell's own duration in rounds; an open-ended or day-long
 * duration has none, so it reads null and the effect lasts until something
 * breaks it.
 *
 * Returns the displaced spell alongside the new character, so the caller can say
 * what was lost and take that spell's effects off the creatures it was holding.
 * @param {Character} character
 * @param {Spell} spell
 * @param {number} slotLevel the level the spell was cast at
 * @returns {{ character: Character, dropped: ConcentrationState | null }}
 */
export function begin(character, spell, slotLevel) {
  const remaining = durationInRounds(spell.duration);
  /** @type {ConcentrationState} */
  const state = { spellId: spell.id, spellName: spell.name, slotLevel, remaining };
  return {
    character: {
      ...character,
      concentration: state,
      conditions: addCondition(character.conditions, CONCENTRATING, remaining),
    },
    dropped: character.concentration ?? null,
  };
}

/**
 * Stop concentrating, however it ended: voluntarily, on a failed save, when the
 * duration ran out, or on dropping to 0 HP. Removing the chip is part of it, so
 * no caller has to remember both halves.
 * @param {Character} character
 * @returns {Character}
 */
export function drop(character) {
  if (!character.concentration) return character;
  return {
    ...character,
    concentration: null,
    conditions: removeCondition(character.conditions, CONCENTRATING),
  };
}

/**
 * The save a concentrating character makes on taking damage: a CON save against
 * `concentrationDC`, which fails the effect out. A character holding nothing, or
 * one taking no damage, is left alone and reports no save.
 *
 * The save is reported whole so the caller can log the DC and the roll behind
 * the outcome.
 * @param {Character} character
 * @param {number} damage
 * @param {{ mode?: RollMode, rng?: RandomFn }} [opts]
 * @returns {{
 *   character: Character,
 *   save: (import('./Checks.js').SaveResult & { proficient: boolean }) | null,
 *   dropped: boolean,
 * }}
 */
export function checkOnDamage(character, damage, opts = {}) {
  if (!character.concentration || damage <= 0) {
    return { character, save: null, dropped: false };
  }
  const save = savingThrow(character, CONCENTRATION_ABILITY, concentrationDC(damage), opts);
  return {
    character: save.success ? character : drop(character),
    save,
    dropped: !save.success,
  };
}

/**
 * Advance one combat round: spend a round of the effect's duration and drop it
 * when it runs out. A duration with no round count (open-ended, or measured in
 * days) never expires here.
 *
 * The chip's counter is rewritten from `remaining` rather than decremented,
 * which is what lets the shared `tickConditions` run over the same list first:
 * whatever it did to the chip, the number the GM reads afterwards is the state's
 * own.
 * @param {Character} character
 * @returns {{ character: Character, expired: boolean }}
 */
export function tick(character) {
  const held = character.concentration;
  if (!held || held.remaining === null) return { character, expired: false };
  const remaining = held.remaining - 1;
  if (remaining <= 0) return { character: drop(character), expired: true };
  return {
    character: {
      ...character,
      concentration: { ...held, remaining },
      conditions: addCondition(character.conditions, CONCENTRATING, remaining),
    },
    expired: false,
  };
}
