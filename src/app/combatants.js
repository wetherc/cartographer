import { indexById } from '../util/indexById.js';
import { memoizeByIdentity } from '../util/memoize.js';
import { effectiveStatBlock } from '../entities/Creature.js';
import { armorClass, unproficientWear } from '../entities/Armor.js';
import { equippedWeapons } from '../entities/Equipment.js';
import { getHP, getSpellbook } from '../entities/Character.js';
import { featRiders } from '../entities/FeatChoices.js';
import { saveBonus } from '../entities/Checks.js';
import { creatureSaveBonus } from '../entities/CreatureChecks.js';
import { applyDefenses, defensesOf } from '../entities/DamageDefenses.js';
import { replaceById } from '../entities/Roster.js';
import { castableLeveledIds } from '../entities/SpellView.js';
import { invocationSpellIds, invokedSpell } from '../entities/Invocations.js';
import { arcanumSpellIds } from '../entities/MysticArcanum.js';
import { resolveSpellIds } from '../library/Library.js';
import { sideOf, isDowned } from '../combat/CombatView.js';
import { labelsFor } from '../combat/DisplayNames.js';
import { spellbookIds } from './casterFields.js';
import { pruneCreatureLinks } from './questCleanup.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/combat.js').Participant} Participant */

/**
 * Combatant is the resolved holder for a participant id: the entity, the
 * collection it lives in, and a store function. Store writes an updated copy
 * back to the collection and refreshes the panels that show it. Combat code
 * uses this one shape to act on any participant id, without a separate lookup
 * for characters and creatures. `label` is the name that log lines use, with
 * the number that tells two foes of one name apart ("Gray Wolf 2").
 * @typedef {(
 *   { kind: 'character', entity: Character, label: string, store: (next: Character) => void }
 *   | { kind: 'creature', entity: Creature, label: string, store: (next: Creature) => void }
 * )} Combatant
 */

/**
 * CombatTarget is the shape combat dialogs and the spell resolver use. It
 * gives enough data to pick a target from a list (name), address the result
 * (id), and roll against it (ac). Every target carries `conditions`, the
 * chips it holds, because a rider on one of them rides a save it takes and
 * because a chip such as Prone slants the attack roll made against it. Only
 * chips go in `conditions`: the effect table reads the list by name, and a
 * feat that happened to share a condition's name must not slant a roll. A
 * character target's feat riders travel separately in `riders`. A save
 * spell's targets carry `saveBonus`, which the app derives for a character and
 * for a creature alike. See `targetSaveBonus`. `armorPenalty` marks a character
 * that rolls a STR or DEX save at disadvantage because it wears armor it is
 * not trained for. See `targetArmorPenalty`. `label` is the name a picker
 * shows, numbered when two targets share a name, and `ally` marks a target
 * on the actor's own side in a hostile list.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   label?: string,
 *   ally?: boolean,
 *   ac: number,
 *   saveBonus?: number,
 *   armorPenalty?: boolean,
 *   conditions: import('../types/entities.js').Condition[],
 *   riders?: import('../entities/Riders.js').RiderSource[],
 * }} CombatTarget
 */

/**
 * memoizedIndex builds id-index Maps for the combat collections, cached per
 * array. Every mutation path replaces `state.characters` or `state.creatures`
 * immutably through `replaceById`. An index keyed on the array object can
 * never serve a stale read: this is the TileIndex pattern applied to rosters.
 * Lookups during a fight run at O(1), instead of a `.find` call per
 * participant per click.
 * @type {(items: readonly { id: string }[]) => Map<string, { id: string }>}
 */
const memoizedIndex = memoizeByIdentity(indexById);

/**
 * @template {{ id: string }} T
 * @param {readonly T[]} items
 * @returns {Map<string, T>}
 */
function cachedIndex(items) {
  return /** @type {Map<string, T>} */ (memoizedIndex(items));
}

/**
 * Every id already taken across the two combat rosters. A new character or
 * creature slugs its id against this list, not only against its own roster.
 * `findCombatant` resolves an id over both collections with the character
 * checked first, so a creature sharing a character's id would receive that
 * character's damage and conditions.
 * @param {AppContext['state']} state
 * @returns {string[]}
 */
export function rosterIds(state) {
  return [...state.characters, ...state.creatures].map((e) => e.id);
}

/**
 * The display names of the given ids, with a number after each name that
 * repeats among them ("Gray Wolf 1", "Gray Wolf 2"). The numbers follow the
 * campaign's own order, the characters and then the creatures, so a
 * creature keeps its number from the setup dialog into the fight.
 * @param {AppContext} app
 * @param {Iterable<string>} ids
 * @returns {Map<string, string>}
 */
