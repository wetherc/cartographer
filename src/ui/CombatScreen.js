import { classNames, el } from './dom.js';
import { icon } from './icons.js';
import { bareButton, chip, sectionLabel, textButton } from './buttons.js';
import { hpBand } from '../view/ViewRole.js';
import { fightOutcome } from '../combat/CombatView.js';
import { combatantCard } from './CombatantCard.js';
import { combatActionBar } from './CombatActionBar.js';
import { loadoutBlock } from './LoadoutBlock.js';
import { entryItem } from './TravelogPanel.js';

/** @typedef {import('../combat/CombatView.js').CombatView} CombatView */
/** @typedef {import('../combat/CombatView.js').CombatantRow} CombatantRow */
/** @typedef {import('../combat/Loadout.js').Loadout} Loadout */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The combat screen shows a turn ribbon over the active combatant's column
 * and the board. The screen owns no combat state. `getView` hands it the
 * already-resolved view, or null when no fight is running. When the view is
 * null, the screen empties, because the mode switch has already hidden it.
 * The host chooses which combatant the left column shows in detail
 * (`getInspectedId`). It defaults to the combatant whose turn it is. Clicking
 * a ribbon chip inspects that combatant without advancing the turn.
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
 * counts and remaining slots. HP and AC alone told a player nothing about
 * what their turn can do. The host decides how much of a loadout a viewer
 * can see. The screen draws whatever it receives.
 *
 * Turn flow and HP edits report back through the callbacks. The host routes
 * them to the same actions the sidebar panel uses. When the party side or the
 * foe side is entirely down, the screen stays open. A banner names the
 * outcome, and the End combat control takes emphasis, because closing the
 * fight is the GM's decision.
 *
 * `diceDock` is an empty slot under the active column. The host parks the
 * app's dice-tray card there while the mode is active. The right column
 * shows the fight's log (`getLogEntries`, already filtered by the host), with
 * the width its lines need. A visually hidden live region announces each
 * turn. The ribbon and the board each form one tab stop. Arrow keys move
 * focus between the chips and between the cards.
 * @param {HTMLElement} container
 * @param {{
 *   getView: () => CombatView | null,
 *   isGM: () => boolean,
 *   onNext: () => void,
 *   onEnd: () => void,
 *   onLeave: () => void,
 *   getInspectedId: () => string | null,
 *   onInspect: (id: string) => void,
 *   getSelectedTargetId: () => string | null,
 *   onSelectTarget: (id: string) => void,
 *   getActions: () => { weapons: (InventoryItem | EnemyWeapon)[], spells: Spell[] },
 *   getLoadout: (id: string) => Loadout,
 *   onWeaponAttack: (weapon: InventoryItem | EnemyWeapon) => void,
 *   onCastSpell: (spell: Spell) => void,
 *   onApplyHP: (id: string, amount: number, isHeal: boolean) => void,
 *   getConcentration: (id: string) => { spellName: string } | null,
 *   onDropConcentration: (id: string) => void,
 *   getLogEntries: () => import('../types/log.js').LogEntry[],
 * }} callbacks
 * @returns {{ update: () => void, diceDock: HTMLElement }}
 */
