import { promptModal } from '../ui/Modal.js';
import { rollDamage, attackTweak } from '../dice/DiceRoller.js';
import { attackAbility, hasWeaponProperty, weaponKind } from '../entities/Weapons.js';
import { unproficientWear } from '../entities/Armor.js';
import { d20Penalty, exhaustionLevel } from '../entities/Exhaustion.js';
import { isProficientWeapon } from '../entities/Proficiencies.js';
import { attacksPerAction, sneakAttackDice } from '../entities/Features.js';
import { attacksAvailable, canSpend } from '../combat/ActionBudget.js';
import { COVER_LEVELS, coverBonus, coverNote } from '../combat/Cover.js';
import { offhandDamageModifier } from '../combat/TwoWeapon.js';
import { formatModifier } from '../entities/Modifiers.js';
import { rollRiders } from '../entities/Riders.js';
import { riderSources } from '../entities/FeatChoices.js';
import { autoCrits, modeReasons, rollMode } from '../entities/ConditionEffects.js';
import {
  abilityModOf,
  attackerProficiency,
  attackerStats,
  damageModifier,
  damageParts,
  droppedNote,
  resolveAttack,
} from '../combat/AttackResolve.js';
import { findCombatant, combatantsAsTargets, applyToTarget } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./combatants.js').CombatTarget} CombatTarget */

/**
 * The situational overrides a pre-roll dialog can add to one attack: the mode
 * of the d20, bonus or penalty dice and a flat bonus on the attack roll, and
 * extra dice and a flat rider on the damage. `twoHanded` swings a versatile
 * weapon with both hands, so the damage uses the two-handed dice. `longRange`
 * fires past the weapon's normal range, which slants the roll toward
 * disadvantage. `thrown` throws a melee weapon instead of striking with it,
 * which makes the swing a ranged attack for every rule that asks.
 * `freeAction` swings without spending the turn's Attack action, which is how
 * the GM takes a swing the action economy has no room for. `offhand` is the
 * second swing of two-weapon fighting: it costs the bonus action rather than
 * the Attack action, and its damage carries no ability bonus. `reaction` is an
 * opportunity attack, which costs the reaction and rolls like a normal swing.
 * `cover` raises the defender's AC for this swing, and `sneak` adds the
 * attacker's Sneak Attack dice to the damage. Both are the GM's call, because
 * nothing here reads a barrel on the map or where the rogue is standing.
 * Every field defaults to nothing, so a plain Enter in the dialog rolls the
 * unmodified attack.
 * @typedef {{
 *   mode?: AttackMode,
 *   twoHanded?: boolean,
 *   longRange?: boolean,
 *   thrown?: boolean,
 *   freeAction?: boolean,
 *   offhand?: boolean,
 *   reaction?: boolean,
 *   cover?: import('../combat/Cover.js').CoverLevel,
 *   sneak?: boolean,
 *   attackDice?: number,
 *   attackDie?: import('../types/dice.js').DieType,
 *   attackFlat?: number,
 *   damageDice?: number,
 *   damageDie?: import('../types/dice.js').DieType,
 *   damageFlat?: number,
 * }} AttackTweaks
 */

/**
 * What the dialog's mode control can say. `auto` is the default and reads the
 * mode off the condition chips, falling back to the dice tray's standing
 * toggle. The other three are the GM's call for this one attack, and each of
 * them beats both, including `normal`, which is how a GM cancels a standing
 * toggle for one roll.
 * @typedef {'auto' | import('../types/dice.js').RollMode} AttackMode
 */

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
 * The three swings a combatant can take, and what each one costs. `main` draws
 * on the Attack action and the swings Extra Attack banks behind it. `offhand`
 * is the second swing of two-weapon fighting. `reaction` is an opportunity
 * attack. Each row carries what the budget spends, what the dialog is titled,
 * what its opt-out box says, what the log adds to the attack line, and what the
 * toast says when the turn cannot pay.
 * @typedef {'main' | 'offhand' | 'reaction'} SwingKind
 */
