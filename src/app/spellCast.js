import { promptModal } from '../ui/Modal.js';
import { parseAssignments } from '../ui/ModalFields.js';
import { castSpell, materialCheck, maxTargets, scalingSteps } from '../entities/Casting.js';
import { riderSummary } from '../entities/Riders.js';
import { combineModes, rollMode, saveOutcome } from '../entities/ConditionEffects.js';
import { removeItem, spellSource } from '../entities/Character.js';
import { formatInventoryEvent } from '../entities/InventoryLog.js';
import { spellSaveDC, spellAttackBonus, hasRitualCasting } from '../entities/Classes.js';
import { formatModifier } from '../entities/Modifiers.js';
import { hostileCreaturesOnTile } from '../entities/CreatureMap.js';
import { castableSlotLevels } from '../entities/SpellSlots.js';
import { toCaster, withCasterState } from '../entities/Caster.js';
import { replaceById } from '../entities/Roster.js';
import { durationInRounds } from '../entities/SpellTiming.js';
import { begin as beginConcentration } from '../entities/Concentration.js';
import {
  findCombatant,
  combatantsAsTargets,
  asTarget,
  applyToTarget,
  applyConditionToTarget,
  targetSaveBonus,
  targetConditions,
  endSpellEffects,
} from './combatants.js';
import { splitTrimmedList } from '../util/text.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The combatants a spell can target, by effect kind. An attack or a save
 * spell reaches the caster's foes, plus any other creature in the fight,
 * bystanders included. A heal or a buff reaches its own side (allies,
 * including the caster). A utility spell targets no one. The list comes
 * from the shared `combatantsAsTargets` function over the combat running
 * order.
 * @param {AppContext} app
 * @param {CombatState} combat
 * @param {Participant} caster
 * @param {Spell} spell
 * @returns {import('./combatants.js').CombatTarget[]}
 */
export function combatTargets(app, combat, caster, spell) {
  const kind = spell.effect.kind;
  if (kind === 'utility') return [];
  return combatantsAsTargets(app, combat, caster, { allies: helps(kind) });
}

/**
 * Whether an effect kind reaches the caster's own side. A heal and a buff do.
 * An attack and a save do not.
 * @param {import('../types/spell.js').SpellEffect['kind']} kind
 * @returns {boolean}
 */
function helps(kind) {
  return kind === 'heal' || kind === 'buff';
}

/**
 * The combatants an out-of-combat cast can reach. There is no initiative
 * order to limit the scope. A heal or a buff reaches the whole party (allies,
 * caster included). An attack or a save spell reaches the foes on the party's
 * tile: the undefeated hostile creatures standing there. A friendly or
 * neutral bystander is not a foe, so it is never offered. A utility spell
 * targets no one. The target shape matches `combatTargets`.
 *
 * The party's tile is the closest range check the app has, because the app
 * cannot measure distance between two tokens. Without this check, a cast
 * offers every foe in the campaign, including foes in regions the party has
 * not reached.
 * @param {AppContext} app
 * @param {Spell} spell
 * @returns {import('./combatants.js').CombatTarget[]}
 */
export function rosterTargets(app, spell) {
  const { state } = app;
  const kind = spell.effect.kind;
  if (kind === 'utility') return [];
  if (helps(kind)) {
    return state.characters.map((c) => asTarget(c, 'character'));
  }
  const position = app.partyTracker.getPosition();
  return hostileCreaturesOnTile(state.creatures, position).map((c) => asTarget(c, 'creature'));
}

/**
 * The label a target shows in the picker: the number the cast rolls against.
 * An attack rolls against AC. A save rolls against the target's own bonus in
 * the spell's ability, when the app knows it. The app omits the bonus for a
 * foe whose save the GM must type in. A heal and a buff roll against nothing,
 * so only the name shows.
 * @param {Spell} spell
 * @param {import('./combatants.js').CombatTarget} target
 * @returns {string}
 */
