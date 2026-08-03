import { formatDamage } from '../entities/Equipment.js';
import { buffCondition } from '../entities/Casting.js';
import { riderSummary } from '../entities/Riders.js';
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
 * The one-line effect summary shown under the meta grid: a spell attack and
 * its damage, a save (ability plus DC) with its damage and the chip it
 * imposes, healing dice, or the chip a buff hands out. A chip that changes
 * later rolls states what it adds. A utility spell has no line, because its
 * rules live in the description.
 * @param {Spell} spell
 * @param {number | null} saveDC the caster's save DC, or null when unknown
 * @returns {string | null}
 */
function effectSummary(spell, saveDC) {
  const effect = spell.effect;
  if (effect.kind === 'attack') {
    const damage = formatDamage(effect.damage) || 'no damage';
    const shots = effect.projectiles;
    if (!shots) return `Spell attack — ${damage}`;
    // With projectiles, the dice apply per projectile. The line states the
    // count before it states what one projectile deals.
    const growth = shots.perStep ? ` (+${shots.perStep} per level)` : '';
    const roll = shots.autoHit ? 'hits automatically' : 'spell attack';
    return `${shots.count} projectile${shots.count === 1 ? '' : 's'}${growth}, ${roll} — ${damage} each`;
  }
  if (effect.kind === 'save') {
    const dc = saveDC !== null ? ` DC ${saveDC}` : '';
    const dmg = formatDamage(effect.damage);
    const half = effect.halfOnSave ? ' (half on save)' : '';
    const rider = effect.rider ? ` (${riderSummary(effect.rider)})` : '';
    const cond = effect.condition ? `, ${effect.condition}${rider}` : '';
    return `${effect.saveAbility} save${dc} — ${dmg || 'no damage'}${half}${cond}`;
  }
  if (effect.kind === 'heal') {
    return `Healing — ${formatDamage(effect.healing) || 'no dice'}`;
  }
  if (effect.kind === 'buff') {
    const chip = buffCondition(spell);
    return effect.rider ? `${chip} — ${riderSummary(effect.rider)}` : chip;
  }
  return null;
}

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