const SWINGS = {
  main: {
    cost: /** @type {const} */ ('attack'),
    title: 'Attack with',
    optOut: 'no attack left this turn',
    note: '',
    blocked: 'has no attack left this turn',
  },
  offhand: {
    cost: /** @type {const} */ ('bonus'),
    title: 'Off-hand attack with',
    optOut: 'bonus action already used',
    note: ', off-hand',
    blocked: 'already used their bonus action this turn',
  },
  reaction: {
    cost: /** @type {const} */ ('reaction'),
    title: 'Opportunity attack with',
    optOut: 'reaction already used',
    note: ', opportunity attack',
    blocked: 'already used their reaction',
  },
};

/**
 * Which of the three swings the dialog's answers describe. A swing is a
 * main-hand one unless it says otherwise, and no swing is two of these at once.
 * @param {AttackTweaks} tweaks
 * @returns {SwingKind}
 */
export function swingKind(tweaks) {
  if (tweaks.reaction) return 'reaction';
  if (tweaks.offhand) return 'offhand';
  return 'main';
}

/**
 * Whether the participant's turn can pay for the given swing. A main-hand swing
 * asks the attack bank, because Extra Attack buys more than one swing per
 * action. The other two ask for their own part of the turn.
 * @param {import('../types/combat.js').Participant} participant
 * @param {SwingKind} kind
 * @param {number} perAction how many swings one Attack action buys
 * @returns {boolean}
 */
export function canSwing(participant, kind, perAction) {
  if (kind === 'main') return attacksAvailable(participant, perAction) > 0;
  return canSpend(participant, SWINGS[kind].cost);
}

/**
 * Who can attack and who is left to attack. The attacker is a party character
 * or an armed creature. An unarmed creature still resolves here, but
 * `weaponsOf` gives it no weapon, so the attack UI stays quiet for it.
 * Defenders come from the opposite side of the running order. Downed
 * combatants drop out.
 * @param {AppContext} app
 * @param {import('../types/combat.js').CombatState} combat
 * @param {import('../types/combat.js').Participant} participant
 * @returns {{ attacker: any, defenders: CombatTarget[] } | null}
 */
export function attackParticipants(app, combat, participant) {
  const found = findCombatant(app, participant.id);
  if (!found) return null;
  return { attacker: found.entity, defenders: combatantsAsTargets(app, combat, participant) };
}

/**
 * Read the pre-roll dialog's answers into the override shape the roll takes.
 * A blank or unreadable field counts as no override.
 * @param {Record<string, string>} values
 * @returns {AttackTweaks}
 */
export function readAttackTweaks(values) {
  return {
    mode: /** @type {AttackMode} */ (values['mode'] || 'auto'),
    twoHanded: values['two-handed'] === '1',
    // The range control of a ranged weapon says 'normal' or 'long'. On a
    // thrown melee weapon it says 'melee', 'thrown', or 'thrown-long', so a
    // dagger can stab at the same dice it throws with.
    longRange: values['range'] === 'long' || values['range'] === 'thrown-long',
    thrown: values['range'] === 'thrown' || values['range'] === 'thrown-long',
    freeAction: values['free-action'] === '1',
    cover: /** @type {import('../combat/Cover.js').CoverLevel} */ (values['cover'] || 'none'),
    sneak: values['sneak'] === '1',
    attackDice: Number(values['atk-count']) || 0,
    attackDie: /** @type {import('../types/dice.js').DieType} */ (values['atk-die']),
    attackFlat: Number(values['atk-flat']) || 0,
    damageDice: Number(values['dmg-count']) || 0,
    damageDie: /** @type {import('../types/dice.js').DieType} */ (values['dmg-die']),
    damageFlat: Number(values['dmg-flat']) || 0,
  };
}

