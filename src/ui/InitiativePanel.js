import { currentParticipant } from '../combat/Initiative.js';
import { formatDamage } from '../entities/Equipment.js';
import { isGM } from '../view/ViewRole.js';
import { textButton } from './buttons.js';
import { sameDeps } from '../view/SheetStructure.js';

/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/combat.js').ParticipantView} ParticipantView */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/** @typedef {{ weapons: (InventoryItem | EnemyWeapon)[], spells: import('../types/spell.js').Spell[] }} ActionStripItems */

/**
 * What the initiative panel's DOM *shape* is built from, as a flat list of
 * values to compare with {@link sameDeps}. Two renders agreeing on this list
 * differ only in values the panel's writers push into elements it already has
 * (the round number, each combatant's name and side, each initiative), so it
 * keeps its DOM instead of discarding roughly a hundred elements — every row,
 * every action button, the turn controls — to move one name.
 *
 * The action strip's contents are named item by item rather than by the acting
 * combatant's entity, because that entity changes on every unrelated edit to it
 * (a damage roll, a condition, a spent slot, an XP award) while the strip shows
 * only weapons and spells. Comparing the items by reference is sound because
 * the entity layer never mutates in place: equipping a different weapon or
 * learning a spell hands back new objects. Both variable-length spreads carry
 * their length in the fixed head, so two different shapes cannot flatten into
 * equal lists.
 *
 * The flip side is the one the character sheet's `sheetDeps` carries too: this
 * list has to name every value the structural builders read. A condition chip
 * or an HP readout added to a row means adding it here as well, or the row will
 * not rebuild when that value changes.
 * @param {CombatState} state
 * @param {boolean} gm
 * @param {boolean[]} mayAct
 * @param {ActionStripItems} strip
 * @returns {unknown[]}
 */
export function initiativeDeps(state, gm, mayAct, strip) {
  return [
    gm,
    state.index,
    state.order.length,
    strip.weapons.length,
    strip.spells.length,
    ...state.order.map((participant) => participant.id),
    ...mayAct,
    ...strip.weapons,
    ...strip.spells,
  ];
}

/**
 * Mount the initiative tracker for a running fight: the turn order with a
 * round counter and current-turn highlight, plus Next turn / End combat for
 * the GM. There is no setup state here — the GM opens combat through the
 * setup dialog (`ui/CombatSetup.js`), and the panel's container stays hidden
 * until a fight is actually running. The panel owns no combat state — it
 * reads it via `getState` and reports actions back, and a participant's name
 * and side come from `describe` rather than the order, so both track the live
 * entity.
 * @param {HTMLElement} container
 * @param {{
 *   getState: () => CombatState | null,
 *   onNext: () => void,
 *   onEnd: () => void,
 *   describe?: (participant: Participant) => ParticipantView | null,
 *   getWeapons?: (participant: Participant) => (InventoryItem | EnemyWeapon)[],
 *   onWeaponAttack?: (participant: Participant, weapon: InventoryItem | EnemyWeapon) => void,
 *   getSpells?: (participant: Participant) => import('../types/spell.js').Spell[],
 *   onCastSpell?: (participant: Participant, spell: import('../types/spell.js').Spell) => void,
 *   canAttack?: (participant: Participant) => boolean,
 *   getRole?: () => ViewRole,
 * }} callbacks
 * On any
 * combatant's turn, `getWeapons` lists their weapons under the row as attack
 * buttons — a party member's equipped weapons, a foe's assigned weapon — and
 * one click rolls the attack via `onWeaponAttack`. `canAttack` gates who may
 * press them: the GM anywhere, a player only on their bound character.
 * Advancing and ending combat are GM actions; a player viewer sees the order
 * read-only.
 * @returns {{ update: () => void }}
 */
