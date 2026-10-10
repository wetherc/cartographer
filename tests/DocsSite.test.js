import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteFiles, EXTRA_PAGES } from '../scripts/docs-site.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = siteFiles(ROOT);
const published = new Set(files.map((f) => f.to));
const pages = files.filter((f) => f.to.endsWith('.md') && !f.to.startsWith('_'));

/**
 * The URL that Jekyll gives a Markdown page on GitHub Pages. An index.md
 * serves its directory, and every other page gets an .html name.
 * @param {string} path
 */
function pageUrl(path) {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const name = path.slice(dir.length);
  if (name === 'index.md') return `/${dir}`;
  return `/${path.replace(/\.md$/, '.html')}`;
}

/** The heading ids that kramdown's GFM parser writes for a page. */
function headingIds(markdown) {
  const ids = new Set();
  const counts = new Map();
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const m = !fenced && /^#{1,6} (.+)$/.exec(line);
    if (!m) continue;
    const text = m[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '');
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_\- ]/gu, '')
      .replace(/ /g, '-');
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    ids.add(n ? `${base}-${n}` : base);
  }
  return ids;
}

/** The inline links and images of a page, outside code. */
function links(markdown) {
  const out = [];
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) continue;
    for (const m of line.replace(/`[^`]*`/g, '').matchAll(/\]\(([^)\s]+)\)/g)) out.push(m[1]);
  }
  return out;
}

const NAV = readFileSync(join(ROOT, 'site/_data/docs_nav.yml'), 'utf8');
const navUrls = [...NAV.matchAll(/url: (\S+)/g)].map((m) => m[1]);

test('the site ships the Jekyll settings, the layout, and the home page', () => {
  for (const path of ['_config.yml', '_layouts/docs.html', '_data/docs_nav.yml', 'docs/index.md']) {
    assert.ok(published.has(path), path);
  }
});

test('the browser pages ship with the files they load', () => {
  for (const path of [
    'docs/dev-guide.html',
    'docs/gallery.html',
    'docs/tile-gallery.html',
    'style.css',
  ]) {
    assert.ok(published.has(path), path);
  }
  // Follow each relative import from the UI gallery entry, as the browser does.
  const seen = new Set();
  const queue = ['docs/gallery/main.js'];
  while (queue.length) {
    const path = queue.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    assert.ok(published.has(path), path);
    const source = readFileSync(join(ROOT, files.find((f) => f.to === path).from), 'utf8');
    for (const m of source.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s*'(\.[^']+)'/gm)) {
      queue.push(normalize(join(dirname(path), m[1])));
    }
  }
  assert.ok(seen.size > 20, 'the gallery imports the source modules');
  // The stylesheet manifest imports each feature sheet.
  const sheets = [
    ...readFileSync(join(ROOT, 'style.css'), 'utf8').matchAll(/@import url\('([^']+)'\)/g),
  ];
  assert.ok(sheets.length > 0);
  for (const [, sheet] of sheets) assert.ok(published.has(sheet), sheet);
  const tiles = readFileSync(join(ROOT, 'tests/tile-preview.html'), 'utf8');
  assert.ok(tiles.includes('../assets/tiles/'));
});

test('the pages outside docs/ ship at their repository paths', () => {
  for (const path of EXTRA_PAGES) assert.ok(published.has(path), path);
});

test('the fonts that docs.css names ship under fonts/', () => {
  const css = readFileSync(join(ROOT, 'site/docs/assets/docs.css'), 'utf8');
  const urls = [...css.matchAll(/url\('\/([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(urls.length > 0);
  for (const url of urls) assert.ok(published.has(url), url);
});

test('each sidebar entry points at a published page', () => {
  const urls = new Set(pages.map((f) => pageUrl(f.to)));
  for (const url of navUrls) {
    assert.ok(urls.has(url) || published.has(url.slice(1)), url);
  }
  assert.equal(new Set(navUrls).size, navUrls.length, 'a sidebar entry repeats');
});

test('the sidebar lists every published page', () => {
  for (const { to } of pages)
    assert.ok(navUrls.includes(pageUrl(to)), `${to} is not in the sidebar`);
});

test('each relative link and anchor resolves on the site', () => {
  const ids = new Map(
    pages.map((f) => [f.to, headingIds(readFileSync(join(ROOT, f.from), 'utf8'))]),
  );
  const broken = [];
  for (const { from, to } of pages) {
    for (const href of links(readFileSync(join(ROOT, from), 'utf8'))) {
      if (/^[a-z]+:/.test(href)) continue;
      const [path, anchor] = href.split('#');
      const target = path ? normalize(join(dirname(to), path)) : to;
      if (!published.has(target)) {
        broken.push(`${to}: ${href}`);
      } else if (anchor && target.endsWith('.md') && !ids.get(target).has(anchor)) {
        broken.push(`${to}: ${href} (no such heading)`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('headingIds follows the GFM id rules', () => {
  const ids = headingIds(
    '# A `code()` title\n## Hit riders, and the pact weapon\n## Same\n## Same\n```\n# not\n```',
  );
  assert.deepEqual([...ids], ['a-code-title', 'hit-riders-and-the-pact-weapon', 'same', 'same-1']);
});

/**
 * The text from the `## Features` heading up to the next `## ` heading.
 * @param {string} text
 */
function featuresSection(text) {
  const start = text.indexOf('\n## Features\n');
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end);
}

test('docs/index.md repeats the README feature list, with links relative to docs/', () => {
  const readme = featuresSection(readFileSync(join(ROOT, 'README.md'), 'utf8'));
  const index = featuresSection(readFileSync(join(ROOT, 'docs/index.md'), 'utf8'));
  assert.ok(readme.includes('### World building'));
  assert.equal(index, readme.replaceAll('](docs/', ']('));
});
