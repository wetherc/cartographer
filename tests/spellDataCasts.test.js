import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { castSpell } from '../src/entities/Casting.js';
import { maxTargets, scalingSteps } from '../src/entities/CastScaling.js';
import { createResource } from '../src/entities/Resource.js';

/** @param {string} id */
const byId = (id) => {
  const found = DEFAULT_SPELLS.find((s) => s.id === id);
  assert.ok(found, id);
  return /** @type {any} */ (found);
};

/** A deterministic RNG that replays a queue of unit values, then returns 0. */
function seq(/** @type {number[]} */ values) {
  const queue = [...values];
  return () => (queue.length ? /** @type {number} */ (queue.shift()) : 0);
}

/**
 * A 17th-level caster of one class, with two slots of each level.
 * @param {string} cls
 * @param {string[]} prepared
 */
function caster(cls, prepared) {
  return /** @type {any} */ ({
    id: 'c',
    name: 'Caster',
    class: cls,
    level: 17,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 16, CHA: 16 },
    resources: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
      createResource(`slots-${n}`, `Level ${n}`, 2),
    ),
    inventory: [],
    conditions: [],
    spellbook: { cantrips: prepared, known: prepared, prepared },
  });
}

test('Produce Flame is a druid cantrip ranged attack for 1d8 fire that scales', () => {
  const spell = byId('produce-flame');
  assert.equal(spell.level, 0);
  assert.deepEqual(spell.classes, ['druid']);
  assert.equal(spell.effect.kind, 'attack');
  assert.equal(spell.effect.melee, undefined);
  assert.deepEqual(spell.effect.damage, [{ count: 1, sides: 8, damageType: 'fire' }]);
  assert.deepEqual(spell.scaling.damagePerLevel, [{ count: 1, sides: 8, damageType: 'fire' }]);
  assert.match(spell.description, /GM rules the light/);
});

test('Call Lightning halves 3d10 on a DEX save, repeats as an action, and scales by slot', () => {
  const spell = byId('call-lightning');
  assert.equal(spell.concentration, true);
  assert.deepEqual(spell.duration, { kind: 'minutes', amount: 10, upTo: true });
  assert.equal(spell.targetCount, 0);
  assert.deepEqual(spell.repeat, {});
  assert.equal(spell.effect.halfOnSave, true);
  assert.equal(scalingSteps(spell, 5, 5), 2);
  const result = /** @type {any} */ (
    castSpell(caster('druid', ['call-lightning']), spell, {
      slotLevel: 5,
      saveDC: 1,
      rng: seq([]),
      targets: [{ id: 'o', name: 'Orc', saveBonus: 0 }],
    })
  );
  // Five d10 at the lowest face, halved on the save.
  assert.equal(result.outcomes[0].saved, true);
  assert.equal(result.outcomes[0].taken, 2);
});

test('Hypnotic Pattern incapacitates until damage and skips the Charmed-immune', () => {
  const spell = byId('hypnotic-pattern');
  assert.equal(spell.targetCount, 0);
  assert.equal(spell.effect.endsOnDamage, true);
  const result = /** @type {any} */ (
    castSpell(caster('wizard', ['hypnotic-pattern']), spell, {
      slotLevel: 3,
      saveDC: 30,
      rng: seq([]),
      targets: [
        { id: 'gob', name: 'Goblin', saveBonus: 0, creatureType: 'humanoid' },
        { id: 'elf', name: 'Elf', saveBonus: 0, conditionImmunities: ['Charmed'] },
      ],
    })
  );
  assert.deepEqual(
    result.outcomes.map((/** @type {any} */ o) => [
      o.target.id,
      o.unaffectedBy ?? null,
      o.condition,
    ]),
    [
      ['gob', null, 'Incapacitated'],
      ['elf', 'immune to Charmed', null],
    ],
  );
  assert.equal(maxTargets(spell, 0), Infinity);
});

