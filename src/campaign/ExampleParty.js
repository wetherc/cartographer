import { addXP, createCharacter, withHP } from '../entities/Character.js';
import { assembleProficiencies } from '../entities/Proficiencies.js';
import {
  applyASI,
  applyFeatureGrant,
  derive,
  takeFeat,
  withClasses,
  withProficiencies,
  withRace,
} from '../entities/Progression.js';
import { withBackground } from '../entities/Backgrounds.js';
import { applyLevelChoices } from '../entities/LevelAssign.js';
import { buildFeatureStamp, pendingFeatureGrants } from '../entities/FeatureGrants.js';
import { buildStamp } from '../entities/FeatChoices.js';
import { classMaxHP, withHitDice } from '../entities/HitDice.js';
import { withSpellSlots } from '../entities/SpellSlots.js';
import { xpForLevel } from '../entities/Experience.js';
import { DEFAULT_FEATS } from '../data/feats.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').Equipment} Equipment */

/**
 * The example party: four level-4 characters, each built through the same
 * calls that the level-up flow makes, so the sheet shows a real history of
 * choices. Ser Aldric takes the Dueling fighting style and a feat, Mirelle an ability score increase, Wren
 * claims the Expertise of the Rogue and takes the Arcane Trickster
 * subclass, and Brannoc takes Great Weapon Fighting and multiclasses from an
 * Eldritch Knight into a wizard.
 */

/**
 * A level-1 character with a race, a background, one class, and its skill
 * picks. The proficiencies are assembled here, once, because a later
 * `assembleProficiencies` call would drop what feats and features grant.
 * @param {string} id @param {string} name @param {Record<string, number>} stats
 * @param {{ raceId: string, race: string, background: string, classId: string,
 *   subclass?: string, skills: string[] }} origin
 * @returns {Character}
 */
function levelOne(id, name, stats, { raceId, race, background, classId, subclass, skills }) {
  let c = createCharacter(id, name, stats, race);
  c = withBackground(withRace(c, raceId), background);
  c = withClasses(c, [{ classId, level: 1, ...(subclass ? { subclass } : {}) }]);
  c = withProficiencies(c, assembleProficiencies(c, { skills }));
  return withHitDice(withSpellSlots(withHP(c, classMaxHP(c) ?? 0)));
}

/**
 * Raise a level-1 character to level 4, assigning each new level in order.
 * @param {Character} c
 * @param {{ classId: string, subclass?: string }[]} levels
 * @returns {Character}
 */
function levelUp(c, levels) {
  let next = addXP(c, xpForLevel(1 + levels.length));
  for (const { classId, subclass } of levels) {
    next = applyLevelChoices(next, { classId, skills: [], stamps: [], subclass });
  }
  return next;
}

/** @param {string} id @returns {import('../types/feat.js').Feat} */
const feat = (id) => /** @type {any} */ (DEFAULT_FEATS.find((f) => f.id === id));

/** No slot filled. @returns {Equipment} */
const bare = () => ({
  helmet: null,
  chest: null,
  gloves: null,
  greaves: null,
  mainHand: null,
  offHand: null,
  ranged: null,
  accessory: null,
  accessory2: null,
});

/** @param {number} gp @returns {InventoryItem} */
const purse = (gp) => ({ id: 'gold', name: 'Gold (gp)', quantity: gp, notes: '', type: 'gear' });

/** @returns {InventoryItem} */
const healingPotion = () => ({
  id: 'healing-potion',
  name: 'Potion of Healing',
  quantity: 1,
  notes: 'Restores 2d4+2 HP.',
  type: 'consumable',
  heals: { count: 2, sides: 4, bonus: 2 },
});