/**
 * Roll one attack against one defender, then log and apply what it did. This
 * is everything the attack does once the dialog has picked a defender and any
 * overrides. The dialog itself stays in `weaponAttack`, so this half runs and
 * is tested without a browser.
 *
 * The roll loads 1d20, the weapon ability's modifier, the attacker's
 * proficiency bonus, any bonus dice, and the defender's AC into the dice tray.
 * A natural 20 hits whatever the AC and doubles the damage dice. A natural 1
 * always misses. Otherwise the total meets or beats AC to hit. On a hit the
 * weapon's damage rolls, with the ability modifier folded into the base term
 * and proficiency left out, and the result applies to the defender through the
 * shared write path.
 * A rider chip on the attacker, such as Bless, adds its own die to the roll.
 * The chips on both sides also set the roll's mode, unless the dialog picked
 * one, and a hit on a helpless defender in melee is a critical one whatever
 * the d20 showed.
 *
 * Cover from the dialog raises the AC this swing rolls against, and the log
 * prints both the raised AC and the plain one. A ticked Sneak Attack box adds
 * the attacker's d6 on a hit and marks the flag as used for the turn, so the
 * second swing cannot add it again.
 *
 * The attack roll goes through the dice tray, which owns its own randomness.
 * `rng` is the source for the damage roll and for the rider dice, injected
 * the way the pure modules take theirs.
 * @param {AppContext} app
 * @param {{
 *   attacker: any,
 *   defender: CombatTarget,
 *   weapon: import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon,
 *   tweaks?: AttackTweaks,
 *   rng?: () => number,
 * }} attack
 */
