import { isHitDicePool } from '../entities/HitDice.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * Which pools exist, what they are called, and how big they are, as one
 * comparable string. Pool *shape* decides the sheet's structure: a pool added,
 * removed, renamed, or given a new maximum changes how many rows and how many
 * spell-slot pips there are, so it forces a rebuild. A pool's `current` does
 * not, because the sheet writes those in place — except for hit dice, whose
 * remaining count is rendered by the progression section rather than by the
 * sheet itself.
 * @param {Character} character
 * @returns {string}
 */
function poolShape(character) {
  return JSON.stringify(
    character.resources.map((pool) => [
      pool.id,
      pool.name,
      pool.max,
      isHitDicePool(pool) ? pool.current : 0,
    ]),
  );
}

/**
 * Everything the character sheet's DOM *shape* is built from, as a flat list of
 * values to compare with {@link sameDeps}. Two renders agreeing on this list
 * differ only in values the sheet can write into the elements it already has
 * (pool levels, bonus HP, base AC, the name, the conditions), so it re-points
 * the existing DOM instead of discarding roughly two hundred elements — six
 * ability badges with an inline SVG die each, every slot pip, the progression
 * and spell sections, the condition chips — to move one health bar.
 *
 * Comparing by reference is sound because the entity layer never mutates in
 * place: any change to a character's classes, stats, inventory, or spellbook
 * hands back a new object for that field. The flip side is that this list has to
 * name every field the structural builders read, so adding a read to the sheet,
 * the progression section, or the spell section means adding it here.
 *
 * Not everything the builders read lives on the character. The spell section
 * resolves stored ids against the spell catalog, so editing a spell in the
 * Library changes what the section shows without touching the character;
 * `catalogStamp` is a value that changes whenever that catalog does, and it is
 * how the sheet learns a library edit means a rebuild.
 * @param {Character} character
 * @param {import('../types/view.js').SheetPermissions} perms
 * @param {unknown} [catalogStamp]
 * @returns {unknown[]}
 */
export function sheetDeps(character, perms, catalogStamp) {
  return [
    character.id,
    perms.editBase,
    perms.play,
    perms.hp,
    perms.restore,
    character.race,
    character.level,
    character.xp,
    character.stats,
    character.classes,
    character.asiChoices,
    character.proficiencies,
    character.expertise,
    character.inventory,
    character.equipment,
    character.spellbook,
    poolShape(character),
    catalogStamp,
  ];
}

/**
 * Whether two {@link sheetDeps} lists describe the same structure. A missing
 * previous list (nothing built yet) is never a match.
 * @param {unknown[] | null} a
 * @param {unknown[]} b
 * @returns {boolean}
 */
export function sameDeps(a, b) {
  if (!a || a.length !== b.length) return false;
  return a.every((value, i) => value === b[i]);
}
