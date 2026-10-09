import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { cureTarget } from '../src/app/healCure.js';
import { createCreature } from '../src/entities/Creature.js';
import { createResource } from '../src/entities/Resource.js';
import { createCondition } from '../src/entities/Conditions.js';
import { replaceById } from '../src/entities/Roster.js';
import { applyCure, cureFields, cureNames, cureOptions } from '../src/entities/HealCure.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp as baseStubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };
const spellById = (id) => /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));

/** A party cleric with slots up to 6th level. */
function cleric(id, over = {}) {
  return /** @type {any} */ ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    race: 'human',
    classes: [{ classId: 'cleric', level: 11 }],
    level: 11,
    xp: 0,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 16, CHA: 10 },
    resources: [
      createResource('hp', 'Hit points', 'health', 30),
      ...[2, 5, 6].map((l) => createResource(`slots-${l}`, `Level ${l} slots`, 'mana', 2)),
    ],
    inventory: [],
    conditions: [],
    spellbook: {
      cantrips: [],
      known: [],
      prepared: ['lesser-restoration', 'greater-restoration', 'heal'],
    },
    proficiencies: undefined,
    ...over,
  });
}

const chip = (name, source) => createCondition(name, null, source ? { source } : {});

function stubApp(characters, creatures = []) {
  return baseStubApp({
    state: { characters, creatures },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
}

/** Cast `spellId` from the first character onto `targetId`. */
function cast(app, spellId, targetId, slot) {
  const caster = app.state.characters[0];
  const all = [...app.state.characters, ...app.state.creatures];
  const targets = all.map(
    (e) => /** @type {any} */ ({ id: e.id, name: e.name, ac: 12, conditions: e.conditions }),
  );
  const plan = /** @type {any} */ (castPlan(app, caster, spellById(spellId), targets));
  assert.equal(plan.ok, true, plan.message);
  resolveCast(
    app,
    plan,
    /** @type {any} */ ({ target: targetId, slot: String(slot), 'ignore-components': '1' }),
    {
      writeBack: (next) => {
        app.state.characters = replaceById(app.state.characters, next);
      },
      rng: () => 0,
    },
  );
}

const pc = (app, id) => app.state.characters.find((c) => c.id === id);

test('cureNames trims, drops empty and repeated names, and reads a comma list', () => {
  assert.deepEqual(cureNames(' Blinded, deafened ,, BLINDED'), ['Blinded', 'deafened']);
  assert.deepEqual(cureNames(['Poisoned', 3, '']), ['Poisoned']);
  assert.equal(cureNames(null), null);
  assert.equal(cureNames([]), null);
  assert.deepEqual(cureFields({ removes: 'Blinded', removesOneOf: [] }), { removes: ['Blinded'] });
  assert.deepEqual(cureFields({}), {});
});

test('cureOptions lists only what the target has, and Exhaustion reads the level', () => {
  const effect = /** @type {any} */ ({
    kind: 'heal',
    healing: [],
    removes: ['Blinded'],
    removesOneOf: ['Exhaustion', 'Charmed', 'Petrified'],
  });
  const target = { conditions: [chip('blinded'), chip('Charmed')], exhaustion: 2 };
  assert.deepEqual(cureOptions(effect, target), {
    always: ['Blinded'],
    choices: ['Exhaustion', 'Charmed'],
  });
  assert.deepEqual(cureOptions({ kind: 'heal', healing: [] }, { conditions: [] }), {
    always: [],
    choices: [],
  });
});

test('applyCure takes the chips off and one level of exhaustion, and returns the same target for nothing', () => {
  const target = { conditions: [chip('Blinded'), chip('Poisoned')], exhaustion: 2 };
  const { entity, ended } = applyCure(target, ['blinded', 'Exhaustion']);
  assert.deepEqual(ended, ['Blinded', 'Exhaustion']);
  assert.deepEqual(
    entity.conditions.map((c) => c.name),
    ['Poisoned'],
  );
  assert.equal(entity.exhaustion, 1);
  assert.equal(target.conditions.length, 2, 'the input is not changed');
  assert.equal(applyCure(target, ['Charmed']).entity, target);
  assert.equal(applyCure({ conditions: [] }, ['Exhaustion']).ended.length, 0);
});

test('Lesser Restoration ends the one condition the target has, with no heal line', () => {
  const app = stubApp([cleric('cleric'), cleric('ally', { conditions: [chip('Poisoned')] })]);
  cast(app, 'lesser-restoration', 'ally', 2);
  assert.equal(pc(app, 'ally').conditions.length, 0);
  assert.ok(app.log.includes('Lesser Restoration ends Poisoned on Ally.'));
  assert.equal(
    app.log.some((l) => l.includes('heals')),
    false,
  );
});

test('Lesser Restoration asks the caster when two conditions apply, and leaves the rest', async () => {
  const app = stubApp([
    cleric('cleric'),
    cleric('ally', { conditions: [chip('Blinded'), chip('Poisoned')] }),
  ]);
  /** @type {string[][]} */
  const asked = [];
  await cureTarget(app, spellById('lesser-restoration'), 'ally', {
    pick: async (_spell, _name, choices) => {
      asked.push(choices);
      return 'Poisoned';
    },
  });
  assert.deepEqual(asked, [['Blinded', 'Poisoned']]);
  assert.deepEqual(
    pc(app, 'ally').conditions.map((c) => c.name),
    ['Blinded'],
  );
  // A closed dialog ends nothing.
  await cureTarget(app, spellById('lesser-restoration'), 'ally', { pick: async () => null });
  await cureTarget(app, spellById('lesser-restoration'), 'ally', {
    pick: async () => {
      throw new Error('one choice asks nothing');
    },
  });
  assert.equal(pc(app, 'ally').conditions.length, 0);
});

test('Lesser Restoration on a target with nothing to end says so', () => {
  const app = stubApp([cleric('cleric'), cleric('ally')]);
  cast(app, 'lesser-restoration', 'ally', 2);
  assert.ok(app.log.includes('Lesser Restoration ends nothing on Ally.'));
});

test('ending a chip that a concentration spell imposed leaves the caster concentrating', async () => {
  const held = { spellId: 'hold-person', spellName: 'Hold Person', slotLevel: 2, remaining: 10 };
  const source = { spellId: 'hold-person', spellName: 'Hold Person', casterId: 'mage' };
  const mage = cleric('mage', { concentration: held });
  const app = stubApp([
    cleric('cleric'),
    mage,
    cleric('ally', { conditions: [chip('Paralyzed', source)] }),
  ]);
  await cureTarget(app, spellById('lesser-restoration'), 'ally');
  assert.equal(pc(app, 'ally').conditions.length, 0);
  assert.deepEqual(pc(app, 'mage').concentration, held);
});

test('Heal restores 70 HP and ends blindness and deafness on a creature', () => {
  const ogre = createCreature('ogre', 'Ogre', {
    disposition: 'friendly',
    maxHP: 100,
    stats: { AC: 11 },
    location: HERE,
    level: 1,
  });
  const app = stubApp(
    [cleric('cleric')],
    [{ ...ogre, currentHP: 10, conditions: [chip('Blinded'), chip('Deafened'), chip('Poisoned')] }],
  );
  cast(app, 'heal', 'ogre', 6);
  const healed = app.state.creatures[0];
  assert.equal(healed.currentHP, 80);
  assert.deepEqual(
    healed.conditions.map((c) => c.name),
    ['Poisoned'],
  );
  assert.ok(app.log.includes('Heal ends Blinded and Deafened on Ogre.'));
});

test('Greater Restoration ends one level of exhaustion when that is all the target has', () => {
  const app = stubApp([cleric('cleric'), cleric('ally', { exhaustion: 3 })]);
  cast(app, 'greater-restoration', 'ally', 5);
  assert.equal(pc(app, 'ally').exhaustion, 2);
  assert.ok(app.log.includes('Greater Restoration ends one level of exhaustion on Ally.'));
});

test('a cure on a target the roster lost, or with no cure fields, writes nothing', async () => {
  const app = stubApp([cleric('cleric')]);
  await cureTarget(app, spellById('lesser-restoration'), 'nobody');
  await cureTarget(app, spellById('cure-wounds'), 'cleric');
  assert.deepEqual(app.log, []);
});