/** Ser Aldric, a knight sworn to House Vane. @returns {Character} */
function aldric() {
  let c = levelOne(
    'aldric',
    'Ser Aldric',
    { STR: 15, DEX: 12, CON: 14, WIS: 12 },
    {
      raceId: 'human',
      race: 'Human',
      background: 'soldier',
      classId: 'fighter',
      skills: ['perception', 'survival'],
    },
  );
  c = levelUp(c, [
    { classId: 'fighter' },
    { classId: 'fighter', subclass: 'Champion' },
    { classId: 'fighter' },
  ]);
  const [style] = pendingFeatureGrants(c);
  c = applyFeatureGrant(c, buildFeatureStamp(style, { style: 'dueling' }));
  c = takeFeat(c, buildStamp(feat('resilient'), { abilities: ['WIS'], saves: ['WIS'] }));
  c.inventory = [
    {
      id: 'longsword',
      name: 'Longsword',
      quantity: 1,
      notes: '',
      type: 'weapon',
      kind: 'melee',
      category: 'martial',
      properties: ['versatile'],
      versatileDamage: [{ count: 1, sides: 10, damageType: 'slashing' }],
      damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
    },
    {
      id: 'vane-greatsword',
      name: 'Vane Greatsword',
      quantity: 1,
      notes: '',
      type: 'weapon',
      kind: 'melee',
      category: 'martial',
      properties: ['heavy', 'two-handed'],
      description:
        'A plain greatsword with the thorn of House Vane on the pommel, a gift from Lord Aldemar.',
      damage: [{ count: 2, sides: 6, damageType: 'slashing' }],
    },
    { id: 'oak-shield', name: 'Oak Shield', quantity: 1, notes: '', type: 'shield' },
    {
      id: 'chain-mail',
      name: 'Chain Mail',
      quantity: 1,
      notes: '',
      type: 'armor',
      armorWeight: 'heavy',
      baseAC: 16,
    },
    {
      id: 'vane-signet',
      name: 'Vane Signet',
      quantity: 1,
      notes: 'The thorn crest of House Vane. Opens the gate of Thornhold.',
      type: 'ring',
    },
    { ...healingPotion(), quantity: 2 },
    { id: 'torch', name: 'Torch', quantity: 5, notes: '', type: 'gear' },
    purse(25),
  ];
  c.equipment = {
    ...bare(),
    chest: 'chain-mail',
    mainHand: 'longsword',
    offHand: 'oak-shield',
    accessory: 'vane-signet',
  };
  return derive(c);
}

/** Mirelle, a priestess of the Dawn. @returns {Character} */
function mirelle() {
  let c = levelOne(
    'mirelle',
    'Mirelle',
    { WIS: 15, CHA: 13, CON: 13, STR: 12 },
    {
      raceId: 'half-elf',
      race: 'Half-elf',
      background: 'acolyte',
      classId: 'cleric',
      subclass: 'Life Domain',
      skills: ['medicine', 'persuasion'],
    },
  );
  c = levelUp(c, [{ classId: 'cleric' }, { classId: 'cleric' }, { classId: 'cleric' }]);
  c = applyASI(c, { WIS: 2 });
  c.spellbook = {
    cantrips: ['sacred-flame', 'guidance', 'light', 'resistance'],
    known: [
      'cure-wounds',
      'healing-word',
      'guiding-bolt',
      'bless',
      'hold-person',
      'lesser-restoration',
    ],
    prepared: ['cure-wounds', 'healing-word', 'guiding-bolt', 'bless', 'lesser-restoration'],
  };
  c.inventory = [
    {
      id: 'mace',
      name: 'Mace',
      quantity: 1,
      notes: '',
      type: 'weapon',
      kind: 'melee',
      category: 'simple',
      damage: [{ count: 1, sides: 6, damageType: 'bludgeoning' }],
    },
    {
      id: 'scale-mail',
      name: 'Scale Mail',
      quantity: 1,
      notes: '',
      type: 'armor',
      armorWeight: 'medium',
      baseAC: 14,
      stealthDisadvantage: true,
    },
    { id: 'dawn-shield', name: 'Shield of the Dawn', quantity: 1, notes: '', type: 'shield' },
    {
      id: 'holy-symbol',
      name: 'Symbol of the Dawn',
      quantity: 1,
      notes: '',
      type: 'gear',
      // A focus covers the material components that have no cost, the way a
      // real cleric's holy symbol does.
      spellFocus: true,
    },
    {
      id: 'healing-herbs',
      name: 'Healing Herbs',
      quantity: 3,
      notes: 'Poultice; stabilizes a downed ally.',
      type: 'consumable',
    },
    {
      id: 'alwyn-letter',
      name: "Sister Alwyn's Letter",
      quantity: 1,
      notes: 'Asks the temple for a priest who is not afraid of graves.',
      type: 'gear',
    },
    purse(12),
  ];
  c.equipment = { ...bare(), chest: 'scale-mail', mainHand: 'mace', offHand: 'dawn-shield' };
  return derive(c);
}

