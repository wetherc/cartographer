// The ability scores of the example foes, from their SRD stat blocks or from
// the SRD creature nearest to each one. A foe without its own scores takes
// `defaultEnemyStats`, which gives all six scores one value.
//
// An armored foe sets DEX and an AC of 10 + DEX, so its worn armor gives the
// SRD AC: Leather Armor at DEX 12 is AC 12. A shield adds 2 on top of
// 10 + DEX. An unarmored foe states its natural AC.

/** @param {number[]} scores STR, DEX, CON, INT, WIS, CHA @param {number} AC */
const block = ([STR, DEX, CON, INT, WIS, CHA], AC) => ({ STR, DEX, CON, INT, WIS, CHA, AC });

export const GOBLIN = block([8, 14, 10, 10, 8, 8], 14);
export const GOBLIN_BOSS = block([10, 14, 10, 10, 8, 10], 14);
export const BUGBEAR = block([15, 14, 13, 8, 11, 9], 14);
export const BANDIT = block([11, 12, 12, 10, 10, 10], 11);
export const CULTIST = block([11, 12, 10, 10, 11, 10], 11);
// The SRD Acolyte has DEX 10. DEX 12 gives the same armored AC as a cultist.
export const ACOLYTE = block([10, 12, 10, 10, 14, 11], 11);
export const SKELETON = block([10, 14, 15, 6, 8, 5], 12);
export const WOLF = block([12, 15, 12, 3, 12, 6], 13);
export const ZOMBIE = block([13, 6, 16, 3, 6, 5], 8);
export const DROWNED = block([13, 6, 16, 3, 6, 5], 11);
export const HARPY = block([12, 13, 12, 7, 10, 13], 11);
export const SCORPION = block([15, 13, 15, 1, 9, 3], 15);
export const WINTER_WOLF = block([18, 13, 14, 7, 12, 8], 13);
// An earth spirit, near an SRD Dust Mephit in wits and a Gargoyle in build.
export const KNOCKER = block([15, 11, 16, 6, 11, 7], 14);
export const GREEN_HAG = block([18, 12, 16, 13, 14, 14], 15);
export const WYVERN = block([19, 10, 16, 5, 12, 6], 16);
// The SRD Wraith scores, with a natural AC one above the Wraith.
export const WRAITH = block([6, 16, 16, 12, 14, 15], 14);
// Studded Leather at DEX 14 gives AC 14.
export const WIGHT = block([15, 14, 16, 10, 13, 15], 12);
// Plate, the legend default from level 5, gives AC 18 whatever the DEX.
export const OSTRAND = block([18, 12, 18, 14, 16, 18], 11);
export const DIRE_WOLF = block([17, 15, 15, 3, 12, 7], 14);
// The SRD Bandit Captain: Studded Leather at DEX 16 gives AC 15.
export const BANDIT_CAPTAIN = block([15, 16, 14, 14, 11, 14], 13);
// A sworn house guard of Thornhold in Chain Mail, near an SRD Thug in build.
export const HOUSE_GUARD = block([15, 12, 14, 10, 11, 10], 11);

/** @param {string[]} saves @param {string[]} skills */
export const trained = (saves, skills) => ({ proficiencies: { saves, skills } });

export const DAGGER = {
  name: 'Dagger',
  kind: /** @type {'melee'} */ ('melee'),
  category: /** @type {'simple'} */ ('simple'),
  damage: [{ count: 1, sides: 4, damageType: 'piercing' }],
};
