import { hasWeaponProperty, weaponKind } from '../entities/Weapons.js';
import { sneakAttackDice } from '../entities/Features.js';
import { coerceMultiattack, swingsPerAction } from '../entities/CreatureAttacks.js';
import { hasExtraAction } from '../entities/ChipMods.js';
import { allowsSneakAttack, hasFreeHandFor } from '../combat/AttackOptions.js';
import { canSpend } from '../combat/ActionBudget.js';
import { COVER_LEVELS } from '../combat/Cover.js';
import { SWINGS, canSwing, swingKind } from '../combat/AttackTweaks.js';

/**
 * The fields of the weapon attack dialog, described once. The module has no
 * DOM code: `weaponAttack` renders the list through `promptModal`, and
 * `readAttackTweaks` reads the answers back.
 */

/** @typedef {import('./combatants.js').CombatTarget} CombatTarget */

/** The mode control's options, in the order they read best. */
const MODE_OPTIONS = [
  { value: 'auto', label: 'Auto (from conditions)' },
  { value: 'normal', label: 'Normal' },
  { value: 'advantage', label: 'Advantage' },
  { value: 'disadvantage', label: 'Disadvantage' },
];

/** The dice the pre-roll dialog offers for a bonus or penalty die. */
const BONUS_DICE = /** @type {import('../types/dice.js').DieType[]} */ ([
  'd4',
  'd6',
  'd8',
  'd10',
  'd12',
]);

/**
 * The title, the fields, and the options of the pre-roll dialog for one swing.
 * @param {{
 *   attacker: any,
 *   defenders: CombatTarget[],
 *   participant: import('../types/combat.js').Participant,
 *   weapon: import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon,
 *   defenderId: string | null,
 *   offhand: boolean,
 *   reaction: boolean,
 *   legendary?: boolean,
 * }} request
 * @returns {{
 *   title: string,
 *   fields: import('../types/modal.js').ModalField[],
 *   options: NonNullable<Parameters<typeof import('../ui/Modal.js').promptModal>[2]>,
 * }}
 */
