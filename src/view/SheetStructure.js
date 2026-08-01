import { isHitDicePool } from '../entities/HitDice.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * Which pools exist, what they are named, and how big they are, as one
 * comparable string. Pool *shape* decides the sheet's structure. Adding,
 * removing, renaming a pool, or giving it a new maximum changes the number
 * of rows and spell-slot pips, so it forces a rebuild. A pool's `current`
 * value does not force a rebuild, because the sheet writes those values in
 * place. Hit dice are the exception: the progression section draws the
 * remaining count, not the sheet itself.
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
 * Everything that builds the character sheet's DOM *shape*, as a flat list
 * of values to compare with {@link sameDeps}. Two renders that agree on
 * this list differ only in values the sheet can write into elements it
 * already has: pool levels, bonus HP, base AC, the name, the conditions.
 * The sheet then re-points the existing DOM, instead of discarding around
 * two hundred elements (six ability badges with an inline SVG die each,
 * every slot pip, the progression and spell sections, the condition chips)
 * just to move one health bar.
 *
 * Comparing by reference works because the entity layer never mutates in
 * place. Any change to a character's classes, stats, inventory, or
 * spellbook returns a new object for that field. The list must name every
 * field that the structural builders read. Adding a read to the sheet, the
 * progression section, or the spell section means adding it here too.
 *
 * Not everything the builders read lives on the character. The spell
 * section resolves stored ids against the spell catalog, so editing a spell
 * in the Library changes what the section shows, without touching the
 * character. `catalogStamp` is a value that changes whenever that catalog
 * changes. This is how the sheet learns that a library edit needs a
 * rebuild.
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
 * Everything that builds the Spellbook tab's row list. Most of it is the
 * learnable set, which follows the character's classes and level. A known
 * spell that those classes do not offer still appears, only because the
 * character knows it. Learning or forgetting one of these spells adds or
 * removes a row without changing anything else in the list. This function
 * folds the known-but-not-learnable ids in as a sorted string, instead of
 * leaving them out.
 * @param {Character} character
 * @param {string[]} knownIds The character's cantrips and known spells.
 * @param {Set<string>} learnableIds What the classes offer, from the last build.
 * @param {boolean} play Whether the viewer can act on the sheet.
 * @param {unknown} catalogStamp Changes whenever the spell catalog changes.
 * @returns {unknown[]}
 */
export function spellListDeps(character, knownIds, learnableIds, play, catalogStamp) {
  const outsiders = knownIds
    .filter((id) => !learnableIds.has(id))
    .sort()
    .join(',');
  return [character.id, play, character.level, character.classes, outsiders, catalogStamp];
}

/**
 * Whether two {@link sheetDeps} lists describe the same structure. A
 * missing previous list, meaning nothing built yet, is never a match.
 * @param {unknown[] | null} a
 * @param {unknown[]} b
 * @returns {boolean}
 */
export function sameDeps(a, b) {
  if (!a || a.length !== b.length) return false;
  return a.every((value, i) => value === b[i]);
}
