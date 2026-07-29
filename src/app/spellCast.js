import { promptModal } from '../ui/Modal.js';
import { parseAssignments } from '../ui/ModalFields.js';
import { castSpell, materialCheck, maxTargets, scalingSteps } from '../entities/Casting.js';
import { removeItem, spellSource } from '../entities/Character.js';
import { formatInventoryEvent } from '../entities/InventoryLog.js';
import { spellSaveDC, spellAttackBonus, hasRitualCasting } from '../entities/Classes.js';
import { formatModifier } from '../entities/Modifiers.js';
import { encountersOnTile } from '../entities/Encounter.js';
import { npcsOnTile } from '../entities/NPC.js';
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
  endSpellEffects,
} from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The combatants a spell can target, by effect kind: an attack or a save spell
 * reaches the caster's foes; a heal reaches its own side (allies, including the
 * caster). Utility spells target no one. The list itself comes from the shared
 * `combatantsAsTargets` assembly over combat's running order.
 * @param {AppContext} app
 * @param {CombatState} combat
 * @param {Participant} caster
 * @param {Spell} spell
 * @returns {{ id: string, name: string, ac: number }[]}
 */
function combatTargets(app, combat, caster, spell) {
  const kind = spell.effect.kind;
  if (kind === 'utility') return [];
  return combatantsAsTargets(app, combat, caster, { allies: kind === 'heal' });
}

/**
 * The combatants an out-of-combat cast can reach, with no initiative order to
 * scope by: a heal reaches the whole party (allies, caster included); an attack
 * or save reaches the foes standing where the party stands — the undefeated
 * encounters staged on its tile plus the NPCs on it. Utility spells target no
 * one. Same target shape as `combatTargets`.
 *
 * The party's tile is as close to a range check as the app gets, since there is
 * no distance between two tokens to measure. Without it a cast offered every
 * encounter in the campaign, including ones in regions the party has never
 * reached.
 * @param {AppContext} app
 * @param {Spell} spell
 * @returns {{ id: string, name: string, ac: number }[]}
 */
function rosterTargets(app, spell) {
  const { state } = app;
  const kind = spell.effect.kind;
  if (kind === 'utility') return [];
  if (kind === 'heal') {
    return state.characters.map((c) => asTarget(c, 'character'));
  }
  const position = app.partyTracker.getPosition();
  const foes = encountersOnTile(state.encounters, position).map((e) => asTarget(e, 'encounter'));
  const npcs = npcsOnTile(state.npcs, position).map((n) => asTarget(n, 'npc'));
  return [...foes, ...npcs];
}

/**
 * How a target reads in the picker: the number the cast rolls against, since
 * that is what the choice turns on. An attack rolls against AC; a save rolls
 * against the target's own bonus in the spell's ability, shown where the app
 * knows it and left off a foe whose save the GM is about to type in; a heal
 * rolls against nothing, so the name stands alone.
 * @param {Spell} spell
 * @param {import('./combatants.js').CombatTarget} target
 * @returns {string}
 */
function targetLabel(spell, target) {
  const kind = spell.effect.kind;
  if (kind === 'heal') return target.name;
  if (kind === 'save') {
    if (target.saveBonus === undefined) return target.name;
    return `${target.name} (${spell.effect.saveAbility} ${formatModifier(target.saveBonus)})`;
  }
  return `${target.name} (AC ${target.ac})`;
}

/** The allocation grid's caption, restated when the slot level changes how many
 * projectiles a cast fires.
 * @param {number} total @returns {string} */
function allocationLabel(total) {
  return `Targets (${total} to allocate)`;
}

/**
 * The slot level a cast dialog opens on: the lowest slot the caster can spend,
 * which is what the picker shows first and what a GM who never touches it
 * submits. Cantrips have no slot, so 0.
 * @param {Spell} spell
 * @param {number[]} slotLevels
 * @returns {number}
 */
export function startingSlotLevel(spell, slotLevels) {
  return spell.level > 0 ? (slotLevels[0] ?? spell.level) : 0;
}