export function attackDialog({
  attacker,
  defenders,
  participant,
  weapon,
  defenderId,
  offhand,
  reaction,
  legendary = false,
}) {
  // Every attack pauses at a pre-roll dialog. The dialog picks the defender
  // and applies any situational overrides: bonus or penalty dice on the
  // attack roll (Bless +1d4, Bane -1d4), and extra damage such as a smite's
  // dice or a flat rider. Every override defaults to zero and sits behind a
  // collapsed disclosure, so a plain Enter rolls the unmodified attack. Bonus
  // damage folds into the weapon's own damage type and doubles on a crit,
  // like all damage dice. The attack-roll dice do not double, because they
  // modify the d20, not the damage.
  const bonusDieOptions = BONUS_DICE.map((d) => ({ value: d, label: d }));
  // A versatile weapon offers the two-handed grip when the other hand is
  // free. A ranged or thrown weapon with a stated range offers the long-range
  // shot. Both sit in the open part of the dialog, because the GM decides
  // them per swing.
  const versatile =
    hasWeaponProperty(weapon, 'versatile') &&
    hasFreeHandFor(attacker, weapon) &&
    'versatileDamage' in weapon &&
    weapon.versatileDamage?.length;
  // A thrown melee weapon can also be struck with, so its control names the
  // melee swing as its own default choice. A ranged weapon can only shoot,
  // so its control offers the two distances alone.
  const thrownMelee = weaponKind(weapon) !== 'ranged' && hasWeaponProperty(weapon, 'thrown');
  const range =
    weaponKind(weapon) === 'ranged' || thrownMelee
      ? 'range' in weapon
        ? weapon.range
        : undefined
      : undefined;
  const rangeOptions = range
    ? thrownMelee
      ? [
          { value: 'melee', label: 'Melee' },
          { value: 'thrown', label: `Thrown (${range.normal} ft)` },
          { value: 'thrown-long', label: `Thrown long (${range.long} ft, disadvantage)` },
        ]
      : [
          { value: 'normal', label: `Normal (${range.normal} ft)` },
          { value: 'long', label: `Long (${range.long} ft, disadvantage)` },
        ]
    : [];
  const kind = swingKind({ offhand, reaction, legendary });
  const swing = SWINGS[kind];
  const cannotPay = !canSwing(
    participant,
    kind,
    swingsPerAction(attacker, weapon),
    hasExtraAction(attacker.conditions),
  );
  const sneakDice = allowsSneakAttack(weapon) ? sneakAttackDice(attacker) : 0;
  // A creature with Multiattack can roll every swing of it from one dialog.
  // The box shows only while the Attack action is unspent, because a spent
  // action leaves only the banked swings.
  const volley =
    kind === 'main' && canSpend(participant, 'action')
      ? coerceMultiattack(attacker.multiattack)
      : undefined;
  return {
    title: `${swing.title} ${weapon.name}`,
    fields: [
      {
        name: 'target',
        label: 'Defender',
        type: 'select',
        // The defenders come foes first. A creature on the attacker's own
        // side sits in a group of its own after them.
        options: defenders.map((d) => ({
          value: d.id,
          label: `${d.label ?? d.name} (AC ${d.ac})`,
          ...(d.ally ? { group: 'Same side' } : {}),
        })),
        // A board-picked defender opens pre-selected. If no defender holds
        // that id, for example after a deselect or a defeat, the dialog
        // falls back to the first defender in the list.
        ...(defenderId && defenders.some((d) => d.id === defenderId) ? { value: defenderId } : {}),
        full: true,
      },
      // The mode sits with the defender, not behind the advanced disclosure.
      // Advantage is the most common call a GM makes at the table, so the GM
      // sets it here and does not leave the dialog to use the dice tray's
      // toggle.
      {
        name: 'mode',
        label: 'Roll',
        type: 'select',
        value: 'auto',
        options: MODE_OPTIONS,
        full: true,
      },
      // Cover is a plain GM call, so it sits in the open part beside the mode.
      // The app knows nothing about walls or barrels, and it never will until
      // tokens have a distance between them.
      {
        name: 'cover',
        label: 'Target cover',
        type: 'select',
        value: 'none',
        options: COVER_LEVELS.map((level) => ({ value: level.value, label: level.label })),
        full: true,
      },
      ...(volley
        ? [
            {
              name: 'multiattack',
              label: `Multiattack (roll all ${volley} attacks)`,
              type: /** @type {const} */ ('checkbox'),
              value: true,
              full: true,
            },
          ]
        : []),
      // Pack Tactics needs an ally next to the target. The fight has no
      // positions, so the GM ticks the box.
      ...(attacker.packTactics === true
        ? [
            {
              name: 'pack',
              label: 'Pack Tactics (an ally is next to the target)',
              type: /** @type {const} */ ('checkbox'),
              value: false,
              full: true,
            },
          ]
        : []),
      // The Sneak Attack box appears for an attacker that has the feature, has
      // not used it this turn, and swings a finesse or ranged weapon. Whether
      // the rogue earned it, from advantage or from an ally beside the
      // target, is the GM's call at the table.
      ...(sneakDice > 0 && canSpend(participant, 'sneak')
        ? [
            {
              name: 'sneak',
              label: `Sneak Attack (+${sneakDice}d6)`,
              type: /** @type {const} */ ('checkbox'),
              value: false,
              full: true,
            },
          ]
        : []),
      ...(versatile
        ? [
            {
              name: 'two-handed',
              label: 'Wield two-handed',
              type: /** @type {const} */ ('checkbox'),
              value: false,
              full: true,
            },
          ]
        : []),
      // This box appears only on a turn that cannot pay for the swing, because
      // that is the only time the answer matters. Ticking it swings anyway, for
      // a rule the action economy here does not carry. Until it is ticked, Roll
      // attack stays disabled, because rollWeaponAttack refuses the swing.
      // Each of the three swings names the part of the turn it could not pay
      // with.
      ...(cannotPay
        ? [
            {
              name: 'free-action',
              label: `Ignore action cost (${swing.optOut})`,
              type: /** @type {const} */ ('checkbox'),
              value: false,
              full: true,
            },
          ]
        : []),
      ...(range
        ? [
            {
              name: 'range',
              label: 'Range',
              type: /** @type {const} */ ('select'),
              value: rangeOptions[0].value,
              options: rangeOptions,
              full: true,
            },
          ]
        : []),
      { name: 'atk-count', label: 'Attack: bonus dice', type: 'number', value: 0, advanced: true },
      {
        name: 'atk-die',
        label: 'Attack: die',
        type: 'select',
        value: 'd4',
        options: bonusDieOptions,
        advanced: true,
      },
      {
        name: 'dmg-count',
        label: 'Damage: bonus dice',
        type: 'number',
        value: 0,
        min: 0,
        advanced: true,
      },
      {
        name: 'dmg-die',
        label: 'Damage: die',
        type: 'select',
        value: 'd4',
        options: bonusDieOptions,
        advanced: true,
      },
      { name: 'atk-flat', label: 'Attack: flat bonus', type: 'number', value: 0, advanced: true },
      { name: 'dmg-flat', label: 'Damage: flat bonus', type: 'number', value: 0, advanced: true },
    ],
    options: {
      submitLabel: 'Roll attack',
      wide: true,
      advancedLabel: 'Situational modifiers',
      ...(cannotPay ? { submitRequires: ['free-action'] } : {}),
    },
  };
}
