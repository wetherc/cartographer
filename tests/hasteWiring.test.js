import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { rosterTargets } from '../src/app/spellTargets.js';
import { applyConditionToTarget, endSpellEffects } from '../src/app/combatantWrites.js';
import { addLethargy } from '../src/app/lethargyWrites.js';
import { advancePastHeld } from '../src/app/turnAdvance.js';
import { createParticipant, startCombat } from '../src/combat/Initiative.js';
import { armorClass } from '../src/entities/Armor.js';
import { hasExtraAction } from '../src/entities/ChipMods.js';
import { saveOutcome } from '../src/entities/ConditionEffects.js';
import { createResource } from '../src/entities/Resource.js';
import { replaceById } from '../src/entities/Roster.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * The wiring of Haste: the chip it leaves with +2 AC, advantage on DEX saves,
 * and an extra action, and the Lethargic chip it leaves when it ends.
 */

const HERE = { nodeId: 'n1', tileId: '0,0' };

const haste = /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === 'haste'));

/** A level 5 party member with 30 HP and level 3 slots. */
function character(id, classId, prepared) {
  return /** @type {any} */ ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    race: 'human',
    classes: [{ classId, level: 5 }],
    level: 5,
    xp: 0,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 10, CHA: 10 },
    resources: [
      createResource('hp', 'Hit points', 30),
      createResource('slots-3', 'Level 3 slots', 2),
    ],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: [], known: prepared, prepared },
    proficiencies: undefined,
  });
}

function stubApp() {
  return baseStubApp({
    state: {
      characters: [character('mage', 'wizard', ['haste']), character('fighter', 'fighter', [])],
      creatures: [],
    },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
}

const pc = (app, id) => app.state.characters.find((c) => c.id === id);

function cast(app, targetId) {
  const plan = /** @type {any} */ (
    castPlan(app, pc(app, 'mage'), haste, rosterTargets(app, haste, 'mage'))
  );
  assert.equal(plan.ok, true, plan.message);
  resolveCast(
    app,
    plan,
    /** @type {any} */ ({ target: targetId, slot: '3', 'ignore-components': '1' }),
    {
      rng: () => 0,
      writeBack: (next) => {
        app.state.characters = replaceById(app.state.characters, next);
      },
    },
  );
}

test('Haste gives +2 AC, advantage on DEX saves, and an extra action', () => {
  const app = stubApp();
  const before = armorClass(pc(app, 'fighter'));
  cast(app, 'fighter');
  const fighter = pc(app, 'fighter');
  assert.equal(armorClass(fighter), before + 2);
  assert.equal(saveOutcome(fighter.conditions, 'DEX').mode, 'advantage');
  assert.equal(hasExtraAction(fighter.conditions), true);
  assert.ok(
    app.log.includes(
      'Fighter gains Haste: +2 AC, advantage on DEX saves, an extra action for one weapon attack.',
    ),
  );
});

test('the end of Haste leaves its target lethargic', () => {
  const app = stubApp();
  cast(app, 'fighter');
  endSpellEffects(app, 'mage', 'haste');
  assert.equal(hasExtraAction(pc(app, 'fighter').conditions), false);
  const at = app.log.indexOf('Fighter is no longer affected by Haste.');
  assert.ok(at >= 0);
  assert.equal(
    app.log[at + 1],
    "Fighter is lethargic and can't move or take actions until after its next turn.",
  );
});

const chipNamed = (app, id, name) => pc(app, id).conditions.find((c) => c.name === name);

test('outside a fight, the Lethargic chip lasts one round', () => {
  const app = stubApp();
  cast(app, 'fighter');
  endSpellEffects(app, 'mage', 'haste');
  const chip = chipNamed(app, 'fighter', 'Lethargic');
  assert.equal(chip.rounds, 1);
  assert.equal(chip.expires, undefined);
});

test('Haste ending on its target turn costs the next turn, which then ends the chip', () => {
  const app = stubApp();
  app.state.combat = startCombat(
    [createParticipant('fighter', 20), createParticipant('mage', 10)],
    (p) => p.id,
  );
  cast(app, 'fighter');
  endSpellEffects(app, 'mage', 'haste');
  assert.deepEqual(chipNamed(app, 'fighter', 'Lethargic').expires, {
    who: 'fighter',
    at: 'end',
    count: 2,
  });
  const hooks = {
    setCombat: (next) => {
      app.state.combat = next;
    },
    tickRound: () => {},
  };
  advancePastHeld(app, hooks);
  assert.equal(chipNamed(app, 'fighter', 'Lethargic').expires.count, 1);
  const result = advancePastHeld(app, hooks);
  assert.equal(result?.state.order[result.state.index].id, 'mage', 'the fighter loses its turn');
  assert.equal(chipNamed(app, 'fighter', 'Lethargic'), undefined);
});

test('a Haste from another caster sits beside the first and counts once', () => {
  const app = stubApp();
  const before = armorClass(pc(app, 'fighter'));
  cast(app, 'fighter');
  const first = chipNamed(app, 'fighter', 'Haste');
  applyConditionToTarget(
    app,
    'fighter',
    'Haste',
    (first.rounds ?? 10) + 5,
    { spellId: 'haste', spellName: 'Haste', casterId: 'other' },
    null,
    { mods: first.mods },
  );
  const hastes = pc(app, 'fighter').conditions.filter((c) => c.name === 'Haste');
  assert.deepEqual(
    hastes.map((c) => c.source?.casterId),
    ['mage', 'other'],
  );
  assert.equal(armorClass(pc(app, 'fighter')), before + 2, 'the AC bonus counts once');
  assert.equal(chipNamed(app, 'fighter', 'Lethargic'), undefined);
  // The end of the first cast takes only its own chip.
  endSpellEffects(app, 'mage', 'haste');
  assert.equal(chipNamed(app, 'fighter', 'Haste')?.source?.casterId, 'other');
  assert.equal(hasExtraAction(pc(app, 'fighter').conditions), true);
});

test('a hand edit that removes Haste adds the chip and logs it', () => {
  const app = stubApp();
  cast(app, 'fighter');
  const prev = pc(app, 'fighter');
  const next = addLethargy(app, prev, {
    ...prev,
    conditions: prev.conditions.filter((c) => c.name !== 'Haste'),
  });
  assert.ok(next.conditions.some((c) => c.name === 'Lethargic'));
  assert.equal(
    app.log.at(-1),
    "Fighter is lethargic and can't move or take actions until after its next turn.",
  );
  assert.equal(addLethargy(app, next, next), next, 'no change keeps the entity');
});