export function mountInitiativePanel(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'initiative-panel';
  container.appendChild(root);

  /** @typedef {{ state: CombatState, views: (ParticipantView | null)[] }} Frame */

  /** The dep list the DOM on screen was built from, or null while nothing is built. */
  let builtDeps = /** @type {unknown[] | null} */ (null);
  /** One per value the built DOM shows, each pushing it into an element it captured. */
  let writers = /** @type {((frame: Frame) => void)[]} */ ([]);

  /**
   * The weapons and spells the active row's action strip holds, resolved once
   * per render. This is the only place that decides whether the buttons are
   * offered at all: nothing to act on outside a real turn, nothing for a
   * combatant this viewer may not act for (`canAttack` says the GM may act for
   * anyone including foes, a player only for their bound character), and
   * nothing for a callback the host left unwired. `build` places whatever comes
   * back and draws nothing when it is empty, so the DOM cannot disagree with
   * the dep list built from these same arrays.
   * @param {CombatState} state
   * @param {boolean[]} mayAct
   * @returns {ActionStripItems}
   */
  function activeStrip(state, mayAct) {
    const active = currentParticipant(state);
    if (!active || !mayAct[state.index]) return { weapons: [], spells: [] };
    return {
      weapons: callbacks.onWeaponAttack ? (callbacks.getWeapons?.(active) ?? []) : [],
      spells: callbacks.onCastSpell ? (callbacks.getSpells?.(active) ?? []) : [],
    };
  }

  function render() {
    const state = callbacks.getState();
    if (!state) {
      root.innerHTML = '';
      builtDeps = null;
      writers = [];
      return;
    }
    const gm = !callbacks.getRole || isGM(callbacks.getRole());
    const views = state.order.map((participant) => callbacks.describe?.(participant) ?? null);
    // Who may press the action buttons turns on the viewer's role and, for a
    // player, which character this tab is bound to, so it is a dep of its own.
    const mayAct = state.order.map((participant) =>
      callbacks.canAttack ? callbacks.canAttack(participant) : gm,
    );
    const strip = activeStrip(state, mayAct);
    const deps = initiativeDeps(state, gm, mayAct, strip);
    if (!sameDeps(builtDeps, deps)) {
      build(state, gm, strip);
      builtDeps = deps;
    }
    for (const write of writers) write({ state, views });
  }

  /**
   * Create the panel's DOM from scratch and collect the writers that keep it
   * current. Reads nothing off a participant that a writer can push in later.
   * @param {CombatState} state
   * @param {boolean} gm
   * @param {ActionStripItems} strip
   */
  function build(state, gm, strip) {
    root.innerHTML = '';
    writers = [];

    const header = document.createElement('div');
    header.className = 'initiative-panel__header';
    root.appendChild(header);
    writers.push((frame) => {
      header.textContent = `Round ${frame.state.round}`;
    });

    const active = currentParticipant(state);
    state.order.forEach((participant, i) => {
      const row = document.createElement('div');
      root.appendChild(row);

      const name = document.createElement('span');
      name.className = 'initiative-panel__name';

      const init = document.createElement('span');
      init.className = 'initiative-panel__init-readout';

      row.append(name, init);
      // An id nothing resolves any more still gets its row, so the order and
      // the turn pointer keep lining up; it just has nothing to act with.
      writers.push((frame) => {
        const view = frame.views[i];
        const turn = active && i === frame.state.index ? ' initiative-panel__row--active' : '';
        row.className = `initiative-panel__row initiative-panel__row--${view?.side ?? 'party'}${turn}`;
        name.textContent = view?.name ?? 'Unknown combatant';
        init.textContent = String(frame.state.order[i]?.initiative ?? '');
      });

      // The active combatant's weapons line up under their row as one-click
      // attack buttons, and a caster's cantrips and prepared/known spells
      // follow as Cast buttons — the same strip shape, differing only in icon,
      // class, and labeling. Both come from `activeStrip`, which is empty
      // whenever they should not be offered, so this only has to place them
      // under the right row; the strips themselves append nothing when empty.
      if (i === state.index) {
        actionStrip(strip.weapons, {
          icon: 'sword',
          className: 'initiative-panel__attack',
          ariaLabel: (weapon) => `Attack with ${weapon.name}`,
          title: (weapon) =>
            `Roll an attack with ${weapon.name} (${formatDamage(weapon.damage ?? [])})`,
          onPick: (weapon) => callbacks.onWeaponAttack?.(participant, weapon),
        });
        actionStrip(strip.spells, {
          icon: 'sparkles',
          className: 'initiative-panel__cast',
          ariaLabel: (spell) => `Cast ${spell.name}`,
          title: (spell) =>
            `Cast ${spell.name} (${spell.level === 0 ? 'cantrip' : `level ${spell.level}`})`,
          onPick: (spell) => callbacks.onCastSpell?.(participant, spell),
        });
      }
    });

    /**
     * One strip of named action buttons under the active row; weapons and
     * spells share it. Appends nothing when there are no items.
     * @template T
     * @param {(T & { name: string })[]} items
     * @param {{ icon: import('./icons.js').IconName, className: string, ariaLabel: (item: T) => string,
     *   title: (item: T) => string, onPick: (item: T) => void }} spec
     */
    function actionStrip(items, spec) {
      if (items.length === 0) return;
      const wrap = document.createElement('div');
      wrap.className = 'initiative-panel__attacks';
      for (const item of items) {
        wrap.appendChild(
          textButton(item.name, () => spec.onPick(item), {
            icon: spec.icon,
            className: spec.className,
            ariaLabel: spec.ariaLabel(item),
            title: spec.title(item),
          }),
        );
      }
      root.appendChild(wrap);
    }

    // Turn flow is the GM's to drive; a player tab just watches the order.
    if (!gm) return;

    const actions = document.createElement('div');
    actions.className = 'initiative-panel__actions';

    const next = textButton(
      'Next turn',
      () => {
        callbacks.onNext();
        render();
      },
      { icon: 'chevron', variant: 'primary' },
    );

    const end = textButton(
      'End combat',
      () => {
        callbacks.onEnd();
        render();
      },
      { icon: 'flag' },
    );

    actions.append(next, end);
    root.appendChild(actions);
  }

  render();
  return { update: render };
}
