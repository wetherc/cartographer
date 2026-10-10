import { promptModal } from '../ui/Modal.js';
import { applyCure, cureOptions } from '../entities/HealCure.js';
import { cureDialog, cureLabel } from '../view/CureDialog.js';
import { findCombatant } from './combatants.js';
import { storeCharacterChips, storeCreature } from './combatantWrites.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/spell.js').SpellHealEffect} SpellHealEffect */

/**
 * Ask the caster which condition the heal ends. The answer is one of the
 * choices, or null when the caster closes the dialog.
 * @typedef {(spell: Spell, targetName: string, choices: string[]) => Promise<string | null>} CurePick
 */

/** @type {CurePick} */
async function askCure(spell, targetName, choices) {
  const { title, fields, options } = cureDialog(spell.name, targetName, choices);
  const values = await promptModal(title, fields, options);
  return values?.cure ?? null;
}

/**
 * End the conditions that a heal names on one target (see
 * `entities/HealCure.js`). The caster picks from the one-of list when the
 * target has more than one of its names. With one or none, nothing is asked
 * and the write happens before the function returns. A chip that a
 * concentration spell imposed comes off, and the caster keeps concentrating.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {string} targetId
 * @param {{ pick?: CurePick }} [options]
 * @returns {Promise<void>}
 */
export async function cureTarget(app, spell, targetId, { pick = askCure } = {}) {
  const effect = /** @type {SpellHealEffect} */ (spell.effect);
  if (!effect.removes && !effect.removesOneOf) return;
  const before = findCombatant(app, targetId);
  if (!before) return;
  const { always, choices } = cureOptions(effect, before.entity);
  const picked =
    choices.length > 1 ? await pick(spell, before.label, choices) : (choices[0] ?? null);
  // The dialog can sit open while the fight moves on, so the write reads the
  // target again.
  const found = findCombatant(app, targetId);
  if (!found) return;
  const { entity, ended } = applyCure(found.entity, [...always, ...(picked ? [picked] : [])]);
  if (ended.length === 0) {
    if (effect.removesOneOf) {
      app.actions.logEvent('combat', `${spell.name} ends nothing on ${found.label}.`);
    }
    return;
  }
  if (found.kind === 'character') {
    storeCharacterChips(app, found, /** @type {typeof found.entity} */ (entity));
  } else {
    storeCreature(app, found.entity, /** @type {typeof found.entity} */ (entity), found.store);
    app.actions.markDirty();
  }
  const list = ended.map(cureLabel).join(' and ');
  app.actions.logEvent('combat', `${spell.name} ends ${list} on ${found.label}.`);
}