test('Charm Person and Hold Person reach only humanoids, and an untyped target', () => {
  const spell = byId('charm-person');
  assert.equal(spell.concentration, false);
  assert.deepEqual(spell.duration, { kind: 'hours', amount: 1 });
  assert.equal(maxTargets(spell, 2), 3);
  assert.deepEqual(byId('hold-person').effect.typeRules, { only: ['humanoid'] });
  assert.deepEqual(byId('hold-monster').effect.typeRules, { skip: ['undead'] });
  const result = /** @type {any} */ (
    castSpell(caster('bard', ['charm-person']), spell, {
      slotLevel: 3,
      saveDC: 30,
      rng: seq([]),
      targets: [
        { id: 'gob', name: 'Goblin', saveBonus: 0, creatureType: 'humanoid' },
        { id: 'wolf', name: 'Wolf', saveBonus: 0, creatureType: 'beast' },
        { id: 'x', name: 'Stranger', saveBonus: 0 },
      ],
    })
  );
  assert.deepEqual(
    result.outcomes.map((/** @type {any} */ o) => [
      o.target.id,
      o.unaffectedBy ?? null,
      o.condition,
    ]),
    [
      ['gob', null, 'Charmed'],
      ['x', null, 'Charmed'],
      ['wolf', 'not humanoid', null],
    ],
  );
});

test('Weird frightens each creature in its area and deals 4d10 on each failed retry', () => {
  const spell = byId('weird');
  assert.equal(spell.targetCount, 0);
  assert.equal(spell.concentration, true);
  const result = /** @type {any} */ (
    castSpell(caster('wizard', ['weird']), spell, {
      slotLevel: 9,
      saveDC: 30,
      rng: seq([]),
      targets: [
        { id: 'a', name: 'Orc', saveBonus: 0 },
        { id: 'b', name: 'Ogre', saveBonus: 0 },
      ],
    })
  );
  for (const outcome of result.outcomes) {
    assert.equal(outcome.condition, 'Frightened');
    assert.deepEqual(outcome.ongoing, [{ count: 4, sides: 10, damageType: 'psychic' }]);
  }
  assert.equal(spell.effect.saveEnds, true);
});

test('Arcane Sword makes a 3d10 force melee spell attack and repeats as a bonus action', () => {
  const spell = byId('arcane-sword');
  assert.deepEqual(spell.classes, ['bard', 'wizard']);
  assert.equal(spell.effect.melee, true);
  assert.deepEqual(spell.effect.damage, [{ count: 3, sides: 10, damageType: 'force' }]);
  assert.deepEqual(spell.repeat, { cost: 'bonus' });
  assert.deepEqual(spell.materials, {
    text: 'a miniature platinum sword with a grip and pommel of copper and zinc, worth 250 gp',
    costGP: 250,
    consumed: false,
  });
});

test('Raise Dead takes an hour and a consumed 500 gp diamond, and passes over undead', () => {
  const spell = byId('raise-dead');
  assert.deepEqual(spell.castingTime, { kind: 'hours', amount: 1 });
  assert.deepEqual(spell.materials, {
    text: 'a diamond worth at least 500 gp',
    costGP: 500,
    consumed: true,
  });
  assert.equal(spell.effect.revives, true);
  const result = /** @type {any} */ (
    castSpell(
      caster('cleric', ['raise-dead']),
      { ...spell, targetCount: 2 },
      {
        slotLevel: 5,
        rng: seq([]),
        targets: [
          { id: 'pc', name: 'Hero', creatureType: 'humanoid' },
          { id: 'z', name: 'Zombie', creatureType: 'undead' },
        ],
      },
    )
  );
  assert.equal(result.outcomes[0].healing.total, 1);
  assert.equal(result.outcomes[0].unaffectedBy, undefined);
  assert.equal(result.outcomes[1].unaffectedBy, 'undead');
});

test('the fixed-text cantrips are utility entries with their SRD casting details', () => {
  const expect = {
    'mage-hand': ['conjuration', { kind: 'action' }, false],
    prestidigitation: ['transmutation', { kind: 'action' }, false],
    thaumaturgy: ['transmutation', { kind: 'action' }, false],
    druidcraft: ['transmutation', { kind: 'action' }, false],
    mending: ['transmutation', { kind: 'minutes', amount: 1 }, false],
    message: ['transmutation', { kind: 'action' }, false],
    'minor-illusion': ['illusion', { kind: 'action' }, false],
    'dancing-lights': ['evocation', { kind: 'action' }, true],
  };
  for (const [id, [school, castingTime, concentration]] of Object.entries(expect)) {
    const spell = byId(id);
    assert.equal(spell.level, 0, id);
    assert.equal(spell.school, school, id);
    assert.deepEqual(spell.castingTime, castingTime, id);
    assert.equal(spell.concentration, concentration, id);
    assert.deepEqual(spell.effect, { kind: 'utility' }, id);
  }
});
