import { setTip } from './Tooltip.js';
import { el } from './dom.js';
import { labeled, fieldRow, numberField, checkbox, select, textField } from './formFields.js';
import { CONDITIONS } from '../entities/Conditions.js';
import { DAMAGE_TYPES, DIE_SIZES } from '../entities/Equipment.js';
import { ABILITY_SCORES } from '../entities/Modifiers.js';
import { buildSlantControls } from './SpellFormSlants.js';
import { buildResistControls } from './SpellFormChipMods.js';

/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * A number field for the buff rows, with its tooltip.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @param {string} tip
 * @returns {HTMLInputElement}
 */
function number(value, min, max, tip) {
  const field = numberField(value, { min, max, className: 'form__number' });
  setTip(field, tip);
  return field;
}

/**
 * The spell form's controls for what a buff's chip changes besides a roll:
 * a flat AC bonus (Shield, Shield of Faith), a base AC for a holder without
 * body armor (Mage Armor), a floor under the holder's AC (Barkskin), a raise
 * to the HP maximum (Aid), temporary HP at the cast (False Life) or at the
 * start of each turn (Heroism), a condition the holder can't take, and the
 * save advantage and extra action of Haste, the damage dice a chip adds to
 * hits (Divine Favor, Hunter's Mark), the attack slants of
 * `SpellFormSlants.js`, the resistances of `SpellFormChipMods.js`, and the
 * list of damage types that the caster picks one of (Protection from Energy).
 * The immunity select shows the
 * first stored condition, and the form keeps any further ones as stored. The
 * form does not show `blocks` (Shield's Magic Missile), and keeps it as stored.
 * `ui/SpellForm.js` places the rows, calls `sync` when the effect kind
 * changes, and reads the values back with `read`. `entities/ChipMods.js` and
 * `entities/SpellFields.js` decide what they mean.
 * @param {Spell | null} spell the spell being edited, or null for a new one
 */
