import { classNames, el } from './dom.js';
import { icon } from './icons.js';
import { bareButton, textButton } from './buttons.js';

/** @typedef {import('../combat/CombatView.js').CombatView} CombatView */

/**
 * The turn ribbon across the top of the combat screen. It shows one chip per
 * participant in order. The current turn shows a ring and the `aria-current`
 * attribute. The round counter and the turn controls sit beside the chips.
 *
 * The round counter is the screen's heading. It is one persistent element,
 * not rebuilt with the chips, and it takes focus with tabindex -1. Focus
 * lands there when nothing better is left after a rebuild.
 *
 * The chips form one tab stop. The current turn's chip anchors it, and the
 * arrow keys move focus through the rest. The keydown listener attaches once
 * here. It queries the chips on each keypress, because every render replaces
 * them.
 * @param {{
 *   onInspect: (id: string) => void,
 *   onLeave: () => void,
 *   onNext: () => void,
 *   onEnd: () => void,
 * }} callbacks
 * @returns {{
 *   element: HTMLElement,
 *   heading: HTMLElement,
 *   render: (view: CombatView, gm: boolean, settled: boolean) => void,
 *   clear: () => void,
 *   currentChip: () => HTMLElement | null,
 * }}
 */
export function mountCombatRibbon(callbacks) {
  const element = el('div', 'combat-ribbon');
  const heading = el('h2', 'combat-ribbon__round');
  heading.tabIndex = -1;
  const chips = el('div', 'combat-ribbon__chips');
  const controls = el('div', 'combat-ribbon__controls');
  element.append(heading, chips, controls);
  element.hidden = true;
  wireRoving(element, '.combat-ribbon__chip');

  /**
   * @param {CombatView} view
   * @param {boolean} gm
   * @param {boolean} settled true when one side is down, so the End combat control leads
   */
  function render(view, gm, settled) {
    element.hidden = false;
    heading.textContent = `Round ${view.round}`;
    chips.innerHTML = '';
    controls.innerHTML = '';
    view.rows.forEach((row, i) => {
      const current = i === view.turnIndex;
      const name = row.name ?? 'Unknown combatant';
      const button = bareButton(
        [
          row.side === 'foe' ? el('span', 'combat-ribbon__foe-mark', icon('sword')) : null,
          el('span', 'combat-ribbon__initials', initialsOf(row.name)),
          el('span', 'combat-ribbon__init', String(row.initiative)),
        ],
        () => callbacks.onInspect(row.id),
        {
          className: classNames([
            'combat-ribbon__chip',
            `combat-ribbon__chip--${row.side}`,
            current && 'combat-ribbon__chip--current',
            row.defeated && 'combat-ribbon__chip--defeated',
            row.incapacitated && !row.defeated && 'combat-ribbon__chip--incapacitated',
          ]),
          ariaLabel:
            `${name}, initiative ${row.initiative}${current ? ', current turn' : ''}` +
            `${row.defeated ? ', defeated' : ''}` +
            `${row.incapacitated && !row.defeated ? ', cannot act' : ''}`,
          title: name,
        },
      );
      if (current) button.setAttribute('aria-current', 'true');
      button.dataset.combatantId = row.id;
      chips.appendChild(button);
    });
    roveGroup(element, '.combat-ribbon__chip', view.rows[view.turnIndex]?.id ?? null);
    // Ending a turn belongs to whoever is taking it. The GM can advance the
    // fight from any turn. A player sees the control only on the turn of the
    // character their tab is bound to. This reads as finishing their own turn,
    // not as running the fight. Ending the whole combat stays the GM's action.
    const acting = view.rows[view.turnIndex];
    const mayEndTurn = gm || Boolean(acting?.mayAct);
    // Back to map is available to everyone, including a player. Looking
    // something up on the map mid-fight is not a GM privilege. The header's
    // mode switch is hidden in the Player view, so without this control a
    // player tab cannot leave the screen. Leaving changes nothing about the
    // fight, which keeps running. The Play sidebar's Open combat control
    // returns here.
    controls.append(
      textButton('Back to map', callbacks.onLeave, { icon: 'map' }),
      ...(mayEndTurn
        ? [
            textButton(gm ? 'Next turn' : 'End my turn', callbacks.onNext, {
              icon: 'chevron',
              // Once a side is down, ending the fight is the next step and
              // takes the emphasis. Turns still advance for anyone who wants
              // one more round of healing.
              variant: settled ? undefined : 'primary',
            }),
          ]
        : []),
      ...(gm
        ? [
            textButton('End combat', callbacks.onEnd, {
              icon: 'flag',
              variant: settled ? 'primary' : undefined,
            }),
          ]
        : []),
    );
  }

  function clear() {
    element.hidden = true;
    chips.innerHTML = '';
    controls.innerHTML = '';
  }

  return {
    element,
    heading,
    render,
    clear,
    currentChip: () => element.querySelector('.combat-ribbon__chip[aria-current]'),
  };
}

/**
 * Make a set of buttons into one tab stop. The anchor, or the first button
 * when there is no anchor, gets tabindex 0. The rest get tabindex -1. Run
 * this once per render, because each render rebuilds the buttons.
 * `wireRoving` wires the arrow-key movement once at mount.
 * @param {HTMLElement} scope
 * @param {string} selector
 * @param {string | null} anchorId the combatant whose button starts focusable
 */
export function roveGroup(scope, selector, anchorId) {
  const buttons = /** @type {HTMLElement[]} */ ([...scope.querySelectorAll(selector)]);
  const anchor = buttons.findIndex((b) => b.dataset.combatantId === anchorId);
  buttons.forEach((b, i) => {
    b.tabIndex = i === (anchor === -1 ? 0 : anchor) ? 0 : -1;
  });
}

/**
 * The arrow-key half of the roving tab stop. This attaches once to a
 * persistent container. It queries the buttons inside on each keypress,
 * because every render replaces them. Focus wraps at the ends of the list.
 * @param {HTMLElement} scope
 * @param {string} selector
 */
export function wireRoving(scope, selector) {
  scope.addEventListener('keydown', (event) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const step = keys[/** @type {keyof typeof keys} */ (event.key)];
    if (!step) return;
    const buttons = /** @type {HTMLElement[]} */ ([...scope.querySelectorAll(selector)]);
    const from = buttons.indexOf(/** @type {HTMLElement} */ (event.target));
    if (from === -1) return;
    event.preventDefault();
    const to = buttons[(from + step + buttons.length) % buttons.length];
    buttons.forEach((b) => {
      b.tabIndex = b === to ? 0 : -1;
    });
    to.focus();
  });
}

/**
 * A name's initials for the ribbon chip, at most two characters. Returns a
 * question mark when no name resolves for the id.
 * @param {string | null} name
 */
export function initialsOf(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (
    parts
      .slice(0, 2)
      // Spread the string before indexing. Indexing with [0] can split a
      // surrogate pair. This can turn a name that starts with an emoji or a
      // rare CJK character into garbage.
      .map((part) => [...part][0].toUpperCase())
      .join('')
  );
}
