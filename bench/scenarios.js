/**
 * The scripted interactions the harness measures.
 *
 * Every scenario drives the real UI: a button click, a pointer drag over the
 * canvas, a wheel gesture, a synthesized cross-tab save. None of them reach
 * into app state, so a measurement covers the same code a GM's action runs.
 *
 * A scenario returns a record of what it did. It can return `{ skipped:
 * reason }` when the UI it needs is absent, for example a fight scenario in a
 * campaign whose party stands on an empty tile. A skip is reported, not an
 * error, so one absent control never costs the whole run.
 *
 * Order matters. `load-example` reloads the page onto the example campaign,
 * and every scenario after it reads that campaign.
 */

import { SAVE_KEY } from './seed.js';

const MODE_BUTTON = '#mode-switch-container button';
const CONFIRM_BUTTON = 'dialog button, .modal button';

/** Wait for the app to finish its first mount. */
async function waitForApp(page) {
  await page.waitFor("document.querySelector('#map-canvas')");
  await page.waitFor("document.querySelector('#party-container .card__title')");
}

/** Switch the app mode through the header switch. */
async function setMode(page, label) {
  const clicked = await page.clickText(MODE_BUTTON, label);
  if (!clicked) throw new Error(`no mode button labelled ${label}`);
  await page.eval('return new Promise((r) => requestAnimationFrame(() => r(null)));');
}

/** Drag the pointer across the canvas in a straight line, one event per step. */
async function dragAcross(page, box, { steps = 24, row = 0.5 } = {}) {
  const y = box.y + box.height * row;
  const from = box.x + box.width * 0.08;
  const to = box.x + box.width * 0.92;
  await page.mouse('mousePressed', from, y);
  for (let i = 1; i <= steps; i++) {
    await page.mouse('mouseMoved', from + ((to - from) * i) / steps, y, { buttons: 1 });
  }
  await page.mouse('mouseReleased', to, y);
}