export function combatLabels(app, ids) {
  return labelsFor([...app.state.characters, ...app.state.creatures], ids);
}

/**
 * Resolve a combat participant id to the entity that holds it: a party
 * character, then a creature, checked in that order. Also return a store
 * function that writes an updated copy back to the right collection and
 * refreshes the matching panels. Callers must mark the campaign dirty
 * themselves. Store only persists and refreshes.
 *
 * A creature resolves wherever it stands. A creature moved off the fight's
 * tile still renders by name, and `syncCombatLocation` is what ends a fight
 * whose tile empties.
 * @param {AppContext} app
 * @param {string} id
 * @returns {Combatant | null}
 */
export function findCombatant(app, id) {
  const { state } = app;
  const character = /** @type {Character | undefined} */ (cachedIndex(state.characters).get(id));
  if (character) {
    return {
      kind: 'character',
      entity: character,
      get label() {
        return labelOf(app, character);
      },
      store: (next) => {
        state.characters = replaceById(state.characters, next);
        app.actions.refreshSelectedCharacter();
        // The combat screen shows the character's HP and conditions. The
        // creature branch reaches it through commitCreatures instead.
        app.views.combatScreen.update();
      },
    };
  }
  const creature = /** @type {Creature | undefined} */ (cachedIndex(state.creatures).get(id));
  if (creature) {
    return {
      kind: 'creature',
      entity: creature,
      get label() {
        return labelOf(app, creature);
      },
      store: (next) => {
        state.creatures = replaceById(state.creatures, next);
        commitCreatures(app, { dirty: false });
      },
    };
  }
  return null;
}

/**
 * Refresh every view that shows a creature, after a write to
 * `state.creatures`. The quest links to a deleted creature go first, so
 * every delete path removes them. Map markers refresh next. That call also rebuilds both
 * Build-rail authoring lists, which show the same node scope. Then the two
 * sidebar panels refresh, then the initiative panel: authoring, moving,
 * spawning, or defeating a creature on the party's tile can start or end a
 * fight, and the initiative wrapper refreshes the combat screen with it.
 * Pass `panel: false` from an encounter-list handler, which re-renders its
 * own rows once the handler finishes. Pass `dirty: false` when the caller
 * marks the campaign dirty itself.
 * @param {AppContext} app
 * @param {{ panel?: boolean, dirty?: boolean }} [options]
 */
export function commitCreatures(app, { panel = true, dirty = true } = {}) {
  pruneCreatureLinks(app);
  app.actions.syncCreatureMarkers();
  if (panel) app.views.encounterPanel.update();
  app.views.npcPanel.update();
  // Deleting the last hostile creature staged on the party's tile ends the
  // fight. Damaging one to defeat does not, because defeated creatures stay
  // staged.
  app.actions.syncCombatLocation();
  app.views.initiativePanel.update();
  if (dirty) app.actions.markDirty();
}

/**
 * describeCombatant gives the name and side of whatever entity holds a
 * participant id, read fresh each call. It returns null when nothing holds
 * the id any more, because the entity was deleted mid-fight. The initiative
 * order does not store the name or side. This makes a rename or a
 * disposition change during a fight show up on the next render.
 * @param {AppContext} app
 * @param {string} id
 * @returns {import('../types/combat.js').ParticipantView | null}
 */
export function describeCombatant(app, id) {
  const found = findCombatant(app, id);
  return found ? { name: found.entity.name, side: sideOf(found) } : null;
}

/**
 * Project an entity into the shared CombatTarget shape. Use a creature's
 * effective AC (armor and stat modifiers applied) or a character's armor AC.
 * The chips come along, so an attack roll against this target can read them
 * without a second lookup.
 * @param {Character | Creature} entity
 * @param {Combatant['kind']} kind
 * @returns {CombatTarget}
 */
export function asTarget(entity, kind) {
  const ac =
    kind === 'character'
      ? armorClass(/** @type {Character} */ (entity))
      : effectiveStatBlock(/** @type {Creature} */ (entity)).AC;
  return { id: entity.id, name: entity.name, ac, conditions: entity.conditions ?? [] };
}

/**
 * targetSaveBonus gives the save bonus a target rolls with: the ability
 * modifier plus proficiency where the target is trained in that save. Both
 * kinds of combatant derive one, from the module that owns their shape. The
 * function returns undefined only for an id nothing holds any more, which is a
 * target deleted while the cast dialog sat open.
 * @param {AppContext} app
 * @param {string} id
 * @param {string} ability
 * @returns {number | undefined}
 */
