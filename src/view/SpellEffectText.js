import { hitRiderSummary } from '../entities/HitRiders.js';
import { formatDamage } from '../entities/Equipment.js';
import { buffCondition } from '../entities/Casting.js';
import { riderSummary } from '../entities/Riders.js';
import { modsSummary } from '../entities/ChipMods.js';
import { UNTIL_LABELS, rollsNoSave } from '../entities/SpellFields.js';
import { typeRulesSummary } from '../entities/SpellTypeRules.js';

/**
 * The lines of the spell detail modal that say what a spell does in play: the
 * roll it makes and what it deals, and what it does on the turns after the
 * cast. `ui/SpellDetail.js` places them. They live here so a test can read
 * them without a browser.
 */

/** @typedef {import('../types/spell.js').Spell} Spell */

/** How each repeat cost reads. @type {Record<string, string>} */
const COST_TEXT = { action: 'an action', bonus: 'a bonus action', reaction: 'a reaction' };

/**
 * The one-line effect summary shown under the meta grid: a spell attack and
 * its damage, a save (ability plus DC) or the HP rule that takes its place,
 * with its damage and the chip it imposes, healing dice, or the chip a buff
 * hands out with what it changes and when it ends. A chip that changes later
 * rolls states what it adds. A utility spell has no line, because its rules
 * live in the description.
 * @param {Spell} spell
 * @param {number | null} saveDC the caster's save DC, or null when unknown
 * @returns {string | null}
 */
export function effectSummary(spell, saveDC) {
  const line = effectLine(spell, saveDC);
  const effect = spell.effect;
  // A save or a heal with type rules states them after the roll.
  const types = 'typeRules' in effect ? typeRulesSummary(effect.typeRules) : '';
  return line && types ? `${line}. ${types}` : line;
}

/**
 * The effect line of `effectSummary`, without the type rules.
 * @param {Spell} spell
 * @param {number | null} saveDC
 * @returns {string | null}
 */
function effectLine(spell, saveDC) {
  const effect = spell.effect;
  if (effect.kind === 'attack') {
    const dice = formatDamage(effect.damage) || 'no damage';
    const damage = effect.addsModifier ? `${dice} + spellcasting modifier` : dice;
    const kind = effect.melee ? 'Melee spell attack' : 'Spell attack';
    const miss = effect.halfOnMiss ? ' (half on a miss)' : '';
    const shots = effect.projectiles;
    if (!shots) return `${kind} — ${damage}${miss}`;
    // With projectiles, the dice apply per projectile. The line states the
    // count before it states what one projectile deals.
    const growth = shots.perStep ? ` (+${shots.perStep} per level)` : '';
    const roll = shots.autoHit ? 'hits automatically' : kind.toLowerCase();
    return `${shots.count} projectile${shots.count === 1 ? '' : 's'}${growth}, ${roll} — ${damage} each`;
  }
  if (effect.kind === 'save') {
    const dc = saveDC !== null ? ` DC ${saveDC}` : '';
    const dmg = formatDamage(effect.damage);
    const half = effect.halfOnSave ? ' (half on save)' : '';
    const rider = effect.rider ? ` (${riderSummary(effect.rider)})` : '';
    const until = effect.until ? ` until ${UNTIL_LABELS[effect.until]}` : '';
    const wakes = effect.endsOnDamage ? ' (ends on damage)' : '';
    const cond = effect.condition ? `, ${effect.condition}${rider}${until}${wakes}` : '';
    const kills = effect.kills ? ', killed outright' : '';
    // A spell that reads HP in place of a save names that rule where the
    // save would go.
    if (rollsNoSave(effect)) {
      const pool = effect.hpPool;
      const growth = pool?.perStep ? ` (+${pool.perStep}d${pool.sides} per level)` : '';
      const reach = pool
        ? `${pool.count}d${pool.sides} HP pool${growth}, lowest HP first`
        : `${effect.hpLimit} HP or fewer`;
      return `${reach} — ${dmg || 'no damage'}${cond}${kills}`;
    }
    return `${effect.saveAbility} save${dc} — ${dmg || 'no damage'}${half}${cond}${kills}`;
  }
  if (effect.kind === 'heal') {
    const mod = effect.addsModifier ? ' + spellcasting modifier' : '';
    // A heal that ends chips names them, and one with no dice says only that.
    const ends = [
      ...(effect.removes ? [`ends ${effect.removes.join(', ')}`] : []),
      ...(effect.removesOneOf ? [`ends one of ${effect.removesOneOf.join(', ')}`] : []),
    ];
    if (effect.stabilizes) return 'Stabilizes a dying character';
    const dice = formatDamage(effect.healing);
    if (!dice && ends.length) return `Restoration — ${ends.join('; ')}`;
    return `Healing — ${dice || 'no dice'}${mod}${ends.map((e) => `; ${e}`).join('')}`;
  }
  if (effect.kind === 'buff') {
    const chip = buffCondition(spell);
    const changes = [
      effect.rider ? riderSummary(effect.rider) : '',
      modsSummary(effect.mods),
      hitRiderSummary(effect.hit),
      effect.modsPerStep?.maxHP ? `${effect.modsPerStep.maxHP} more max HP per slot level` : '',
      effect.tempHP ? tempHPText(effect.tempHP) : '',
      effect.tempEachTurn ? 'spell modifier as temp HP each turn' : '',
    ]
      .filter(Boolean)
      .join(', ');
    const until = effect.until ? ` until ${UNTIL_LABELS[effect.until]}` : '';
    return changes ? `${chip} — ${changes}${until}` : `${chip}${until}`;
  }
  return null;
}

