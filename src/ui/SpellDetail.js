import { effectSummary, hitLines, laterTurnLines } from '../view/SpellEffectText.js';
import { formatCastingTime, formatDuration } from '../entities/SpellTiming.js';
import { capitalize } from '../util/text.js';
import { badge, textButton } from './buttons.js';
import { el } from './dom.js';
import { factLine } from './FactLine.js';
import { openDialog } from './Modal.js';

/** @typedef {import('../types/spell.js').Spell} Spell */
/**
 * A button in the spell-detail modal. `id` is what the promise resolves to when
 * clicked; `variant` picks the button style.
 * @typedef {{ id: string, label: string, variant?: 'primary' | 'danger' }} SpellAction
 */

/**
 * The components line: the letters, then what the M component is when the
 * spell names it. A consumed material states this, because it is the one a
 * caster must hold.
 * @param {Spell} spell
 * @returns {string}
 */
function componentsText(spell) {
  const letters = spell.components.join(', ') || '—';
  const materials = spell.materials;
  if (!materials?.text) return letters;
  return `${letters} (${materials.text}${materials.consumed ? ', consumed' : ''})`;
}

/**
 * Show a read-only spell detail modal: a school and level line, casting
 * meta, effect summary, and description, with a caller-supplied set of
 * action buttons plus an always-present Close button. Resolves to the
 * clicked action's `id`, or null when Closed or dismissed. The sheet passes
 * a Cast action. The spellbook passes Learn, Forget, and Prepare actions.
 * @param {Spell} spell
 * @param {SpellAction[]} actions
 * @param {{ saveDC?: number | null }} [options]
 * @returns {Promise<string | null>}
 */
export function promptSpellDetail(spell, actions, options = {}) {
  return openDialog({
    className: 'modal--wide spell-detail',
    title: spell.name,
    build: (close) => {
      const levelText = spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`;
      const summary = effectSummary(spell, options.saveDC ?? null);

      // Falsy entries are the optional lines: no effect summary, no
      // description. Node[] is the type openDialog's body takes.
      const body = /** @type {Node[]} */ (
        [
          // School and level line, with concentration and ritual as trailing tags.
          el(
            'p',
            'spell-detail__subtitle u-row u-wrap u-g2',
            `${levelText} · ${capitalize(spell.school)}`,
            spell.concentration && badge('Concentration', { className: 'spell-detail__tag' }),
            spell.ritual && badge('Ritual', { className: 'spell-detail__tag' }),
          ),
          el(
            'div',
            'spell-detail__meta',
            factLine('Casting time', formatCastingTime(spell.castingTime)),
            factLine('Range', spell.range || '—'),
            factLine('Components', componentsText(spell)),
            factLine(
              'Duration',
              formatDuration(spell.duration, { concentration: spell.concentration }),
            ),
          ),
          summary && el('p', 'spell-detail__effect', summary),
          ...hitLines(spell, options.saveDC ?? null).map((line) =>
            el('p', 'spell-detail__effect', line),
          ),
          ...laterTurnLines(spell).map((line) => el('p', 'spell-detail__effect', line)),
          spell.description && el('p', 'spell-detail__description', spell.description),
        ].filter(Boolean)
      );

      // Dismiss on the left, primary on the right, the same order as every modal.
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
