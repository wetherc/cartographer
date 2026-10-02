import { setTip } from './Tooltip.js';
import { buildDamageEditor } from './ItemFormEditors.js';
import { labeled, fieldRow, checkbox, select } from './formFields.js';
import { CHIP_UNTILS, UNTIL_LABELS } from '../entities/SpellFields.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/spell.js').Spell} Spell */

/** A starting term for a dice editor that has nothing to seed from. */
const SAMPLE = [{ count: 1, sides: 6, damageType: 'acid' }];

/**
 * The spell form's controls for what a spell does after the turn it is cast:
 * how a melee spell attack and a splash on a miss read, damage that stays on
 * a target for later turns, the turn boundary that ends a save's condition
 * or a buff's chip, and a repeat that the caster uses without a new slot.
 * `ui/SpellForm.js` places the rows, calls `sync` when the effect kind
 * changes, and reads the values back with `read`. `entities/SpellDraft.js` decides what they mean.
 * @param {Spell | null} spell the spell being edited, or null for a new one
 */
export function buildLaterTurnControls(spell) {
  const effect = spell?.effect;
  const attack = effect?.kind === 'attack' ? effect : null;
  const save = effect?.kind === 'save' ? effect : null;
  const buff = effect?.kind === 'buff' ? effect : null;
  const ongoing = attack?.ongoing ?? save?.ongoing ?? null;

  const melee = checkbox('Melee spell attack', attack?.melee === true);
  setTip(melee.label, 'Prone and an automatic critical hit read this. Touch range is melee anyway');
  const halfOnMiss = checkbox('Half on a miss', attack?.halfOnMiss === true);

  const until = select(
    [
      { value: '', label: 'Spell duration' },
      ...CHIP_UNTILS.map((value) => ({ value, label: capitalize(UNTIL_LABELS[value]) })),
    ],
    save?.until ?? buff?.until ?? '',
  );
  const untilField = labeled('Condition ends at', until);

  const lingers = checkbox('Deals damage on later turns', !!ongoing);
  setTip(lingers.label, "The damage rolls at the end of each of the target's turns");
  const ongoingDamage = buildDamageEditor(ongoing?.damage ?? SAMPLE, null);
  const ongoingPerStep = buildDamageEditor(ongoing?.perStep ?? [], null);
  const ongoingUntil = select(
    CHIP_UNTILS.map((value) => ({ value, label: capitalize(UNTIL_LABELS[value]) })),
    ongoing?.until ?? 'target-end',
  );

  const repeat = spell?.repeat ?? null;
  const repeats = checkbox('Repeats on later turns', !!repeat);
  setTip(repeats.label, 'While the spell lasts, the caster uses it again with no slot');
  const repeatCost = select(
    [
      { value: '', label: 'Same as casting time' },
      { value: 'action', label: 'Action' },
      { value: 'bonus', label: 'Bonus action' },
    ],
    repeat?.cost ?? '',
  );
  const fixed = checkbox('Fixed damage to the same target', !!repeat?.damage?.length);
  setTip(
    fixed.label,
    'Each repeat hits the creature the first cast hit, with no roll, as with Witch Bolt',
  );
  const repeatDamage = buildDamageEditor(repeat?.damage ?? SAMPLE, null);

  const rows = {
    attack: fieldRow(melee.label, halfOnMiss.label),
    until: fieldRow(untilField),
    lingers: fieldRow(lingers.label),
    ongoing: fieldRow(labeled('Later damage', ongoingDamage.element)),
    ongoingMore: fieldRow(labeled('Extra later dice / level', ongoingPerStep.element)),
    ongoingUntil: fieldRow(labeled('Own chip ends at', ongoingUntil)),
    repeats: fieldRow(repeats.label),
    repeat: fieldRow(labeled('Each repeat costs', repeatCost), fixed.label),
    repeatDamage: fieldRow(labeled('Repeat damage', repeatDamage.element)),
  };

  /**
   * Show the rows the effect kind uses. The damage rows show only once their
   * box is ticked.
   * @param {string} kind
   * @param {boolean} hasCondition whether a save names a condition
   */
  function sync(kind, hasCondition) {
    const damaging = kind === 'attack' || kind === 'save';
    rows.attack.hidden = kind !== 'attack';
    // A buff always leaves a chip, and a save leaves one once it names a
    // condition.
    rows.until.hidden = kind !== 'buff' && (kind !== 'save' || !hasCondition);
    rows.lingers.hidden = !damaging;
    rows.ongoing.hidden = !damaging || !lingers.input.checked;
    rows.ongoingMore.hidden = rows.ongoing.hidden;
    rows.ongoingUntil.hidden = rows.ongoing.hidden;
    rows.repeat.hidden = !repeats.input.checked;
    rows.repeatDamage.hidden = !repeats.input.checked || !fixed.input.checked;
  }

  /** @param {() => void} onChange */
  function listen(onChange) {
    for (const box of [lingers, repeats, fixed]) box.input.addEventListener('change', onChange);
  }

  /** The control values, for `SpellDraft.assembleSpell`. */
  function read() {
    return {
      effect: {
        melee: melee.input.checked,
        halfOnMiss: halfOnMiss.input.checked,
        until: until.value,
        ongoing: lingers.input.checked
          ? {
              damage: ongoingDamage.get(),
              perStep: ongoingPerStep.get(),
              until: ongoingUntil.value,
            }
          : null,
      },
      repeat: repeats.input.checked
        ? { cost: repeatCost.value, damage: fixed.input.checked ? repeatDamage.get() : [] }
        : null,
    };
  }

  return { rows, sync, listen, read };
}