/** Wren Tallowby, a halfling smuggler who owes Corvin. @returns {Character} */
function wren() {
  let c = levelOne(
    'wren',
    'Wren Tallowby',
    { DEX: 15, INT: 13, CON: 12, WIS: 12, CHA: 10 },
    {
      raceId: 'halfling',
      race: 'Halfling',
      background: 'criminal',
      classId: 'rogue',
      skills: ['acrobatics', 'perception', 'sleight-of-hand', 'investigation'],
    },
  );
  const [expertise] = pendingFeatureGrants(c);
  c = applyFeatureGrant(
    c,
    buildFeatureStamp(expertise, { expertise: ['stealth', 'sleight-of-hand'] }),
  );
  c = levelUp(c, [
    { classId: 'rogue' },
    { classId: 'rogue', subclass: 'Arcane Trickster' },
    { classId: 'rogue' },
  ]);
  c = takeFeat(
    c,
    buildStamp(feat('skill-expert'), {
      abilities: ['DEX'],
      skills: ['arcana'],
      expertise: ['perception'],
    }),
  );
  // An Arcane Trickster always knows Mage Hand. At rogue 4 she knows four
  // 1st-level spells: three from enchantment or illusion and one from any
  // school, here Shield.
  c.spellbook = {
    cantrips: ['mage-hand', 'minor-illusion', 'message'],
    known: ['charm-person', 'disguise-self', 'silent-image', 'shield'],
    prepared: [],
  };
  c.inventory = [
    {
      id: 'rapier',
      name: 'Rapier',
      quantity: 1,
      notes: '',
      type: 'weapon',
      kind: 'melee',
      category: 'martial',
      properties: ['finesse'],
      damage: [{ count: 1, sides: 8, damageType: 'piercing' }],
    },
    {
      id: 'dagger',
      name: 'Dagger',
      quantity: 2,
      notes: '',
      type: 'weapon',
      kind: 'melee',
      category: 'simple',
      properties: ['finesse', 'light', 'thrown'],
      range: { normal: 20, long: 60 },
      damage: [{ count: 1, sides: 4, damageType: 'piercing' }],
    },
    {
      id: 'shortbow',
      name: 'Shortbow',
      quantity: 1,
      notes: '',
      type: 'bow',
      kind: 'ranged',
      category: 'simple',
      properties: ['ammunition', 'two-handed'],
      range: { normal: 80, long: 320 },
      damage: [{ count: 1, sides: 6, damageType: 'piercing' }],
    },
    {
      id: 'leather-armor',
      name: 'Leather Armor',
      quantity: 1,
      notes: '',
      type: 'armor',
      armorWeight: 'light',
      baseAC: 11,
    },
    { id: 'thieves-tools', name: "Thieves' Tools", quantity: 1, notes: '', type: 'gear' },
    {
      id: 'corvin-marker',
      name: "Corvin's Marker",
      quantity: 1,
      notes: 'A lead token stamped with a gull. Wren owes its bearer one cargo run.',
      type: 'gear',
    },
    healingPotion(),
    purse(41),
  ];
  c.equipment = {
    ...bare(),
    chest: 'leather-armor',
    mainHand: 'rapier',
    offHand: 'dagger',
    ranged: 'shortbow',
  };
  return derive(c);
}

