import { setTip } from './Tooltip.js';
import { labeled, fieldRow, checkbox, textField, numberField, select } from './formFields.js';
import {
  CASTING_TIME_KINDS,
  DURATION_KINDS,
  TIMED_CASTING_KINDS,
  TIMED_DURATION_KINDS,
  parseCastingTime,
  parseDuration,
} from '../entities/SpellTiming.js';

/** @typedef {import('../types/spell.js').Spell} Spell */

/** How each casting-time kind reads in the picker. A counted kind also serves
 * as the caption over the amount field beside it. @type {Record<string, string>} */
const CASTING_TIME_LABELS = {
  action: 'Action',
  bonus: 'Bonus action',
  reaction: 'Reaction',
  minutes: 'Minutes',
  hours: 'Hours',
  special: 'Special',
};

/** The same map for durations. @type {Record<string, string>} */
const DURATION_LABELS = {
  instantaneous: 'Instantaneous',
  rounds: 'Rounds',
  minutes: 'Minutes',
  hours: 'Hours',
  days: 'Days',
  'until-dispelled': 'Until dispelled',
  special: 'Special',
};

/** The kind picker's options: each kind paired with its human label.
 * @param {readonly string[]} kinds
 * @param {Record<string, string>} labels
 * @returns {{ value: string, label: string }[]} */
function kindOptions(kinds, labels) {
  return kinds.map((kind) => ({ value: kind, label: labels[kind] }));
}

/** Rewrite a captioned field's caption. This lets one amount input name
 * itself 'Minutes' or 'Hours' as the kind beside it changes.
 * @param {HTMLElement} field @param {string} caption */
export function setCaption(field, caption) {
  const span = field.querySelector('span');
  if (span) span.textContent = caption;
}

/**
 * The spell form's casting-time and duration controls: a kind picker each,
 * plus the amount, trigger, or text that the kind uses. `ui/SpellForm.js`
 * places the rows and reads the values back with `read`. The controls keep
 * themselves in step with their kind pickers.
 * @param {Spell | null} spell the spell being edited, or null for a new one
 */
export function buildTimingControls(spell) {
  const castingTime = parseCastingTime(spell?.castingTime ?? '1 action');
  const timeKindSelect = select(
    kindOptions(CASTING_TIME_KINDS, CASTING_TIME_LABELS),
    castingTime.kind,
  );
  const timeAmountInput = numberField(castingTime.amount ?? 1, {
    min: 1,
    className: 'form__number',
  });
  const timeAmountField = labeled('Minutes', timeAmountInput);
  const triggerInput = textField(castingTime.trigger ?? '', {
    placeholder: 'which you take when ...',
  });
  const timeTextInput = textField(castingTime.text ?? '', { placeholder: 'as written' });
  const timeTextField = labeled('Casting time text', timeTextInput);

  // A duration has the same fields, plus the "up to" distinction.
  const duration = parseDuration(spell?.duration ?? 'Instantaneous');
  const durationKindSelect = select(kindOptions(DURATION_KINDS, DURATION_LABELS), duration.kind);
  const durationAmountInput = numberField(duration.amount ?? 1, {
    min: 1,
    className: 'form__number',
  });
  const durationAmountField = labeled('Rounds', durationAmountInput);
  const upTo = checkbox('Up to', duration.upTo ?? false);
  setTip(upTo.label, 'The caster may end the spell before the time runs out');
  const durationTextInput = textField(duration.text ?? '', { placeholder: 'as written' });
  const durationTextField = labeled('Duration text', durationTextInput);

  const rows = {
    casting: fieldRow(labeled('Casting time', timeKindSelect), timeAmountField, timeTextField),
    trigger: fieldRow(labeled('Reaction to', triggerInput)),
    duration: fieldRow(
      labeled('Duration', durationKindSelect),
      durationAmountField,
      upTo.label,
      durationTextField,
    ),
  };

  // Each timing kind shows only what it uses: an amount for a counted kind,
  // a trigger clause for a reaction, or the original text for `special`.
  function sync() {
    const timeKind = timeKindSelect.value;
    const timed = TIMED_CASTING_KINDS.includes(
      /** @type {import('../types/spell.js').CastingTime['kind']} */ (timeKind),
    );
    timeAmountField.hidden = !timed;
    if (timed) setCaption(timeAmountField, CASTING_TIME_LABELS[timeKind]);
    rows.trigger.hidden = timeKind !== 'reaction';
    timeTextField.hidden = timeKind !== 'special';

    const durationKind = durationKindSelect.value;
    const durationTimed = TIMED_DURATION_KINDS.includes(
      /** @type {import('../types/spell.js').SpellDuration['kind']} */ (durationKind),
    );
    durationAmountField.hidden = !durationTimed;
    upTo.label.hidden = !durationTimed;
    if (durationTimed) setCaption(durationAmountField, DURATION_LABELS[durationKind]);
    durationTextField.hidden = durationKind !== 'special';
  }
  timeKindSelect.addEventListener('change', sync);
  durationKindSelect.addEventListener('change', sync);
  sync();

  // The reader hands the raw control values to the parser instead of
  // validating here. This keeps the form and an imported file in agreement
  // on what a timing value can contain.
  /** @returns {{ castingTime: import('../types/spell.js').CastingTime, duration: import('../types/spell.js').SpellDuration }} */
  function read() {
    return {
      castingTime: parseCastingTime({
        kind: timeKindSelect.value,
        amount: timeAmountInput.value,
        trigger: triggerInput.value.trim(),
        text: timeTextInput.value.trim(),
      }),
      duration: parseDuration({
        kind: durationKindSelect.value,
        amount: durationAmountInput.value,
        upTo: upTo.input.checked,
        text: durationTextInput.value.trim(),
      }),
    };
  }

  return { rows, read };
}