/** @type {{ name: string, description: string, run: (page: any, ctx: any) => Promise<any> }[]} */
export const SCENARIOS = [
  {
    name: 'boot',
    description: 'Cold load of a blank campaign, up to the first mounted panel.',
    async run(page, { url }) {
      await page.navigate(url);
      await waitForApp(page);
      return { nodes: (await page.metrics()).Nodes };
    },
  },

  {
    name: 'load-example',
    description: 'Build the example campaign, persist it, and reload onto it.',
    async run(page, { url }) {
      await page.clickSelector('#example-btn');
      const present = await page.eval(`
        return [...document.querySelectorAll(${JSON.stringify(CONFIRM_BUTTON)})]
          .some((n) => n.textContent.trim() === 'Load example');
      `);
      if (!present) return { skipped: 'no Load example confirm button' };
      // Accepting persists the campaign and reloads, so the click cannot
      // answer. The wait is for the second document's load event.
      await page.clickForReload(CONFIRM_BUTTON, 'Load example');
      await waitForApp(page);
      return { url };
    },
  },

  {
    name: 'paint-stroke',
    description: 'One authoring stroke of 24 cells across the current node.',
    async run(page) {
      await setMode(page, 'Build');
      const picked = await page.clickSelector('.palette__swatch');
      if (!picked) return { skipped: 'no palette swatch' };
      const box = await page.box('#map-canvas');
      await dragAcross(page, box);
      await setMode(page, 'Play');
      return { steps: 24 };
    },
  },

  {
    name: 'generate-map',
    description: 'Procedural generation of a large node, through the Generate dialog.',
    async run(page) {
      await setMode(page, 'Build');
      const opened = await page.clickSelector('#generate-btn');
      if (!opened) return { skipped: 'no generate button' };
      await page.waitFor(`[...document.querySelectorAll('${CONFIRM_BUTTON}')].length > 0`);
      // The dialog's own primary control carries the word Generate. Anything
      // else in the dialog is a size or archetype choice, left at its default.
      const accepted =
        (await page.clickText(CONFIRM_BUTTON, 'Generate')) ||
        (await page.clickText(CONFIRM_BUTTON, 'Generate map'));
      if (!accepted) {
        await page.eval("document.querySelector('dialog')?.close();");
        return { skipped: 'no generate confirm button' };
      }
      // A generate over a filled node asks a second time.
      await page.eval(`
        const again = [...document.querySelectorAll(${JSON.stringify(CONFIRM_BUTTON)})]
          .find((n) => /overwrite|replace|generate/i.test(n.textContent));
        if (again) again.click();
        return null;
      `);
      await setMode(page, 'Play');
      return { accepted: true };
    },
  },

  {
    name: 'zoom-pan',
    description: 'Twenty wheel-zoom steps at the canvas center, in and then out.',
    async run(page) {
      const box = await page.box('#map-canvas');
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      for (let i = 0; i < 10; i++) await page.wheel(cx, cy, -120);
      for (let i = 0; i < 10; i++) await page.wheel(cx, cy, 120);
      return { steps: 20 };
    },
  },

  {
    name: 'play-pan',
    description: 'One right-drag pan across the fog-revealed map in Play mode.',
    // Play mode is the one place the cell grid clips itself to the revealed
    // cells, and that clip is rebuilt on every frame. The Build-mode
    // authoring numbers never pay it, so this pan is what prices it.
    async run(page) {
      const box = await page.box('#map-canvas');
      const y = box.y + box.height * 0.5;
      const from = box.x + box.width * 0.85;
      const to = box.x + box.width * 0.15;
      const steps = 48;
      const right = { button: 'right', buttons: 2 };
      await page.mouse('mousePressed', from, y, right);
      for (let i = 1; i <= steps; i++) {
        await page.mouse('mouseMoved', from + ((to - from) * i) / steps, y, right);
      }
      await page.mouse('mouseReleased', to, y, right);
      return { steps };
    },
  },

  {
    name: 'panel-tabs',
    description: 'Thirty sidebar tab switches, which rebuild the session panels.',
    async run(page) {
      const labels = ['Story', 'Log', 'Session'];
      for (let i = 0; i < 30; i++) {
        const clicked = await page.clickText('#sidebar-tabs button', labels[i % labels.length]);
        if (!clicked) return { skipped: 'no sidebar tabs' };
      }
      return { switches: 30 };
    },
  },

  {
    name: 'rehydrate',
    description: 'Fifty cross-tab save adoptions, the leak check for panel rebuilds.',
    async run(page) {
      const rounds = 50;
      // A dirty campaign answers an external save with a confirm dialog
      // instead of adopting it, so the scenario saves first. An earlier
      // authoring scenario in the same run is what leaves it dirty.
      await page.clickSelector('#save-btn');
      const ok = await page.eval(`
        const key = 'campaign-builder:save';
        const value = localStorage.getItem(key);
        if (value === null) return false;
        for (let i = 0; i < ${rounds}; i++) {
          window.dispatchEvent(new StorageEvent('storage', {
            key,
            oldValue: null,
            newValue: value,
            storageArea: localStorage,
          }));
          await new Promise((r) => setTimeout(r, 5));
        }
        return true;
      `);
      return ok ? { rounds } : { skipped: 'no save in localStorage' };
    },
  },

  {
    name: 'combat-turns',
    description: 'Start a fight on the party tile, advance twenty turns, then end it.',
    async run(page, { seedSave }) {
      let started = await page.clickText('#encounter-container button', 'Start combat');
      if (!started && seedSave) {
        // The party stands on an empty tile, so the harness loads a save that
        // puts it on an encounter. The reload here is part of the setup and
        // sits before the measured turns.
        await page.eval(`
          localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(seedSave)});
          return null;
        `);
        await page.reload();
        await waitForApp(page);
        started = await page.clickText('#encounter-container button', 'Start combat');
      }
      if (!started) return { skipped: 'no encounter on the party tile' };
      await page.waitFor(`[...document.querySelectorAll('${CONFIRM_BUTTON}')].length > 0`);
      await page.clickText(CONFIRM_BUTTON, 'Roll initiative');
      const confirmed = await page.clickText(CONFIRM_BUTTON, 'Start combat');
      if (!confirmed) return { skipped: 'no Start combat control in the setup dialog' };
      await page.waitFor("document.querySelector('#combat-screen').children.length > 0");
      let turns = 0;
      for (let i = 0; i < 20; i++) {
        const advanced = await page.clickText('#combat-screen button', 'Next turn');
        if (!advanced) break;
        turns += 1;
      }
      await page.clickText('#combat-screen button', 'End combat');
      await page.clickText(CONFIRM_BUTTON, 'End combat');
      return { turns };
    },
  },

  {
    name: 'rehydrate-focus',
    description: 'Whether the keyboard position survives ten cross-tab save adoptions.',
    // This scenario reloads onto the seed save, so it runs last. A reload
    // in the middle of the run changes what the scenarios after it start
    // from. It reports `focusKept`, not a timing, and it is a correctness
    // check that the harness already had the machinery for.
    async run(page, { seedSave }) {
      if (!seedSave) return { skipped: 'no seed save' };
      // A dirty campaign blocks the reload with its own prompt, so the
      // save comes first.
      await page.clickSelector('#save-btn');
      await page.eval(`
        localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(seedSave)});
        return null;
      `);
      await page.reload();
      await waitForApp(page);
      // The encounter panel lives on the Session tab, and an earlier
      // scenario can leave another tab open. A control on a closed tab
      // cannot take focus at all.
      await page.clickText('#sidebar-tabs button', 'Session');
      return page.eval(`
        const key = 'campaign-builder:save';
        const value = localStorage.getItem(key);
        if (value === null) return { skipped: 'no save in localStorage' };
        const label = (el) =>
          el ? (el.getAttribute('aria-label') ?? el.textContent.trim()) : null;
        // Every candidate here is a row control of a panel that the list
        // panel builds. The party panel is left out, because it rebuilds
        // through its own path.
        const candidates = [
          ...document.querySelectorAll(
            '#encounter-container .encounter-panel__row button, #encounter-container .encounter-panel__row input',
          ),
        ];
        let target = null;
        for (const candidate of candidates) {
          candidate.focus();
          if (document.activeElement === candidate) {
            target = candidate;
            break;
          }
        }
        const before = label(target);
        for (let i = 0; i < 10; i++) {
          window.dispatchEvent(new StorageEvent('storage', {
            key, oldValue: null, newValue: value, storageArea: localStorage,
          }));
          await new Promise((r) => setTimeout(r, 20));
        }
        // The rebuilt control is a different element with the same
        // accessible name, so the names are what to compare.
        return {
          focusTarget: before,
          focusKept: before === null ? null : label(document.activeElement) === before,
        };
      `);
    },
  },
];
