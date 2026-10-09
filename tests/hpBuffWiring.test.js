import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { rosterTargets } from '../src/app/spellTargets.js';
import {
  applyConditionToTarget,
  applyToTarget,
  endSpellEffects,
} from '../src/app/combatantWrites.js';
import { startTurnEffects } from '../src/app/turnEffects.js';
import { passTime } from '../src/app/passTime.js';
import { grantTempTo } from '../src/app/tempHP.js';
import { getHP } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { createResource } from '../src/entities/Resource.js';
import { replaceById } from '../src/entities/Roster.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * The wiring of the buffs that change hit points: Aid's raise to the HP
 * maximum, the temporary HP of False Life, and Heroism's temporary HP each
 * turn and its immunity to Frightened.
 */

const HERE = { nodeId: 'n1', tileId: '0,0' };

const spellById = (id) => /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));

/** A level 5 party member with 30 HP and level 1 and 2 slots. */
function character(id, classId, prepared, over = {}) {
  return /** @type {any} */ ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    race: 'human',
    classes: [{ classId, level: 5 }],
    level: 5,
    xp: 0,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 16, CHA: 16 },
    resources: [
      createResource('hp', 'Hit points', 'health', 30),
      createResource('slots-1', 'Level 1 slots', 'mana', 4),
      createResource('slots-2', 'Level 2 slots', 'mana', 3),
      createResource('slots-3', 'Level 3 slots', 'mana', 2),
    ],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: [], known: prepared, prepared },
    proficiencies: undefined,
    ...over,
  });
}