export function targetSaveBonus(app, id, ability) {
  const found = findCombatant(app, id);
  if (!found) return undefined;
  return combatantSaveBonus(found, ability);
}

/**
 * The save bonus an already-resolved combatant rolls with, dispatched to the
 * module that owns its shape.
 * @param {Combatant} found
 * @param {string} ability
 * @returns {number}
 */
export function combatantSaveBonus(found, ability) {
  return found.kind === 'character'
    ? saveBonus(found.entity, ability)
    : creatureSaveBonus(found.entity, ability);
}

/**
 * targetConditions gives the condition chips a combatant is holding, so a
 * rider on one of them can ride the roll a cast makes it take, and so a chip
 * such as Restrained can slant that roll. Chips only: a feat rider must stay
 * out of the lists the condition-effect table scans by name, and
 * `targetFeatRiders` carries it instead. An unknown id has none, so it reads
 * as an empty list.
 * @param {AppContext} app
 * @param {string} id
 * @returns {import('../types/entities.js').Condition[]}
 */
export function targetConditions(app, id) {
  const found = findCombatant(app, id);
  return found ? (found.entity.conditions ?? []) : [];
}

/**
 * The damage a combatant takes from one hit after its resistances,
 * vulnerabilities, and immunities (see `DamageDefenses.applyDefenses`), and
 * the defenses that changed it, for the log. An unknown id has no defenses.
 * @param {AppContext} app
 * @param {string} id
 * @param {import('../dice/DiceRoller.js').DamageGroup[]} groups
 * @param {{ halve?: boolean, nonmagical?: boolean }} [options] `nonmagical`
 *   marks a hit from a nonmagical weapon, which Stoneskin resists
 * @returns {{ total: number, notes: string[] }}
 */
export function defendedDamage(app, id, groups, options = {}) {
  const found = findCombatant(app, id);
  const defenses = defensesOf(found?.entity ?? {}, { nonmagical: !!options.nonmagical });
  return applyDefenses(groups, defenses, { halve: !!options.halve });
}

/**
 * targetFeatRiders gives the standing feat riders a combatant carries, for
 * the save a cast makes it roll. Only a character can take feats, so a
 * creature or an unknown id reads as an empty list.
 * @param {AppContext} app
 * @param {string} id
 * @returns {import('../entities/Riders.js').RiderSource[]}
 */
export function targetFeatRiders(app, id) {
  const found = findCombatant(app, id);
  if (!found || found.kind !== 'character') return [];
  return featRiders(found.entity);
}

/**
 * targetArmorPenalty says whether a target rolls STR and DEX saves at
 * disadvantage because it wears armor it is not trained for. Only a party
 * character can, because only a character tracks worn gear against
 * proficiency lists. An unknown id has no penalty.
 * @param {AppContext} app
 * @param {string} id
 * @returns {boolean}
 */
export function targetArmorPenalty(app, id) {
  const found = findCombatant(app, id);
  return found?.kind === 'character'
    ? unproficientWear(/** @type {Character} */ (found.entity)).length > 0
    : false;
}

/**
 * weaponsOf gives the weapons a combatant can attack with: a party
 * character's equipped weapons, or the one weapon a creature was given. An
 * unarmed creature has nothing to swing, and so does an id that resolves to
 * nothing.
 * @param {AppContext} app
 * @param {string} id
 * @returns {(import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon)[]}
 */
export function weaponsOf(app, id) {
  const found = findCombatant(app, id);
  if (!found) return [];
  if (found.kind === 'character') return equippedWeapons(found.entity);
  return found.entity.weapon ? [found.entity.weapon] : [];
}

/**
 * spellsOf gives a combatant's castable spells, resolved from the spellbook
 * ids through the merged library's memoized index. A party character lists
 * its cantrips plus what its classes' known-rule makes castable, and the
 * spells its warlock invocations cast, each as the invocations change it. Its
 * Mystic Arcanum spells list too. A
 * prepared caster's unprepared spells stay off the list. A creature lists its whole
 * spellbook, because its authoring dialog marks every picked spell as
 * castable. A non-caster's empty spellbook lists nothing.
 * @param {AppContext} app
 * @param {string} id
 * @returns {import('../types/spell.js').Spell[]}
 */