export function mountCombatScreen(container, callbacks) {
  const active = el('aside', 'combat-screen__active');
  const board = el('div', 'combat-board');
  const ribbon = el('div', 'combat-ribbon');
  const logList = el('ul', 'combat-log__list travelog__list u-col u-g1');
  const logEmpty = el('p', 'u-muted', 'Nothing logged yet.');
  const diceDock = el('div', 'combat-screen__dice-dock');
  // The left rail shows the active combatant over the borrowed dice tray. The
  // numbers a turn needs and the dice it rolls sit under one hand.
  const left = el('div', 'combat-screen__left', active, diceDock);
  const side = el(
    'aside',
    'combat-screen__log',
    el('section', 'combat-log', el('h3', 'combat-board__heading', 'Combat log'), logEmpty, logList),
  );
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
    ribbon,
    notice,
    el('div', 'combat-screen__columns', left, board, side),
    announcer,
  );
  container.appendChild(root);

  // The damage or heal amount survives re-renders. Every HP edit triggers a
  // re-render. This lets the GM apply the same number to several combatants
  // without retyping it.
  let hpAmount = 1;

  /** The last turn spoken, stored as `round:id`. A refresh that moves nothing,
   * for example an HP edit or a condition tick, stays silent. */
  let announcedTurn = /** @type {string | null} */ (null);

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

  function render() {
    loadouts.clear();
    // A rebuild replaces whatever held focus. Note where the keyboard focus
    // was, on a ribbon chip or a board card, and restore it to the matching
    // element.
    const focused = /** @type {HTMLElement | null} */ (document.activeElement);
    const refocus =
      focused && root.contains(focused) && focused.dataset.combatantId
        ? {
            chip: focused.classList.contains('combat-ribbon__chip'),
            id: focused.dataset.combatantId,
          }
        : null;
    active.innerHTML = '';
    board.innerHTML = '';
    ribbon.innerHTML = '';
    const view = callbacks.getView();
    if (!view) {
      logList.innerHTML = '';
      notice.hidden = true;
      announcedTurn = null;
      return;
    }
    const gm = callbacks.isGM();
    const outcome = fightOutcome(view);
    setNotice(outcome, gm);
    renderRibbon(view, gm, outcome !== null);
    renderActive(view, gm);
    const party = view.rows.filter((row) => row.side === 'party');
    const foes = view.rows.filter((row) => row.side === 'foe');
    const selectedId = callbacks.getSelectedTargetId();
    board.append(group('Party', party, selectedId), group('Foes', foes, selectedId));
    roveGroup(board, '.combatant-card--selectable', selectedId);
    renderLog();
    announceTurn(view);
    if (refocus) {
      const scope = refocus.chip ? ribbon : board;
      /** @type {HTMLElement | null} */
      const again = scope.querySelector(`[data-combatant-id="${CSS.escape(refocus.id)}"]`);
      again?.focus();
    }
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

  /** The fight's log entries, newest on top, rebuilt whole. A fight logs only
   * tens of lines, so nothing is worth a diff. */
  function renderLog() {
    logList.innerHTML = '';
    const entries = callbacks.getLogEntries();
    for (const entry of entries) logList.prepend(entryItem(entry));
    logEmpty.hidden = entries.length > 0;
    logList.hidden = entries.length === 0;
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
   * Make a set of buttons into one tab stop. The anchor, or the first button
   * when there is no anchor, gets tabindex 0. The rest get tabindex -1. Run
   * this once per render, because each render rebuilds the buttons.
   * `wireRoving` wires the arrow-key movement once at mount.
   * @param {HTMLElement} scope
   * @param {string} selector
   * @param {string | null} anchorId the combatant whose button starts focusable
   */
  function roveGroup(scope, selector, anchorId) {
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
  function wireRoving(scope, selector) {
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
  wireRoving(ribbon, '.combat-ribbon__chip');
  wireRoving(board, '.combatant-card--selectable');

  /**
   * The turn ribbon across the top of the screen. It shows one chip per
   * participant in order. The current turn shows a ring and the
   * `aria-current` attribute. The round counter and the GM's turn controls
   * sit beside it.
   * @param {CombatView} view
   * @param {boolean} gm
   * @param {boolean} settled true when one side is down, so the End combat control leads
   */
  function renderRibbon(view, gm, settled) {
    ribbon.appendChild(el('span', 'combat-ribbon__round', `Round ${view.round}`));
    const chips = el('div', 'combat-ribbon__chips');
    ribbon.appendChild(chips);
    view.rows.forEach((row, i) => {
      const current = i === view.turnIndex;
      const name = row.name ?? 'Unknown combatant';
      const button = bareButton(
        [
          row.side === 'foe' ? el('span', 'combat-ribbon__foe-mark', icon('sword')) : null,
          el('span', 'combat-ribbon__initials', initialsOf(row.name)),
          el('span', 'combat-ribbon__init', String(row.initiative)),
        ],
        () => {
          callbacks.onInspect(row.id);
          render();
        },
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
    // One tab stop. The current turn's chip anchors it. Arrow keys move focus
    // through the rest.
    roveGroup(ribbon, '.combat-ribbon__chip', view.rows[view.turnIndex]?.id ?? null);
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
    ribbon.appendChild(
      el(
        'div',
        'combat-ribbon__controls',
        textButton('Back to map', callbacks.onLeave, { icon: 'map' }),
        mayEndTurn
          ? textButton(gm ? 'Next turn' : 'End my turn', callbacks.onNext, {
              icon: 'chevron',
              // Once a side is down, ending the fight is the next step and
              // takes the emphasis. Turns still advance for anyone who wants
              // one more round of healing.
              variant: settled ? undefined : 'primary',
            })
          : null,
        gm
          ? textButton('End combat', callbacks.onEnd, {
              icon: 'flag',
              variant: settled ? 'primary' : undefined,
            })
          : null,
      ),
    );
  }

  /**
   * The left column shows the inspected combatant, or the combatant whose
   * turn it is. The GM can edit HP. HP shows exact for a viewer who can act
   * for this combatant, and banded otherwise. Concentration shows with its
   * Drop control for a viewer who can act.
   * @param {CombatView} view
   * @param {boolean} gm
   */
  function renderActive(view, gm) {
    const inspectedId = callbacks.getInspectedId();
    const row =
      view.rows.find((r) => r.id === inspectedId) ?? view.rows[view.turnIndex] ?? view.rows[0];
    if (!row) return;
    const current = view.rows[view.turnIndex]?.id === row.id;

    active.appendChild(
      el(
        'header',
        'combat-screen__active-header',
        el('h2', 'combat-screen__active-name', row.name ?? 'Unknown combatant'),
        el('span', 'u-muted', current ? 'Current turn' : 'Inspecting'),
      ),
    );

    const facts = el('div', 'combat-screen__facts');
    facts.appendChild(fact('Initiative', String(row.initiative)));
    if (row.ac !== null) facts.appendChild(fact('AC', String(row.ac)));
    if (row.hp) {
      // HP shows exact where the viewer can act for this combatant. The GM
      // sees exact HP anywhere. A player sees exact HP for their own
      // character, matching their sheet.
      facts.appendChild(
        fact(
          'HP',
          row.mayAct ? `${row.hp.current}/${row.hp.max}` : hpBand(row.hp.current, row.hp.max),
        ),
      );
    }
    active.appendChild(facts);

    if (gm && row.hp) active.appendChild(hpControls(row));

    if (row.conditions.length > 0) {
      active.appendChild(
        el(
          'div',
          'combat-screen__active-conditions u-row u-wrap u-g1',
          ...row.conditions.map((c) =>
            chip(c.rounds !== null && c.rounds !== undefined ? `${c.name} (${c.rounds})` : c.name),
          ),
        ),
      );
    }

    const held = callbacks.getConcentration(row.id);
    if (held) {
      const line = el(
        'div',
        'combat-screen__concentration u-row u-wrap u-g1',
        el('span', 'u-muted', `Concentrating on ${held.spellName}`),
      );
      if (row.mayAct) {
        line.appendChild(
          textButton('Drop', () => callbacks.onDropConcentration(row.id), {
            variant: 'danger',
            ariaLabel: `Drop concentration on ${held.spellName}`,
          }),
        );
      }
      active.appendChild(line);
    }

    // The action bar belongs to the turn, not the inspection. It shows only
    // when the column displays the current combatant and the viewer can act
    // for them. Inspecting a foe never offers its weapons to a player.
    const bar =
      current && row.mayAct
        ? combatActionBar(callbacks.getActions(), {
            onWeaponAttack: callbacks.onWeaponAttack,
            onCastSpell: callbacks.onCastSpell,
          })
        : null;

    // This shows the loadout in full, minus whatever the bar already offers
    // as buttons. Without this, the weapons list twice in one column. The
    // bar's buttons already name their damage.
    const loadout = loadoutOf(row.id);
    const block = loadoutBlock(bar ? { ...loadout, weapons: [] } : loadout, { detailed: true });
    if (block) active.appendChild(block);

    if (bar) {
      const selected = view.rows.find((r) => r.id === callbacks.getSelectedTargetId());
      if (selected && selected.id !== row.id) {
        active.appendChild(
          el(
            'div',
            'combat-screen__targeting',
            `Targeting ${selected.name ?? 'Unknown combatant'}`,
          ),
        );
      }
      active.appendChild(bar);
    }
  }

  /**
   * @param {string} label
   * @param {string} value
   */
  function fact(label, value) {
    return el(
      'div',
      'combat-screen__fact',
      sectionLabel(label),
      el('span', 'combat-screen__fact-value', value),
    );
  }

  /**
   * The GM's HP edit control: an amount field with a Damage button and a Heal
   * button. This matches the pattern the Encounters panel uses.
   * @param {CombatantRow} row
   */
  function hpControls(row) {
    const amount = /** @type {HTMLInputElement} */ (el('input', 'field combat-screen__hp-amount'));
    amount.type = 'number';
    amount.min = '1';
    amount.value = String(hpAmount);
    amount.setAttribute('aria-label', 'Damage or heal amount');
    const name = row.name ?? 'Unknown combatant';
    const damage = textButton('Damage', () => callbacks.onApplyHP(row.id, hpAmount, false), {
      icon: 'minus',
      variant: 'danger',
      ariaLabel: `Damage ${name}`,
    });
    const heal = textButton('Heal', () => callbacks.onApplyHP(row.id, hpAmount, true), {
      icon: 'heal',
      variant: 'success',
      ariaLabel: `Heal ${name}`,
    });
    // The buttons apply the tracked amount, not the field text. When the
    // field holds an unusable value, for example empty, zero, or negative,
    // the buttons disable. This stops the buttons from applying an old valid
    // number.
    amount.addEventListener('input', () => {
      const parsed = Number.parseInt(amount.value, 10);
      const valid = Number.isFinite(parsed) && parsed > 0;
      if (valid) hpAmount = parsed;
      damage.disabled = !valid;
      heal.disabled = !valid;
    });
    // The amount sits on its own line above both buttons, with a caption, so
    // it is clear that it feeds either button.
    return el(
      'div',
      'combat-screen__hp-controls u-g2',
      sectionLabel('Amount', { className: 'combat-screen__hp-label' }),
      amount,
      damage,
      heal,
    );
  }

  /**
   * @param {string} label
   * @param {CombatantRow[]} rows
   * @param {string | null} selectedId
   */
  function group(label, rows, selectedId) {
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
