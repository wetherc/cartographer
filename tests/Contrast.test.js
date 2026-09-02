import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The color tokens in styles/base.css promise WCAG AA contrast: 4.5:1 for
// text on every surface, 3:1 for the control boundary line. This test reads
// the light-dark() declarations and checks each pair in both themes.

const CSS_PATH = fileURLToPath(new URL('../styles/base.css', import.meta.url));
const TOKEN_RE = /--([a-z-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi;

const SURFACES = ['bg', 'surface', 'surface-raised', 'surface-sunken'];
const TEXT = [
  'text',
  'text-muted',
  'accent',
  'accent-hover',
  'danger',
  'success',
  'warning',
  'mana',
];

/** @returns {{ light: Record<string, string>, dark: Record<string, string> }} */
function readTokens() {
  const css = readFileSync(CSS_PATH, 'utf8');
  /** @type {Record<string, string>} */
  const light = {};
  /** @type {Record<string, string>} */
  const dark = {};
  for (const match of css.matchAll(TOKEN_RE)) {
    light[match[1]] = match[2];
    dark[match[1]] = match[3];
  }
  return { light, dark };
}

/** @param {string} hex */
function luminance(hex) {
  /** @param {number} at */
  const channel = (at) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** @param {string} a @param {string} b */
function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const tokens = readTokens();

test('contrast matches the WCAG reference values', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(0), '21');
  assert.equal(contrast('#ffffff', '#ffffff').toFixed(0), '1');
  assert.equal(contrast('#767676', '#ffffff').toFixed(2), '4.54');
});

test('base.css declares every surface and text token in both themes', () => {
  for (const name of [...SURFACES, ...TEXT, 'border-strong']) {
    assert.match(tokens.light[name], /^#[0-9a-f]{6}$/i, `light ${name}`);
    assert.match(tokens.dark[name], /^#[0-9a-f]{6}$/i, `dark ${name}`);
  }
});

for (const theme of /** @type {const} */ (['light', 'dark'])) {
  const palette = tokens[theme];

  test(`${theme}: every text token reaches 4.5:1 on every surface`, () => {
    for (const text of TEXT) {
      for (const surface of SURFACES) {
        const ratio = contrast(palette[text], palette[surface]);
        assert.ok(ratio >= 4.5, `${theme} --${text} on --${surface} is ${ratio.toFixed(2)}`);
      }
    }
  });

  test(`${theme}: --border-strong reaches 3:1 on every surface`, () => {
    for (const surface of SURFACES) {
      const ratio = contrast(palette['border-strong'], palette[surface]);
      assert.ok(ratio >= 3, `${theme} --border-strong on --${surface} is ${ratio.toFixed(2)}`);
    }
  });
}
