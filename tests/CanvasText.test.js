import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawPlatedLabel, drawPlatedLabels } from '../src/map/CanvasText.js';

/** A context that records each call and each state write, in order. */
function recorder() {
  /** @type {any[]} */
  const log = [];
  const ctx = new Proxy(
    { measureText: (/** @type {string} */ t) => ({ width: t.length * 10 }) },
    {
      get(target, key) {
        if (key === 'measureText') return target.measureText;
        if (key in target) return target[key];
        return (...args) => log.push([key, ...args]);
      },
      set(target, key, value) {
        log.push(['set', key, value]);
        return true;
      },
    },
  );
  return { ctx, log };
}

test('drawPlatedLabels sets the font once for a run, inside one save', () => {
  const { ctx, log } = recorder();
  drawPlatedLabels(
    ctx,
    [
      { text: '1', x: 10, y: 5 },
      { text: '2', x: 30, y: 5 },
    ],
    { fontSize: 10, color: 'white' },
  );
  assert.equal(log.filter((e) => e[1] === 'font').length, 1);
  assert.equal(log.filter((e) => e[0] === 'save').length, 1);
  assert.deepEqual(
    log.filter((e) => e[0] === 'fillText'),
    [
      ['fillText', '1', 10, 5],
      ['fillText', '2', 30, 5],
    ],
  );
  assert.deepEqual(log.at(-1), ['restore']);
});

test('drawPlatedLabels draws each plate before its own text', () => {
  const { ctx, log } = recorder();
  drawPlatedLabels(
    ctx,
    [
      { text: 'ab', x: 50, y: 20 },
      { text: 'c', x: 90, y: 20 },
    ],
    { fontSize: 10, plate: 'pill', plateColor: 'black', color: 'white' },
  );
  const order = log.filter((e) => e[0] === 'roundRect' || e[0] === 'fillText').map((e) => e[0]);
  assert.deepEqual(order, ['roundRect', 'fillText', 'roundRect', 'fillText']);
  // 'ab' measures 20, plus 2.5 padding each side, centered on 50; the height
  // is 10 plus 1 padding each side, centered on 20.
  assert.deepEqual(
    log.find((e) => e[0] === 'roundRect'),
    ['roundRect', 37.5, 14, 25, 12, 3],
  );
  const styles = log.filter((e) => e[1] === 'fillStyle').map((e) => e[2]);
  assert.deepEqual(styles, ['black', 'white', 'black', 'white']);
});

test('drawPlatedLabel places a plate for each alignment and baseline', () => {
  const rect = (/** @type {any} */ opts) => {
    const { ctx, log } = recorder();
    drawPlatedLabel(ctx, 'ab', 100, 50, { fontSize: 10, plate: 'rect', padX: 2, padY: 1, ...opts });
    return log.find((e) => e[0] === 'roundRect').slice(1, 3);
  };
  assert.deepEqual(rect({ align: 'left', baseline: 'top' }), [98, 49]);
  assert.deepEqual(rect({ align: 'right', baseline: 'bottom' }), [78, 39]);
  assert.deepEqual(rect({ align: 'end', baseline: 'alphabetic' }), [78, 39]);
  assert.deepEqual(rect({ align: 'center', baseline: 'middle' }), [88, 44]);
});
