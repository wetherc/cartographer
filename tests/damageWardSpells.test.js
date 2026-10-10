import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wardSpellDamage } from '../src/app/damageWardPrompt.js';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { canSpend, spend } from '../src/combat/ActionBudget.js';
import { createParticipant, startCombat } from '../src/combat/Initiative.js';
import { roll } from '../src/dice/DiceRoller.js';
import { landingDamage } from '../src/entities/DamageWard.js';
import { createResource } from '../src/entities/Resource.js';
import { replaceById } from '../src/entities/Roster.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { emptyLibrary, setActiveLibrary } from '../src/library/Library.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * The damage reaction pause for a spell attack and a save spell: the
 * question after the spell rolls its damage, the cast it leads to, and the
 * damage that lands through the new chip. The reaction here is a
 * GM-authored Absorb Elements.
 */

const HERE = { nodeId: 'n1', tileId: '0,0' };
const ABSORB = /** @type {any} */ ({
  id: 'absorb-elements',
  name: 'Absorb Elements',
  level: 1,
  school: 'abjuration',
  classes: ['wizard'],
  castingTime: { kind: 'reaction', trigger: 'when you take elemental damage' },
  range: 'Self',
  components: ['S'],
  duration: { kind: 'rounds', amount: 1 },
  concentration: false,
  ritual: false,
  description: 'Resist the triggering damage type until the start of your next turn.',
  effect: {
    kind: 'buff',
    resistChoice: ['acid', 'cold', 'fire', 'lightning', 'thunder'],
    until: 'caster-start',
  },
});
const spellById = (/** @type {string} */ id) =>
  /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));
const d20 = (/** @type {number} */ n) => (n - 1) / 20;

/** An rng that hands back the given values in order, then repeats the last one. */
function scripted(/** @type {number[]} */ values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/** A level 5 wizard with DEX 14 and 30 HP who knows `spells`. */
function wizard(/** @type {string} */ id, /** @type {string[]} */ spells) {
  return /** @type {any} */ ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    race: 'human',
    classes: [{ classId: 'wizard', level: 5 }],
    level: 5,
    xp: 0,
    stats: { STR: 10, DEX: 14, CON: 10, INT: 16, WIS: 10, CHA: 10 },
    resources: [
      createResource('hp', 'Hit points', 'health', 30),
      createResource('slots-1', 'Level 1 slots', 'mana', 4),
    ],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: ['fire-bolt'], known: spells, prepared: spells },
  });
}

/** A stub app with the evoker, the mage, and the sage, in a fight. */
function stubApp(mageSpells = ['absorb-elements']) {
  const app = baseStubApp({
    state: {
      characters: [
        wizard('evoker', ['burning-hands']),
        wizard('mage', mageSpells),
        wizard('sage', ['absorb-elements']),
      ],
      creatures: [],
    },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
    actions: {
      getBoundCharacterId: () => null,
      rollDice: (/** @type {any} */ selection) => ({ result: roll(selection, () => 0.5) }),
      spendBudget: (/** @type {string} */ id, /** @type {any} */ cost) => {
        const combat = app.state.combat;
        const index = combat?.order.findIndex((p) => p.id === id) ?? -1;
        if (!combat || index < 0) return true;
        if (!canSpend(combat.order[index], cost)) return false;
        const order = [...combat.order];
        order[index] = spend(order[index], cost);
        app.state.combat = { ...combat, order };
        return true;
      },
    },
  });
  app.state.combat = startCombat(
    ['evoker', 'mage', 'sage'].map((id, i) => createParticipant(id, 20 - i)),
    (/** @type {any} */ x) => x.id,
  );
  return app;
}

const pc = (/** @type {any} */ app, /** @type {string} */ id) =>
  app.state.characters.find((/** @type {any} */ c) => c.id === id);
const hpOf = (/** @type {any} */ app, /** @type {string} */ id) =>
  pc(app, id).resources.find((/** @type {any} */ r) => r.id === 'hp').current;