/**
 * Brannoc Hollowell, a dwarf miner's son: an Eldritch Knight with one level
 * of wizard, read from his father's notes on the Hollowvein wards.
 * @returns {Character}
 */
function brannoc() {
  let c = levelOne(
    'brannoc',
    'Brannoc Hollowell',
    { STR: 15, INT: 13, CON: 14, WIS: 10 },
    {
      raceId: 'dwarf',
      race: 'Dwarf',
      background: 'guild-artisan',
      classId: 'fighter',
      skills: ['athletics', 'history'],
    },
  );
  c = levelUp(c, [
    { classId: 'fighter' },
    { classId: 'fighter', subclass: 'Eldritch Knight' },
    { classId: 'wizard' },
  ]);
  const [style] = pendingFeatureGrants(c);
  c = applyFeatureGrant(c, buildFeatureStamp(style, { style: 'great-weapon' }));
  // As an Eldritch Knight 3 he knows two cantrips and three 1st-level
  // spells: two from abjuration or evocation and one from any school. As a
  // wizard 1 he knows three cantrips, keeps six 1st-level spells in his
  // spellbook, and prepares two of them (INT modifier plus wizard level).
  c.spellbook = {
    cantrips: ['shocking-grasp', 'light', 'fire-bolt', 'mending', 'prestidigitation'],
    known: [
      'shield',
      'thunderwave',
      'detect-magic',
      'magic-missile',
      'protection-from-evil-and-good',
      'burning-hands',
      'false-life',
      'sleep',
      'color-spray',
    ],
    prepared: ['magic-missile', 'protection-from-evil-and-good'],
    // A multiclass caster names the class that each spell belongs to.
    sources: {
      'shocking-grasp': 'fighter',
      light: 'fighter',
      shield: 'fighter',
      thunderwave: 'fighter',
      'detect-magic': 'fighter',
      'fire-bolt': 'wizard',
      mending: 'wizard',
      prestidigitation: 'wizard',
      'magic-missile': 'wizard',
      'protection-from-evil-and-good': 'wizard',
      'burning-hands': 'wizard',
      'false-life': 'wizard',
      sleep: 'wizard',
      'color-spray': 'wizard',
    },
  };
  c.inventory = [
    {
      id: 'warhammer',
      name: 'Warhammer',
      quantity: 1,
      notes: '',
      type: 'weapon',
      kind: 'melee',
      category: 'martial',
      properties: ['versatile'],
      versatileDamage: [{ count: 1, sides: 10, damageType: 'bludgeoning' }],
      damage: [{ count: 1, sides: 8, damageType: 'bludgeoning' }],
    },
    {
      id: 'light-crossbow',
      name: 'Light Crossbow',
      quantity: 1,
      notes: '',
      type: 'bow',
      kind: 'ranged',
      category: 'simple',
      properties: ['ammunition', 'loading', 'two-handed'],
      range: { normal: 80, long: 320 },
      damage: [{ count: 1, sides: 8, damageType: 'piercing' }],
    },
    {
      id: 'splint',
      name: 'Splint Armor',
      quantity: 1,
      notes: '',
      type: 'armor',
      armorWeight: 'heavy',
      baseAC: 17,
      strength: 15,
      stealthDisadvantage: true,
    },
    {
      id: 'father-lamp',
      name: "Hollowell's Lamp",
      quantity: 1,
      notes: "His father's miner's lamp, found burning at the mine mouth after the last shift.",
      type: 'gear',
    },
    {
      id: 'ward-notes',
      name: 'Notes on the Vein Wards',
      quantity: 1,
      notes: 'His father kept them. Half the sigils are ones no guild teaches.',
      type: 'gear',
      spellFocus: true,
    },
    healingPotion(),
    purse(18),
  ];
  c.equipment = {
    ...bare(),
    chest: 'splint',
    mainHand: 'warhammer',
    ranged: 'light-crossbow',
  };
  return derive(c);
}

/**
 * The four members of the example party.
 * @returns {Character[]}
 */
export function exampleParty() {
  return [aldric(), mirelle(), wren(), brannoc()];
}