export function buildBuffControls(spell) {
  const effect = spell?.effect.kind === 'buff' ? spell.effect : null;
  const mods = effect?.mods ?? {};
  const ac = number(mods.ac ?? 0, -30, 30, 'Added to the AC of each target. Negative to lower it');
  const acBase = number(
    mods.acBase ?? 0,
    0,
    30,
    'Base AC before DEX for a target without body armor, as with Mage Armor',
  );
  const acMin = number(
    mods.acMin ?? 0,
    0,
    30,
    "The target's AC can't be lower than this, as with Barkskin",
  );
  const maxHP = number(
    mods.maxHP ?? 0,
    0,
    100,
    'Added to the HP maximum and current HP of each target while the chip lasts, as with Aid',
  );
  const maxHPPerStep = number(
    effect?.modsPerStep?.maxHP ?? 0,
    0,
    100,
    'More HP maximum per slot level above the base',
  );
  const temp = effect?.tempHP;
  const tempCount = number(
    temp?.count ?? 0,
    0,
    20,
    'Dice of temporary HP each target gains at the cast',
  );
  const tempSides = select(
    DIE_SIZES.map((n) => ({ value: String(n), label: `d${n}` })),
    String(temp?.sides ?? 4),
  );
  const tempFlat = number(
    temp?.flat ?? 0,
    0,
    100,
    'Temporary HP on top of the dice, as with the 4 of False Life',
  );
  const tempPerStep = number(
    temp?.flatPerStep ?? 0,
    0,
    100,
    'More temporary HP per slot level above the base',
  );
  const eachTurn = checkbox('Temp HP each turn', !!effect?.tempEachTurn);
  setTip(
    eachTurn.label,
    "The holder gains the caster's spell modifier as temporary HP at the start of each of its turns, as with Heroism",
  );
  const stored = mods.immune?.[0] ?? '';
  const moreImmune = mods.immune?.slice(1) ?? [];
  const immune = select(
    [
      { value: '', label: 'None' },
      ...(stored && !CONDITIONS.includes(stored) ? [stored] : []),
      ...CONDITIONS,
    ],
    stored,
  );
  const immuneField = labeled('Immune to', immune);
  setTip(immuneField, 'The holder ends this condition and cannot take it again, as with Heroism');
  const advantage = ABILITY_SCORES.map((key) =>
    checkbox(key, (mods.saveAdvantage ?? []).includes(key)),
  );
  const advantageField = labeled(
    'Save advantage',
    el('div', 'u-row u-wrap u-g2', ...advantage.map((box) => box.label)),
  );
  setTip(advantageField, 'The holder rolls saves in these abilities with advantage, as with Haste');
  const extra = checkbox('Extra action', !!mods.extraAction);
  setTip(
    extra.label,
    'The holder has one more action on each of its turns, good for one weapon attack, as with Haste',
  );

  const hitStored = effect?.hit;
  const hitCount = number(
    hitStored?.count ?? 0,
    0,
    20,
    'Dice each hit adds, as with the 1d4 of Divine Favor',
  );
  const hitSides = select(
    DIE_SIZES.map((n) => ({ value: String(n), label: `d${n}` })),
    String(hitStored?.sides ?? 6),
  );
  const hitType = select(
    [{ value: '', label: 'Same as the hit' }, ...DAMAGE_TYPES],
    hitStored?.damageType ?? '',
  );
  const weaponOnly = checkbox('Weapon hits only', !!hitStored?.weaponOnly);
  setTip(
    weaponOnly.label,
    "Only weapon attacks add the dice, as with Divine Favor and Hunter's Mark",
  );
  const mark = checkbox('Marks a foe', !!hitStored?.mark);
  setTip(
    mark.label,
    "The chip goes on a foe, and only the caster's hits against it add the dice, as with Hunter's Mark",
  );
  const slants = buildSlantControls(mods);
  const resist = buildResistControls(mods);
  const choice = textField((effect?.resistChoice ?? []).join(', '), { placeholder: 'no pick' });
  const choiceField = labeled('Caster picks one of', choice);
  setTip(
    choiceField,
    'Damage types, split by commas. The cast dialog asks for one, and the chip resists it, as with Protection from Energy',
  );

  const rows = {
    ac: fieldRow(
      labeled('AC bonus', ac),
      labeled('Unarmored base AC', acBase),
      labeled('Minimum AC', acMin),
    ),
    hp: fieldRow(
      labeled('Max HP bonus', maxHP),
      labeled('Per slot level', maxHPPerStep),
      immuneField,
    ),
    temp: fieldRow(
      labeled('Temp HP dice', tempCount),
      labeled('Die', tempSides),
      labeled('Plus', tempFlat),
      labeled('Per slot level', tempPerStep),
      eachTurn.label,
    ),
    turn: fieldRow(advantageField, labeled('Action', extra.label)),
    hit: fieldRow(
      labeled('Hit dice', hitCount),
      labeled('Die', hitSides),
      labeled('Type', hitType),
      weaponOnly.label,
      mark.label,
    ),
    slants: slants.row,
    resist: resist.row,
    resistPick: fieldRow(choiceField),
  };

  /** @param {string} kind */
  function sync(kind) {
    for (const row of Object.values(rows)) row.hidden = kind !== 'buff';
  }

  /** The control values, for `SpellDraft.assembleSpell`. */
  function read() {
    return {
      mods: {
        ac: ac.value,
        acBase: acBase.value,
        acMin: acMin.value,
        maxHP: maxHP.value,
        immune: [...(immune.value ? [immune.value] : []), ...moreImmune],
        saveAdvantage: ABILITY_SCORES.filter((_, i) => advantage[i].input.checked),
        blocks: mods.blocks ?? [],
        extraAction: extra.input.checked,
        ...slants.read(),
        ...resist.read(),
      },
      resistChoice: choice.value
        .split(',')
        .map((/** @type {string} */ t) => t.trim().toLowerCase()),
      modsPerStep: { maxHP: maxHPPerStep.value },
      tempHP: {
        count: tempCount.value,
        sides: tempSides.value,
        flat: tempFlat.value,
        flatPerStep: tempPerStep.value,
      },
      tempEachTurn: eachTurn.input.checked,
      hit: {
        count: hitCount.value,
        sides: hitSides.value,
        damageType: hitType.value,
        weaponOnly: weaponOnly.input.checked,
        mark: mark.input.checked,
      },
    };
  }

  return { rows, sync, read };
}
