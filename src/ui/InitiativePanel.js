import { currentParticipant } from '../combat/Initiative.js';
import { formatDamage } from '../entities/Equipment.js';
import { isGM } from '../view/ViewRole.js';
import { textButton } from './buttons.js';

/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/combat.js').ParticipantView} ParticipantView */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

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

  function render() {
    root.innerHTML = '';
    const state = callbacks.getState();
    if (!state) return;
    const gm = !callbacks.getRole || isGM(callbacks.getRole());

    const header = document.createElement('div');
    header.className = 'initiative-panel__header';
    header.textContent = `Round ${state.round}`;
    root.appendChild(header);

    const active = currentParticipant(state);
    state.order.forEach((participant, i) => {
      // An id nothing resolves any more still gets its row, so the order and
      // the turn pointer keep lining up; it just has nothing to act with.
      const view = callbacks.describe?.(participant) ?? null;
      const row = document.createElement('div');
      row.className = `initiative-panel__row initiative-panel__row--${view?.side ?? 'party'}`;
      if (active && i === state.index) row.classList.add('initiative-panel__row--active');

      const name = document.createElement('span');
      name.className = 'initiative-panel__name';
      name.textContent = view?.name ?? 'Unknown combatant';

      const init = document.createElement('span');
      init.className = 'initiative-panel__init-readout';
      init.textContent = String(participant.initiative);

      row.append(name, init);
      root.appendChild(row);

      // On the active combatant's turn, their weapons line up under the row
      // as one-click attack buttons, and a caster's known cantrips and
      // prepared/known spells follow as Cast buttons — the same strip shape,
      // differing only in icon, class, and labeling. `canAttack` decides who
      // sees them — the GM for anyone (including foes), a player only for
      // their bound character.
      const mayAttack = callbacks.canAttack ? callbacks.canAttack(participant) : gm;
      if (active && i === state.index && mayAttack) {
        if (callbacks.onWeaponAttack) {
          actionStrip(callbacks.getWeapons?.(participant) ?? [], {
            icon: 'sword',
            className: 'initiative-panel__attack',
            ariaLabel: (weapon) => `Attack with ${weapon.name}`,
            title: (weapon) =>
              `Roll an attack with ${weapon.name} (${formatDamage(weapon.damage ?? [])})`,
            onPick: (weapon) => callbacks.onWeaponAttack?.(participant, weapon),
          });
        }
        if (callbacks.onCastSpell) {
          actionStrip(callbacks.getSpells?.(participant) ?? [], {
            icon: 'sparkles',
            className: 'initiative-panel__cast',
            ariaLabel: (spell) => `Cast ${spell.name}`,
            title: (spell) =>
              `Cast ${spell.name} (${spell.level === 0 ? 'cantrip' : `level ${spell.level}`})`,
            onPick: (spell) => callbacks.onCastSpell?.(participant, spell),
          });
        }
      }
    });

    /**
     * One strip of named action buttons under the active row; weapons and
     * spells share it. Appends nothing when there are no items.
     * @template T
     * @param {(T & { name: string })[]} items
     * @param {{ icon: import('./icons.js').IconName, className: string, ariaLabel: (item: T) => string,
     *   title: (item: T) => string, onPick: (item: T) => void }} strip
     */
    function actionStrip(items, strip) {
      if (items.length === 0) return;
      const wrap = document.createElement('div');
      wrap.className = 'initiative-panel__attacks';
      for (const item of items) {
        wrap.appendChild(
          textButton(item.name, () => strip.onPick(item), {
            icon: strip.icon,
            className: strip.className,
            ariaLabel: strip.ariaLabel(item),
            title: strip.title(item),
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
