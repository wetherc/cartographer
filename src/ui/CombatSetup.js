import { formatModifier } from '../entities/Modifiers.js';
import { setTip } from './Tooltip.js';
import { textButton } from './buttons.js';
import { el } from './dom.js';
import { icon } from './icons.js';
import { checkbox, numberField } from './formFields.js';
import { openDialog } from './Modal.js';
import { rollUnsettled } from '../combat/InitiativeRoll.js';
import { numberedNames } from '../combat/DisplayNames.js';
import { groupTitle, nearbyGroups } from '../combat/CombatRoster.js';
import { stealthStep } from './CombatSetupStealth.js';

/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/combat.js').ParticipantView} ParticipantView */

/**
 * Show the combat setup dialog. It lists one row per potential combatant with
 * an editable initiative value. An optional Roll initiative button fills
 * every row from `rollInitiative` (a Dexterity check in the app, or an
 * injected roll in tests). Each roll also returns a note saying what slanted
 * it, which the dialog passes on to `onRolled` for the log. A Start combat
 * button submits the form. Rolled values stay editable, so the GM can override
 * a result by hand before starting. A Surprised box on each row marks a
 * combatant that the other side caught unaware.
 *
 * With `stealth` hooks, an optional Stealth contest above the rows ticks the
 * Surprised boxes (see CombatSetupStealth.js), and Start passes each outcome
 * line to `onStealth`. With `onParley`, a Parley button closes the dialog
 * with no fight. The dialog then calls `onParley` and resolves to null.
 *
 * `nearby` lists foes outside the roster, each with its distance in tiles.
 * They show under "Add nearby foes" with a Join box, unticked. A ticked foe
 * joins the roster for Roll initiative and Start. The Stealth contest covers
 * only the roster.
 *
 * This is the GM's entry into combat. The initiative panel itself only shows
 * a running fight, so the caller must gate who can open this dialog. On
 * Start, this function rolls each row that the GM neither rolled nor typed,
 * and resolves to the participants with their final initiative values. On
 * cancel, it resolves to null.
 *
 * As in the initiative panel, a row's name and side come from `describe`,
 * not from the participant, because the participant carries only the
 * numbers.
 * @param {Participant[]} roster
 * @param {{
 *   describe?: (participant: Participant) => ParticipantView | null,
 *   rollInitiative?: (participant: Participant) => { value: number, note: string },
 *   onRolled?: (results: { name: string, value: number, note: string }[]) => void,
 *   stealth?: import('./CombatSetupStealth.js').StealthHooks,
 *   onStealth?: (line: string) => void,
 *   onParley?: () => void,
 *   nearby?: import('../combat/CombatRoster.js').NearbyFoe[],
 * }} [callbacks]
 * @returns {Promise<Participant[] | null>}
 */
