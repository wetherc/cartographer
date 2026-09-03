import { el } from './dom.js';
import { fightOutcome } from '../combat/CombatView.js';
import { focusKey, refocusTarget } from '../combat/FocusRestore.js';
import { combatantCard } from './CombatantCard.js';
import { mountActiveColumn } from './CombatActiveColumn.js';
import { mountCombatLog } from './CombatLog.js';
import { mountCombatRibbon, roveGroup, wireRoving } from './CombatRibbon.js';

/** @typedef {import('../combat/CombatView.js').CombatView} CombatView */
/** @typedef {import('../combat/CombatView.js').CombatantRow} CombatantRow */
/** @typedef {import('../combat/Loadout.js').Loadout} Loadout */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * What the host gives the screen. The screen owns no combat state. `getView`
 * hands it the already-resolved view, or null when no fight is running. The
 * rest are the reads and the actions the columns route to.
 * @typedef {{
 *   getView: () => CombatView | null,
 *   isGM: () => boolean,
 *   onNext: () => void,
 *   onEnd: () => void,
 *   onLeave: () => void,
 *   getInspectedId: () => string | null,
 *   onInspect: (id: string) => void,
 *   getSelectedTargetId: () => string | null,
 *   onSelectTarget: (id: string) => void,
 *   getActions: () => {
 *     weapons: (InventoryItem | EnemyWeapon)[],
 *     spells: Spell[],
 *     offhand?: (InventoryItem | EnemyWeapon)[],
 *   },
 *   getLoadout: (id: string) => Loadout,
 *   getReaction: (id: string) => {
 *     weapons: (InventoryItem | EnemyWeapon)[],
 *     spells: Spell[],
 *   },
 *   onWeaponAttack: (weapon: InventoryItem | EnemyWeapon) => void,
 *   onOffhandAttack: (weapon: InventoryItem | EnemyWeapon) => void,
 *   onOpportunityAttack: (id: string, weapon: InventoryItem | EnemyWeapon) => void,
 *   onReactionCast: (id: string, spell: Spell) => void,
 *   onCastSpell: (spell: Spell) => void,
 *   onApplyHP: (id: string, amount: number, isHeal: boolean) => void,
 *   getConcentration: (id: string) => { spellName: string } | null,
 *   onDropConcentration: (id: string) => void,
 *   onRollDeathSave: (id: string) => void,
 *   onStabilize: (id: string) => void,
 *   getLogEntries: () => import('../types/log.js').LogEntry[],
 * }} CombatScreenCallbacks
 */

/**
 * The combat screen shows a turn ribbon over the active combatant's column
 * and the board. When the view is null, the screen empties, because the mode
 * switch has already hidden it. The host chooses which combatant the left
 * column shows in detail (`getInspectedId`). It defaults to the combatant
 * whose turn it is. Clicking a ribbon chip inspects that combatant without
 * advancing the turn.
 *
 * The board's cards double as the target picker. Clicking one reports
 * through `onSelectTarget`, and the host's `getSelectedTargetId` names which
 * target is held. The selection feeds the action bar under the active
 * combatant: the current turn's weapons and spells, offered only when the
 * viewer can act that turn. Its picks report through `onWeaponAttack` and
 * `onCastSpell`.
 *
 * Every card carries its combatant's loadout (`getLoadout`): what they wear,
 * what they can swing, and, where the viewer can see the detail, their spell
 * counts and remaining slots. The host decides how much of a loadout a viewer
 * can see. The screen draws whatever it receives.
 *
 * Turn flow and HP edits report back through the callbacks. The host routes
 * them to the same actions the sidebar panel uses. When the party side or the
 * foe side is entirely down, the screen stays open. A banner names the
 * outcome, and the End combat control takes emphasis, because closing the
 * fight is the GM's decision.
 *
 * A card that is not the active turn's carries the reaction controls
 * (`getReaction`), for a combatant the viewer can act for whose reaction is
 * still free. An opportunity attack or a reaction spell reports through
 * `onOpportunityAttack` and `onReactionCast`, with the id, because the
 * combatant that reacts is not the one taking the turn.
 *
 * `diceDock` is an empty slot under the active column. The host parks the
 * app's dice-tray card there while the mode is active. The right column
 * shows the fight's log (`getLogEntries`, already filtered by the host). A
 * visually hidden live region announces each turn. The ribbon and the board
 * each form one tab stop. Arrow keys move focus between the chips and
 * between the cards.
 *
 * A rebuild replaces every control. Focus follows: the control with the same
 * name takes it back, else the current turn's chip, else the heading. See
 * `FocusRestore.js`.
 * @param {HTMLElement} container
 * @param {CombatScreenCallbacks} callbacks
 * @returns {{ update: () => void, diceDock: HTMLElement }}
 */
