import { formatDamage } from '../entities/Equipment.js';
import { capitalize } from '../util/text.js';
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
  const cell = document.createElement('div');
  cell.className = 'spell-detail__meta-cell';
  const dt = document.createElement('span');
  dt.className = 'section-label';
  dt.textContent = term;
  const dd = document.createElement('span');
  dd.className = 'spell-detail__meta-value';
  dd.textContent = value;
  cell.append(dt, dd);
  return cell;
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
      /** @type {Node[]} */
      const body = [];

      // School / level line, with concentration and ritual as trailing tags.
      const subtitle = document.createElement('p');
      subtitle.className = 'spell-detail__subtitle';
      const levelText = spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`;
      subtitle.textContent = `${levelText} · ${capitalize(spell.school)}`;
      if (spell.concentration) {
        const tag = document.createElement('span');
        tag.className = 'spell-detail__tag';
        tag.textContent = 'Concentration';
        subtitle.appendChild(tag);
      }
      if (spell.ritual) {
        const tag = document.createElement('span');
        tag.className = 'spell-detail__tag';
        tag.textContent = 'Ritual';
        subtitle.appendChild(tag);
      }
      body.push(subtitle);

      const meta = document.createElement('div');
      meta.className = 'spell-detail__meta';
      meta.append(
        metaCell('Casting time', spell.castingTime || '—'),
        metaCell('Range', spell.range || '—'),
        metaCell('Components', spell.components.join(', ') || '—'),
        metaCell('Duration', spell.duration || '—'),
      );
      body.push(meta);

      const summary = effectSummary(spell, options.saveDC ?? null);
      if (summary) {
        const effect = document.createElement('p');
        effect.className = 'spell-detail__effect';
        effect.textContent = summary;
        body.push(effect);
      }

      if (spell.description) {
        const description = document.createElement('p');
        description.className = 'spell-detail__description';
        description.textContent = spell.description;
        body.push(description);
      }

      // Dismiss-left, primary-right — the same ordering as every modal.
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'btn';
      dismiss.textContent = 'Close';
      dismiss.addEventListener('click', () => close('close'));
      const buttons = actions.map((action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn${action.variant ? ` btn--${action.variant}` : ''}`;
        button.textContent = action.label;
        button.addEventListener('click', () => close(action.id));
        return button;
      });

      return {
        body,
        actions: [dismiss, ...buttons],
        initialFocus: buttons.length ? buttons[buttons.length - 1] : dismiss,
      };
    },
    result: (returnValue) => (returnValue && returnValue !== 'close' ? returnValue : null),
  });
}
