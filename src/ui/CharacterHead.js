/**
 * The headline lines of a character sheet: the HP line with its damage and
 * heal steppers, the spell-slot pips, and the banner of level, AC, speed, and
 * the other numbers a GM asks for in play. `mountCharacterSheet` places them
 * and runs the writer each one returns on every re-point.
 */

import { getHP, damageCharacter, spendResource, restoreResource } from '../entities/Character.js';
import { xpForNextLevel } from '../entities/Experience.js';
import { armorClass } from '../entities/Armor.js';
import { speedNote, walkSpeed } from '../entities/Movement.js';
import { getSlotPools, getPactPool } from '../entities/SpellSlots.js';
import { exhaustionReadout } from '../view/ExhaustionView.js';
import { formatModifier } from '../entities/Modifiers.js';
import { initiativeReadout } from '../view/InitiativeBadge.js';
import { passivePerception } from '../entities/Checks.js';
import { characterProficiency, effectiveLevel, pendingLevels } from '../entities/Multiclass.js';
import { sheetLevelText } from '../view/LevelUpCue.js';
import { buildStatBar, buildSlotLine } from './CharacterBars.js';
import { textButton } from './buttons.js';
import { el } from './dom.js';
import { setTip } from './Tooltip.js';
import { buildHpAmountField, takeHpAmount } from './HpAmountField.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/view.js').SheetPermissions} SheetPermissions */

/**
 * What a headline builder needs from the sheet that mounts it.
 * @typedef {{
 *   live: () => Character,
 *   commit: (next: Character) => void,
 * }} HeadContext
 */

/**
 * The header's XP line: the total against the start of the next level, or
 * the total alone at the top level.
 * @param {Character} character
 * @returns {string}
 */
function xpProgress(character) {
  const next = xpForNextLevel(character.level);
  return next === null ? `XP ${character.xp}` : `XP ${character.xp} / ${next}`;
}

/**
 * The HP block, or null for a character with no HP pool. It reads top to
 * bottom: the label and the numbers, a tall bar the width of the card, then
 * the damage and heal buttons with the amount between them. A GM reads the
 * bar from across the table.
 * @param {Character} character
 * @param {SheetPermissions} perms
 * @param {HeadContext & {
 *   hpStep: { onStep: (amount: number, isHeal: boolean) => void } | null,
 *   hpAmount: { value: number },
 * }} ctx `hpAmount` is the sheet's box for the typed amount, so the amount
 *   stays through a rebuild.
 * @returns {{ element: HTMLElement, write: () => void } | null}
 */
export function buildHpLine(character, perms, { live, commit, hpStep, hpAmount }) {
  const hp = getHP(character);
  if (!hp) return null;
  /** @type {HTMLElement | null} */
  let controls = null;
  if (perms.hp) {
    // The amount field sets how many HP each step button moves, so a big
    // hit or heal is one click. A press sets the field back to 1, and an
    // unusable entry disables both buttons (see `HpAmountField.js`).
    const amount = () => takeHpAmount(amountInput) ?? 1;
    // Bonus HP absorbs the hit before the pool does.
    const damageButton = textButton(
      'Damage',
      () => (hpStep ? hpStep.onStep(amount(), false) : commit(damageCharacter(live(), amount()))),
      {
        icon: 'minus',
        variant: 'danger',
        className: 'character-sheet__hp-step',
        ariaLabel: `Damage ${character.name}`,
      },
    );
    const healButton = textButton(
      'Heal',
      () =>
        hpStep ? hpStep.onStep(amount(), true) : commit(restoreResource(live(), 'hp', amount())),
      {
        icon: 'heal',
        variant: 'success',
        className: 'character-sheet__hp-step',
        ariaLabel: `Heal ${character.name}`,
      },
    );
    const amountInput = buildHpAmountField({
      value: hpAmount.value,
      className: 'character-sheet__hp-amount',
      ariaLabel: `HP amount for ${character.name}`,
      onInput: (value) => {
        if (value !== null) hpAmount.value = value;
        damageButton.disabled = value === null;
        healButton.disabled = value === null;
      },
    });
    controls = el(
      'div',
      'character-sheet__hp-controls u-row u-g2',
      damageButton,
      amountInput,
      healButton,
    );
  }
  const bar = buildStatBar(hp, {
    label: 'HP',
    critical: true,
    bonus: character.bonusHP ?? 0,
    hero: true,
  });
  return {
    element: el('div', 'character-sheet__hp-line u-col u-g2', bar.element, controls),
    write: () => {
      const pool = getHP(live());
      if (pool) bar.update(pool, live().bonusHP ?? 0);
    },
  };
}

