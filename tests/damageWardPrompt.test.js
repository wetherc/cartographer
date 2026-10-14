import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingDamageWard } from '../src/app/damageWardPrompt.js';
import { rollWeaponAttack } from '../src/app/weaponAttack.js';
import { canSpend, spend } from '../src/combat/ActionBudget.js';
import { createParticipant, startCombat } from '../src/combat/Initiative.js';
import { roll } from '../src/dice/DiceRoller.js';
import { createCharacter } from '../src/entities/Character.js';
import { createResource } from '../src/entities/Resource.js';
import { emptyLibrary, setActiveLibrary } from '../src/library/Library.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * The pause after a weapon hit's damage roll, for a defender with a reaction
 * spell that resists a type in the hit. The spell here is a GM-authored
 * Absorb Elements: a reaction buff with a resist pick list.
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
const FLAME = /** @type {any} */ ({
  id: 'flame',
  name: 'Flame Blade',
  type: 'weapon',
  kind: 'melee',
  category: 'martial',
  quantity: 1,
  notes: '',
  damage: [{ count: 2, sides: 8, damageType: 'fire' }],
});
const d20 = (/** @type {number} */ n) => (n - 1) / 20;

/** A level 5 wizard with 30 HP who knows Absorb Elements. */
function mage() {
  return /** @type {any} */ ({
    id: 'mage',
    name: 'Mage',
    race: 'human',
    classes: [{ classId: 'wizard', level: 5 }],
    level: 5,
    xp: 0,
    stats: { STR: 10, DEX: 14, CON: 10, INT: 16, WIS: 10, CHA: 10 },
    resources: [
      createResource('hp', 'Hit points', 30),
      createResource('slots-1', 'Level 1 slots', 4),
    ],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: [], known: ['absorb-elements'], prepared: ['absorb-elements'] },
  });
}

function stubApp() {
  const rng = (() => {
    const values = [d20(15), 0.5, 0.5];
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
  })();
  const app = baseStubApp({
    state: { characters: [mage(), createCharacter('hero', 'Hero', { STR: 16 })], creatures: [] },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
    actions: {
      getBoundCharacterId: () => null,
      rollDice: (/** @type {any} */ selection) => ({ result: roll(selection, rng) }),
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
    [createParticipant('hero', 20), createParticipant('mage', 5)],
    (/** @type {any} */ x) => x.id,
  );
  return app;
}

const hpOf = (/** @type {any} */ app) =>
  app.state.characters[0].resources.find((/** @type {any} */ r) => r.id === 'hp').current;

/** The hero swings the flame blade at the mage, answering `yes` to the pause. */
async function swing(app, yes) {
  const asked = /** @type {string[]} */ ([]);
  await rollWeaponAttack(app, {
    attacker: app.state.characters[1],
    defender: { id: 'mage', name: 'Mage', ac: 12, conditions: [] },
    weapon: FLAME,
    tweaks: { freeAction: true },
    rng: () => 0.5,
    ask: async (message) => {
      asked.push(message);
      return yes;
    },
  });
  return asked;
}

test('casting the reaction after the damage roll halves the picked type', async () => {
  setActiveLibrary({ ...emptyLibrary(), spells: [ABSORB] });
  try {
    const app = stubApp();
    const asked = await swing(app, true);
    assert.equal(asked.length, 1);
    assert.match(asked[0], /Cast Absorb Elements as a reaction \(resist fire\)\?$/);
    const chip = app.state.characters[0].conditions.find(
      (/** @type {any} */ c) => c.name === 'Absorb Elements',
    );
    assert.deepEqual(chip.mods.resist, ['fire']);
    // 2d8 at 0.5 rolls 5 + 5, plus STR +3, for 13 fire, which the chip halves to 6.
    assert.equal(hpOf(app), 24);
    // The spent reaction leaves nothing to offer against the next hit.
    const groups = [{ damageType: 'fire', rolls: [5], bonus: 0, subtotal: 5 }];
    assert.equal(pendingDamageWard(app, 'mage', 'hero', groups), null);
  } finally {
    setActiveLibrary(emptyLibrary());
  }
});

test('declining the reaction takes the full damage, and a type it cannot resist asks nothing', async () => {
  setActiveLibrary({ ...emptyLibrary(), spells: [ABSORB] });
  try {
    const app = stubApp();
    assert.equal((await swing(app, false)).length, 1);
    assert.equal(hpOf(app), 17);
    const slash = [{ damageType: 'slashing', rolls: [5], bonus: 0, subtotal: 5 }];
    assert.equal(pendingDamageWard(stubApp(), 'mage', 'hero', slash), null);
    assert.equal(pendingDamageWard(stubApp(), 'mage', 'mage', slash), null, 'no self-hit');
  } finally {
    setActiveLibrary(emptyLibrary());
  }
});