export function rollWeaponAttack(
  app,
  { attacker, defender, weapon, tweaks = {}, rng = Math.random },
) {
  // The swing pays first, so a turn with nothing left rolls no dice. A main-hand
  // swing spends the Attack action and banks whatever Extra Attack adds, and
  // each later swing draws on that bank. An off-hand swing spends the bonus
  // action, and an opportunity attack spends the reaction; neither touches the
  // attack bank. `freeAction` comes from the dialog's opt-out and skips the
  // whole question. Outside a running fight there is no turn to spend, and the
  // action reports success.
  const swing = SWINGS[swingKind(tweaks)];
  if (!tweaks.freeAction && app.actions.spendBudget) {
    // Only the Attack action banks swings behind it, so only that cost carries
    // the count.
    const spent = app.actions.spendBudget(
      attacker.id,
      swing.cost,
      swing.cost === 'attack' ? { attacksPerAction: attacksPerAction(attacker) } : {},
    );
    if (!spent) {
      app.toasts.show(`${attacker.name} ${swing.blocked}.`);
      return;
    }
  }
  const stats = attackerStats(attacker);
  // A finesse weapon reads the attacker here: it takes the higher of the
  // attacker's STR and DEX.
  const ability = attackAbility(weapon, stats);
  const abilityMod = abilityModOf(stats, ability);
  // A character reads the level ladder. A rated creature reads the challenge
  // rating ladder, the same one its saves and spells use.
  const proficiency = attackerProficiency(attacker);
  // Only a character carries proficiency lists, so only a character can lack
  // proficiency with a weapon. A creature's attack bonus bakes proficiency in,
  // the way a 5e stat block does.
  const proficient = attacker.proficiencies
    ? isProficientWeapon(attacker, weapon.name, 'category' in weapon ? weapon.category : undefined)
    : true;
  // An attack roll is a d20 test, so exhaustion takes 2 off it for each level.
  // Both kinds of attacker carry the level, so a tired foe swings worse too.
  // Damage is untouched: the penalty is on the roll, not on the hit.
  const tired = d20Penalty(attacker);
  const attackBonus = abilityMod + (proficient ? proficiency : 0) + tired;
  // Bonus attack dice join the d20 in the tray's selection, so they roll in
  // view. `attackTweak` rolls penalty dice and folds them into the modifier,
  // and keeps the values in its note for the log.
  const tweak = attackTweak(
    tweaks.attackDice ?? 0,
    tweaks.attackDie ?? 'd4',
    tweaks.attackFlat ?? 0,
  );
  // A Bless or Bane chip on the attacker adds its die here, without the GM
  // typing it into the dialog. Its dice roll outside the tray, the same way
  // the dialog's penalty dice already do, so a bonus and a penalty read the
  // same in the log.
  const rider = rollRiders(riderSources(attacker), 'attack', rng);
  // The chips on both sides decide the mode. Reach matters, because a prone
  // defender is easier to hit in melee and harder to hit at range. The
  // weapon's kind is the reach signal, and a thrown melee weapon counts as
  // ranged for the throw the GM picked in the dialog.
  const melee = weaponKind(weapon) !== 'ranged' && !tweaks.thrown;
  const conditionQuery = /** @type {const} */ ({
    roller: attacker.conditions,
    target: defender.conditions,
    kind: 'attack',
    melee,
  });
  // A mode the GM picked in the dialog wins over the chips, and it is always
  // passed on, so a picked `normal` also cancels the tray's standing toggle
  // for this roll. Under `auto`, a null mode means no chip slanted the roll,
  // and the key stays off the selection so the tray's toggle still applies.
  // A shot past normal range adds one disadvantage slant, and so does armor
  // the attacker is not trained for, because every weapon attack rolls off
  // STR or DEX. Both fold in with the chip slants under the 5e rule: any
  // advantage cancels any number of disadvantages to a straight roll.
  const picked = tweaks.mode && tweaks.mode !== 'auto' ? tweaks.mode : null;
  const longSlant = tweaks.longRange ? 'disadvantage' : null;
  const badWear = unproficientWear(attacker);
  const wearSlant = badWear.length > 0 ? 'disadvantage' : null;
  const mode = picked ?? rollMode(conditionQuery, [longSlant, wearSlant]);
  // Cover is the GM's call in the dialog, and it raises the AC of this one
  // swing. Nothing on the map says who stands behind what, so no rule here
  // could work it out.
  const cover = coverBonus(tweaks.cover);
  const ac = defender.ac + cover;
  const { result } = app.actions.rollDice(
    {
      counts: { d20: 1, ...tweak.counts },
      modifier: attackBonus + tweak.modifier + rider.modifier,
      ...(mode ? { mode } : {}),
    },
    ac,
  );
  const d20 = result.results.find((r) => r.die === 'd20');
  const natural = d20?.rolls[0] ?? 0;
  const { crit, hit, outcome } = resolveAttack({
    natural,
    total: result.total,
    ac,
    // A helpless defender turns any melee hit into a critical one, without a
    // natural 20.
    autoCrit: autoCrits(defender.conditions, { melee }),
  });
  // An advantage or disadvantage attack notes the discarded d20, so the log
  // shows both dice and matches the tray's own readout.
  const modeNote = droppedNote(d20, result.selection.mode);
  const tweakNote = tweak.note ? `, ${tweak.note}` : '';
  const riderNote = rider.note ? `, ${rider.note}` : '';
  // Naming the chips keeps a cancelled pair readable: the log says why the
  // roll came out straight, not just that it did.
  // A GM-picked mode replaces the chip reasons, because the chips no longer
  // decide the roll and naming them would say the opposite of what happened.
  const slantReasons = [
    modeReasons(conditionQuery),
    longSlant && !picked ? 'long range disadvantage' : '',
    wearSlant && !picked ? `not proficient with ${badWear.join(' and ')}, disadvantage` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const reasons = picked ? `${picked} set by the GM` : slantReasons;
  const conditionNote = reasons ? `, ${reasons}` : '';
  const proficiencyNote = proficient ? `proficiency +${proficiency}` : 'not proficient';
  const tiredNote = tired ? `, exhaustion ${exhaustionLevel(attacker)} ${tired}` : '';
  // An off-hand swing and an opportunity attack both roll to hit like any other
  // swing, so the note sits on the attack line: it says where the missing damage
  // bonus went, or which part of the turn the swing came out of.
  const handNote = swing.note;
  // The AC in the log is the one the roll answered to, and the cover note says
  // where the difference came from.
  const coverAC = cover ? ` (${defender.ac} ${coverNote(tweaks.cover)})` : '';
  app.actions.logEvent(
    'combat',
    `${attacker.name} attacks ${defender.name} with ${weapon.name}${handNote} (${ability} ${formatModifier(abilityMod)}, ${proficiencyNote}${tiredNote}${tweakNote}${riderNote}${conditionNote}): ${result.total} to hit vs AC ${ac}${coverAC}${modeNote} — ${outcome}.`,
  );
  if (!hit) {
    app.toasts.show(`${result.total} vs AC ${ac}: ${attacker.name} misses ${defender.name}.`);
    return;
  }
  // A crit rolls every damage die twice, including the dialog's added dice.
  // The ability modifier still adds only once, and proficiency never
  // reaches damage. A two-handed swing of a versatile weapon reads the
  // two-handed dice instead of the one-handed ones.
  const twoHanded =
    tweaks.twoHanded && 'versatileDamage' in weapon && weapon.versatileDamage?.length;
  // Sneak Attack adds its dice only on a hit, so the flag is spent here rather
  // than beside the swing. An attacker without the feature has no dice to add,
  // whatever the dialog said.
  const sneakDice = tweaks.sneak ? sneakAttackDice(attacker) : 0;
  if (sneakDice > 0 && app.actions.spendBudget) app.actions.spendBudget(attacker.id, 'sneak');
  const parts = damageParts((twoHanded ? weapon.versatileDamage : weapon.damage) ?? [], {
    crit,
    bonusDice: tweaks.damageDice ?? 0,
    bonusDie: tweaks.damageDie ?? 'd4',
    sneakDice,
  });
  // The second hand of two-weapon fighting adds no ability bonus to damage. A
  // negative modifier still applies, so the swing of a weak character is still
  // weak.
  const damageMod = tweaks.offhand ? offhandDamageModifier(abilityMod) : abilityMod;
  const damage = rollDamage(parts, damageModifier(damageMod, tweaks.damageFlat ?? 0), rng);
  const inflicts =
    'statusEffects' in weapon && weapon.statusEffects?.length
      ? `, inflicting ${weapon.statusEffects.join(', ')}`
      : '';
  const blow = crit ? 'critically hits' : 'hits';
  // The dice are already inside the detail, so the note only names how many of
  // them came from Sneak Attack. A crit doubled that count too.
  const sneakNote =
    sneakDice > 0 ? `, with sneak attack ${crit ? sneakDice * 2 : sneakDice}d6` : '';
  // The travelogue keeps the raw damage dice as detail. The toast below
  // keeps only the short per-type totals as text.
  app.actions.logEvent(
    'combat',
    `${weapon.name} ${blow} ${defender.name} for ${damage.detail || '0 damage'}${sneakNote}${inflicts}.`,
  );
  // Applies the damage on the spot through the shared write path. Every
  // combatant tracks HP, and the function logs a defeat or a drop to 0
  // only once.
  applyToTarget(app, defender.id, damage.total, false, { crit });
  app.toasts.show(
    `${crit ? 'Critical hit!' : 'Hit!'} ${defender.name} takes ${damage.text || 'no damage'}${inflicts}.`,
  );
}

/**
 * Rolls a weapon attack for the active combatant, in 5e style. A pre-roll
 * dialog picks the defender and how the d20 rolls, and takes situational
 * overrides: bonus or penalty dice on the attack roll (Bless +1d4, Bane
 * -1d4), extra damage dice (a smite), and flat bonuses on either roll. The
 * mode defaults to reading the condition chips, and picking one of the three
 * modes there overrides both the chips and the dice tray's standing toggle for
 * this roll. A cover control raises the defender's AC for this swing, and an
 * attacker with Sneak Attack that has not used it this turn gets a box that
 * adds its dice. Both are GM calls: the app tracks no line of sight and no
 * position. The function then loads 1d20,
 * the attacker's ability modifier, proficiency bonus, any overrides, and the
 * defender's AC into the dice tray, and rolls. A natural 20 hits regardless
 * of AC and doubles the damage dice, for a critical hit. A natural 1 always
 * misses. Otherwise the function compares the total against AC. On a hit,
 * the weapon's damage dice roll too: the ability modifier folds into the
 * base term, and proficiency never adds to damage. The function applies the
 * result to the defender automatically. Creatures lose HP on the spot, and
 * party characters take it through bonus HP first. Party members attack
 * with their equipped weapons, and a creature attacks with its assigned
 * weapon. Everything lands in the travelogue and in a toast.
 * @param {AppContext} app
 * @param {import('../types/combat.js').CombatState} combat
 * @param {import('../types/combat.js').Participant} participant
 * @param {import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon} weapon
 * @param {{ defenderId?: string | null, offhand?: boolean, reaction?: boolean }}
 *   [options] If a defender is already picked on the combat board, it pre-fills
 *   the dialog's target. The common flow is to click the card, click the weapon,
 *   then press Enter. `offhand` makes this the second swing of two-weapon
 *   fighting, which costs the bonus action and drops the ability bonus from its
 *   damage. `reaction` makes it an opportunity attack, which costs the reaction
 *   and can come on another combatant's turn.
 */
export async function weaponAttack(
  app,
  combat,
  participant,
  weapon,
  { defenderId = null, offhand = false, reaction = false } = {},
) {
  const sides = attackParticipants(app, combat, participant);
  if (!sides) return;
  const { attacker, defenders } = sides;
  if (defenders.length === 0) {
    app.toasts.show('No defender left standing.');
    return;
  }
  // Every attack pauses at a pre-roll dialog. The dialog picks the defender
  // and applies any situational overrides: bonus or penalty dice on the
  // attack roll (Bless +1d4, Bane -1d4), and extra damage such as a smite's
  // dice or a flat rider. Every override defaults to zero and sits behind a
  // collapsed disclosure, so a plain Enter rolls the unmodified attack. Bonus
  // damage folds into the weapon's own damage type and doubles on a crit,
  // like all damage dice. The attack-roll dice do not double, because they
  // modify the d20, not the damage.
  const bonusDieOptions = BONUS_DICE.map((d) => ({ value: d, label: d }));
  // A versatile weapon offers the two-handed grip. A ranged or thrown weapon
  // with a stated range offers the long-range shot. Both sit in the open part
  // of the dialog, because the GM decides them per swing.
  const versatile =
    hasWeaponProperty(weapon, 'versatile') &&
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
  const swing = SWINGS[swingKind({ offhand, reaction })];
  const sneakDice = sneakAttackDice(attacker);
  const values = await promptModal(
    `${swing.title} ${weapon.name}`,
    [
      {
        name: 'target',
        label: 'Defender',
        type: 'select',
        options: defenders.map((d) => ({
          value: d.id,
          label: `${d.name} (AC ${d.ac})`,
        })),
        // A board-picked defender opens pre-selected. If no defender holds
        // that id, for example after a deselect or a defeat, the dialog
        // falls back to the first defender in the list.
        ...(defenderId && defenders.some((d) => d.id === defenderId) ? { value: defenderId } : {}),
        full: true,
      },
      // The mode sits with the defender, not behind the advanced disclosure.
      // Advantage is the most common call a GM makes at the table, and it used
      // to mean leaving the dialog to flip the dice tray's toggle.
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
      // The Sneak Attack box appears for an attacker that has the feature and
      // has not used it this turn. Whether the rogue earned it, from advantage
      // or from an ally beside the target, is the GM's call at the table.
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
      // a rule the action economy here does not carry. Each of the three swings
      // names the part of the turn it could not pay with.
      ...(!canSwing(participant, swingKind({ offhand, reaction }), attacksPerAction(attacker))
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
    { submitLabel: 'Roll attack', wide: true, advancedLabel: 'Situational modifiers' },
  );
  if (!values) return;
  // A defender the dialog no longer offers, for example one defeated while
  // the dialog stood open, falls back to the first one left standing.
  const defender = defenders.find((d) => d.id === values.target) ?? defenders[0];
  rollWeaponAttack(app, {
    attacker,
    defender,
    weapon,
    tweaks: { ...readAttackTweaks(values), offhand, reaction },
  });
}
