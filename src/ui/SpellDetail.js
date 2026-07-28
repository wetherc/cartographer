import { formatDamage } from '../entities/Equipment.js';
import { capitalize } from '../util/text.js';
import { textButton } from './buttons.js';
import { el } from './dom.js';
import { openDialog } from './Modal.js';

/** @typedef {import('../types/spell.js').Spell} Spell */
/**
 * A button in the spell-detail modal. `id` is what the promise resolves to when
 * clicked; `variant` picks the button style.
 * @typedef {{ id: string, label: string, variant?: 'primary' | 'danger' }} SpellAction
 */

/**
 * The one-line effect summary shown under the meta grid: a spell attack and its
 * damage, a save (ability + DC) with its damage and rider, or healing dice.
 * Utility spells have no line (their rules live in the description).
 * @param {Spell} spell
 * @param {number | null} saveDC the caster's save DC, or null when unknown
 * @returns {string | null}
 */
function effectSummary(spell, saveDC) {
  const effect = spell.effect;
  if (effect.kind === 'attack') {
    return `Spell attack — ${formatDamage(effect.damage) || 'no damage'}`;
  }
  if (effect.kind === 'save') {
    const dc = saveDC !== null ? ` DC ${saveDC}` : '';
    const dmg = formatDamage(effect.damage);
    const half = effect.halfOnSave ? ' (half on save)' : '';
    const cond = effect.condition ? `, ${effect.condition}` : '';
    return `${effect.saveAbility} save${dc} — ${dmg || 'no damage'}${half}${cond}`;
  }
  if (effect.kind === 'heal') {
    return `Healing — ${formatDamage(effect.healing) || 'no dice'}`;
  }
  return null;
}

/** @param {string} term @param {string} value @returns {HTMLElement} a labelled meta cell. */
function metaCell(term, value) {
  return el(
    'div',
    'spell-detail__meta-cell',
    el('span', 'section-label', term),
    el('span', 'spell-detail__meta-value', value),
  );
}

/**
 * Show a read-only spell detail modal — school/level line, casting meta,
 * effect summary, and description — with a caller-supplied set of action
 * buttons plus an always-present Close. Resolves the clicked action's `id`, or
 * null when Closed or dismissed. The sheet passes a Cast action; the spellbook
 * passes Learn/Forget/Prepare actions.
 * @param {Spell} spell
 * @param {SpellAction[]} actions
 * @param {{ saveDC?: number | null }} [options]
 * @returns {Promise<string | null>}
 */
export function promptSpellDetail(spell, actions, options = {}) {
  return openDialog({
    className: 'modal modal--wide spell-detail',
    title: spell.name,
    build: (close) => {
      const levelText = spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`;
      const summary = effectSummary(spell, options.saveDC ?? null);

      // Falsy entries are the optional lines (no effect summary, no
      // description); Node[] is what openDialog's body takes.
      const body = /** @type {Node[]} */ (
        [
          // School / level line, with concentration and ritual as trailing tags.
          el(
            'p',
            'spell-detail__subtitle',
            `${levelText} · ${capitalize(spell.school)}`,
            spell.concentration && el('span', 'badge spell-detail__tag', 'Concentration'),
            spell.ritual && el('span', 'badge spell-detail__tag', 'Ritual'),
          ),
          el(
            'div',
            'spell-detail__meta',
            metaCell('Casting time', spell.castingTime || '—'),
            metaCell('Range', spell.range || '—'),
            metaCell('Components', spell.components.join(', ') || '—'),
            metaCell('Duration', spell.duration || '—'),
          ),
          summary && el('p', 'spell-detail__effect', summary),
          spell.description && el('p', 'spell-detail__description', spell.description),
        ].filter(Boolean)
      );

      // Dismiss-left, primary-right — the same ordering as every modal.
      const dismiss = textButton('Close', () => close('close'));
      const buttons = actions.map((action) =>
        textButton(action.label, () => close(action.id), { variant: action.variant }),
      );

      return {
        body,
        actions: [dismiss, ...buttons],
        initialFocus: buttons.length ? buttons[buttons.length - 1] : dismiss,
      };
    },
    result: (returnValue) => (returnValue && returnValue !== 'close' ? returnValue : null),
  });
}
