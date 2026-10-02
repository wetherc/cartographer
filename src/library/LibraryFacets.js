import { crLabel } from '../data/challenge.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The filter tags of the Library rows. A tag is `facet:value`, for example
 * `class:wizard` or `cr:0.25`. A facet select above a list offers the values
 * that its rows carry, and a row shows only when it carries every chosen tag.
 */

/** @param {Spell} spell @returns {string[]} */
export function spellTags(spell) {
  return [
    ...(spell.classes ?? []).map((c) => `class:${c}`),
    `level:${spell.level}`,
    ...(spell.school ? [`school:${spell.school}`] : []),
  ];
}

/** @param {CreatureTemplate} entry @returns {string[]} */
export function creatureTags(entry) {
  return entry.cr != null && crLabel(entry.cr) ? [`cr:${entry.cr}`] : [];
}

/** The option label of one tag value, per facet. */
const LABELS = /** @type {Record<string, (value: string) => string>} */ ({
  class: capitalize,
  school: capitalize,
  level: (v) => (v === '0' ? 'Cantrip' : `Level ${v}`),
  cr: (v) => `CR ${crLabel(Number(v))}`,
});

/**
 * The options of one facet select: "All" first, then each value that a row
 * carries, once. Numbers sort by value, and words sort by name.
 * @param {{ tags?: string[] }[]} rows
 * @param {string} facet
 * @param {string} allLabel for example "All classes"
 * @returns {{ value: string, label: string }[]}
 */
export function facetOptions(rows, facet, allLabel) {
  const prefix = `${facet}:`;
  const values = new Set(
    rows.flatMap((row) => (row.tags ?? []).filter((t) => t.startsWith(prefix))),
  );
  const label = LABELS[facet] ?? String;
  return [
    { value: '', label: allLabel },
    ...[...values]
      .map((tag) => tag.slice(prefix.length))
      .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
      .map((v) => ({ value: `${prefix}${v}`, label: label(v) })),
  ];
}

/**
 * Whether a row passes the chosen facet values. An empty choice passes all.
 * @param {string[] | undefined} tags
 * @param {string[]} chosen
 */
export function matchesFacets(tags, chosen) {
  return chosen.every((tag) => !tag || (tags ?? []).includes(tag));
}
