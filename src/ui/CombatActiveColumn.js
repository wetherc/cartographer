import { el } from './dom.js';
import { bareButton, sectionLabel, textButton } from './buttons.js';
import { conditionChip, mountConditionsBar } from './ConditionsBar.js';
import { hpBand } from '../view/ViewRole.js';
import { combatActionBar } from './CombatActionBar.js';
import { deathSaveBlock } from './DeathSaveBlock.js';
import { factLine } from './FactLine.js';
import { loadoutBlock } from './LoadoutBlock.js';
import { numberField, select } from './formFields.js';
import { buildHpAmountField, takeHpAmount } from './HpAmountField.js';
import { hpTargetId } from '../view/CombatHpTarget.js';
import { viewTurnKey } from '../view/CombatSelection.js';

/** @typedef {import('../combat/CombatView.js').CombatView} CombatView */
/** @typedef {import('../combat/CombatView.js').CombatantRow} CombatantRow */
/** @typedef {import('../combat/Loadout.js').Loadout} Loadout */
/** @typedef {import('./CombatScreen.js').CombatScreenCallbacks} CombatScreenCallbacks */

/**
 * The left column of the combat screen. It shows the inspected combatant, or
 * the combatant whose turn it is. The GM can edit HP. HP shows exact for a
 * viewer who can act for this combatant, and banded otherwise. Concentration
 * shows with its Drop control, and a death-save tracker with its Roll and
 * Stabilize controls, for a viewer who can act. The action bar shows under
 * the loadout on the current turn, for a viewer who can act.
 * @param {CombatScreenCallbacks} callbacks
 * @param {(id: string) => Loadout} loadoutOf the screen's per-render loadout cache
 * @param {() => void} followTurn drops the inspection, so the column shows
 *   whoever's turn it is again
 * @returns {{
 *   element: HTMLElement,
 *   render: (view: CombatView, gm: boolean) => void,
 *   clear: () => void,
 * }}
 */
