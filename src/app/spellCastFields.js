import { maxTargets, scalingSteps } from '../entities/Casting.js';
import { helps, targetFree, targetLabel } from './spellTargets.js';

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/cast.js').CastPlan} CastPlan */

/**
 * The cast dialog's field list, and what one changed field does to the rest.
 * A cast asks the GM for a slot level, a target or an allocation of
 * projectiles across targets, and whether the cast is a ritual. The fields
 * are plain records with no DOM, so what the dialog offers is unit tested
 * here rather than in a browser.
 *
 * The slot level decides how many targets and projectiles a spell gets, so
 * changing it restates the allocation caption and the field bounds.
 * `castChangeHandler` is what carries that through.
 *
 * Every function here is pure.
 */

/** The allocation grid caption. The app restates it when the slot level
 * changes the number of projectiles a cast fires.
 * @param {number} total @returns {string} */
function allocationLabel(total) {
  return `Targets (${total} to allocate)`;
}

/**
 * The slot level a cast dialog opens on: the lowest slot the caster can
 * spend. The picker shows this level first, and the dialog submits it if the
 * GM does not change it. A cantrip has no slot, so the level is 0.
 * @param {Spell} spell
 * @param {number[]} slotLevels
 * @returns {number}
 */
export function startingSlotLevel(spell, slotLevels) {
  return spell.level > 0 ? (slotLevels[0] ?? spell.level) : 0;
}

/**
 * The level a cast resolves at: the picked slot, or the spell's own level
 * when the caster casts it as a ritual. A ritual trades the slot for extra
 * time, so there is no slot to upcast from. When nothing is picked, the
 * function returns the spell's level. This is what a dialog with no slot
 * picker submits.
 * @param {Spell} spell
 * @param {string | number | undefined} picked
 * @param {boolean} ritual
 * @returns {number}
 */
export function effectiveSlot(spell, picked, ritual) {
  if (ritual) return spell.level;
  return Number(picked) || spell.level;
}

/**
 * The number of creatures a cast reaches at this slot level. For a
 * multi-projectile spell, this is the number of projectiles. Read the cap at
 * the level the cast actually uses. A cap taken from a higher slot offers
 * a projectile the cast cannot fire.
 * @param {Spell} spell
 * @param {number} slotLevel
 * @param {number} casterLevel
 * @returns {number}
 */
export function castCap(spell, slotLevel, casterLevel) {
  return maxTargets(spell, scalingSteps(spell, slotLevel, casterLevel));
}

/**
 * The pre-roll dialog fields for a cast. Fields include a slot-level picker
 * (for a leveled spell cast at or above its level, from a slot the caster
 * still has), the target or targets, an advantage/disadvantage mode, and,
 * for a save spell, the DC and the target's save bonus. A cantrip omits the
 * slot picker. A utility spell adds no target field. The function returns
 * null when the caster has no usable slot for a leveled spell.
 *
 * A spell that reaches one creature keeps a single select, so the common
 * case stays one click. A spell that reaches more creatures gets a checkbox
 * group, capped at the number the spell allows. An area spell has no cap, so
 * the GM picks whoever the blast covers. A multi-projectile spell gets the
 * allocation grid instead, because a checkbox cannot express partial
 * allocation across targets. The grid also serves as the target picker: a
 * creature given no projectile is not a target of the cast.
 *
 * A ritual cast spends no slot, so a caster with no slots left can still
 * cast one. The dialog leaves out the slot picker instead of refusing the
 * whole dialog, and the ritual box opens ticked, because that is the only
 * cast still available.
 *
 * The dialog offers the save DC for editing, for a save spell. It also
 * offers a bonus field for targets whose own save the app cannot read. A
 * target that carries a `saveBonus` value rolls that value instead, and the
 * picker shows it. The field is left out when every target has a
 * `saveBonus` value.
 * @param {Spell} spell
 * @param {import('./combatants.js').CombatTarget[]} targets
 * @param {number[]} slotLevels the available slot levels at or above the spell's level
 * @param {number} saveDC
 * @param {number} cap the number of targets this cast can reach. The value is Infinity for an area spell.
 * @param {{ material?: boolean, ritual?: boolean, armor?: boolean, actionLabel?: string }} [opts] `material`: true when the
 *   cast requires the caster to hold a material component. This adds the opt-out
 *   checkbox for a table that treats components as flavor. `ritual`: true when this caster can
 *   cast this spell as a ritual. This adds the box that trades the slot for extra time.
 *   `armor`: true when the caster wears armor it is not trained for. This adds
 *   the opt-out checkbox that lets the GM waive the armor rule.
 *   `actionLabel`: the wording of the action-cost opt-out, for a cast the
 *   caster's turn cannot pay for. An empty string leaves the box out.
 * @returns {import('../types/modal.js').ModalField[] | null}
 */
