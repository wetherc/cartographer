import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { combatTargets, rosterTargets } from '../src/app/spellTargets.js';
import { findCombatant } from '../src/app/combatants.js';
import { endSpellEffects } from '../src/app/combatantWrites.js';
import { acOf } from '../src/combat/CombatView.js';
import { createParticipant, startCombat } from '../src/combat/Initiative.js';
import { createCreature } from '../src/entities/Creature.js';
import { createResource } from '../src/entities/Resource.js';
import { replaceById } from '../src/entities/Roster.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * The wiring of a buff whose chip changes AC: the flat bonus of Shield and
 * Shield of Faith, the unarmored base of Mage Armor, and the floor of
 * Barkskin. The chip lands through the cast, and the AC that the combat
 * screen shows reads it.
 */

const HERE = { nodeId: 'n1', tileId: '0,0' };

const spellById = (id) => /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));

/** A party caster with level 1 and level 2 slots. */
function character(id, over = {}) {
  return /** @type {any} */ ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    race: 'human',
    classes: [{ classId: 'druid', level: 5 }],
    level: 5,
    xp: 0,
    stats: { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 16, CHA: 10 },
    resources: [
      createResource('hp', 'Hit points', 'health', 30),
      createResource('slots-1', 'Level 1 slots', 'mana', 4),
      createResource('slots-2', 'Level 2 slots', 'mana', 3),
    ],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: [], known: [], prepared: ['barkskin'] },
    proficiencies: undefined,
    ...over,
  });
}

/** A wizard who knows the two abjurations. */
const mage = () =>
  character('mage', {
    classes: [{ classId: 'wizard', level: 5 }],
    stats: { STR: 10, DEX: 14, CON: 10, INT: 16, WIS: 10, CHA: 10 },
    spellbook: {
      cantrips: [],
      known: ['shield', 'mage-armor'],
      prepared: ['shield', 'mage-armor'],
    },
  });

/** A cleric who prepared Shield of Faith. */
const cleric = () =>
  character('cleric', {
    classes: [{ classId: 'cleric', level: 5 }],
    spellbook: { cantrips: [], known: [], prepared: ['shield-of-faith'] },
  });

function stubApp() {
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 7,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });
  return baseStubApp({
    state: {
      characters: [mage(), cleric(), character('druid'), character('fighter')],
      creatures: [goblin],
    },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
}

const pc = (app, id) => app.state.characters.find((c) => c.id === id);
const acNow = (app, id) => acOf(/** @type {any} */ (findCombatant(app, id)));

/** Cast `spellId` from `casterId` on `targetId`, with the dialog answers given. */
function cast(app, casterId, spellId, targetId) {
  const caster = pc(app, casterId);
  const spell = spellById(spellId);
  const offered = rosterTargets(app, spell, casterId);
  const plan = /** @type {any} */ (castPlan(app, caster, spell, offered));
  assert.equal(plan.ok, true, plan.message);
  resolveCast(
    app,
    plan,
    /** @type {any} */ ({ target: targetId, slot: String(spell.level), 'ignore-components': '1' }),
    {
      writeBack: (next) => {
        app.state.characters = replaceById(app.state.characters, next);
      },
    },
  );
}

test('Shield of Faith adds 2 to the AC of its target until the spell ends', () => {
  const app = stubApp();
  assert.equal(acNow(app, 'fighter'), 12);
  cast(app, 'cleric', 'shield-of-faith', 'fighter');
  assert.equal(acNow(app, 'fighter'), 14);
  assert.ok(app.log.includes('Fighter gains Shield of Faith: +2 AC.'));
  endSpellEffects(app, 'cleric', 'shield-of-faith');
  assert.equal(acNow(app, 'fighter'), 12);
});

test('Mage Armor raises the unarmored base AC to 13', () => {
  const app = stubApp();
  cast(app, 'mage', 'mage-armor', 'fighter');
  assert.equal(acNow(app, 'fighter'), 15);
  assert.ok(app.log.includes('Fighter gains Mage Armor: base AC 13 + DEX without armor.'));
});

test('Barkskin sets a floor of 16 under the AC of its target', () => {
  const app = stubApp();
  cast(app, 'druid', 'barkskin', 'fighter');
  assert.equal(acNow(app, 'fighter'), 16);
});

test('Shield reaches only its caster, in a fight and out of one', () => {
  const app = stubApp();
  assert.deepEqual(
    rosterTargets(app, spellById('shield'), 'mage').map((t) => t.id),
    ['mage'],
  );
  const combat = startCombat(
    [createParticipant('goblin', 20), createParticipant('mage', 5), createParticipant('cleric', 3)],
    (x) => x.id,
  );
  app.state.combat = combat;
  const mageTurn = /** @type {any} */ (combat.order.find((p) => p.id === 'mage'));
  assert.deepEqual(
    combatTargets(app, combat, mageTurn, spellById('shield')).map((t) => t.id),
    ['mage'],
  );
  // A buff with a range beyond Self still reaches the whole side.
  assert.ok(combatTargets(app, combat, mageTurn, spellById('mage-armor')).length > 1);
});

test('Shield cast on a foe turn lasts until the start of the caster next turn', () => {
  const app = stubApp();
  app.state.combat = startCombat(
    [createParticipant('goblin', 20), createParticipant('mage', 5)],
    (x) => x.id,
  );
  cast(app, 'mage', 'shield', 'mage');
  assert.equal(acNow(app, 'mage'), 17);
  const chip = pc(app, 'mage').conditions.find((c) => c.name === 'Shield');
  assert.deepEqual(chip.expires, { who: 'mage', at: 'start', count: 1 });
  assert.equal(chip.rounds, null);
});

test('Shield outside a fight lasts one round', () => {
  const app = stubApp();
  cast(app, 'mage', 'shield', 'mage');
  const chip = pc(app, 'mage').conditions.find((c) => c.name === 'Shield');
  assert.equal(chip.rounds, 1);
  assert.equal(chip.expires, undefined);
});
