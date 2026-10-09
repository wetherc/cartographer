import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFightXP,
  applyLoot,
  askFightXP,
  confirmFightEnd,
  fightSummary,
  opensXPDialog,
} from '../src/app/combatEnd.js';
import { createCharacter } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { stubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** Two wolves still standing at the end of a fight, and one character. */
function ended() {
  const wolf = (/** @type {string} */ id) =>
    createCreature(id, 'Gray Wolf', {
      disposition: 'hostile',
      maxHP: 11,
      location: HERE,
      cr: 0.25,
    });
  const app = stubApp({
    state: /** @type {any} */ ({
      characters: [createCharacter('wren', 'Wren')],
      creatures: [wolf('w1'), wolf('w2')],
    }),
  });
  const end = /** @type {any} */ ({
    outcome: 'victory',
    standing: 2,
    standingFoes: [
      { id: 'w1', name: 'Gray Wolf 1', xp: 50 },
      { id: 'w2', name: 'Gray Wolf 2', xp: 50 },
    ],
    xp: 0,
    earners: ['wren'],
    share: 0,
    loot: [],
    loot: [],
  });
  return { app, end };
}

test('the fate select offers each standing foe, and each fate lands', async () => {
  const { app, end } = ended();
  /** @type {any[]} */
  let asked = [];
  /** @type {any} */
  let opts = {};
  const prompt = /** @type {any} */ (
    async (/** @type {string} */ _title, /** @type {any[]} */ fields, /** @type {any} */ o) => {
      asked = fields;
      opts = o;
      return { 'fate:w1': 'surrendered', 'fate:w2': 'fled', amount: '100' };
    }
  );
  const values = await askFightXP(end, { prompt });
  assert.deepEqual(
    asked.map((f) => f.name),
    ['fate:w1', 'fate:w2', 'amount', 'gold'],
  );
  assert.equal(asked[0].label, 'Gray Wolf 1, 50 XP if overcome');
  assert.equal(asked[0].value, 'hostile');
  assert.equal(opts.cancelLabel, 'Back to the fight');
  assert.equal(opts.submitLabel, 'End and award');
  assert.ok(values && values !== 'none');
  applyFightXP(app, end, values);
  const w1 = app.state.creatures.find((c) => c.id === 'w1');
  assert.notEqual(w1?.disposition, 'hostile', 'a captive stands down');
  assert.equal(
    app.state.creatures.some((c) => c.id === 'w2'),
    false,
    'a fled foe leaves the campaign',
  );
  assert.ok(app.log.includes('Gray Wolf 2 flees.'));
  assert.ok(app.log.includes('The party is awarded 100 XP each for the fight.'));
  assert.equal(app.state.characters[0].xp, 100);
});

test('the fate change restates the per-character amount', async () => {
  const { end } = ended();
  /** @type {Record<string, any>} */
  const form = { 'fate:w1': 'fled', 'fate:w2': 'hostile', amount: 0 };
  /** @type {string[]} */
  const labels = [];
  const prompt = /** @type {any} */ (
    async (/** @type {string} */ _t, /** @type {any} */ _f, /** @type {any} */ o) => {
      const api = {
        get: (/** @type {string} */ n) => form[n],
        set: (/** @type {string} */ n, /** @type {any} */ v) => (form[n] = v),
        setLabel: (/** @type {string} */ _n, /** @type {string} */ l) => labels.push(l),
      };
      o.onChange('amount', api);
      o.onChange('fate:w1', api);
      return null;
    }
  );
  assert.equal(await askFightXP(end, { prompt }), null);
  assert.equal(form.amount, 50);
  assert.equal(labels.length, 1);
});

test('going back to the fight returns null, and a zero award changes no XP', async () => {
  const { app, end } = ended();
  assert.equal(await askFightXP(end, { prompt: /** @type {any} */ (async () => null) }), null);
  applyFightXP(app, end, { 'fate:w1': 'hostile', 'fate:w2': 'hostile', amount: 0 });
  assert.equal(app.state.creatures.length, 2);
  assert.equal(app.state.characters[0].xp, 0);
  assert.deepEqual(app.log, []);
});

test('a defeat, or a fight with nothing to award, opens no dialog', async () => {
  const { end } = ended();
  const prompt = /** @type {any} */ (async () => assert.fail('no dialog'));
  assert.equal(await askFightXP({ ...end, outcome: 'defeat' }, { prompt }), 'none');
  assert.equal(await askFightXP({ ...end, standingFoes: [] }, { prompt }), 'none');
  assert.equal(await askFightXP({ ...end, earners: [] }, { prompt }), 'none');
});

test('the XP dialog names the standing foes above the fate selects', async () => {
  const { end } = ended();
  /** @type {string[]} */
  const messages = [];
  const prompt = /** @type {any} */ (
    async (/** @type {string} */ _t, /** @type {any} */ _f, /** @type {any} */ o) => {
      messages.push(o.message);
      return null;
    }
  );
  await askFightXP(end, { prompt });
  await askFightXP({ ...end, standingFoes: end.standingFoes.slice(0, 1) }, { prompt });
  await askFightXP({ ...end, standingFoes: [], xp: 50 }, { prompt });
  assert.deepEqual(messages, [
    '2 foes are still standing. Pick what became of each one.',
    '1 foe is still standing. Pick what became of it.',
    undefined,
  ]);
});

test('opensXPDialog is true only when the dialog has something to ask', () => {
  const { end } = ended();
  assert.equal(opensXPDialog(end), true);
  assert.equal(opensXPDialog({ ...end, standingFoes: [], xp: 50 }), true);
  assert.equal(opensXPDialog({ ...end, standingFoes: [] }), false);
  assert.equal(opensXPDialog({ ...end, earners: [] }), false);
  assert.equal(opensXPDialog({ ...end, outcome: 'defeat' }), false);
});

/** A running fight of Wren against two wolves. `hp` sets the HP of each wolf. */
function running(hp = 11) {
  const wolf = (/** @type {string} */ id) => ({
    ...createCreature(id, 'Gray Wolf', {
      disposition: 'hostile',
      maxHP: 11,
      location: HERE,
      cr: 0.25,
    }),
    currentHP: hp,
  });
  return stubApp({
    state: /** @type {any} */ ({
      characters: [createCharacter('wren', 'Wren')],
      creatures: [wolf('w1'), wolf('w2')],
      combat: {
        round: 1,
        index: 0,
        order: ['wren', 'w1', 'w2'].map((id) => ({ id, initiative: 10, modifier: 0 })),
      },
    }),
  });
}

/** A confirm stub that records each question and answers `answer`. */
function confirmer(/** @type {boolean} */ answer) {
  /** @type {string[]} */
  const asked = [];
  const confirm = /** @type {any} */ (
    async (/** @type {string} */ message) => {
      asked.push(message);
      return answer;
    }
  );
  return { asked, confirm };
}

test('confirmFightEnd stays closed when the XP dialog opens', async () => {
  const { asked, confirm } = confirmer(false);
  const end = await confirmFightEnd(running(), { confirm });
  assert.equal(end?.standing, 2);
  assert.equal(opensXPDialog(/** @type {any} */ (end)), true);
  assert.deepEqual(asked, []);
});

test('confirmFightEnd stays closed when no foe stands', async () => {
  const { asked, confirm } = confirmer(false);
  const end = await confirmFightEnd(running(0), { confirm });
  assert.equal(end?.outcome, 'victory');
  assert.equal(end?.xp, 100);
  assert.deepEqual(asked, []);
});

test('confirmFightEnd asks when foes stand and no character can earn', async () => {
  const app = running();
  app.state.characters = [];
  const yes = confirmer(true);
  assert.equal((await confirmFightEnd(app, { confirm: yes.confirm }))?.standing, 2);
  assert.deepEqual(yes.asked, ['2 foes are still standing. End the fight anyway?']);
  app.state.creatures = app.state.creatures.slice(0, 1);
  const no = confirmer(false);
  assert.equal(await confirmFightEnd(app, { confirm: no.confirm }), null);
  assert.deepEqual(no.asked, ['1 foe is still standing. End the fight anyway?']);
});

test('confirmFightEnd and fightSummary return null with no fight running', async () => {
  const app = running();
  app.state.combat = null;
  assert.equal(await confirmFightEnd(app, { confirm: confirmer(true).confirm }), null);
  assert.equal(fightSummary(app), null);
});

test('a fate picked for a foe that fell while the dialog was open does not land', () => {
  const app = running();
  assert.deepEqual(
    fightSummary(app)?.standingFoes.map((f) => f.id),
    ['w1', 'w2'],
  );
  // A Player tab kills w1 while the XP dialog is open.
  app.state.creatures = app.state.creatures.map((c) =>
    c.id === 'w1' ? { ...c, currentHP: 0 } : c,
  );
  const now = /** @type {any} */ (fightSummary(app));
  assert.deepEqual(
    now.standingFoes.map((/** @type {{ id: string }} */ f) => f.id),
    ['w2'],
  );
  applyFightXP(app, now, { 'fate:w1': 'fled', 'fate:w2': 'hostile', amount: 0 });
  assert.equal(app.state.creatures.length, 2, 'the dead wolf is not removed as fled');
  assert.deepEqual(app.log, []);
});

test('the award reaches only the earners, and the toast counts them', () => {
  const app = running(0);
  app.state.characters = [...app.state.characters, createCharacter('dorn', 'Dorn')];
  /** @type {string[]} */
  const toasts = [];
  app.toasts = { show: (/** @type {string} */ text) => toasts.push(text) };
  const end = /** @type {any} */ (fightSummary(app));
  applyFightXP(app, end, { amount: 10 });
  applyFightXP(app, { ...end, earners: ['wren', 'dorn'] }, { amount: 5 });
  assert.deepEqual(
    app.state.characters.map((c) => c.xp),
    [15, 5],
  );
  assert.deepEqual(toasts, ['Awarded 10 XP to 1 character.', 'Awarded 5 XP to 2 characters.']);
});

test('a defeated foe drops its weapon and armor, and the loot lands with the carrier', async () => {
  const app = running(0);
  app.state.characters = [...app.state.characters, createCharacter('dorn', 'Dorn')];
  app.state.creatures = app.state.creatures.map((c, i) =>
    i === 0
      ? {
          ...c,
          weapon: {
            name: 'Scimitar',
            kind: 'melee',
            category: 'martial',
            damage: [{ count: 1, sides: 6, damageType: 'slashing' }],
            properties: ['finesse', 'light'],
          },
          armor: { name: 'Leather Armor', baseAC: 11, armorWeight: 'light' },
        }
      : { ...c, weapon: { name: 'Bite', kind: 'melee', category: null, damage: [] }, armor: null },
  );
  app.state.combat.order.push({ id: 'dorn', initiative: 9, modifier: 0 });
  const end = /** @type {any} */ (fightSummary(app));
  assert.deepEqual(
    end.loot.map((/** @type {any} */ l) => l.label),
    ['Scimitar (Gray Wolf 1)', 'Leather Armor (Gray Wolf 1)'],
    'a natural bite drops nothing',
  );
  assert.equal(end.loot[0].item.type, 'weapon');
  /** @type {any[]} */
  let seen = [];
  const prompt = /** @type {any} */ (
    async (/** @type {string} */ _t, /** @type {any[]} */ fields) => {
      seen = fields;
      return { amount: 0, loot: 'loot-0,loot-1', lootTo: 'dorn', gold: 9 };
    }
  );
  const values = await askFightXP(end, { prompt, nameOf: (id) => id.toUpperCase() });
  assert.deepEqual(seen.find((f) => f.name === 'lootTo').options, [
    { value: 'wren', label: 'WREN' },
    { value: 'dorn', label: 'DORN' },
  ]);
  /** @type {string[]} */
  const lines = [];
  app.actions.logEvent = (/** @type {string} */ _k, /** @type {string} */ text) => lines.push(text);
  applyFightXP(app, end, /** @type {any} */ (values));
  const [wren, dorn] = app.state.characters;
  assert.equal(wren.purse?.gp, 4);
  assert.equal(dorn.purse?.gp, 4);
  assert.deepEqual(
    dorn.inventory.map((i) => i.name),
    ['Scimitar', 'Leather Armor'],
  );
  assert.equal(wren.inventory.length, 0);
  assert.deepEqual(lines, [
    'Dorn takes Scimitar, Leather Armor from the fallen foes.',
    'The party splits the coins found: 4 gp each.',
  ]);
  const before = app.state.characters;
  applyLoot(app, end, { loot: '', gold: 0 });
  assert.equal(app.state.characters, before, 'nothing picked changes nothing');
  applyLoot(app, end, { loot: 'loot-0', lootTo: 'ghost', gold: 0 });
  assert.equal(app.state.characters, before, 'a carrier who is not an earner takes nothing');
});