export function combatSetupModal(roster, callbacks = {}) {
  /** @type {Map<string, HTMLInputElement>} */
  const inputs = new Map();
  /** @type {Map<string, HTMLInputElement>} */
  const surprised = new Map();
  /** The ids whose value the GM rolled or typed. Start rolls the others. */
  const settled = new Set();
  /** @type {ReturnType<typeof stealthStep> | null} */
  let stealth = null;

  /**
   * The setup rows show only a name and a side. The fallback for an
   * unresolvable id needs only those two fields.
   * @param {Participant} participant
   * @returns {Pick<ParticipantView, 'name' | 'side'>}
   */
  const described = (participant) =>
    callbacks.describe?.(participant) ?? { name: 'Unknown combatant', side: 'party' };
  // Two rows that share a name get numbers, in roster order, which is the
  // campaign's order of characters and then creatures. The fight numbers
  // them the same way.
  const nearby = callbacks.nearby ?? [];
  /** The Join box of each nearby foe. */
  /** @type {Map<string, HTMLInputElement>} */
  const joined = new Map();
  /** The roster plus each nearby foe whose Join box is ticked. */
  const active = () => [
    ...roster,
    ...nearby.filter((n) => joined.get(n.participant.id)?.checked).map((n) => n.participant),
  ];
  const labels = numberedNames(
    [...roster, ...nearby.map((n) => n.participant)].map((p) => ({
      id: p.id,
      name: described(p).name,
    })),
  );
  const describe = (/** @type {Participant} */ participant) => {
    const view = described(participant);
    return { ...view, name: labels.get(participant.id) ?? view.name };
  };

  const shown = openDialog({
    className: 'combat-setup',
    title: 'Set up combat',
    form: true,
    build: (close) => {
      /** @type {Node[]} */
      const body = [];
      stealth = callbacks.stealth
        ? stealthStep(roster, describe, surprised, callbacks.stealth)
        : null;
      if (stealth) body.push(stealth.section);
      /**
       * One row: the name, the DEX modifier, and the initiative field, then
       * the cells that follow them. A note shows in small text under the
       * name, so it does not push the initiative field out of line.
       * @param {Participant} participant
       * @param {Node[]} cells
       * @param {string} [note]
       */
      const initiativeRow = (participant, cells, note) => {
        const view = describe(participant);
        const modifier = el(
          'span',
          'initiative-panel__modifier u-muted',
          formatModifier(participant.modifier ?? 0),
        );
        setTip(modifier, 'DEX modifier, added to the initiative roll');
        const input = numberField(participant.initiative, {
          className: 'initiative-panel__init',
          ariaLabel: `Initiative for ${view.name}`,
        });
        input.addEventListener('input', () => settled.add(participant.id));
        inputs.set(participant.id, input);
        return el(
          'div',
          `initiative-panel__row combat-setup__row u-row u-g2 initiative-panel__row--${view.side}`,
          el(
            'span',
            'initiative-panel__name',
            view.side === 'foe' ? foeMark() : null,
            view.name,
            view.side === 'foe' ? el('span', 'sr-only', ', foe') : null,
            note ? el('span', 'combat-setup__distance u-muted', note) : null,
          ),
          modifier,
          input,
          ...cells,
        );
      };
      for (const participant of roster) {
        const name = describe(participant).name;
        const surprise = checkbox('Surprised', participant.surprised === true, {
          className: 'initiative-panel__surprised',
        });
        surprise.input.setAttribute('aria-label', `${name} is surprised`);
        setTip(
          surprise.label,
          'No action, bonus action, or move on its first turn, and no reaction until that turn ends',
        );
        surprised.set(participant.id, surprise.input);
        body.push(
          initiativeRow(participant, [
            surprise.label,
            ...(stealth ? [stealth.cells(participant)] : []),
          ]),
        );
      }

      if (nearby.length > 0) {
        body.push(el('h3', 'combat-setup__nearby-title', 'Add nearby foes'));
        for (const group of nearbyGroups(nearby)) {
          /** @type {HTMLInputElement[]} */
          const boxes = [];
          const title = groupTitle(group.map((foe) => described(foe.participant).name));
          const all = group.length > 1 ? groupBox(title, group[0].distance, boxes) : null;
          if (all) body.push(all.row);
          for (const { participant, distance } of group) {
            const name = describe(participant).name;
            const join = checkbox('Join', false, { className: 'initiative-panel__surprised' });
            join.input.setAttribute('aria-label', `Add ${name} to the fight`);
            join.input.addEventListener('change', () => all?.sync());
            joined.set(participant.id, join.input);
            boxes.push(join.input);
            body.push(initiativeRow(participant, [join.label], tilesAway(distance)));
          }
        }
      }

      /** @type {HTMLElement[]} */
      const actions = [];

      const rollInitiative = callbacks.rollInitiative;
      if (rollInitiative) {
        const rollAll = textButton(
          'Roll initiative',
          () => {
            /** @type {{ name: string, value: number, note: string }[]} */
            const results = [];
            for (const participant of active()) {
              const input = inputs.get(participant.id);
              if (!input) continue;
              const { value, note } = rollInitiative(participant);
              input.value = String(value);
              settled.add(participant.id);
              results.push({ name: describe(participant).name, value, note });
            }
            if (results.length > 0) callbacks.onRolled?.(results);
          },
          { icon: 'dice' },
        );
        actions.push(rollAll);
      }

      stealth?.layout();
      const cancel = textButton('Cancel', () => close('cancel'));
      // Parley ends the setup with no fight. The caller logs how the party
      // settled the encounter.
      if (callbacks.onParley) {
        actions.push(
          textButton('Parley', () => close('parley'), {
            icon: 'flag',
          }),
        );
      }

      // The submit button carries a value. This makes an Escape dismissal,
      // where returnValue stays empty, read as a cancel, not as starting the
      // fight.
      const start = textButton('Start combat', undefined, {
        icon: 'sword',
        variant: 'primary',
        type: 'submit',
        value: 'start',
      });

      actions.push(cancel, start);
      return { body, actions, initialFocus: start };
    },
    result: (returnValue) => {
      if (returnValue === 'parley') callbacks.onParley?.();
      if (returnValue !== 'start') return null;
      for (const line of stealth?.lines() ?? []) callbacks.onStealth?.(line);
      // A row the GM neither rolled nor typed still shows the placeholder of
      // 10 plus the modifier. Start rolls those rows, and logs them the same
      // way a press of Roll initiative does.
      if (callbacks.rollInitiative) {
        const rolled = rollUnsettled(active(), settled, callbacks.rollInitiative);
        for (const { participant, value } of rolled) {
          const input = inputs.get(participant.id);
          if (input) input.value = String(value);
        }
        if (rolled.length > 0) {
          callbacks.onRolled?.(
            rolled.map(({ participant, value, note }) => ({
              name: describe(participant).name,
              value,
              note,
            })),
          );
        }
      }
      return active().map((p) => {
        const { surprised: _, ...rest } = p;
        const initiative = Number(inputs.get(p.id)?.value) || 0;
        return surprised.get(p.id)?.checked
          ? { ...rest, initiative, surprised: true }
          : { ...rest, initiative };
      });
    },
  });
  // Focus on Start combat scrolls the dialog to its end. The GM reads the
  // dialog from the top, and the sticky button row keeps Start in view.
  const dialogs = document.querySelectorAll('dialog.combat-setup');
  const dialog = dialogs[dialogs.length - 1];
  if (dialog) dialog.scrollTop = 0;
  return shown;
}

