import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  actionFields,
  actionIdOf,
  actionList,
  actionSpell,
  actionSummary,
  readyActionSpells,
  refreshActions,
  rollRecharges,
  spendAction,
} from '../src/entities/CreatureActions.js';
import { createCreature, editCreature, withDefaults } from '../src/entities/Creature.js';
import { fromTemplate, toTemplate } from '../src/entities/CreatureTemplate.js';

/** The rng value that makes a d6 come up `value`. */
const d6 = (value) => () => (value - 1) / 6 + 1e-9;

const breath = {
  id: 'cold-breath',
  name: 'Cold Breath',
  saveAbility: 'DEX',
  dc: 12,
  damage: [{ count: 4, sides: 8, damageType: 'cold' }],
  halfOnSave: true,
  recharge: 5,
};

test('actionList repairs each entry and drops nameless ones', () => {
  const list = actionList([
    { name: '  Fire Breath ', saveAbility: 'XYZ', dc: 99, recharge: 3, spent: true },
    { name: 'Fire Breath', dc: -4, recharge: 6, spent: true, halfOnSave: true },
    { dc: 10 },
    null,
    'text',
  ]);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], {
    id: 'fire-breath',
    name: 'Fire Breath',
    saveAbility: 'DEX',
    dc: 30,
    damage: [],
    halfOnSave: false,
  });
  assert.equal(list[1].id, 'fire-breath-2');
  assert.equal(list[1].dc, 1);
  assert.equal(list[1].recharge, 6);
  assert.equal(list[1].spent, true);
  assert.deepEqual(actionList('nope'), []);
  assert.equal(actionList([{ name: 'X', dc: 'abc' }])[0].dc, 10);
  assert.equal(actionList([{ name: '!!!' }])[0].id, 'action');
});

test('actionFields is empty for no actions', () => {
  assert.deepEqual(actionFields(undefined), {});
  assert.deepEqual(actionFields([breath]).actions?.[0].id, 'cold-breath');
});

test('actionSpell is a level 0 save spell that keeps the DC', () => {
  const spell = actionSpell(breath);
  assert.equal(spell.id, 'action:cold-breath');
  assert.equal(spell.level, 0);
  assert.deepEqual(spell.effect, {
    kind: 'save',
    saveAbility: 'DEX',
    damage: breath.damage,
    halfOnSave: true,
  });
  assert.deepEqual(spell.creatureAction, { id: 'cold-breath', dc: 12 });
  assert.equal(actionIdOf(spell), 'cold-breath');
  assert.equal(actionIdOf({ id: 'fireball' }), null);
});

test('a spent action leaves the ready list until it recharges', () => {
  const wolf = {
    name: 'Winter Wolf',
    actions: [breath, { ...breath, id: 'b', recharge: undefined }],
  };
  assert.equal(readyActionSpells(wolf).length, 2);
  const spent = spendAction(wolf, 'cold-breath');
  assert.equal(spent.actions[0].spent, true);
  assert.deepEqual(
    readyActionSpells(spent).map((s) => s.id),
    ['action:b'],
  );
  assert.equal(spendAction(spent, 'cold-breath'), spent, 'already spent');
  assert.equal(spendAction(wolf, 'b'), wolf, 'no recharge, never spent');
  assert.equal(spendAction(wolf, 'missing'), wolf);
  assert.equal(spendAction({ name: 'Hero' }, 'x').name, 'Hero');
  assert.deepEqual(readyActionSpells({}), []);
});

test('rollRecharges brings an action back on its face or higher', () => {
  const wolf = spendAction({ name: 'Winter Wolf', actions: [breath] }, 'cold-breath');
  const miss = rollRecharges(wolf, d6(4));
  assert.equal(miss.creature.actions[0].spent, true);
  assert.deepEqual(miss.lines, ["Winter Wolf's Cold Breath does not recharge (d6: 4)."]);
  const hit = rollRecharges(wolf, d6(5));
  assert.equal(hit.creature.actions[0].spent, undefined);
  assert.deepEqual(hit.lines, ["Winter Wolf's Cold Breath recharges (d6: 5)."]);
  const ready = { name: 'Wolf', actions: [breath] };
  assert.deepEqual(rollRecharges(ready), { creature: ready, lines: [] });
  assert.deepEqual(rollRecharges({ name: 'Rat' }).lines, []);
});

test('refreshActions readies every spent action', () => {
  const wolf = spendAction({ name: 'W', actions: [breath] }, 'cold-breath');
  assert.equal(refreshActions(wolf).actions[0].spent, undefined);
  const ready = { name: 'W', actions: [breath] };
  assert.equal(refreshActions(ready), ready);
  const none = { name: 'W' };
  assert.equal(refreshActions(none), none);
});

test('actionSummary names the save, damage, and recharge', () => {
  assert.equal(actionSummary(breath), 'DC 12 DEX save, 4d8 cold, half on save, recharge 5-6');
  assert.equal(
    actionSummary({
      ...breath,
      recharge: 6,
      damage: [{ count: 1, sides: 6, damageType: 'fire', bonus: 2 }],
    }),
    'DC 12 DEX save, 1d6+2 fire, half on save, recharge 6',
  );
  assert.equal(actionSummary({ ...breath, damage: [], recharge: undefined }), 'DC 12 DEX save');
});

test('creatures and templates keep their actions', () => {
  const wolf = createCreature('w', 'Winter Wolf', { actions: [breath] });
  assert.equal(wolf.actions?.[0].dc, 12);
  assert.equal(createCreature('r', 'Rat').actions, undefined);
  const loaded = withDefaults(/** @type {any} */ ({ ...wolf, actions: [{ name: 'Bite' }, 4] }));
  assert.deepEqual(
    loaded.actions?.map((a) => a.id),
    ['bite'],
  );
  const spent = spendAction(wolf, 'cold-breath');
  const kept = editCreature(spent, {
    name: 'W',
    disposition: 'hostile',
    maxHP: 10,
    location: null,
  });
  assert.equal(kept.actions?.[0].spent, true, 'an edit without actions keeps them');
  const cleared = editCreature(spent, {
    name: 'W',
    disposition: 'hostile',
    maxHP: 10,
    location: null,
    actions: [],
  });
  assert.equal(cleared.actions, undefined);
  const template = toTemplate('t', spent);
  assert.equal(template.actions?.[0].spent, undefined, 'a template stores ready actions');
  const spawn = fromTemplate(template, 'w2');
  assert.deepEqual(spawn.actions, template.actions);
  assert.notEqual(spawn.actions?.[0], template.actions?.[0]);
});
