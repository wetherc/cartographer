import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/castPlan.js';
import { rosterTargets } from '../src/app/spellTargets.js';
import { createResource } from '../src/entities/Resource.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp } from './helpers/app.js';

/** The cast plan of a ritual in the Book of Shadows. */

const HERE = { nodeId: 'n1', tileId: '0,0' };
const spell = (id) => /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));

function app(extra = {}) {
  return stubApp({
    state: {
      characters: [
        /** @type {any} */ ({
          id: 'wren',
          name: 'Wren',
          race: 'human',
          classes: [{ classId: 'warlock', level: 5 }],
          level: 5,
          xp: 0,
          stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 16 },
          resources: [
            createResource('hp', 'Hit points', 'health', 30),
            createResource('pact-3', 'Pact slots', 'mana', 2),
          ],
          inventory: [],
          conditions: [],
          spellbook: { cantrips: ['eldritch-blast'], known: [], prepared: [] },
          pactBoon: 'tome',
          invocations: ['book-of-ancient-secrets'],
          bookOfShadows: { cantrips: [], rituals: ['detect-magic'] },
          ...extra,
        }),
      ],
      creatures: [],
    },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
}

function plan(a, id) {
  const s = spell(id);
  return /** @type {any} */ (castPlan(a, a.state.characters[0], s, rosterTargets(a, s, 'wren')));
}

test('a book ritual plans as a ritual-only warlock cast with no slot', () => {
  const p = plan(app(), 'detect-magic');
  assert.equal(p.ok, true, p.message);
  assert.equal(p.ritualOnly, true);
  assert.deepEqual(p.slotLevels, []);
  assert.equal(p.sourceClass, 'warlock');
  assert.equal(p.dc, 14);
});

test('a ritual outside the book is not castable', () => {
  const p = plan(app({ bookOfShadows: { cantrips: [], rituals: [] } }), 'detect-magic');
  assert.equal(p.ritualOnly, false);
});