const target = (/** @type {any} */ app, /** @type {string} */ id) => ({
  id,
  name: pc(app, id).name,
  ac: 12,
  conditions: [],
});

/**
 * Cast `spellId` from the evoker at `ids`, answering each question with
 * `answer(message)`. The return is the questions asked.
 */
async function castAt(
  /** @type {any} */ app,
  /** @type {string} */ spellId,
  /** @type {string[]} */ ids,
  /** @type {() => number} */ rng,
  /** @type {(message: string) => boolean} */ answer,
) {
  const asked = /** @type {string[]} */ ([]);
  const plan = /** @type {any} */ (
    castPlan(
      app,
      pc(app, 'evoker'),
      spellById(spellId),
      ids.map((id) => target(app, id)),
    )
  );
  assert.equal(plan.ok, true, plan.message);
  await resolveCast(app, plan, /** @type {any} */ ({ targets: ids.join(','), slot: '1' }), {
    writeBack: (next) => {
      app.state.characters = replaceById(app.state.characters, next);
    },
    rng,
    ask: async (message) => {
      asked.push(message);
      return answer(message);
    },
  });
  return asked;
}

/** Run `body` with Absorb Elements in the active library. */
async function withAbsorb(/** @type {() => Promise<void> | void} */ body) {
  setActiveLibrary({ ...emptyLibrary(), spells: [ABSORB] });
  try {
    await body();
  } finally {
    setActiveLibrary(emptyLibrary());
  }
}

const fire = (/** @type {number} */ n) => ({
  damageType: 'fire',
  rolls: [n],
  bonus: 0,
  subtotal: n,
});

test('landingDamage reads the damage an attack or save outcome is about to deal', () => {
  const damage = { byType: [fire(7), { ...fire(4), damageType: 'cold' }] };
  assert.deepEqual(landingDamage('attack', { hit: true, damage }), {
    groups: damage.byType,
    total: 11,
  });
  assert.deepEqual(landingDamage('attack', { hit: false, damage }).total, 0);
  const splash = landingDamage('attack', { hit: false, halved: true, damage });
  assert.deepEqual(
    splash.groups.map((g) => g.subtotal),
    [3, 2],
  );
  assert.equal(splash.total, 5);
  const shots = [{ damage: { byType: [fire(5)] } }, {}, { damage: { byType: [fire(6)] } }];
  assert.deepEqual(landingDamage('attack', { shots }), {
    groups: [{ damageType: 'fire', rolls: [5, 6], bonus: 0, subtotal: 11 }],
    total: 11,
  });
  assert.equal(landingDamage('save', { saved: false, taken: 11, damage }).total, 11);
  assert.equal(landingDamage('save', { saved: true, taken: 5, damage }).total, 5);
  assert.equal(landingDamage('save', { saved: true, taken: 0, damage }).total, 0);
  assert.equal(landingDamage('save', { unaffectedBy: 'undead', taken: 0, damage }).total, 0);
  assert.equal(landingDamage('heal', { damage }).total, 0);
});

test('Absorb Elements halves a Fire Bolt hit after its damage roll', () =>
  withAbsorb(async () => {
    const app = stubApp();
    // A natural 9 plus the evoker's +6 is 15 against AC 12, and 2d10 at 0.5 is 12 fire.
    const asked = await castAt(app, 'fire-bolt', ['mage'], scripted([d20(9), 0.5]), () => true);
    assert.deepEqual(asked, [
      'Fire Bolt hits Mage for 12 damage. Cast Absorb Elements as a reaction (resist fire)?',
    ]);
    assert.equal(hpOf(app, 'mage'), 24);
    const cast = app.log.indexOf('Mage casts Absorb Elements at level 1.');
    const hit = app.log.findIndex((l) => l.startsWith('Fire Bolt hits Mage'));
    assert.ok(cast >= 0 && cast < hit, app.log.join('\n'));
  }));