/**
 * The spell-slot and pact-slot pips. A non-caster gets an empty spacer with
 * no writer: in the two-column sheet it keeps the space the pips would take,
 * so the sheet below the header does not rise when the GM selects a
 * non-caster after a caster. The stacked sheet hides the spacer
 * (widgets.css).
 * @param {Character} character
 * @param {SheetPermissions} perms
 * @param {HeadContext} ctx
 * @returns {{ element: HTMLElement, write: (() => void) | null }}
 */
export function buildSlotPips(character, perms, { live, commit }) {
  const pact = getPactPool(character);
  const slots = [...getSlotPools(character), ...(pact ? [pact] : [])];
  if (slots.length === 0) {
    const spacer = el('span', 'slot-line slot-line--empty');
    spacer.setAttribute('aria-hidden', 'true');
    return { element: spacer, write: null };
  }
  const line = buildSlotLine(
    slots,
    perms.play
      ? (pool, spent) =>
          commit(spent ? spendResource(live(), pool.id, 1) : restoreResource(live(), pool.id, 1))
      : null,
    perms.restore,
  );
  return {
    element: line.element,
    write: () => {
      const next = live();
      const nextPact = getPactPool(next);
      line.update([...getSlotPools(next), ...(nextPact ? [nextPact] : [])]);
    },
  };
}

/**
 * The banner line of level, derived AC, and XP progress, with initiative,
 * speed, passive Perception, the proficiency bonus, and exhaustion between
 * them. An edit to base AC or STR does not change the sheet's shape, so the
 * writer refreshes every derived badge.
 * @param {Character} character
 * @param {() => Character} live
 * @returns {{ element: HTMLElement, write: () => void }}
 */
export function buildHeadBanner(character, live) {
  const acBadge = tipBadge(
    el('span', 'character-sheet__ac'),
    'Armor class: equipped body armor sets base AC + DEX per its weight class ' +
      '(light: full, medium: max +2, heavy: none); unarmored is base AC + DEX, ' +
      'or the unarmored defense of a Barbarian or a Monk when that is higher. ' +
      'A shield adds its own bonus; other equipped items add their flat bonuses.',
  );

  const speedBadge = el('span', 'character-sheet__speed u-muted');
  // Initiative, passive Perception, and the proficiency bonus are the other
  // numbers a GM asks for in play, so they join AC and speed on one line.
  const initBadge = el('span', 'character-sheet__init u-muted');
  const ppBadge = el('span', 'character-sheet__pp u-muted');
  tipBadge(ppBadge, 'Passive Perception');
  const profBadge = el('span', 'character-sheet__prof u-muted');
  tipBadge(profBadge, 'Proficiency bonus');

  // A penalty that reaches every d20 roll belongs in the headline, not only
  // beside the conditions. The badge is empty at level 0, which is where most
  // characters sit, so the line reads as it did before exhaustion existed.
  const tiredBadge = el('span', 'character-sheet__exhaustion');

  const element = el(
    'div',
    'character-sheet__header',
    el('span', '', sheetLevelText(effectiveLevel(character), pendingLevels(character))),
    el(
      'span',
      'character-sheet__header-meta u-muted',
      acBadge,
      initBadge,
      speedBadge,
      ppBadge,
      profBadge,
      tiredBadge,
      el('span', 'character-sheet__xp-progress u-muted', xpProgress(character)),
    ),
  );
  const write = () => {
    const shown = live();
    acBadge.textContent = `AC ${armorClass(shown)}`;
    // Speed follows a STR edit as well, because armor too heavy for the
    // wearer costs 10 feet.
    speedBadge.textContent = `${walkSpeed(shown)} ft`;
    const init = initiativeReadout(shown);
    initBadge.textContent = init.label;
    tipBadge(initBadge, init.note);
    ppBadge.textContent = `PP ${passivePerception(shown)}`;
    profBadge.textContent = `Prof ${formatModifier(characterProficiency(shown))}`;
    tipBadge(speedBadge, speedNote(shown));
    const tired = exhaustionReadout(shown);
    tiredBadge.textContent = tired.badge;
    tipBadge(tiredBadge, tired.badge && tired.note);
    tiredBadge.classList.toggle('character-sheet__exhaustion--fatal', tired.fatal);
  };
  return { element, write };
}

/**
 * Give a headline badge a tooltip and put it in the Tab order, so a keyboard
 * user reads the same hint that a hover shows. A badge with no hint, such as
 * the empty exhaustion badge at level 0, leaves the Tab order.
 * @param {HTMLElement} badge
 * @param {string} text
 * @returns {HTMLElement}
 */
function tipBadge(badge, text) {
  setTip(badge, text);
  if (text) badge.tabIndex = 0;
  else badge.removeAttribute('tabindex');
  return badge;
}