/**
 * The sword beside a foe's name, as on the combat cards. A screen reader
 * hears ", foe" after the name instead.
 */
function foeMark() {
  const mark = el('span', 'combat-setup__foe-mark', icon('sword'));
  mark.setAttribute('aria-hidden', 'true');
  return mark;
}

/** @param {number} distance */
const tilesAway = (distance) => `${distance} ${distance === 1 ? 'tile' : 'tiles'} away`;

/**
 * The "Add the whole group" box above the foes of one tile. It ticks or
 * clears every Join box of the group, and it shows as mixed while only some
 * are ticked.
 * @param {string} title the names in the group (see `groupTitle`)
 * @param {number} distance
 * @param {HTMLInputElement[]} boxes the Join boxes, filled in after this call
 */
function groupBox(title, distance, boxes) {
  // The names and the distance go in the label text, so a screen reader
  // hears which creatures the box adds, and the distance shares the baseline
  // of the checkbox label instead of floating beside it.
  const all = checkbox(`Add the whole group (${title}), ${tilesAway(distance)}`, false, {
    className: 'combat-setup__group',
  });
  all.input.addEventListener('change', () => {
    for (const box of boxes) box.checked = all.input.checked;
    all.input.indeterminate = false;
  });
  const sync = () => {
    const ticked = boxes.filter((box) => box.checked).length;
    all.input.checked = ticked === boxes.length;
    all.input.indeterminate = ticked > 0 && ticked < boxes.length;
  };
  const row = el('div', 'combat-setup__group-row u-row u-g2', all.label);
  return { row, sync };
}