function targetLabel(spell, target) {
  const kind = spell.effect.kind;
  if (helps(kind)) return target.name;
  if (kind === 'save') {
    if (target.saveBonus === undefined) return target.name;
    return `${target.name} (${spell.effect.saveAbility} ${formatModifier(target.saveBonus)})`;
  }
  return `${target.name} (AC ${target.ac})`;
}

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
 * @param {{ material?: boolean, ritual?: boolean }} [opts] `material`: true when the
 *   cast requires the caster to hold a material component. This adds the opt-out
 *   checkbox for a table that treats components as flavor. `ritual`: true when this caster can
 *   cast this spell as a ritual. This adds the box that trades the slot for extra time.
 * @returns {import('../types/modal.js').ModalField[] | null}
 */
export function castFields(spell, targets, slotLevels, saveDC, cap, opts = {}) {
  const { material = false, ritual = false } = opts;
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
  if (kind !== 'utility') {
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
    // The hand-entered bonus covers only targets whose own save the app
    // cannot read. The dialog does not ask for this bonus when every target has one.
    if (targets.some((t) => t.saveBonus === undefined)) {
      fields.push({
        name: 'save-bonus',
        label: targets.every((t) => t.saveBonus === undefined)
          ? 'Target save bonus'
          : 'Save bonus (targets without one)',
        type: 'number',
        value: 0,
      });
    }
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
  return fields;
}

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
 * @param {{ targetId?: string | null }} [options] a target already picked on
 *   the combat board pre-fills the dialog target field
 */
export async function castSpellAction(app, combat, participant, spell, { targetId = null } = {}) {
  const targets = combatTargets(app, combat, participant, spell);
  const found = findCombatant(app, participant.id);
  if (!found) return;
  await runCast(
    app,
    found.entity,
    spell,
    targets,
    /** @type {(next: any) => void} */ (found.store),
    found.kind === 'character',
    targetId,
  );
}

/**
 * Cast a spell from a character's sheet outside of combat. The targets come
 * from the roster and nearby foes, with no initiative order. Then `runCast`
 * handles the dialog, the resolution, and the application, the same way the
 * combat path does.
 * @param {AppContext} app
 * @param {import('../types/entities.js').Character} caster
 * @param {Spell} spell
 */
export async function castSpellOutOfCombat(app, caster, spell) {
  await runCast(
    app,
    caster,
    spell,
    rosterTargets(app, spell),
    (next) => {
      app.state.characters = replaceById(app.state.characters, next);
      app.actions.refreshSelectedCharacter();
    },
    true,
  );
}

/**
 * Everything a cast needs to work out before it can open a dialog: the caster
 * view, the targets with their save bonuses filled in, the spendable slot
 * levels, the save DC, the target cap, the component check, and the dialog's
 * own field list. Nothing here touches the DOM, so the whole pre-dialog
 * decision is testable.
 *
 * A refusal comes back as `{ ok: false, message }` and the caller shows the
 * message. There are two refusals: nothing to target, and no slot high enough
 * for a leveled spell.
 * @typedef {{ ok: false, message: string }} CastRefused
 * @typedef {{
 *   ok: true,
 *   entity: any,
 *   spell: Spell,
 *   caster: import('../types/entities.js').SpellCaster,
 *   targets: import('./combatants.js').CombatTarget[],
 *   saveAbility: import('../types/spell.js').Ability | null,
 *   slotLevels: number[],
 *   sourceClass: string | undefined,
 *   dc: number,
 *   material: ReturnType<typeof materialCheck>,
 *   fields: import('../types/modal.js').ModalField[],
 * }} CastPlan
 */

/**
 * Work out the pre-dialog half of a cast. A caster with no spell ability
 * falls back to a flat DC 10. The caster entity is read through `toCaster`,
 * so a party Character and a Creature resolve the same way.
 * A caster from a class with ritual casting is offered the ritual box, which
 * trades the slot for extra time.
 * @param {AppContext} app
 * @param {any} entity the real combatant that casts the spell
 * @param {Spell} spell
 * @param {import('./combatants.js').CombatTarget[]} offered
 * @returns {CastPlan | CastRefused}
 */
export function castPlan(app, entity, spell, offered) {
  // The pure spell helper functions take a `SpellCaster`: a caster's class,
  // level, stats, resources, and spellbook. This is exactly what `toCaster`
  // returns. The helpers read this view, and the code writes back only to
  // the real entity.
  const caster = toCaster(entity);
  if (spell.effect.kind !== 'utility' && offered.length === 0) {
    return { ok: false, message: 'No target available.' };
  }
  // Each target of a save spell gets its own bonus where the app can read
  // one. The dialog shows what a target will add, and the resolver rolls it.
  // This happens once here, not in the two target assemblies, because the
  // saved ability is a property of the spell, not of the target.
  // A target's own chips ride the same save, so they travel with the bonus.
  // Both are read when the dialog opens, not when it is submitted, so a chip
  // that lands on a target while the dialog sits open misses this cast. The
  // GM opens and submits a cast in one motion, and re-reading the roster
  // under an open dialog would let the numbers on screen go stale instead.
  const saveAbility = spell.effect.kind === 'save' ? spell.effect.saveAbility : null;
  const targets = saveAbility
    ? offered.map((t) => {
        const bonus = targetSaveBonus(app, t.id, saveAbility);
        const conditions = targetConditions(app, t.id);
        if (bonus === undefined && conditions.length === 0) return t;
        return {
          ...t,
          ...(bonus === undefined ? {} : { saveBonus: bonus }),
          ...(conditions.length > 0 ? { conditions } : {}),
        };
      })
    : offered;

  // A leveled spell casts from a slot at or above its level that still has a
  // charge, leveled or pact. The picker offers each such level.
  const slotLevels = spell.level > 0 ? castableSlotLevels(caster, spell.level) : [];
  // A multiclass caster's DC and attack bonus use the class the spell was
  // learned under. Without a recorded source, they fall back to the first
  // caster class.
  const sourceClass = spellSource(caster, spell.id) ?? undefined;
  const dc = spellSaveDC(caster, sourceClass) ?? 10;
  // Both caps read the level the picker starts on: the lowest slot the
  // caster can spend. This is also the level submitted if the GM does not
  // change it. The projectile allocation then follows the picked level,
  // because it must add up exactly. The target checkboxes stay at the
  // starting cap, and a cast above it drops the extra targets. `castSpell`
  // reports the dropped targets back.
  const cap = castCap(spell, startingSlotLevel(spell, slotLevels), caster.level ?? 1);
  // The check reads the real entity, not the caster view, because the
  // caster view has no inventory. A combatant with no inventory is never
  // asked for a component. Only a Character has an inventory. The check's
  // contract is that an entity without one needs nothing, so all three
  // combatant shapes go through the same check.
  const material = materialCheck(
    /** @type {{ inventory?: import('../types/entities.js').InventoryItem[] }} */ (
      /** @type {unknown} */ (entity)
    ),
    spell,
  );
  // Ritual casting is a class feature. A caster can cast a spell with a
  // ritual as a ritual only as a bard, cleric, druid, or wizard.
  const ritualOffered = spell.ritual && spell.level > 0 && hasRitualCasting(caster);
  const fields = castFields(spell, targets, slotLevels, dc, cap, {
    material: material.required,
    ritual: ritualOffered,
  });
  if (!fields) {
    return { ok: false, message: `No level ${spell.level}+ slot left for ${spell.name}.` };
  }
  return {
    ok: true,
    entity,
    spell,
    caster,
    targets,
    saveAbility,
    slotLevels,
    sourceClass,
    dc,
    material,
    fields,
  };
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
  return (name, form) => {
    if (name !== 'slot' && name !== 'ritual') return;
    const asRitual = form.get('ritual') === '1';
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

/**
 * Resolve a cast from the dialog's answers, then write back and apply what it
 * did. This is everything the cast does once the GM has submitted, so it runs
 * and is tested without a browser.
 *
 * The pure `castSpell` resolver rolls the effect, and this function applies
 * the result and logs it. When a slot is spent, `withCasterState` splices the
 * change back onto the real entity, and the caller's `writeBack` function
 * stores it in the right collection. Damage or healing lands on each target
 * the same way a weapon hit does: every combatant tracks HP. A ritual spends
 * nothing and writes nothing back. A concentration spell cast by a party
 * character starts that character concentrating and ends whatever spell it
 * held before.
 * @param {AppContext} app
 * @param {CastPlan} plan
 * @param {Record<string, string>} values the dialog's answers
 * @param {{ writeBack: (next: any) => void, concentrates: boolean, rng?: () => number }} opts
 *   `writeBack` stores the updated entity. `concentrates` is true when this
 *   caster can hold a spell open. Only a party character can, because a
 *   creature has no concentration field. The call site passes
 *   this value, because it already knows the combatant kind. `rng` is the
 *   source for every roll the cast makes, injected the way the pure modules
 *   take theirs.
 */
export function resolveCast(app, plan, values, { writeBack, concentrates, rng = Math.random }) {
  const { entity, spell, caster, targets, saveAbility, sourceClass, dc, material } = plan;
  const asRitual = values.ritual === '1';
  const slotLevel = spell.level > 0 ? effectiveSlot(spell, values.slot, asRitual) : spell.level;
  const mode = /** @type {import('../types/dice.js').RollMode} */ (values.mode ?? 'normal');
  const saveDC = Number(values.dc) || dc;
  const chosen = chosenTargets(targets, values);
  if (spell.effect.kind !== 'utility' && chosen.length === 0) {
    app.toasts.show(`Pick at least one target for ${spell.name}.`);
    return;
  }
  // A missing component blocks the cast before the resolver runs, so a
  // refused cast never spends a slot. The check happens here, not in
  // `castSpell`, because the opt-out is a table ruling, not a rule of the spell.
  const enforce = material.required && values['ignore-components'] !== '1';
  if (enforce && !material.satisfied) {
    // A destroyed or costed material has to be the material itself. A
    // cost-free one names the focus first, because carrying a pouch covers
    // every such component at once.
    app.toasts.show(
      material.consumes || (spell.materials?.costGP ?? 0) > 0
        ? `${spell.name} needs ${spell.materials?.text}.`
        : `${spell.name} needs a component pouch or a focus, or ${spell.materials?.text}.`,
    );
    return;
  }
  // A target that carries its own bonus rolls that bonus. A foe with no save
  // the app can read falls back to the one number the GM typed for all such targets.
  const entered = Number(values['save-bonus']) || 0;
  // The caster view carries no conditions, so the chips come off the real
  // combatant. A Bless on the caster rides its spell attack rolls, and a
  // Blinded on it slants them.
  const casterConditions = entity.conditions ?? [];
  // The GM's dialog choice and the chips on the table are two sources of the
  // same slant, so they fold together under the cancel rule. Neither one
  // overrides the other.
  let castTargets = chosen;
  if (saveAbility) {
    castTargets = chosen.map((t) => {
      const outcome = saveOutcome(t.conditions, saveAbility);
      return {
        ...t,
        saveBonus: t.saveBonus ?? entered,
        saveMode: combineModes([mode, outcome.mode]) ?? 'normal',
        ...(outcome.failedBy ? { autoFailSave: outcome.failedBy } : {}),
      };
    });
  } else if (spell.effect.kind === 'attack') {
    // A touch spell reaches as far as a melee weapon does, which is the split
    // Prone needs. Every other range is a ranged attack.
    const melee = /touch/i.test(spell.range ?? '');
    castTargets = chosen.map((t) => ({
      ...t,
      attackMode:
        combineModes([
          mode,
          rollMode({ roller: casterConditions, target: t.conditions, kind: 'attack', melee }),
        ]) ?? 'normal',
    }));
  }

  const result = castSpell(caster, spell, {
    slotLevel,
    casterLevel: caster.level ?? 1,
    targets: castTargets,
    spellAttackBonus: spellAttackBonus(caster, sourceClass) ?? 0,
    saveDC,
    attackMode: spell.effect.kind === 'attack' ? mode : 'normal',
    ritual: asRitual,
    casterConditions,
    rng,
  });
  if (!result.ok) {
    // A dialog opened with only the ritual box submits with no slot to
    // spend. Unticking the ritual box is the one way to reach 'no-slot' from here.
    app.toasts.show(
      result.reason === 'no-slot'
        ? `No level ${spell.level}+ slot left for ${spell.name}.`
        : `Can't cast ${spell.name}.`,
    );
    return;
  }
  if (result.truncated > 0) {
    app.toasts.show(
      `${spell.name} reaches ${result.targets.length} at level ${result.slotLevel}; ` +
        `${result.truncated} dropped.`,
    );
  }

  // The code writes the spent slot, the consumed component, and the started
  // concentration back to the caster before it applies effects. This
  // prevents any of them from lingering if effect application throws an
  // error. Each change threads onto the same value and stores once:
  // `withCasterState` splices the decremented slot pools onto the real
  // entity, a stack of the material comes off the inventory, and the
  // concentration state and its chip land beside them.
  // Holding the material is not the same as spending it. A costed component
  // must be in hand and stays there.
  const consumed = enforce && material.consumes && material.item ? material.item : null;
  const holds = concentrates && spell.concentration;
  /** @type {import('../types/entities.js').ConcentrationState | null} */
  let displaced = null;
  if (result.spent || consumed || holds) {
    let next = result.spent ? withCasterState(entity, result.caster) : entity;
    // Only a Character reaches here with an inventory. `materialCheck`
    // already requires one.
    if (consumed) {
      next = removeItem(
        /** @type {import('../types/entities.js').Character} */ (next),
        consumed.id,
        1,
      );
    }
    if (holds) {
      const started = beginConcentration(
        /** @type {import('../types/entities.js').Character} */ (next),
        spell,
        result.slotLevel,
      );
      next = started.character;
      displaced = started.dropped;
    }
    writeBack(next);
    app.actions.markDirty();
  }
  if (consumed) {
    app.actions.logEvent(
      'note',
      formatInventoryEvent(caster.name, { verb: 'use', itemName: consumed.name, count: 1 }),
    );
  }
  // The clock counts watches, not minutes. The log states a ritual's extra
  // ten minutes for the GM to adjudicate, rather than advancing the clock.
  const at = result.ritual
    ? ' as a ritual (10 minutes longer)'
    : result.slotLevel > 0
      ? ` at level ${result.slotLevel}`
      : '';
  app.actions.logEvent('combat', `${caster.name} casts ${spell.name}${at}.`);
  // A caster holds one spell open at a time, so starting this spell ended
  // the previous effect. The table needs to know this rules consequence.
  // The creatures the displaced spell held go free before this cast's own
  // outcomes land, including when the caster recasts the same spell on someone new.
  if (displaced) {
    app.actions.logEvent(
      'combat',
      `${caster.name} stops concentrating on ${displaced.spellName} to hold ${spell.name}.`,
    );
    endSpellEffects(app, entity.id, displaced.spellId);
  }

  applyOutcomes(app, spell, result, entity.id);
}

/**
 * The shared cast pipeline behind both entry points. This mirrors
 * `weaponAttack`: `castPlan` works out what the dialog offers, the dialog
 * takes the slot level, the target, and the situational modes, and
 * `resolveCast` rolls and applies the cast. The dialog is the only part of
 * the pipeline that needs a browser.
 * @template {import('../types/entities.js').Character
 *   | import('../types/creature.js').Creature} T
 * @param {AppContext} app
 * @param {T} entity the real combatant that casts the spell
 * @param {Spell} spell
 * @param {import('./combatants.js').CombatTarget[]} offered
 * @param {(next: T) => void} writeBack stores the updated entity
 * @param {boolean} concentrates true when this caster can hold a spell open
 * @param {string | null} [preferredTargetId] a target picked before the
 *   dialog opened, from the combat board selection. The dialog pre-fills
 *   this target where it is offered.
 */
async function runCast(app, entity, spell, offered, writeBack, concentrates, preferredTargetId) {
  const plan = castPlan(app, entity, spell, offered);
  if (!plan.ok) {
    app.toasts.show(plan.message);
    return;
  }
  if (preferredTargetId) prefillTarget(plan.fields, preferredTargetId);
  const values = await promptModal(`Cast ${spell.name}`, plan.fields, {
    submitLabel: 'Cast',
    wide: true,
    onChange: castChangeHandler(plan),
  });
  if (!values) return;
  resolveCast(app, plan, values, { writeBack, concentrates });
}

/**
 * Point a cast dialog's target field at an already-picked target, in
 * whichever shape `castFields` chose: the single select value, the
 * multiselect one pre-checked box, or the whole allocation moved onto that
 * creature. The grid already opens with everything on its first row, so
 * this only changes which row holds the allocation. When no option offers
 * the id (for example, a picked ally under an attack spell, or a foe
 * defeated since), the field keeps its own default.
 * @param {import('../types/modal.js').ModalField[]} fields
 * @param {string} targetId
 */
export function prefillTarget(fields, targetId) {
  for (const field of fields) {
    if (field.name === 'target' && field.type === 'select') {
      if (field.options.some((o) => o.value === targetId)) field.value = targetId;
    } else if (field.name === 'targets' && field.type === 'multiselect') {
      if (field.options.some((o) => o.value === targetId)) field.value = targetId;
    } else if (field.name === 'allocation' && field.type === 'allocation') {
      if (field.rows.some((r) => r.value === targetId)) {
        field.value = `${targetId}:${field.total}`;
      }
    }
  }
}

/**
 * The targets the GM picked out of the dialog. The source is the allocation
 * grid's per-target projectile counts, the multiselect's comma-joined ids,
 * or the single select's one id. The function resolves these back to the
 * target objects in the order they were offered. It drops unknown ids
 * rather than trusting them. A target allocated no projectile is not a target.
 * @param {{ id: string, name: string, ac: number }[]} targets
 * @param {Record<string, string>} values
 * @returns {import('../entities/Casting.js').CastTarget[]}
 */
export function chosenTargets(targets, values) {
  if (values.allocation !== undefined) {
    const assigned = parseAssignments(values.allocation);
    return targets
      .filter((t) => Number(assigned[t.id]) > 0)
      .map((t) => ({ ...t, projectiles: Number(assigned[t.id]) }));
  }
  const raw = values.targets ?? values.target ?? '';
  const ids = new Set(splitTrimmedList(raw));
  return targets.filter((t) => ids.has(t.id));
}

/**
 * How a cast's targets read in a toast message. The function returns the
 * one name when a spell reached one creature, and a count when it reached
 * several.
 * @param {{ name?: string }[]} targets
 * @returns {string}
 */
export function targetSummary(targets) {
  if (targets.length === 1) return targets[0].name ?? '';
  return `${targets.length} targets`;
}

/**
 * The parenthetical a log line carries when the caster's chips changed the
 * roll, or an empty string when they did not. A multi-projectile cast passes
 * one entry per ray, because each ray rolls the riders again, and the rays
 * that rolled nothing drop out.
 * @param {({ note: string } | null | undefined)[]} riders
 * @returns {string}
 */
function riderNote(riders) {
  const notes = riders.filter((r) => r?.note).map((r) => /** @type {{ note: string }} */ (r).note);
  return notes.length > 0 ? ` (${notes.join('; ')})` : '';
}

/**
 * Apply and log a resolved cast's outcomes: attack hits and misses, save
 * results with full, half, or no damage, and healing. Each target gets its
 * own log line, so a multi-target cast is auditable roll by roll. The toast
 * carries the summary. Damage and healing route to the same HP models the
 * weapon path uses.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {{ outcomes: object[], targets: import('../entities/Casting.js').CastTarget[] }} result
 * @param {string} casterId the function stamps this id onto a condition this
 *   cast imposes, so the app can find the effect again when the caster stops
 *   holding the spell
 */
export function applyOutcomes(app, spell, result, casterId) {
  const kind = spell.effect.kind;
  const summary = targetSummary(result.targets);
  if (kind === 'attack') {
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      // A multi-projectile cast logs the tally, not one line per ray. The
      // rolls are already aggregated per creature, and the damage carries
      // every ray's dice.
      if (o.shots) {
        const tally = `${o.hits} of ${o.fired} hit ${o.target.name}`;
        // Each ray rolls the caster's riders again, so the line names every
        // ray's dice. The tally itself prints no to-hit numbers, and this is
        // the only place the rays' own rolls are recorded.
        const rode = riderNote(o.shots.map((/** @type {any} */ s) => s.rider));
        app.actions.logEvent(
          'combat',
          o.hits > 0
            ? `${spell.name}: ${tally}${rode} for ${o.damage.detail}.`
            : `${spell.name}: ${tally}${rode} (AC ${o.ac}).`,
        );
        applyToTarget(app, o.target.id, o.damage?.total ?? 0, false);
        continue;
      }
      const verb = o.crit ? 'critically hits' : o.hit ? 'hits' : 'misses';
      // A rider on the caster changed the number, so both outcomes say so.
      const rode = riderNote([o.rider]);
      if (!o.hit) {
        app.actions.logEvent(
          'combat',
          `${spell.name}: ${o.attack.total} to hit vs AC ${o.ac}${rode} — ${verb} ${o.target.name}.`,
        );
        continue;
      }
      app.actions.logEvent(
        'combat',
        `${spell.name} ${verb} ${o.target.name}${rode} for ${o.damage?.detail || '0 damage'}.`,
      );
      applyToTarget(app, o.target.id, o.damage?.total ?? 0, false);
    }
    app.toasts.show(`${spell.name} on ${summary}.`);
    return;
  }
  if (kind === 'save') {
    // A failed save's condition rides for as long as the spell lasts. The
    // structured duration gives this length in rounds. An open-ended
    // duration leaves the chip for the GM to clear.
    const rounds = durationInRounds(spell.duration);
    const effect = /** @type {import('../types/spell.js').SpellSaveEffect} */ (spell.effect);
    const ability = effect.saveAbility;
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      const verdict = o.saved ? 'saves' : 'fails';
      // The log names the bonus alongside the roll, the same way an attack
      // log names the ability and proficiency behind its number.
      const bonus = `${ability} ${formatModifier(o.target.saveBonus ?? 0)}`;
      // The chip records the cast that wrote it. This lets the app end the
      // effect when the caster stops holding the spell, and lets a repeated
      // save roll against it. The app uses the bonus stamped here only for a
      // target whose own save it cannot read. It re-derives a character's
      // bonus at retry time.
      const imposed = o.condition
        ? applyConditionToTarget(
            app,
            o.target.id,
            o.condition,
            rounds,
            {
              spellId: spell.id,
              spellName: spell.name,
              casterId,
              saveAbility: ability,
              saveDC: o.dc,
              saveBonus: o.target.saveBonus ?? 0,
              ...(effect.saveEnds ? { saveEnds: true } : {}),
            },
            o.conditionRider,
          )
        : false;
      const cond = o.condition ? `, ${o.condition}${imposed ? '' : ' (untracked)'}` : '';
      // A rider the target already held changed the roll, so the line states it.
      const rode = o.rider ? `, ${o.rider.note}` : '';
      // A chip that fails the save outright threw no die, so the line names
      // the chip where the roll would have gone.
      const detail = o.autoFailedBy ? o.autoFailedBy : `${bonus}${rode}: ${o.save.total}`;
      app.actions.logEvent(
        'combat',
        `${o.target.name} ${verdict} DC ${o.dc} (${detail}) — takes ${o.taken} damage${cond}.`,
      );
      applyToTarget(app, o.target.id, o.taken, false);
    }
    app.toasts.show(`${spell.name} on ${summary}.`);
    return;
  }
  if (kind === 'heal') {
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      app.actions.logEvent(
        'combat',
        `${spell.name} heals ${o.target.name} for ${o.healing.total} HP.`,
      );
      applyToTarget(app, o.target.id, o.healing.total, true);
    }
    app.toasts.show(`${spell.name} heals ${summary}.`);
    return;
  }
  if (kind === 'buff') {
    // A buff rolls nothing, so the whole cast is the chip it leaves. The chip
    // carries the same source a failed save writes, which is what lets
    // `endSpellEffects` sweep it when the caster stops concentrating.
    const rounds = durationInRounds(spell.duration);
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      const imposed = applyConditionToTarget(
        app,
        o.target.id,
        o.condition,
        rounds,
        { spellId: spell.id, spellName: spell.name, casterId },
        o.rider,
      );
      const adds = o.rider ? `: ${riderSummary(o.rider)}` : '';
      app.actions.logEvent(
        'combat',
        `${o.target.name} gains ${o.condition}${adds}${imposed ? '' : ' (untracked)'}.`,
      );
    }
    app.toasts.show(`${spell.name} on ${summary}.`);
    return;
  }
  app.toasts.show(`${spell.name} cast.`);
}
