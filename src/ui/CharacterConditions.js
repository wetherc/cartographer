import { settleHPBuffs } from '../entities/HPBuffs.js';
import { CONCENTRATING } from '../entities/Conditions.js';
import { drop as dropConcentration } from '../entities/Concentration.js';
import { canAct } from '../entities/ConditionEffects.js';
import { mountConditionsBar } from './ConditionsBar.js';
import { deathSaveBlock } from './DeathSaveBlock.js';
import { mountExhaustionBar } from './ExhaustionBar.js';
import { sectionLabel, textButton } from './buttons.js';
import { el } from './dom.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The conditions section of the character sheet (see `CharacterSheet.js`):
 * the condition chips, the held concentration with its Drop control, the
 * exhaustion pips, and the death-save block. It returns the section and a
 * writer that the sheet calls after each change it writes in place, so the
 * parts repaint only when their state changed. This file is DOM wiring,
 * verified visually.
 * @param {Character} character the character at build time
 * @param {{
 *   live: () => Character,
 *   commit: (next: Character) => void,
 *   getPermissions: () => import('../types/view.js').SheetPermissions,
 *   onConcentrationEnd?: (
 *     character: Character,
 *     held: import('../types/entities.js').ConcentrationState,
 *   ) => void,
 *   exhaustion: { onSet: (level: number) => void } | null | undefined,
 *   deathSaves: { onRoll: () => void, onStabilize: () => void } | null | undefined,
 * }} ctx
 * @returns {{ element: HTMLElement, write: () => void }}
 */
export function buildConditionsSection(character, ctx) {
  const { live, commit, getPermissions, exhaustion, deathSaves } = ctx;
  const conditions = el(
    'div',
    'character-sheet__conditions u-col u-g1',
    sectionLabel('Conditions'),
  );
  /**
   * Stop the character from holding the spell it was concentrating on,
   * from whichever control triggered this. Tell the host which spell
   * ended, so the creatures it affected go free.
   * @param {Character} from the character to drop it from
   */
  function endConcentration(from) {
    const held = from.concentration;
    commit(dropConcentration(from));
    if (held) ctx.onConcentrationEnd?.(from, held);
  }

  // The bar reads and reports the whole list, so it stays mounted across
  // ticks. Only its chips are rebuilt, and only when they can have changed.
  const conditionsBar = mountConditionsBar(conditions, {
    getConditions: () => live()?.conditions ?? [],
    // Removing the Concentrating chip by hand means the spell ended, so
    // the state behind it must end too. Without this, the chip and the held
    // spell can disagree. A chip such as Stunned that leaves the character
    // unable to act ends the spell the same way.
    onChange: (next) => {
      const held = live();
      const kept = next.some((c) => c.name.toLowerCase() === CONCENTRATING.toLowerCase());
      const withConditions = settleHPBuffs({ ...held, conditions: next });
      if (held.concentration && (!kept || !canAct(next))) endConcentration(withConditions);
      else commit(withConditions);
    },
    canEdit: () => getPermissions().play,
  });
  // This names the held spell beside the chip that marks it, with a
  // control to end it early. A caster can stop concentrating at any time.
  const concentration = el('div', 'character-sheet__concentration u-row u-wrap u-g1');
  conditions.appendChild(concentration);
  /** @type {import('../types/entities.js').ConcentrationState | null | undefined} */
  let shownConcentration;
  function renderConcentration() {
    const held = live().concentration;
    shownConcentration = held;
    concentration.replaceChildren();
    if (!held) return;
    concentration.appendChild(el('span', 'u-muted', `Concentrating on ${held.spellName}`));
    if (getPermissions().play) {
      concentration.appendChild(
        textButton('Drop', () => endConcentration(live()), {
          variant: 'danger',
          ariaLabel: `Drop concentration on ${held.spellName}`,
        }),
      );
    }
  }
  renderConcentration();
  // Exhaustion sits under the chips, because it reads as one of them even
  // though it is a level rather than an on-or-off state. The pips write
  // through the host, so the sixth level can kill and log. The bar needs no
  // writer of its own: the level is part of the sheet's shape, so a change to
  // it rebuilds the card along with the save and skill bonuses it moves.
  // The pips take the GM-only `restore` permission, not `play`: exhaustion
  // is a GM ruling, and the sixth pip kills, so a bound player only reads
  // the row. The two creature panels gate their bars the same way.
  mountExhaustionBar(conditions, {
    getEntity: () => live(),
    onSet: (level) => exhaustion?.onSet(level),
    canEdit: () => getPermissions().restore && Boolean(exhaustion),
  });
  // The death-save tracker sits under concentration and shows only while
  // the character is at 0 HP. The combat screen draws the same block from
  // the same builder, so the two surfaces cannot describe it differently.
  const dying = el('div', 'character-sheet__death-saves');
  conditions.appendChild(dying);
  /** @type {import('../types/entities.js').DeathSaveState | null | undefined} */
  let shownDeathSaves;
  function renderDeathSaves() {
    const state = live().deathSaves;
    shownDeathSaves = state;
    dying.replaceChildren();
    const mayUse = getPermissions().play && Boolean(deathSaves);
    const block = deathSaveBlock(state, {
      name: live().name,
      canRoll: mayUse,
      canStabilize: mayUse,
      onRoll: () => deathSaves?.onRoll(),
      onStabilize: () => deathSaves?.onStabilize(),
    });
    if (block) dying.appendChild(block);
  }
  renderDeathSaves();

  /** @type {import('../types/entities.js').Condition[]} */
  let shownConditions = character.conditions;
  const write = () => {
    const next = live().conditions;
    if (next !== shownConditions) {
      shownConditions = next;
      conditionsBar.update();
    }
    if (live().concentration !== shownConcentration) renderConcentration();
    if (live().deathSaves !== shownDeathSaves) renderDeathSaves();
  };
  return { element: conditions, write };
}
