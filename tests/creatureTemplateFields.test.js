import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromTemplate, toTemplate } from '../src/entities/CreatureTemplate.js';
import { createCreature } from '../src/entities/Creature.js';

test('toTemplate fills a missing disposition and stat block', () => {
  const bare = /** @type {any} */ ({
    ...createCreature('x', 'Shade', { maxHP: 9 }),
    disposition: undefined,
    stats: undefined,
  });
  const template = toTemplate('t', bare);
  assert.equal(template.disposition, 'neutral');
  assert.equal(typeof template.stats, 'object');
  assert.ok(!('role' in template));
  assert.ok(!('notes' in template));
});

test('a role and notes go from creature to template to spawn', () => {
  const smith = createCreature('s', 'Smith', {
    disposition: 'friendly',
    maxHP: 4,
    role: 'blacksmith',
    notes: 'Owes the party a favor.',
  });
  const template = toTemplate('t', smith);
  assert.equal(template.role, 'blacksmith');
  assert.equal(template.notes, 'Owes the party a favor.');
  const spawn = fromTemplate(template, 's2');
  assert.equal(spawn.role, 'blacksmith');
  assert.equal(spawn.notes, 'Owes the party a favor.');
});