export function mountActiveColumn(callbacks, loadoutOf, followTurn) {
  const element = el('aside', 'combat-screen__active');

  // The damage or heal amount. A Damage or Heal press sets it back to 1, so a
  // second click does not repeat a big hit by mistake. A new turn also sets
  // it back.
  let hpAmount = 1;

  // The combatant the GM picked in the HP box. A new card selection or a new
  // inspection drops the pick, so the box follows the board again.
  let hpPick = /** @type {string | null} */ (null);
  let hpContext = '';

  /**
   * @param {CombatView} view
   * @param {boolean} gm
   */
  function render(view, gm) {
    element.innerHTML = '';
    const inspectedId = callbacks.getInspectedId();
    const row =
      view.rows.find((r) => r.id === inspectedId) ?? view.rows[view.turnIndex] ?? view.rows[0];
    if (!row) return;
    const current = view.rows[view.turnIndex]?.id === row.id;

    element.appendChild(
      el(
        'header',
        'combat-screen__active-header',
        el('h2', 'combat-screen__active-name', row.name ?? 'Unknown combatant'),
        el('span', 'u-muted', current ? 'Current turn' : 'Inspecting'),
        current
          ? null
          : bareButton(['Back to current turn'], followTurn, {
              className: 'combat-screen__follow-turn',
            }),
      ),
    );

    if (gm && current && callbacks.onDelay) element.appendChild(delayControl(view));

    const facts = el('div', 'combat-screen__facts');
    facts.appendChild(
      gm && callbacks.onSetInitiative
        ? initiativeField(row, callbacks.onSetInitiative)
        : factLine('Initiative', String(row.initiative)),
    );
    if (row.ac !== null) facts.appendChild(factLine('AC', String(row.ac)));
    if (row.hp) {
      // The GM sees exact HP anywhere. A player sees exact HP for every
      // party character, matching the roster, and a band for creatures.
      facts.appendChild(
        factLine(
          'HP',
          row.exactHP ? `${row.hp.current}/${row.hp.max}` : hpBand(row.hp.current, row.hp.max),
        ),
      );
    }
    element.appendChild(facts);

    const selectedId = callbacks.getSelectedTargetId();
    const turn = viewTurnKey(view);
    const context = `${turn}|${selectedId}|${inspectedId}`;
    if (context !== hpContext) {
      // A new turn also resets the amount, so a 7 typed for one hit does
      // not deal 7 again on the next combatant's turn.
      if (!hpContext.startsWith(`${turn}|`)) hpAmount = 1;
      hpPick = null;
      hpContext = context;
    }
    const hpTarget = hpTargetId(view, { picked: hpPick, selectedId, inspectedId });
    if (gm && view.rows.some((r) => r.hp)) element.appendChild(hpControls(view, hpTarget, gm));

    // The GM adds and removes chips here, so a foe knocked prone does not
    // need a trip back to the map. Everyone else sees the chips only.
    const onSetConditions = callbacks.onSetConditions;
    if (gm && onSetConditions) {
      const holder = el('div', 'combat-screen__active-conditions');
      mountConditionsBar(holder, {
        getConditions: () => row.conditions,
        onChange: (next) => onSetConditions(row.id, next),
      });
      element.appendChild(holder);
    } else if (row.conditions.length > 0) {
      element.appendChild(
        el(
          'div',
          'combat-screen__active-conditions u-row u-wrap u-g1',
          ...row.conditions.map((c) => conditionChip(c)),
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
      element.appendChild(line);
    }

    // A dying character shows its tracker under concentration. Roll shows on
    // its own turn for a viewer who can act for it, until the roll of that
    // turn, and Stabilize shows to the GM on any turn. The sheet shows the same block, from the same builder.
    const dying = deathSaveBlock(row.deathSaves, {
      name: row.name ?? 'Unknown combatant',
      canRoll: current && row.mayAct && !row.used.deathSave,
      canStabilize: gm,
      onRoll: () => callbacks.onRollDeathSave(row.id),
      onStabilize: () => callbacks.onStabilize(row.id),
    });
    if (dying) element.appendChild(dying);

    // The action bar belongs to the turn, not the inspection. It shows only
    // when the column displays the current combatant and the viewer can act
    // for them, and never for a downed combatant, which has no actions.
    // Inspecting a foe never offers its weapons to a player.
    const bar =
      current && row.mayAct && !row.defeated
        ? combatActionBar(
            callbacks.getActions(),
            {
              onWeaponAttack: callbacks.onWeaponAttack,
              onCastSpell: callbacks.onCastSpell,
              onOffhandAttack: callbacks.onOffhandAttack,
              onTurnAction: callbacks.onTurnAction,
              onToggleBudget: callbacks.onToggleBudget,
            },
            // The pips belong to the turn the bar acts on, so they come from
            // the same row.
            { used: row.used, attacksLeft: row.attacksLeft },
          )
        : null;

    // This shows the loadout in full, minus whatever the bar already offers
    // as buttons. Without this, the weapons list twice in one column. The
    // bar's buttons already name their damage.
    const loadout = loadoutOf(row.id);
    const block = loadoutBlock(bar ? { ...loadout, weapons: [] } : loadout, { detailed: true });
    if (block) element.appendChild(block);

    if (bar) {
      const selected = view.rows.find((r) => r.id === callbacks.getSelectedTargetId());
      if (selected && selected.id !== row.id) {
        element.appendChild(
          el(
            'div',
            'combat-screen__targeting',
            `Targeting ${selected.name ?? 'Unknown combatant'}`,
          ),
        );
      }
      element.appendChild(bar);
    }
  }

  /**
   * The GM's HP edit control: a target select, an amount field, and a Damage
   * button and a Heal button that name the target. This matches the pattern
   * the Encounters panel uses. The select defaults to the inspected
   * combatant, then to the selected card (see `hpTargetId`). With neither,
   * the select reads "Choose a target" and both buttons stay disabled until
   * the GM picks one.
   * @param {CombatView} view
   * @param {string | null} targetId
   * @param {boolean} gm
   */
  function hpControls(view, targetId, gm) {
    const rows = view.rows.filter((r) => r.hp);
    const target = select(
      [
        { value: '', label: 'Choose a target', disabled: true },
        ...rows.map((r) => ({ value: r.id, label: r.name ?? 'Unknown combatant' })),
      ],
      targetId ?? '',
      { className: 'combat-screen__hp-target', ariaLabel: 'Damage or heal target' },
    );
    target.addEventListener('change', () => {
      hpPick = target.value || null;
      render(view, gm);
    });
    const row = rows.find((r) => r.id === targetId);
    const name = row ? (row.name ?? 'Unknown combatant') : null;
    /** @param {boolean} isHeal */
    const apply = (isHeal) => {
      const value = takeHpAmount(amount);
      if (targetId && value !== null) callbacks.onApplyHP(targetId, value, isHeal);
    };
    const damage = textButton(name ? `Damage ${name}` : 'Damage', () => apply(false), {
      icon: 'minus',
      variant: 'danger',
      ariaLabel: name ? `Damage ${name}` : 'Damage, choose a target first',
    });
    const heal = textButton(name ? `Heal ${name}` : 'Heal', () => apply(true), {
      icon: 'heal',
      variant: 'success',
      ariaLabel: name ? `Heal ${name}` : 'Heal, choose a target first',
    });
    damage.disabled = !name;
    heal.disabled = !name;
    // An unusable amount, for example empty, zero, or negative, disables
    // both buttons. The last usable amount stays in `hpAmount`, so a
    // rebuild of the column shows it again.
    const amount = buildHpAmountField({
      value: hpAmount,
      className: 'combat-screen__hp-amount',
      ariaLabel: 'Damage or heal amount',
      onInput: (value) => {
        if (value !== null) hpAmount = value;
        damage.disabled = value === null || !name;
        heal.disabled = value === null || !name;
      },
    });
    // The amount sits on its own line above both buttons, with a caption, so
    // it is clear that it feeds either button.
    return el(
      'div',
      'combat-screen__hp-controls u-g2',
      sectionLabel('Target', { className: 'combat-screen__hp-label' }),
      target,
      sectionLabel('Amount', { className: 'combat-screen__hp-label' }),
      amount,
      damage,
      heal,
    );
  }

  /**
   * The GM's Delay control for the current turn. The combatant moves to just
   * after the next row, and that row starts its turn. The last row of a round
   * has no later row, so the button is disabled there.
   * @param {CombatView} view
   */
  function delayControl(view) {
    const last = view.turnIndex >= view.rows.length - 1;
    const button = textButton('Delay turn', () => callbacks.onDelay?.(), {
      icon: 'down',
      className: 'combat-screen__delay',
      title: last
        ? 'The last combatant in the round has no later turn to wait for'
        : 'Act after the next combatant in the order',
    });
    button.disabled = last;
    return button;
  }

  return {
    element,
    render,
    clear: () => {
      element.innerHTML = '';
    },
  };
}

/**
 * The GM's initiative field for the shown combatant. A typed value commits
 * when the field loses focus or on Enter, and the host sorts the order again
 * with the turn left where it is. An empty or unchanged value commits
 * nothing.
 * @param {CombatantRow} row
 * @param {(id: string, initiative: number) => void} onSet
 * @returns {HTMLElement}
 */
export function initiativeField(row, onSet) {
  const input = numberField(row.initiative, { min: -10, max: 50 });
  input.classList.add('combat-screen__initiative');
  input.setAttribute('aria-label', `Initiative of ${row.name ?? 'Unknown combatant'}`);
  input.addEventListener('focus', () => input.select());
  input.addEventListener('change', () => {
    const typed = Number.parseInt(input.value, 10);
    if (!Number.isFinite(typed) || typed === row.initiative) return;
    onSet(row.id, typed);
  });
  return factLine('Initiative', input);
}