/**
 * The level a cast resolves at: the picked slot, or the spell's own level when it
 * is being cast as a ritual — a ritual trades the slot for the time, so there is
 * no slot to upcast from. Falls back to the spell's level when nothing is picked,
 * which is what a dialog with no slot picker submits.
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
 * How many creatures — or, for a multi-projectile spell, projectiles — a cast at
 * this slot level reaches. Read at the level actually being cast, since a cap
 * taken from a higher slot offers a projectile the cast cannot fire.
 * @param {Spell} spell
 * @param {number} slotLevel
 * @param {number} casterLevel
 * @returns {number}
 */
export function castCap(spell, slotLevel, casterLevel) {
  return maxTargets(spell, scalingSteps(spell, slotLevel, casterLevel));
}

/**
 * The pre-roll dialog fields for a cast: a slot-level picker (leveled spells
 * cast at or above their level from a slot the caster still has), the target or
 * targets, an advantage/disadvantage mode, and — for a save spell — the DC and
 * the target's save bonus. Cantrips omit the slot picker; utility spells add no
 * target. Returns null when the caster has no usable slot for a leveled spell.
 *
 * A spell that reaches one creature keeps a single select, so the common case
 * stays one click. A spell that reaches more gets the checkbox group, capped at
 * what the spell allows — an area spell has no cap, so the GM picks whoever the
 * blast covers. A multi-projectile spell gets the allocation grid instead, since
 * a checkbox cannot say "two rays here, one there"; it doubles as the target
 * picker, a creature given no projectile being one the cast never touches.
 *
 * A ritual cast spends no slot, so a caster out of slots can still make one:
 * the slot picker is left out rather than the whole dialog refused, and the
 * ritual box opens ticked because that is the only cast still available.
 *
 * A save spell's DC is offered for editing, and so is a bonus for the targets
 * whose own save the app cannot read. A target that carries a `saveBonus` rolls
 * that instead, and the picker shows it, so the field is left out when every
 * target has one.
 * @param {Spell} spell
 * @param {import('./combatants.js').CombatTarget[]} targets
 * @param {number[]} slotLevels available slot levels at or above the spell's
 * @param {number} saveDC
 * @param {number} cap how many targets this cast may reach; Infinity for an area
 * @param {{ material?: boolean, ritual?: boolean }} [opts] `material`: the cast
 *   will consume a material component, which adds the opt-out a table that
 *   hand-waves components casts through. `ritual`: this caster may cast this
 *   spell as a ritual, which adds the box that trades the slot for the time.
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
    // Sits beside the slot picker it governs: ticking it hides that picker,
    // since a ritual always resolves at the spell's own level.
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
    const noun = kind === 'heal' ? 'Recipient' : 'Target';
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
        // The whole allocation starts on the first target, so a single-target
        // cast is still one click.
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
    // The hand-entered bonus covers only the targets whose own save the app
    // cannot read, so a cast whose every target has one does not ask for it.
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
  // Ticking this casts without touching the inventory, so a table that treats
  // components as flavor is not made to stock diamonds to cast Revivify.
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
 * Cast a spell for the active combatant, mirroring `weaponAttack`: the targets
 * come from the initiative order (foes for attack/save, the party for heal),
 * then `runCast` runs the pre-roll dialog, resolves, and applies. The caster is
 * whichever combatant holds the participant's id — resolved by the shared
 * `findCombatant`, whose `store` writes the spent slot back to that
 * combatant's own collection.
 * @param {AppContext} app
 * @param {CombatState} combat
 * @param {Participant} participant
 * @param {Spell} spell
 */
export async function castSpellAction(app, combat, participant, spell) {
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
  );
}