/**
 * What an attack spell's hit does besides its damage, one sentence per
 * effect: the save or condition it brings, and the hit points the caster
 * regains. A spell with neither has no lines.
 * @param {Spell} spell
 * @param {number | null} saveDC the caster's save DC, or null when unknown
 * @returns {string[]}
 */
export function hitLines(spell, saveDC) {
  const effect = spell.effect;
  if (effect.kind !== 'attack') return [];
  /** @type {string[]} */
  const lines = [];
  const onHit = effect.onHit;
  if (onHit) {
    const until = onHit.until ? ` until ${UNTIL_LABELS[onHit.until]}` : '';
    const dc = saveDC !== null ? ` DC ${saveDC}` : '';
    lines.push(
      onHit.saveAbility
        ? `A creature it hits makes a ${onHit.saveAbility} save${dc}, and on a failure it is ${onHit.condition}${until}.`
        : `A creature it hits is also ${onHit.condition}${until}.`,
    );
  }
  if (effect.drain) {
    const share = effect.drain === 'half' ? 'half the damage' : 'all the damage';
    lines.push(`The caster regains hit points equal to ${share} its hits deal.`);
  }
  return lines;
}

/**
 * What a spell does on the turns after the cast, one sentence per effect:
 * damage it leaves on a target, and a repeat that the caster can use without
 * a new slot. A spell with neither has no lines.
 * @param {Spell} spell
 * @returns {string[]}
 */
export function laterTurnLines(spell) {
  /** @type {string[]} */
  const lines = [];
  const effect = spell.effect;
  const ongoing = effect.kind === 'attack' || effect.kind === 'save' ? effect.ongoing : undefined;
  if (ongoing) {
    const dice = formatDamage(ongoing.damage);
    const growth = ongoing.perStep?.length ? ` (+${formatDamage(ongoing.perStep)} per level)` : '';
    const trigger = effect.kind === 'attack' ? 'A hit' : 'A failed save';
    const when =
      effect.kind === 'save' && effect.condition && effect.saveEnds
        ? 'at the end of each of its turns while it fails the repeated save'
        : effect.kind === 'save' && effect.condition
          ? `at the end of each of its turns while it is ${effect.condition}`
          : `at ${UNTIL_LABELS[ongoing.until ?? 'target-end']}`;
    lines.push(`${trigger} also deals ${dice}${growth} ${when}.`);
  }
  const repeat = spell.repeat;
  if (repeat) {
    const cost = COST_TEXT[repeat.cost ?? spell.castingTime.kind] ?? 'an action';
    const what = repeat.damage?.length
      ? `deals ${formatDamage(repeat.damage)} to the creature it hit, with no roll`
      : 'repeats the effect';
    lines.push(`On each later turn while the spell lasts, ${cost} ${what}. No slot.`);
  }
  return lines;
}

/**
 * How a buff's temporary HP at the cast reads, for example
 * "1d4 + 4 temp HP (5 more per slot level)".
 * @param {import('../types/spell.js').SpellTempHP} temp
 * @returns {string}
 */
function tempHPText(temp) {
  const dice = temp.count > 0 ? `${temp.count}d${temp.sides}` : '';
  const amount = [dice, temp.flat ? String(temp.flat) : ''].filter(Boolean).join(' + ');
  const more = temp.flatPerStep ? ` (${temp.flatPerStep} more per slot level)` : '';
  return `${amount} temp HP${more}`;
}