function stubApp() {
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 7,
    location: HERE,
    level: 1,
  });
  return baseStubApp({
    state: {
      characters: [
        character('cleric', 'cleric', ['aid']),
        character('mage', 'wizard', ['false-life']),
        character('bard', 'bard', ['heroism']),
        character('fighter', 'fighter', []),
      ],
      creatures: [goblin],
    },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
}

const pc = (app, id) => app.state.characters.find((c) => c.id === id);
const hp = (app, id) => getHP(pc(app, id));

/** Cast `spellId` from `casterId` on `targetId` at `slot`, with every die rolling 1. */
function cast(app, casterId, spellId, targetId, slot = spellById(spellId).level) {
  const spell = spellById(spellId);
  const plan = /** @type {any} */ (
    castPlan(app, pc(app, casterId), spell, rosterTargets(app, spell, casterId))
  );
  assert.equal(plan.ok, true, plan.message);
  resolveCast(
    app,
    plan,
    /** @type {any} */ ({ target: targetId, slot: String(slot), 'ignore-components': '1' }),
    {
      rng: () => 0,
      writeBack: (next) => {
        app.state.characters = replaceById(app.state.characters, next);
      },
    },
  );
}

test('Aid raises the HP maximum and current HP, and the raise ends with the chip', () => {
  const app = stubApp();
  cast(app, 'cleric', 'aid', 'fighter');
  assert.deepEqual([hp(app, 'fighter').current, hp(app, 'fighter').max], [35, 35]);
  assert.equal(pc(app, 'fighter').hpBoost, 5);
  assert.ok(app.log.includes('Fighter gains Aid: +5 max HP.'));
  applyToTarget(app, 'fighter', 10, false);
  endSpellEffects(app, 'cleric', 'aid');
  // Current HP stays where it is, because it sits under the lower maximum.
  assert.deepEqual([hp(app, 'fighter').current, hp(app, 'fighter').max], [25, 30]);
  assert.equal('hpBoost' in pc(app, 'fighter'), false);
});

test('Aid from a higher slot raises more, and eight hours end it', () => {
  const app = stubApp();
  cast(app, 'cleric', 'aid', 'fighter', 3);
  assert.equal(hp(app, 'fighter').max, 40);
  passTime(app, 2);
  assert.deepEqual([hp(app, 'fighter').current, hp(app, 'fighter').max], [30, 30]);
});

test('Aid brings a dying character back up', () => {
  const app = stubApp();
  app.state.characters = replaceById(app.state.characters, {
    ...pc(app, 'fighter'),
    resources: pc(app, 'fighter').resources.map((r) => (r.id === 'hp' ? { ...r, current: 0 } : r)),
    deathSaves: { successes: 1, failures: 1, stable: false },
    conditions: [{ name: 'Unconscious', rounds: null }],
  });
  cast(app, 'cleric', 'aid', 'fighter');
  assert.equal(hp(app, 'fighter').current, 5);
  assert.equal(pc(app, 'fighter').deathSaves, null);
});

test('Aid on a creature raises its stored maximum', () => {
  const app = stubApp();
  applyConditionToTarget(app, 'goblin', 'Aid', 4800, undefined, null, { mods: { maxHP: 5 } });
  const goblin = app.state.creatures[0];
  assert.deepEqual([goblin.currentHP, goblin.maxHP, goblin.hpBoost], [12, 12, 5]);
});

test('False Life grants temporary HP that end with its chip', () => {
  const app = stubApp();
  cast(app, 'mage', 'false-life', 'mage');
  assert.equal(pc(app, 'mage').bonusHP, 5);
  assert.ok(app.log.includes('Mage gains 5 temporary HP from False Life (1d4 [1] + 4).'));
  endSpellEffects(app, 'mage', 'false-life');
  assert.equal(pc(app, 'mage').bonusHP, 0);
});

test('False Life from a 2nd-level slot adds 5, and a smaller grant changes nothing', () => {
  const app = stubApp();
  cast(app, 'mage', 'false-life', 'mage', 2);
  assert.equal(pc(app, 'mage').bonusHP, 10);
  cast(app, 'mage', 'false-life', 'mage');
  assert.equal(pc(app, 'mage').bonusHP, 10);
  assert.ok(app.log.includes('Mage keeps 10 temporary HP (False Life gives 5).'));
});

test('Heroism ends Frightened and keeps it off, and grants temporary HP each turn', () => {
  const app = stubApp();
  applyConditionToTarget(app, 'fighter', 'Frightened', 10);
  cast(app, 'bard', 'heroism', 'fighter');
  assert.ok(app.log.includes('Fighter is no longer Frightened.'));
  assert.equal(pc(app, 'fighter').bonusHP ?? 0, 0);
  applyConditionToTarget(app, 'fighter', 'Frightened', 10);
  assert.ok(app.log.includes('Fighter is immune to Frightened (Heroism).'));
  assert.equal(
    pc(app, 'fighter').conditions.some((c) => c.name === 'Frightened'),
    false,
  );
  startTurnEffects(app, 'fighter');
  assert.equal(pc(app, 'fighter').bonusHP, 3);
  assert.ok(app.log.includes('Fighter gains 3 temporary HP from Heroism.'));
  applyToTarget(app, 'fighter', 2, false);
  assert.equal(pc(app, 'fighter').bonusHP, 1);
  startTurnEffects(app, 'fighter');
  assert.equal(pc(app, 'fighter').bonusHP, 3);
  const lines = app.log.length;
  startTurnEffects(app, 'fighter');
  assert.equal(app.log.length, lines, 'a turn that changes nothing logs nothing');
  endSpellEffects(app, 'bard', 'heroism');
  assert.equal(pc(app, 'fighter').bonusHP, 0);
});

test('temporary HP on a creature absorb damage first', () => {
  const app = stubApp();
  app.state.creatures = [{ ...app.state.creatures[0], bonusHP: 4 }];
  applyToTarget(app, 'goblin', 6, false);
  const goblin = app.state.creatures[0];
  assert.deepEqual([goblin.bonusHP, goblin.currentHP], [0, 5]);
});

test('grantTempTo reaches a creature and skips a missing combatant', () => {
  const app = stubApp();
  assert.equal(grantTempTo(app, 'goblin', 6, 'False Life'), true);
  assert.equal(app.state.creatures[0].bonusHP, 6);
  assert.equal(grantTempTo(app, 'nobody', 6, 'False Life'), false);
  assert.equal(grantTempTo(app, 'goblin', 0, 'False Life'), false);
});

test('a weaker Aid from a second caster leaves the stronger Aid in place', () => {
  const app = stubApp();
  const src = (casterId) => ({ spellId: 'aid', spellName: 'Aid', casterId });
  applyConditionToTarget(app, 'fighter', 'Aid', 4700, src('A'), null, { mods: { maxHP: 10 } });
  assert.deepEqual([hp(app, 'fighter').current, hp(app, 'fighter').max], [40, 40]);
  applyConditionToTarget(app, 'fighter', 'Aid', 4800, src('B'), null, { mods: { maxHP: 5 } });
  assert.deepEqual([hp(app, 'fighter').current, hp(app, 'fighter').max], [40, 40]);
  assert.equal(pc(app, 'fighter').conditions[0].source.casterId, 'A');
});
