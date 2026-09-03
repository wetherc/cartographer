import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyToTarget } from '../src/app/combatants.js';
import { createCharacter, withHP } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { stubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** A stub app with the given rosters and the party standing on HERE. */
function appWith(/** @type {{ characters?: any[], creatures?: any[] }} */ rosters) {
  return stubApp({
    state: rosters,
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
}

const goblin = () =>
  createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  });

test('applyToTarget with manual set logs the amount and the HP left on a creature', () => {
  const app = appWith({ creatures: [goblin()] });
  applyToTarget(app, 'goblin', 4, false, { manual: true });
  assert.deepEqual(app.log, ['Goblin takes 4 damage (HP 6/10).']);
  applyToTarget(app, 'goblin', 6, false, { manual: true });
  assert.deepEqual(app.log.slice(1), ['Goblin takes 6 damage (HP 0/10).', 'Defeated Goblin.']);
  applyToTarget(app, 'goblin', 3, true, { manual: true });
  assert.equal(app.log.at(-1), 'Goblin heals 3 (HP 3/10).');
});

test('applyToTarget with manual set logs the amount before the drop line on a character', () => {
  const app = appWith({ characters: [withHP(createCharacter('hero', 'Hero'), 10)] });
  applyToTarget(app, 'hero', 12, false, { manual: true });
  assert.deepEqual(app.log, ['Hero takes 12 damage (HP 0/10).', 'Hero drops to 0 HP.']);
  applyToTarget(app, 'hero', 4, true, { manual: true });
  assert.deepEqual(app.log.slice(2), ['Hero heals 4 (HP 4/10).', 'Hero regains consciousness.']);
});

test('applyToTarget with manual set drops the readout for a character without HP', () => {
  const app = appWith({ characters: [createCharacter('hero', 'Hero')] });
  applyToTarget(app, 'hero', 3, false, { manual: true });
  assert.deepEqual(app.log, ['Hero takes 3 damage.']);
});

test('applyToTarget without manual set writes no amount line', () => {
  const app = appWith({ creatures: [goblin()] });
  applyToTarget(app, 'goblin', 4, false);
  applyToTarget(app, 'goblin', 2, true);
  assert.deepEqual(app.log, []);
});