/**
 * Cast a spell from a character's sheet outside of combat: the targets come
 * from the roster and nearby foes (no initiative order), then `runCast` handles
 * the dialog, resolution, and application exactly as the combat path does.
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
 * The shared cast pipeline behind both entry points, mirroring `weaponAttack`:
 * a pre-roll dialog picks the slot level, target, and situational modes, then
 * the pure `castSpell` resolver rolls the effect and this wiring applies the
 * result and logs it. A caster with no spell ability falls back to a flat DC 10
 * / +0 attack. The caster entity is read through `toCaster` so a party
 * Character, a foe Encounter, and an NPC all resolve the same way; when a slot
 * is spent, `withCasterState` splices it back onto the real entity and the
 * caller's `writeBack` stores it in the right collection. Damage or healing
 * lands on each target the same way a weapon hit does — encounters and
 * characters track HP, an HP-less NPC keeps the log line only. A spell with a
 * ritual, cast by a class that has ritual casting, can be cast for the extra ten
 * minutes instead of a slot, which spends nothing and writes nothing back. A
 * concentration spell cast by a party character starts that character
 * concentrating, ending whatever was already held.
 * @template {import('../types/entities.js').Character
 *   | import('../types/entities.js').Encounter
 *   | import('../types/npc.js').NPC} T
 * @param {AppContext} app
 * @param {T} entity the real combatant casting
 * @param {Spell} spell
 * @param {import('./combatants.js').CombatTarget[]} offered
 * @param {(next: T) => void} writeBack stores the updated entity
 * @param {boolean} concentrates whether this caster can hold a spell open —
 *   only a party character does, since an encounter and an NPC have no
 *   concentration field to write. Passed from the call site rather than sniffed
 *   off the entity, which is where the combatant's kind is already known.
 */
