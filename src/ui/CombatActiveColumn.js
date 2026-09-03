import { el } from './dom.js';
import { chip, sectionLabel, textButton } from './buttons.js';
import { hpBand } from '../view/ViewRole.js';
import { combatActionBar } from './CombatActionBar.js';
import { deathSaveBlock } from './DeathSaveBlock.js';
import { factLine } from './FactLine.js';
import { loadoutBlock } from './LoadoutBlock.js';

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
 * @returns {{
 *   element: HTMLElement,
 *   render: (view: CombatView, gm: boolean) => void,
 *   clear: () => void,
 * }}
 */
export function mountActiveColumn(callbacks, loadoutOf) {
  const element = el('aside', 'combat-screen__active');

  // The damage or heal amount survives re-renders. Every HP edit triggers a
  // re-render. This lets the GM apply the same number to several combatants
  // without retyping it.
  let hpAmount = 1;

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
      ),
    );

    const facts = el('div', 'combat-screen__facts');
    facts.appendChild(factLine('Initiative', String(row.initiative)));
    if (row.ac !== null) facts.appendChild(factLine('AC', String(row.ac)));
    if (row.hp) {
      // HP shows exact where the viewer can act for this combatant. The GM
      // sees exact HP anywhere. A player sees exact HP for their own
      // character, matching their sheet.
      facts.appendChild(
        factLine(
          'HP',
          row.mayAct ? `${row.hp.current}/${row.hp.max}` : hpBand(row.hp.current, row.hp.max),
        ),
      );
    }
    element.appendChild(facts);

    if (gm && row.hp) element.appendChild(hpControls(row));

    if (row.conditions.length > 0) {
      element.appendChild(
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
      element.appendChild(line);
    }

    // A dying character shows its tracker under concentration, with the Roll
    // and Stabilize controls for a viewer who can act for it. The sheet shows
    // the same block, from the same builder.
    const dying = deathSaveBlock(row.deathSaves, {
      name: row.name ?? 'Unknown combatant',
      canAct: row.mayAct,
      onRoll: () => callbacks.onRollDeathSave(row.id),
      onStabilize: () => callbacks.onStabilize(row.id),
    });
    if (dying) element.appendChild(dying);

    // The action bar belongs to the turn, not the inspection. It shows only
    // when the column displays the current combatant and the viewer can act
    // for them. Inspecting a foe never offers its weapons to a player.
    const bar =
      current && row.mayAct
        ? combatActionBar(
            callbacks.getActions(),
            {
              onWeaponAttack: callbacks.onWeaponAttack,
              onCastSpell: callbacks.onCastSpell,
              onOffhandAttack: callbacks.onOffhandAttack,
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

  return {
    element,
    render,
    clear: () => {
      element.innerHTML = '';
    },
  };
}