export function spellsOf(app, id) {
  const found = findCombatant(app, id);
  if (!found) return [];
  if (found.kind === 'character') {
    const character = found.entity;
    const book = getSpellbook(character);
    const known = new Set([...book.cantrips, ...castableLeveledIds(character)]);
    const ids = [...known, ...invocationSpellIds(character), ...arcanumSpellIds(character)];
    // A spell the caster also knows lists as the book has it, because the cast
    // dialog offers the at-will cast as a choice and rewrites it there.
    return resolveSpellIds([...new Set(ids)]).map((spell) =>
      invokedSpell(character, spell, { atWill: !known.has(spell.id) }),
    );
  }
  const book = getSpellbook(found.entity);
  return resolveSpellIds(spellbookIds(book));
}

/**
 * Assemble the combatants an action can target, from the running order. By
 * default, the action targets the acting participant's foes, plus every
 * other creature in the fight: a bystander lines up beside the party, but a
 * party that turns on it is not stopped. A character on the actor's own
 * side stays out of the hostile list. For a heal, the action targets its
 * own side, including the actor, as allies. Downed combatants drop out of a
 * hostile list but stay eligible as allies, because a heal's whole point
 * can be the downed combatant. This function resolves sides per
 * participant, not from the order, so a creature that turns hostile
 * mid-fight becomes targetable as one. An actor whose own entity is gone can
 * target nothing.
 *
 * A hostile list puts the actor's foes first and marks the creatures on its
 * own side as `ally`, so a wolf's bite opens on the party and its packmate
 * sits apart at the end. Each target carries its numbered `label`.
 * @param {AppContext} app
 * @param {CombatState} combat
 * @param {Participant} actor
 * @param {{ allies?: boolean }} [options]
 * @returns {CombatTarget[]}
 */
export function combatantsAsTargets(app, combat, actor, { allies = false } = {}) {
  const actorSide = describeCombatant(app, actor.id)?.side;
  if (!actorSide) return [];
  const labels = combatLabels(
    app,
    combat.order.map((p) => p.id),
  );
  /** @param {Combatant} found @param {boolean} ally */
  const target = (found, ally) => ({
    ...asTarget(found.entity, found.kind),
    label: labels.get(found.entity.id) ?? found.entity.name,
    ...(ally ? { ally: true } : {}),
  });
  /** @type {CombatTarget[]} */
  const foes = [];
  /** @type {CombatTarget[]} */
  const friends = [];
  for (const p of combat.order) {
    const found = findCombatant(app, p.id);
    if (!found) continue;
    const sameSide = sideOf(found) === actorSide;
    if (allies) {
      if (sameSide) friends.push(target(found, false));
      continue;
    }
    const attackable = !sameSide || (found.kind === 'creature' && p.id !== actor.id);
    if (!attackable || isDowned(found)) continue;
    if (sameSide) friends.push(target(found, true));
    else foes.push(target(found, false));
  }
  return [...foes, ...friends];
}

/**
 * The HP of a combatant, from the entity as written. The manual log line
 * reads it, and so does a spell with an HP limit. A character without an HP
 * pool reads as null, and the log line then drops the readout.
 * @param {Combatant['kind']} kind
 * @param {Character | Creature} entity
 * @returns {{ current: number, max: number } | null}
 */
export function hpOf(kind, entity) {
  if (kind === 'creature') {
    const creature = /** @type {Creature} */ (entity);
    return { current: creature.currentHP, max: creature.maxHP };
  }
  const hp = getHP(/** @type {Character} */ (entity));
  return hp ? { current: hp.current, max: hp.max } : null;
}

/**
 * The log label of one combatant. In a running fight, the labels number the
 * foes that share a name across the whole order, so a log line names the
 * same "Gray Wolf 2" as the card. Outside a fight, or for an entity outside
 * the order, the label is the plain name. `findCombatant` reads this through
 * a getter, so a lookup that never logs does not pay for the numbering.
 * @param {AppContext} app
 * @param {Character | Creature} entity
 * @returns {string}
 */
function labelOf(app, entity) {
  const combat = app.state.combat;
  if (!combat) return entity.name;
  const labels = combatLabels(
    app,
    combat.order.map((p) => p.id),
  );
  return labels.get(entity.id) ?? entity.name;
}

/**
 * The log label of a combatant by id, or the fallback name when the id is not
 * in the roster (a target that left the fight, for example).
 * @param {AppContext} app
 * @param {{ id: string, name: string }} target
 * @returns {string}
 */
export function logName(app, target) {
  return findCombatant(app, target.id)?.label ?? target.name;
}
