import { setTip } from './Tooltip.js';
import { labeled, fieldRow, checkbox, select } from './formFields.js';
import { CONDITIONS } from '../entities/Conditions.js';
import { ABILITY_SCORES } from '../entities/Modifiers.js';
import { CHIP_UNTILS, UNTIL_LABELS } from '../entities/SpellFields.js';
import { capitalize } from '../util/text.js';
import { buildChipModControls } from './SpellFormChipMods.js';
import { buildTypedChipControls } from './SpellFormTypedChip.js';

/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The spell form's controls for what an attack spell's hit does besides its
 * damage: a condition the hit imposes, with or without a save against it, and
 * the share of the damage the caster regains. A hit that imposes a condition
 * can also leave a second chip on a target of some creature types
 * (`ui/SpellFormTypedChip.js`). `ui/SpellForm.js` places the rows and the
 * typed chip rows, calls `sync` when the effect kind changes, and reads the values back
 * with `read`. `entities/SpellDraft.js` decides what they mean.
 * @param {Spell | null} spell the spell being edited, or null for a new one
 */
export function buildOnHitControls(spell) {
  const attack = spell?.effect.kind === 'attack' ? spell.effect : null;
  const onHit = attack?.onHit ?? null;

  const imposes = checkbox('A hit imposes a condition', !!onHit);
  setTip(imposes.label, 'Ray of Sickness poisons the creature it hits unless it makes a CON save');
  const noHealing = checkbox('Stops healing', onHit?.mods?.noHealing === true);
  setTip(
    noHealing.label,
    'Chill Touch: the creature it hits regains no hit points while the chip lasts',
  );
  const stored = onHit?.condition ?? '';
  const condition = select(
    [...(stored && !CONDITIONS.includes(stored) ? [stored] : []), ...CONDITIONS],
    stored || 'Poisoned',
  );
  const save = select(
    [{ value: '', label: 'No save' }, ...ABILITY_SCORES.map((a) => ({ value: a, label: a }))],
    onHit?.saveAbility ?? '',
  );
  const until = select(
    [
      { value: '', label: 'Spell duration' },
      ...CHIP_UNTILS.map((value) => ({ value, label: capitalize(UNTIL_LABELS[value]) })),
    ],
    onHit?.until ?? '',
  );
  const drain = select(
    [
      { value: '', label: 'Nothing' },
      { value: 'half', label: 'Half the damage' },
      { value: 'full', label: 'All the damage' },
    ],
    attack?.drain ?? '',
  );
  const chip = buildChipModControls(onHit?.mods ?? {});
  const typed = buildTypedChipControls(onHit?.typed ?? null);
  const drainField = labeled('Caster regains', drain);
  setTip(drainField, "The damage counts after the target's resistances, as with Vampiric Touch");

  const rows = {
    drain: fieldRow(drainField),
    imposes: fieldRow(imposes.label),
    onHit: fieldRow(labeled('Condition on a hit', condition), labeled('Save against it', save)),
    onHitUntil: fieldRow(labeled('Hit condition ends at', until), noHealing.label),
    onHitSlants: chip.rows.slants,
    onHitResist: chip.rows.resist,
  };

  /**
   * Show the rows the effect kind uses. The condition rows show only once
   * their box is ticked.
   * @param {string} kind
   */
  function sync(kind) {
    const attacks = kind === 'attack';
    rows.drain.hidden = !attacks;
    rows.imposes.hidden = !attacks;
    rows.onHit.hidden = !attacks || !imposes.input.checked;
    rows.onHitUntil.hidden = rows.onHit.hidden;
    rows.onHitSlants.hidden = rows.onHitResist.hidden = rows.onHit.hidden;
    typed.sync(!rows.onHit.hidden);
  }

  /** @param {() => void} onChange */
  function listen(onChange) {
    imposes.input.addEventListener('change', onChange);
    typed.listen(onChange);
  }

  /** The control values, for `SpellDraft.assembleSpell`. */
  function read() {
    return {
      onHit: imposes.input.checked
        ? {
            condition: condition.value,
            saveAbility: save.value,
            until: until.value,
            mods: { ...chip.read(), noHealing: noHealing.input.checked },
            typed: typed.read(),
          }
        : null,
      drain: drain.value,
    };
  }

  return { rows, typedRows: Object.values(typed.rows), sync, listen, read };
}
