import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * `src/main.js` needs a document, so no suite can run the mount. These tests
 * read the source instead, and check the order of the wiring calls. A module
 * that reads another module's registration while it mounts throws when the
 * two calls swap, and every module after it stays unwired. The failure shows
 * only in a browser, so the order is pinned here.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = (/** @type {string} */ file) => readFileSync(join(SRC, file), 'utf8');
const main = read('main.js');

/** @param {string} call */
function at(call) {
  const index = main.indexOf(call);
  assert.notEqual(index, -1, `main.js calls ${call}`);
  return index;
}

test('the saved fight reconciles after the modules it calls are wired', () => {
  const sync = at('app.actions.syncCombatLocation();');
  assert.ok(at('wireStory(app);') < sync, 'logEvent is registered first');
  assert.ok(at('wireSessionControls(app);') < sync, 'setMode is registered first');
  assert.ok(sync < at("app.actions.setMode('combat');"), 'a dropped fight does not open');
});

test('the combat screen mounts before the fight state refreshes it', () => {
  assert.ok(at('wireCombatScreen(app);') < at('wireFightState(app);'));
  assert.ok(at('wireFightState(app);') < at('wireEncounters(app, fight);'));
});

test('the encounter and story modules mount before the first map draw', () => {
  const map = at('wireMapView(app);');
  assert.ok(at('wireEncounters(app, fight);') < map, 'the Build foe list is registered');
  assert.ok(at('wireStory(app);') < map, 'the NPC list is registered');
});

test('the session controls mount after every other wiring module', () => {
  const session = at('wireSessionControls(app);');
  for (const call of [
    'wireCampaignActions(app);',
    'wireLibrary(app);',
    'wireCombatScreen(app);',
    'wireFightState(app);',
    'wireEncounters(app, fight);',
    'wireStory(app);',
    'wireParty(app, reloadView);',
    'wireMapView(app);',
    'wireGenerateAction(app, mapEnv);',
    'wireDiceTray(app);',
  ]) {
    assert.ok(at(call) < session, `${call} comes first`);
  }
});

test('the fight state does not reconcile the saved fight while it mounts', () => {
  for (const file of ['app/fightState.js', 'app/encounterWiring.js']) {
    assert.doesNotMatch(read(file), /^\s*app\.actions\.syncCombatLocation\(\);/m);
  }
});
