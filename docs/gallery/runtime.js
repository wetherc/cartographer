/**
 * The gallery's own scaffolding. A story is one rendered widget, the exact
 * call that built it, and the classes that call produces.
 *
 * The code snippet is read back from the source of the render function
 * itself, through `Function.prototype.toString`. Nothing here retypes a
 * call as a string, so a demo and the code beside it cannot drift apart.
 * The page is served as plain files with no build step, so the source the
 * browser holds is the source in the repository.
 */

import { classNames, el } from '../../src/ui/dom.js';
import { mountToasts } from '../../src/ui/Toast.js';

/** @typedef {import('../../src/ui/dom.js').Child} Child */

/**
 * One entry in the gallery.
 * @typedef {object} Story
 * @property {string} title what the entry demonstrates
 * @property {string} [notes] one or two sentences of context
 * @property {string} [classes] the class contract the call produces
 * @property {boolean} [stack] lay the demo out as a column, for a panel or
 *   a form rather than a row of controls
 * @property {boolean} [raised] draw the demo on the raised surface. The demo
 *   panel is sunken by default, which hides a widget that paints the sunken
 *   color itself, for example an empty stat-bar track
 * @property {() => Child | Child[]} render builds the demo. Its source is
 *   the snippet, so write it as the call a caller would write.
 */

/**
 * One group of stories.
 * @typedef {object} Section
 * @property {string} id the anchor and the nav link target
 * @property {string} title
 * @property {string} blurb
 * @property {Story[]} stories
 */

/** @type {{ show: (message: string) => void } | null} */
let toasts = null;

/** Mount the app's real toast stack, which demo clicks report through. */
export function mountGalleryToasts() {
  toasts = mountToasts(document.body);
}

/**
 * Report a demo click. A gallery widget acts on nothing, so a click has to
 * confirm itself some other way. It does that through the app's own toasts,
 * which makes the toast stack part of the gallery as well.
 * @param {string} message
 */
export function notify(message) {
  toasts?.show(message);
}

/**
 * Strip the shared leading indentation from a block of source, and drop
 * blank lines at either end.
 * @param {string} text
 * @returns {string}
 */
export function dedent(text) {
  const lines = text.replace(/\t/g, '  ').split('\n');
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => line.length - line.trimStart().length);
  const shared = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(shared)).join('\n');
}

/**
 * Pull the continuation lines of a one-expression body back under their
 * first line. A call written inside a story sits several levels deep in the
 * source, and only its opening line loses that depth when the expression is
 * cut out of the function. This takes the same depth off the lines below it,
 * so the snippet reads as it would at the top level of a file.
 * @param {string} text
 * @returns {string}
 */
function reindent(text) {
  const [first, ...rest] = text.split('\n');
  if (first === undefined || first.startsWith(' ')) return text;
  const indents = rest
    .filter((line) => line.trim() !== '')
    .map((line) => line.length - line.trimStart().length);
  const shared = indents.length > 0 ? Math.min(...indents) : 0;
  if (shared === 0) return text;
  return [first, ...rest.map((line) => line.slice(shared))].join('\n');
}

/**
 * The body of an arrow function, as source. A one-expression arrow gives
 * the expression. A braced arrow gives its statements. A story that shows
 * several widgets at once returns them in an array, and the brackets are
 * scaffolding rather than part of the call, so they come off too. In every
 * case the shared indentation is stripped.
 * @param {() => unknown} fn
 * @returns {string}
 */
export function snippetOf(fn) {
  const text = String(fn);
  const arrow = text.indexOf('=>');
  if (arrow === -1) return dedent(text);
  const body = text.slice(arrow + 2).trim();
  const wrapped =
    (body.startsWith('{') && body.endsWith('}')) || (body.startsWith('[') && body.endsWith(']'));
  return reindent(dedent(wrapped ? body.slice(1, -1) : body));
}

/**
 * Build one story: the heading, the live widget, the source, and the class
 * contract.
 * @param {Story} story
 * @returns {HTMLElement}
 */
export function buildStory(story) {
  const rendered = story.render();
  const demo = el(
    'div',
    classNames(['gx-demo', story.stack && 'gx-demo--stack', story.raised && 'gx-demo--raised']),
  );
  for (const node of Array.isArray(rendered) ? rendered : [rendered]) {
    if (node === null || node === undefined || node === false) continue;
    demo.append(node);
  }

  return el(
    'article',
    'gx-story',
    el(
      'header',
      'gx-story__head',
      el('h3', 'gx-story__title', story.title),
      story.notes ? el('p', 'gx-story__notes u-muted', story.notes) : null,
    ),
    demo,
    // The snippet is set as text, never as markup, so a code sample can
    // hold angle brackets without being parsed as one.
    el('pre', 'gx-code', el('code', '', snippetOf(story.render))),
    story.classes ? el('p', 'gx-classes', story.classes) : null,
  );
}

/**
 * Build one section, with an id the nav links to.
 * @param {Section} section
 * @returns {HTMLElement}
 */
export function buildSection(section) {
  const root = el(
    'section',
    'gx-section',
    el('h2', 'gx-section__title', section.title),
    el('p', 'gx-section__blurb', section.blurb),
  );
  root.id = section.id;
  for (const story of section.stories) root.append(buildStory(story));
  return root;
}

/**
 * Build the side navigation over the sections.
 * @param {Section[]} sections
 * @returns {HTMLElement[]}
 */
export function buildNav(sections) {
  return sections.map((section) => {
    const link = el('a', 'gx-nav__link', section.title);
    link.href = `#${section.id}`;
    return link;
  });
}