test('each target of Burning Hands gets its own question, in target order', () =>
  withAbsorb(async () => {
    const app = stubApp();
    // 3d6 at 0.5 is 12 fire. The mage fails its save and the sage succeeds.
    const rng = scripted([0.5, 0.5, 0.5, d20(1), d20(20)]);
    const asked = await castAt(app, 'burning-hands', ['mage', 'sage'], rng, (m) =>
      m.startsWith('Mage'),
    );
    assert.deepEqual(asked, [
      'Mage fails the save against Burning Hands and takes 12 damage. Cast Absorb Elements as a reaction (resist fire)?',
      'Sage saves against Burning Hands and takes 6 damage. Cast Absorb Elements as a reaction (resist fire)?',
    ]);
    assert.equal(hpOf(app, 'mage'), 24, 'the mage cast it and took half of 12');
    assert.equal(hpOf(app, 'sage'), 24, 'the sage declined and took half of 12 for the save');
  }));

test('a Shield that turns the hit aside leaves no damage to resist', () =>
  withAbsorb(async () => {
    const app = stubApp(['shield', 'absorb-elements']);
    const asked = await castAt(app, 'fire-bolt', ['mage'], scripted([d20(9), 0.5]), () => true);
    assert.equal(asked.length, 1);
    assert.match(asked[0], /Cast Shield/);
    assert.equal(hpOf(app, 'mage'), 30);
  }));

test('a declined Shield leaves the reaction for the damage question', () =>
  withAbsorb(async () => {
    const app = stubApp(['shield', 'absorb-elements']);
    const asked = await castAt(app, 'fire-bolt', ['mage'], scripted([d20(9), 0.5]), (m) =>
      m.includes('Absorb'),
    );
    assert.equal(asked.length, 2);
    assert.equal(hpOf(app, 'mage'), 24);
  }));

test('the damage lands after the question when the fight ends while it is open', () =>
  withAbsorb(async () => {
    const app = stubApp();
    await castAt(app, 'fire-bolt', ['mage'], scripted([d20(9), 0.5]), () => {
      app.state.combat = null;
      return true;
    });
    assert.equal(hpOf(app, 'mage'), 24);
  }));

test('a spell with no reaction in reach lands without waiting', () =>
  withAbsorb(() => {
    const app = stubApp([]);
    const result = {
      outcomes: [{ target: { id: 'mage' }, hit: true, damage: { byType: [fire(5)] } }],
    };
    assert.equal(
      wardSpellDamage(app, spellById('fire-bolt'), result, 'evoker', { cast: resolveCast }),
      null,
    );
    const nameless = { outcomes: [{ target: {}, hit: true, damage: { byType: [fire(5)] } }] };
    assert.equal(
      wardSpellDamage(app, spellById('fire-bolt'), nameless, 'evoker', { cast: resolveCast }),
      null,
    );
  }));

test('the question names a ray tally and a spell that rolls no save', () =>
  withAbsorb(async () => {
    const asked = /** @type {string[]} */ ([]);
    const ask = async (/** @type {string} */ message) => {
      asked.push(message);
      return false;
    };
    const mage = { id: 'mage', name: 'Mage' };
    const shots = [{ damage: { byType: [fire(5)] } }, {}];
    const rays = { outcomes: [{ target: mage, shots, hits: 1, fired: 2 }] };
    const app = stubApp();
    await wardSpellDamage(app, spellById('scorching-ray'), rays, 'evoker', {
      ask,
      cast: resolveCast,
    });
    const noRoll = {
      outcomes: [{ target: mage, noRoll: true, taken: 4, damage: { byType: [fire(4)] } }],
    };
    await wardSpellDamage(app, spellById('burning-hands'), noRoll, 'evoker', {
      ask,
      cast: resolveCast,
    });
    assert.deepEqual(
      asked.map((m) => m.split(' Cast ')[0]),
      ['Scorching Ray: 1 of 2 hit Mage for 5 damage.', 'Burning Hands deals 4 damage to Mage.'],
    );
    assert.equal(
      wardSpellDamage(app, spellById('cure-wounds'), rays, 'evoker', { ask, cast: resolveCast }),
      null,
    );
  }));