export function mountCombatScreen(container, callbacks) {
  /** Per-render loadout cache. The inspected combatant is also a board card,
   * so without this cache one frame resolves its loadout twice. */
  const loadouts = /** @type {Map<string, Loadout>} */ (new Map());

  /** @param {string} id */
  function loadoutOf(id) {
    let loadout = loadouts.get(id);
    if (!loadout) {
      loadout = callbacks.getLoadout(id);
      loadouts.set(id, loadout);
    }
    return loadout;
  }

  const ribbon = mountCombatRibbon({
    onInspect: (id) => {
      callbacks.onInspect(id);
      render();
    },
    onLeave: callbacks.onLeave,
    onNext: callbacks.onNext,
    onEnd: callbacks.onEnd,
  });
  const column = mountActiveColumn(callbacks, loadoutOf);
  const log = mountCombatLog();
  const board = el('div', 'combat-board');
  const diceDock = el('div', 'combat-screen__dice-dock');
  // The left rail shows the active combatant over the borrowed dice tray. The
  // numbers a turn needs and the dice it rolls sit under one hand.
  const left = el('div', 'combat-screen__left', column.element, diceDock);
  const side = el('aside', 'combat-screen__log', log.element);
  // A turn change is announced, not only shown with a highlight. The polite
  // setting lets a screen reader finish speaking first. This element stays
  // outside the cleared regions.
  const announcer = el('div', 'sr-only');
  announcer.setAttribute('aria-live', 'polite');
  // A defeated side ends the fighting but not the fight. The screen stays open
  // until the GM ends it, so the party can heal, loot, and read the log. This
  // is a status region, not a rebuilt node, so a screen reader speaks it once
  // when it appears, not on every refresh.
  const notice = el('div', 'combat-screen__notice');
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  const root = el(
    'div',
    'combat-screen__layout',
    ribbon.element,
    notice,
    el('div', 'combat-screen__columns', left, board, side),
    announcer,
  );
  container.appendChild(root);
  wireRoving(board, '.combatant-card--selectable');

  /** The last turn spoken, stored as `round:id`. A refresh that moves nothing,
   * for example an HP edit or a condition tick, stays silent. */
  let announcedTurn = /** @type {string | null} */ (null);

  /** Whether the last render drew a fight. The first frame of a fight moves
   * focus onto the screen, because whatever opened it is gone or hidden. */
  let showing = false;

  function render() {
    loadouts.clear();
    // Note what has focus before the rebuild replaces it.
    const focused = document.activeElement;
    const inside = focused instanceof HTMLElement && root.contains(focused) ? focused : null;
    const previousKey = inside ? keyOf(inside) : null;
    board.innerHTML = '';
    const view = callbacks.getView();
    if (!view) {
      ribbon.clear();
      column.clear();
      log.clear();
      notice.hidden = true;
      announcedTurn = null;
      showing = false;
      return;
    }
    const opened = !showing;
    showing = true;
    const gm = callbacks.isGM();
    const outcome = fightOutcome(view);
    setNotice(outcome, gm);
    ribbon.render(view, gm, outcome !== null);
    column.render(view, gm);
    const party = view.rows.filter((row) => row.side === 'party');
    const foes = view.rows.filter((row) => row.side === 'foe');
    const selectedId = callbacks.getSelectedTargetId();
    // The turn's own card offers no reaction controls, so the board needs to
    // know whose turn it is.
    const activeId = view.rows[view.turnIndex]?.id ?? null;
    board.append(
      group('Party', party, selectedId, activeId),
      group('Foes', foes, selectedId, activeId),
    );
    roveGroup(board, '.combatant-card--selectable', selectedId);
    log.update(callbacks.getLogEntries());
    announceTurn(view);
    restoreFocus(inside, previousKey, opened);
  }

  /**
   * The stable name of one control, read off the element. See `focusKey`.
   * @param {HTMLElement} element
   */
  function keyOf(element) {
    return focusKey({
      combatantId: element.dataset.combatantId,
      chip: element.classList.contains('combat-ribbon__chip'),
      label: element.getAttribute('aria-label'),
      text: element.textContent,
    });
  }

  /**
   * Put focus back after a rebuild. Focus that sat on an element still in
   * the document is left alone, whether inside the screen (the dice tray)
   * or outside it. Focus on a replaced control moves to its rebuilt twin,
   * or to the current turn's chip, or to the heading. The first frame of a
   * fight moves focus onto the screen the same way, because the control that
   * opened the fight is gone or hidden by then.
   * @param {HTMLElement | null} inside the screen element that had focus, if any
   * @param {string | null} previousKey its name
   * @param {boolean} opened whether this is the fight's first frame
   */
  function restoreFocus(inside, previousKey, opened) {
    if (inside ? inside.isConnected : !opened) return;
    const candidates = [...root.querySelectorAll('button, input, select')].map((element) => ({
      element: /** @type {HTMLElement} */ (element),
      key: keyOf(/** @type {HTMLElement} */ (element)),
      disabled: /** @type {HTMLButtonElement} */ (element).disabled,
    }));
    const fallbacks = [ribbon.currentChip(), ribbon.heading].map((element) =>
      element ? { element, key: null } : null,
    );
    refocusTarget(previousKey, candidates, fallbacks)?.element.focus();
  }

  /**
   * The banner over the board once one side is down. It states the outcome
   * and, for the GM, reminds them that the fight stays open until they close
   * it.
   * @param {'victory' | 'defeat' | null} outcome
   * @param {boolean} gm
   */
  function setNotice(outcome, gm) {
    notice.classList.toggle('combat-screen__notice--victory', outcome === 'victory');
    notice.classList.toggle('combat-screen__notice--defeat', outcome === 'defeat');
    if (!outcome) {
      notice.textContent = '';
      notice.hidden = true;
      return;
    }
    const result =
      outcome === 'victory'
        ? { line: 'The party is victorious.', gmTail: 'End combat when the party is done here.' }
        : { line: 'The party is defeated.', gmTail: 'End combat when you are ready.' };
    const text = gm ? `${result.line} ${result.gmTail}` : result.line;
    // Show the region before the text lands. A status region hidden at the
    // moment of change is not read aloud.
    notice.hidden = false;
    if (notice.textContent !== text) notice.textContent = text;
  }

  /**
   * Announce the turn only when it changes: state the round and the name.
   * The key stops HP edits and other refreshes from repeating the
   * announcement.
   * @param {CombatView} view
   */
  function announceTurn(view) {
    const row = view.rows[view.turnIndex];
    if (!row) return;
    const key = `${view.round}:${row.id}`;
    if (key === announcedTurn) return;
    announcedTurn = key;
    announcer.textContent = `Round ${view.round}: ${row.name ?? 'Unknown combatant'}'s turn.`;
  }

  /**
   * The reaction controls for one card, or null for a card that gets none. A
   * reaction is taken between the turns of its owner, so the active card gets
   * none: the action bar in the left column is where that turn's controls live.
   * The rest of the test is the viewer's right to act for the combatant, a
   * combatant still able to act, an unspent reaction, and something to do with
   * it.
   * @param {CombatantRow} row
   * @param {string | null} activeId
   * @returns {import('./CombatantCard.js').ReactionControl | null}
   */
  function reactionFor(row, activeId) {
    if (row.id === activeId || !row.mayAct) return null;
    if (row.defeated || row.incapacitated || row.used.reaction) return null;
    const { weapons, spells } = callbacks.getReaction(row.id);
    if (weapons.length === 0 && spells.length === 0) return null;
    return {
      weapons,
      spells,
      onAttack: (weapon) => callbacks.onOpportunityAttack(row.id, weapon),
      onCast: (spell) => callbacks.onReactionCast(row.id, spell),
    };
  }

  /**
   * @param {string} label
   * @param {CombatantRow[]} rows
   * @param {string | null} selectedId
   * @param {string | null} activeId
   */
  function group(label, rows, selectedId, activeId) {
    return el(
      'section',
      'combat-board__group',
      el('h3', 'combat-board__heading', label),
      rows.length === 0
        ? el('p', 'combat-board__empty u-muted', 'Nobody on this side.')
        : el(
            'div',
            'combat-board__cards',
            ...rows.map((row) =>
              combatantCard(row, {
                selected: row.id === selectedId,
                loadout: loadoutOf(row.id),
                reaction: reactionFor(row, activeId),
                onSelect: (id) => {
                  callbacks.onSelectTarget(id);
                  render();
                },
              }),
            ),
          ),
    );
  }

  render();
  return { update: render, diceDock };
}