async function runCast(app, entity, spell, offered, writeBack, concentrates) {
  // The pure spell helpers take a `SpellCaster` — a caster's class/level/stats/
  // resources/spellbook, which is exactly what `toCaster` surfaces — so the view
  // is what they read and the real entity is only written back to.
  const caster = toCaster(entity);
  if (spell.effect.kind !== 'utility' && offered.length === 0) {
    app.toasts.show('No target available.');
    return;
  }
  // A save spell's targets each get their own bonus where the app can read one,
  // so the dialog shows what a target will add and the resolver rolls it. The
  // decoration happens once here rather than in the two target assemblies, since
  // the ability being saved against is a property of the spell, not the target.
  const saveAbility = spell.effect.kind === 'save' ? spell.effect.saveAbility : null;
  const targets = saveAbility
    ? offered.map((t) => {
        const bonus = targetSaveBonus(app, t.id, saveAbility);
        return bonus === undefined ? t : { ...t, saveBonus: bonus };
      })
    : offered;

  // Leveled spells cast from a slot at or above their level that still has a
  // charge — leveled or pact; the picker offers each such level.
  const slotLevels = spell.level > 0 ? castableSlotLevels(caster, spell.level) : [];
  // A multiclass caster's DC/attack use the class the spell was learned
  // under; without a recorded source they fall back to the first caster class.
  const sourceClass = spellSource(caster, spell.id) ?? undefined;
  const dc = spellSaveDC(caster, sourceClass) ?? 10;
  // Both caps are read at the level the picker starts on — the lowest slot the
  // caster can spend, which is also the level submitted if the GM never touches
  // it. The projectile allocation then follows the picked level, since it has to
  // add up exactly; the target checkboxes stay at the starting cap and a cast
  // over it drops the extras, which `castSpell` reports back.
  const cap = castCap(spell, startingSlotLevel(spell, slotLevels), caster.level ?? 1);
  // Read against the real entity rather than the caster view, which surfaces no
  // inventory: a combatant with none is never asked for a component. Only a
  // Character has one, and the check's own contract is that an entity without it
  // needs nothing, so the three combatant shapes go in as one.
  const material = materialCheck(
    /** @type {{ inventory?: import('../types/entities.js').InventoryItem[] }} */ (
      /** @type {unknown} */ (entity)
    ),
    spell,
  );
  // Ritual casting is a class feature, so a spell that has a ritual is only
  // castable as one by a bard, cleric, druid, or wizard.
  const ritualOffered = spell.ritual && spell.level > 0 && hasRitualCasting(caster);
  const fields = castFields(spell, targets, slotLevels, dc, cap, {
    material: material.required,
    ritual: ritualOffered,
  });
  if (!fields) {
    app.toasts.show(`No level ${spell.level}+ slot left for ${spell.name}.`);
    return;
  }

  // A projectile spell fires a different number per slot level, and its
  // allocation has to add up to that number, so the grid is restated whenever
  // the level changes — including when the ritual box changes it, since a ritual
  // resolves at the spell's own level whatever the picker says.
  const allocates = fields.some((f) => f.name === 'allocation');
  const values = await promptModal(`Cast ${spell.name}`, fields, {
    submitLabel: 'Cast',
    wide: true,
    onChange: (name, form) => {
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
    },
  });
  if (!values) return;

  const asRitual = values.ritual === '1';
  const slotLevel = spell.level > 0 ? effectiveSlot(spell, values.slot, asRitual) : spell.level;
  const mode = /** @type {import('../types/dice.js').RollMode} */ (values.mode ?? 'normal');
  const saveDC = Number(values.dc) || dc;
  const chosen = chosenTargets(targets, values);
  if (spell.effect.kind !== 'utility' && chosen.length === 0) {
    app.toasts.show(`Pick at least one target for ${spell.name}.`);
    return;
  }
  // A missing component blocks before the resolver runs, so a refused cast never
  // spends a slot. Checked here rather than in `castSpell` because the opt-out is
  // a table's ruling, not a rule of the spell.
  const consume = material.required && values['ignore-components'] !== '1';
  if (consume && !material.satisfied) {
    app.toasts.show(`${spell.name} needs ${spell.materials?.text}.`);
    return;
  }
  // A target carrying its own bonus rolls that; a foe with no save surface to
  // read falls back to the one number the GM typed for all of them.
  const entered = Number(values['save-bonus']) || 0;
  const castTargets = saveAbility
    ? chosen.map((t) => ({ ...t, saveBonus: t.saveBonus ?? entered, saveMode: mode }))
    : chosen;

  const result = castSpell(caster, spell, {
    slotLevel,
    casterLevel: caster.level ?? 1,
    targets: castTargets,
    spellAttackBonus: spellAttackBonus(caster, sourceClass) ?? 0,
    saveDC,
    attackMode: spell.effect.kind === 'attack' ? mode : 'normal',
    ritual: asRitual,
  });
  if (!result.ok) {
    // A dialog opened on the ritual box alone submits with no slot to spend, so
    // unticking it is the one way to reach 'no-slot' from here.
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

  // Write the spent slot, the consumed component, and the started concentration
  // back to the caster before applying effects, so none of them lingers if the
  // effect application throws. Each is threaded onto the same value and stored
  // once: `withCasterState` splices the decremented slot pools onto the real
  // entity, a stack of the material comes off the inventory, and the
  // concentration state and its chip land beside them.
  const consumed = consume && material.item ? material.item : null;
  const holds = concentrates && spell.concentration;
  /** @type {import('../types/entities.js').ConcentrationState | null} */
  let displaced = null;
  if (result.spent || consumed || holds) {
    let next = result.spent ? withCasterState(entity, result.caster) : entity;
    // Only a Character reaches here holding an inventory, which is what
    // `materialCheck` requiring one already established.
    if (consumed) {
      next = /** @type {T} */ (
        removeItem(/** @type {import('../types/entities.js').Character} */ (next), consumed.id, 1)
      );
    }
    if (holds) {
      const started = beginConcentration(
        /** @type {import('../types/entities.js').Character} */ (next),
        spell,
        result.slotLevel,
      );
      next = /** @type {T} */ (started.character);
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
  // The clock counts watches, not minutes, so a ritual's extra ten minutes is
  // stated in the log for the GM to adjudicate rather than advanced.
  const at = result.ritual
    ? ' as a ritual (10 minutes longer)'
    : result.slotLevel > 0
      ? ` at level ${result.slotLevel}`
      : '';
  app.actions.logEvent('combat', `${caster.name} casts ${spell.name}${at}.`);
  // A caster holds one spell open at a time, so starting this one ended the
  // previous effect; that is a rules consequence the table needs told about, and
  // the creatures the displaced spell was holding go free before this cast's own
  // outcomes land — including when the same spell is being recast on someone new.
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
 * The targets the GM picked out of the dialog: the allocation grid's per-target
 * projectile counts, the multiselect's comma-joined ids, or the single select's
 * one id, resolved back to the target objects in the order they were offered.
 * Unknown ids are dropped rather than trusted, and a target allocated no
 * projectile is not a target.
 * @param {{ id: string, name: string, ac: number }[]} targets
 * @param {Record<string, string>} values
 * @returns {import('../entities/Casting.js').CastTarget[]}
 */
function chosenTargets(targets, values) {
  if (values.allocation !== undefined) {
    const assigned = parseAssignments(values.allocation);
    return targets
      .filter((t) => Number(assigned[t.id]) > 0)
      .map((t) => ({ ...t, projectiles: Number(assigned[t.id]) }));
  }
  const raw = values.targets ?? values.target ?? '';
  const ids = new Set(
    String(raw)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
  return targets.filter((t) => ids.has(t.id));
}

/**
 * How a cast's targets read in a toast: the one name when a spell reached one
 * creature, a count when it reached several.
 * @param {{ name?: string }[]} targets
 * @returns {string}
 */
function targetSummary(targets) {
  if (targets.length === 1) return targets[0].name ?? '';
  return `${targets.length} targets`;
}

/**
 * Apply and log a resolved cast's outcomes: attack hits/misses, save results
 * with full/half/no damage, and healing. Each target gets its own log line, so a
 * multi-target cast is auditable roll by roll; the toast carries the summary.
 * Damage and healing route to the same HP models the weapon path uses.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {{ outcomes: object[], targets: import('../entities/Casting.js').CastTarget[] }} result
 * @param {string} casterId stamped onto a condition this cast imposes, so the
 *   effect can be found again when the caster stops holding the spell
 */
function applyOutcomes(app, spell, result, casterId) {
  const kind = spell.effect.kind;
  const summary = targetSummary(result.targets);
  if (kind === 'attack') {
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      // A multi-projectile cast logs the tally rather than one line per ray: the
      // rolls are already aggregated per creature, and the damage carries every
      // ray's dice.
      if (o.shots) {
        const tally = `${o.hits} of ${o.fired} hit ${o.target.name}`;
        app.actions.logEvent(
          'combat',
          o.hits > 0
            ? `${spell.name}: ${tally} for ${o.damage.detail}.`
            : `${spell.name}: ${tally} (AC ${o.ac}).`,
        );
        applyToTarget(app, o.target.id, o.damage?.total ?? 0, false);
        continue;
      }
      const verb = o.crit ? 'critically hits' : o.hit ? 'hits' : 'misses';
      if (!o.hit) {
        app.actions.logEvent(
          'combat',
          `${spell.name}: ${o.attack.total} to hit vs AC ${o.ac} — ${verb} ${o.target.name}.`,
        );
        continue;
      }
      app.actions.logEvent(
        'combat',
        `${spell.name} ${verb} ${o.target.name} for ${o.damage?.detail || '0 damage'}.`,
      );
      applyToTarget(app, o.target.id, o.damage?.total ?? 0, false);
    }
    app.toasts.show(`${spell.name} on ${summary}.`);
    return;
  }
  if (kind === 'save') {
    // A failed save's condition rides for as long as the spell lasts, which the
    // structured duration gives in rounds; an open-ended duration leaves the
    // chip for the GM to clear.
    const rounds = durationInRounds(spell.duration);
    const effect = /** @type {import('../types/spell.js').SpellSaveEffect} */ (spell.effect);
    const ability = effect.saveAbility;
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      const verdict = o.saved ? 'saves' : 'fails';
      // The bonus is named alongside the roll, the way an attack's log names the
      // ability and proficiency behind its number.
      const bonus = `${ability} ${formatModifier(o.target.saveBonus ?? 0)}`;
      // The chip records the cast that wrote it, which is what ends the effect
      // when the caster stops holding the spell, and what a repeated save rolls
      // against. The bonus stamped here is only ever used for a target whose own
      // save the app cannot read; a character's is re-derived at retry time.
      const imposed = o.condition
        ? applyConditionToTarget(app, o.target.id, o.condition, rounds, {
            spellId: spell.id,
            spellName: spell.name,
            casterId,
            saveAbility: ability,
            saveDC: o.dc,
            saveBonus: o.target.saveBonus ?? 0,
            ...(effect.saveEnds ? { saveEnds: true } : {}),
          })
        : false;
      const cond = o.condition ? `, ${o.condition}${imposed ? '' : ' (untracked)'}` : '';
      app.actions.logEvent(
        'combat',
        `${o.target.name} ${verdict} DC ${o.dc} (${bonus}: ${o.save.total}) — takes ${o.taken} damage${cond}.`,
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
  app.toasts.show(`${spell.name} cast.`);
}
