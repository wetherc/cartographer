import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The rules of the UI guide that no linter states for us. Every one of them
 * is about drift: a class name typed by hand where a builder owns it, a
 * shared module that learned one feature's vocabulary, a sheet nothing
 * imports. None of these break a test elsewhere, and all of them are
 * invisible in review once the tree is large enough.
 *
 * These read the source as text. That is the only tool available, because
 * the modules they check build DOM and the runner has no document. A
 * failure prints the offending file and line, so the fix is the call the
 * message names.
 *
 * See `docs/architecture/ui-components.md` for the rules themselves.
 */

const SRC = new URL('../src/', import.meta.url).pathname;
const STYLES = new URL('../styles/', import.meta.url).pathname;
const ROOT = new URL('../', import.meta.url).pathname;

/**
 * Every JavaScript file under `src/`, as a path relative to `src/` and its
 * text.
 * @param {string} [dir]
 * @param {string} [prefix]
 * @returns {{ path: string, text: string }[]}
 */
function sources(dir = SRC, prefix = '') {
  /** @type {{ path: string, text: string }[]} */
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) found.push(...sources(join(dir, entry.name), `${relative}/`));
    else if (entry.name.endsWith('.js'))
      found.push({ path: relative, text: readFileSync(join(dir, entry.name), 'utf8') });
  }
  return found;
}

/**
 * Every class name a file writes by hand, with the line it sits on. A class
 * reaches the DOM through the second argument of `el`, a `className` option,
 * or a string inside a `classNames` list, so this reads all three. A class
 * assembled from a template string is skipped, since a scan cannot resolve
 * it, and the guide asks for a literal in the first place.
 * @param {string} text
 * @returns {{ name: string, line: number }[]}
 */
function classNamesIn(text) {
  /** @type {{ name: string, line: number }[]} */
  const found = [];
  /** @param {string} literal @param {number} at */
  const take = (literal, at) => {
    const line = text.slice(0, at).split('\n').length;
    for (const name of literal.split(/\s+/).filter(Boolean)) found.push({ name, line });
  };

  const single = /(?:\bel\(\s*'[a-z0-9]+'\s*,\s*|className:\s*)'([^']*)'/g;
  for (const match of text.matchAll(single)) take(match[1], match.index);

  // A classNames list holds several literals, mixed with conditions and
  // variables. Every literal in the list is a class this file names.
  const list = /\bclassNames\(\[([\s\S]*?)\]/g;
  for (const match of text.matchAll(list)) {
    for (const inner of match[1].matchAll(/'([^']*)'/g)) take(inner[1], match.index);
  }
  return found;
}

/**
 * The block a class belongs to: `chip__remove` and `chip--active` are both
 * the `chip` block.
 * @param {string} name
 * @returns {string}
 */
function blockOf(name) {
  return name.split('--')[0].split('__')[0];
}

/**
 * The module that owns each shared block. A block listed here is the output
 * of a builder, so no other module may name it.
 * @type {Record<string, string>}
 */
const OWNERS = {
  btn: 'ui/buttons.js',
  'btn-bare': 'ui/buttons.js',
  chip: 'ui/buttons.js',
  badge: 'ui/buttons.js',
  'section-label': 'ui/buttons.js',
  'empty-state': 'ui/buttons.js',
  'seg-switch': 'ui/buttons.js',
  'fact-line': 'ui/FactLine.js',
  disclosure: 'ui/Disclosure.js',
  'stat-bar': 'ui/CharacterBars.js',
  tabs: 'ui/Tabs.js',
  toast: 'ui/Toast.js',
  'toast-stack': 'ui/Toast.js',
  icon: 'ui/icons.js',
};

/**
 * Where one primitive is deliberately composed into another. A disclosure
 * header takes the `section-label` treatment when it carries a label, so
 * that a collapsible group heading looks like every other group heading.
 * The class goes on the header button itself, so `sectionLabel`, which
 * builds an element, does not fit. The guide documents this pairing.
 * @type {Record<string, string[]>}
 */
const COMPOSERS = {
  'section-label': ['ui/Disclosure.js'],
};

/**
 * The blocks each shared module is allowed to name, on top of the utility
 * layer. A shared module is one that features import; it must not learn the
 * vocabulary of any single feature. The modal modules are allowed `field`
 * as well, since their plain controls take the same skin as an inline
 * form's.
 * @type {Record<string, string[]>}
 */
const SHARED_MODULES = {
  'ui/buttons.js': [
    'btn',
    'btn-bare',
    'chip',
    'badge',
    'section-label',
    'empty-state',
    'seg-switch',
  ],
  'ui/formFields.js': ['form', 'field', 'field-check'],
  'ui/Modal.js': ['modal', 'field'],
  'ui/ModalFields.js': ['modal', 'field'],
  'ui/Tabs.js': ['tabs'],
  'ui/Disclosure.js': ['disclosure', 'section-label'],
  'ui/Toast.js': ['toast', 'toast-stack'],
  'ui/FactLine.js': ['fact-line'],
  'ui/icons.js': ['icon'],
  'ui/ContextMenu.js': ['context-menu'],
  'ui/listPanel.js': [],
  'ui/dom.js': [],
};

test('innerHTML is only ever cleared, never assigned markup', () => {
  /** @type {string[]} */
  const offenders = [];
  for (const file of sources()) {
    file.text.split('\n').forEach((text, index) => {
      const match = /\.innerHTML\s*=\s*(.+)/.exec(text);
      if (match && match[1].trim() !== "'';") offenders.push(`src/${file.path}:${index + 1}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `Build the content with el() instead. Clearing with innerHTML = '' is the only assignment allowed:\n${offenders.join('\n')}`,
  );
});

test('a builder-owned class is never typed by hand elsewhere', () => {
  /** @type {string[]} */
  const offenders = [];
  for (const file of sources()) {
    for (const { name, line } of classNamesIn(file.text)) {
      const block = blockOf(name);
      const owner = OWNERS[block];
      if (!owner || owner === file.path) continue;
      if (COMPOSERS[block]?.includes(file.path)) continue;
      offenders.push(`src/${file.path}:${line} writes "${name}", which ${owner} owns`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Call the builder and pass className for your own modifier:\n${offenders.join('\n')}`,
  );
});

test('a shared module names no feature vocabulary', () => {
  /** @type {string[]} */
  const offenders = [];
  for (const [path, blocks] of Object.entries(SHARED_MODULES)) {
    const text = readFileSync(join(SRC, path), 'utf8');
    for (const { name, line } of classNamesIn(text)) {
      if (name.startsWith('u-') || blocks.includes(blockOf(name))) continue;
      offenders.push(`src/${path}:${line} writes "${name}"`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `A shared module emits its own vocabulary and the utility layer, nothing else. Take the class from the caller:\n${offenders.join('\n')}`,
  );
});

test('style.css lists every sheet under styles/, and nothing missing', () => {
  const manifest = readFileSync(join(ROOT, 'style.css'), 'utf8');
  const imported = [...manifest.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)].map((match) =>
    match[1].replace(/^\.?\/?styles\//, ''),
  );
  const present = readdirSync(STYLES).filter((name) => name.endsWith('.css'));
  assert.deepEqual(
    [...imported].sort(),
    [...present].sort(),
    'A sheet nobody imports is dead, and an import with no file is a silent 404.',
  );
});
