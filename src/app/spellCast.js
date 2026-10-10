import { promptModal } from '../ui/Modal.js';
import { replaceById } from '../entities/Roster.js';
import { findCombatant, storeOf } from './combatants.js';
import {
  combatTargets,
  missingTarget,
  rosterTargets,
  targetValues,
  prefillTarget,
} from './spellTargets.js';
import { castChangeHandler } from './spellCastFields.js';
import { resolveCast } from './spellCastResolve.js';
import { castPlan } from './castPlan.js';
import { castRoutes } from '../entities/CastRoute.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/cast.js').CastPlan} CastPlan */
/** @typedef {import('../types/cast.js').CastRefused} CastRefused */

/**
 * Casting a spell, from the button the GM presses to the dialog and back.
 * The two entry points are `castSpellAction` for a combatant on their turn
 * and `castSpellOutOfCombat` for a character on the roster. Both assemble a
 * cast plan, ask the GM to fill it in, and hand the answers to
 * `spellCastResolve.js`.
 *
 * The plan is what makes one cast readable: it holds the caster, the
 * targets, the fields, and the write-back, so the dialog code below has no
 * rules of its own. The rules live in `entities/`, the targets in
 * `spellTargets.js`, and the field list in `spellCastFields.js`.
 */

/**
 * Cast a spell for the active combatant. This mirrors `weaponAttack`. The
 * targets come from the initiative order: foes for an attack or save, the
 * party for a heal. Then `runCast` runs the pre-roll dialog, resolves the
 * cast, and applies the result. The caster is the combatant that holds the
 * participant's id, found by the shared `findCombatant` function. Its
 * `store` function writes the spent slot back to that combatant's own collection.
 * @param {AppContext} app
 * @param {CombatState} combat
 * @param {Participant} participant
 * @param {Spell} spell
 * @param {{ targetId?: string | null, prompt?: typeof promptModal }} [options]
 *   a target already picked on the combat board pre-fills the dialog target
 *   field. `prompt` renders the dialogs, and a test passes its own answers.
 */
export async function castSpellAction(
  app,
  combat,
  participant,
  spell,
  { targetId = null, prompt = promptModal } = {},
) {
  const targets = combatTargets(app, combat, participant, spell);
  const found = findCombatant(app, participant.id);
  if (!found) return;
  await runCast(app, found.entity, spell, targets, storeOf(found), targetId, prompt);
}

/**
 * Cast a spell from a character's sheet outside of combat. The targets come
 * from the roster and nearby foes, with no initiative order. Then `runCast`
 * handles the dialog, the resolution, and the application, the same way the
 * combat path does.
 * @param {AppContext} app
 * @param {import('../types/entities.js').Character} caster
 * @param {Spell} spell
 * @param {{ prompt?: typeof promptModal }} [options] `prompt` renders the
 *   dialogs, and a test passes its own answers.
 */
export async function castSpellOutOfCombat(app, caster, spell, { prompt = promptModal } = {}) {
  await runCast(
    app,
    caster,
    spell,
    rosterTargets(app, spell, caster.id),
    // The caster is a character, so the cast writes back a character.
    (next) => {
      const character = /** @type {import('../types/entities.js').Character} */ (next);
      app.state.characters = replaceById(app.state.characters, character);
      app.actions.refreshSelectedCharacter();
    },
    null,
    prompt,
  );
}

/**
 * The shared cast pipeline behind both entry points. This mirrors
 * `weaponAttack`: `castPlan` works out what the dialog offers, the dialog
 * takes the slot level, the target, and the situational modes, and
 * `resolveCast` rolls and applies the cast. The dialog is the only part of
 * the pipeline that needs a browser.
 * @param {AppContext} app
 * @param {import('../types/entities.js').Character
 *   | import('../types/creature.js').Creature} entity the real combatant
 *   that casts the spell
 * @param {Spell} spell
 * @param {import('./combatants.js').CombatTarget[]} offered
 * @param {import('./spellCastResolve.js').WriteBack} writeBack stores the
 *   updated entity
 * @param {string | null} [preferredTargetId] a target picked before the
 *   dialog opened, from the combat board selection. The dialog pre-fills
 *   this target where it is offered.
 * @param {typeof promptModal} [prompt] renders the dialogs
 */
async function runCast(
  app,
  entity,
  spell,
  offered,
  writeBack,
  preferredTargetId,
  prompt = promptModal,
) {
  const route = await pickRoute(spell, castRoutes(entity, spell), prompt);
  if (route === undefined) return;
  const plan = castPlan(app, entity, spell, offered, route);
  if (!plan.ok) {
    app.toasts.show(plan.message, { level: 'error' });
    return;
  }
  if (preferredTargetId) prefillTarget(plan.fields, preferredTargetId);
  const verb = plan.free?.repeat ? 'Repeat' : 'Cast';
  const values = await prompt(`${verb} ${spell.name}`, plan.fields, {
    submitLabel: verb,
    wide: true,
    onChange: castChangeHandler(plan),
    // Each opt-out box that the cast would be refused without holds Cast
    // disabled until it is ticked.
    submitRequires: [
      ...(plan.material.required && !plan.material.satisfied ? ['ignore-components'] : []),
      ...(plan.armor.length > 0 ? ['ignore-armor'] : []),
      ...(plan.actionBlocked ? ['ignore-action'] : []),
      ...(plan.ruleBlock ? ['ignore-spell-rule'] : []),
    ],
    // Cast with no target ticked keeps the dialog open, so the GM picks one
    // instead of starting the cast over.
    validate: (get) =>
      missingTarget(spell, plan.targets, targetValues(plan.fields, get))
        ? 'Pick at least one target.'
        : '',
  });
  if (!values) return;
  await resolveCast(app, plan, values, { writeBack });
}

/**
 * Ask the GM how to pay for a spell that has more than one way, before the
 * cast dialog opens. The answer decides the slot picker, the targets, and
 * the components of that dialog, so it comes first. A spell with one way
 * resolves to null with no question.
 * @param {Spell} spell
 * @param {{ id: import('../types/cast.js').CastRoute, label: string }[]} routes
 * @param {typeof promptModal} prompt renders the question
 * @returns {Promise<import('../types/cast.js').CastRoute | null | undefined>}
 *   the picked route, null with nothing to pick, or undefined when the GM
 *   cancels
 */
async function pickRoute(spell, routes, prompt) {
  if (routes.length === 0) return null;
  const values = await prompt(
    `Cast ${spell.name}`,
    [
      {
        name: 'route',
        label: 'How to cast',
        type: 'select',
        value: routes[0].id,
        options: routes.map((r) => ({ value: r.id, label: r.label })),
      },
    ],
    { submitLabel: 'Next' },
  );
  if (!values) return undefined;
  return /** @type {import('../types/cast.js').CastRoute} */ (values.route);
}
