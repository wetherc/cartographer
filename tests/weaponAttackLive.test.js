import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveAttackSides } from '../src/app/weaponAttack.js';
import { createCharacter, withHP } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { stubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };
const ORDER = [{ id: 'hero' }, { id: 'goblin' }];

/** A hero and a goblin on one tile, with a fight running unless `combat` is null. */
function fight({
  hero = withHP(createCharacter('hero', 'Hero'), 12),
  combat = { order: ORDER },
} = {}) {
  const goblin = createCreature('goblin', 'Goblin', {
    disposition: 'hostile',
    maxHP: 10,
    location: HERE,
    level: 1,
  });
  return stubApp({
    state: /** @type {any} */ ({ characters: [hero], creatures: [goblin], combat }),
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
}

test('liveAttackSides reads both sides from the live state', () => {
  const app = fight();
  const renamed = { ...app.state.creatures[0], name: 'Goblin boss' };
  // A cross-tab adoption replaces the goblin while the dialog is open.
  app.state.creatures = [renamed];
  const live = liveAttackSides(app, ORDER[0], 'goblin');
  assert.ok(!('refusal' in live));
  assert.equal(live.attacker, app.state.characters[0]);
  assert.equal(live.defender.name, 'Goblin boss');
});

test('liveAttackSides refuses once the fight has ended', () => {
  const app = fight({ combat: null });
  assert.deepEqual(liveAttackSides(app, ORDER[0], 'goblin'), {
    refusal: 'The fight ended before the attack rolled.',
  });
});

test('liveAttackSides refuses an attacker that can no longer act', () => {
  const hero = {
    ...withHP(createCharacter('hero', 'Hero'), 12),
    conditions: [{ name: 'Stunned', rounds: 1 }],
  };
  const live = liveAttackSides(fight({ hero: /** @type {any} */ (hero) }), ORDER[0], 'goblin');
  assert.match(/** @type {any} */ (live).refusal, /can no longer act/);
});

test('liveAttackSides refuses an attacker that left the fight', () => {
  const live = liveAttackSides(fight(), { id: 'ghost' }, 'goblin');
  assert.match(/** @type {any} */ (live).refusal, /can no longer act/);
});

test('liveAttackSides refuses a defender that is no longer a target', () => {
  const app = fight();
  app.state.creatures = [];
  assert.match(
    /** @type {any} */ (liveAttackSides(app, ORDER[0], 'goblin')).refusal,
    /down or gone/,
  );
});