export function castFields(spell, targets, slotLevels, saveDC, cap, opts = {}) {
  const { material = false, ritual = false, armor = false, actionLabel = '' } = opts;
  const kind = spell.effect.kind;
  /** @type {import('../types/modal.js').ModalField[]} */
  const fields = [];
  if (spell.level > 0) {
    if (slotLevels.length === 0 && !ritual) return null;
    if (slotLevels.length > 0) {
      fields.push({
        name: 'slot',
        label: 'Cast at level',
        type: 'select',
        value: String(slotLevels[0]),
        options: slotLevels.map((l) => ({ value: String(l), label: `Level ${l}` })),
      });
    }
    // This sits beside the slot picker it controls. Ticking this box hides
    // the slot picker, because a ritual always resolves at the spell's own level.
    if (ritual) {
      fields.push({
        name: 'ritual',
        label: 'Cast as ritual (10 minutes longer)',
        type: 'checkbox',
        full: true,
        value: slotLevels.length === 0,
      });
    }
  }
  if (!targetFree(kind)) {
    const noun = helps(kind) ? 'Recipient' : 'Target';
    const options = targets.map((t) => ({ value: t.id, label: targetLabel(spell, t) }));
    const projectiles = spell.effect.kind === 'attack' ? spell.effect.projectiles : undefined;
    if (projectiles && cap > 1) {
      fields.push({
        name: 'allocation',
        label: allocationLabel(cap),
        type: 'allocation',
        full: true,
        total: cap,
        rows: options,
        unit: 'unassigned',
        // The whole allocation starts on the first target. This keeps a
        // single-target cast to one click.
        value: `${options[0].value}:${cap}`,
      });
    } else if (cap <= 1) {
      fields.push({ name: 'target', label: noun, type: 'select', full: true, options });
    } else {
      fields.push({
        name: 'targets',
        label: Number.isFinite(cap) ? `${noun}s (up to ${cap})` : `${noun}s in the area`,
        type: 'multiselect',
        full: true,
        options,
        fixedHeight: true,
        ...(Number.isFinite(cap) ? { max: cap } : {}),
      });
    }
  }
  if (kind === 'attack') {
    fields.push({
      name: 'mode',
      label: 'Attack roll',
      type: 'select',
      value: 'normal',
      options: [
        { value: 'normal', label: 'Normal' },
        { value: 'advantage', label: 'Advantage' },
        { value: 'disadvantage', label: 'Disadvantage' },
      ],
    });
  }
  if (kind === 'save') {
    fields.push({ name: 'dc', label: 'Save DC', type: 'number', value: saveDC, min: 1 });
    fields.push({
      name: 'mode',
      label: 'Save roll',
      type: 'select',
      value: 'normal',
      options: [
        { value: 'normal', label: 'Normal' },
        { value: 'advantage', label: 'Advantage' },
        { value: 'disadvantage', label: 'Disadvantage' },
      ],
    });
  }
  // Ticking this box casts the spell without reading or touching the
  // inventory. A table that treats components as flavor does not need to
  // stock diamonds to cast Revivify, or a pouch to cast anything else.
  if (material) {
    fields.push({
      name: 'ignore-components',
      label: 'Ignore components',
      type: 'checkbox',
      full: true,
    });
  }
  // Untrained armor blocks a cast under the 5e armor proficiency rule.
  // Ticking this box casts anyway, for a table that waives the rule.
  if (armor) {
    fields.push({
      name: 'ignore-armor',
      label: 'Ignore armor',
      type: 'checkbox',
      full: true,
    });
  }
  // A turn that has already spent what this cast costs, or a casting time
  // longer than a turn, blocks the cast. Ticking this box casts anyway, which
  // is the GM's call for a rule the action economy here does not carry.
  if (actionLabel) {
    fields.push({
      name: 'ignore-action',
      label: actionLabel,
      type: 'checkbox',
      full: true,
    });
  }
  return fields;
}

/**
 * The dialog's live response to a changed slot level. A projectile spell
 * fires a different number of projectiles at each slot level, and its
 * allocation must add up to that number, so the grid's total and caption are
 * restated whenever the level changes. Ticking the ritual box also changes
 * the level, because a ritual always resolves at the spell's own level, and
 * it hides the slot picker it overrides.
 *
 * This takes the form as an interface, not as elements, so a fake form
 * records what a change would do to the dialog.
 * @param {CastPlan} plan
 * @returns {(name: string, form: import('../types/modal.js').ModalFormHandle) => void}
 */
export function castChangeHandler(plan) {
  const { spell, caster, slotLevels, fields } = plan;
  const allocates = fields.some((f) => f.name === 'allocation');
  // A spell with no ritual has no box to read. Reading one that the dialog
  // never built throws, which would break the slot picker of every leveled
  // spell that cannot be cast as a ritual.
  const offersRitual = fields.some((f) => f.name === 'ritual');
  return (name, form) => {
    if (name !== 'slot' && name !== 'ritual') return;
    const asRitual = offersRitual && form.get('ritual') === '1';
    if (name === 'ritual' && slotLevels.length > 0) form.setHidden('slot', asRitual);
    if (!allocates) return;
    const total = castCap(
      spell,
      effectiveSlot(spell, form.get('slot'), asRitual),
      caster.level ?? 1,
    );
    form.setTotal('allocation', total);
    form.setLabel('allocation', allocationLabel(total));
  };
}
