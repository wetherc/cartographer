import { el, uniqueId } from './dom.js';
import { icon } from './icons.js';
import { highlight, queryTerms } from '../view/CampaignSearch.js';

/** @typedef {import('../view/CampaignSearch.js').SearchResult} SearchResult */
/** @typedef {import('../view/CampaignSearch.js').SearchGroup & { total: number }} SearchGroup */

/**
 * The header search box. It follows the ARIA combobox pattern with a list
 * popup: the input keeps focus, the arrow keys move the active option
 * through `aria-activedescendant`, Enter opens the active match (or the
 * first one), and Escape closes the list, then clears the text. The options
 * sit in one group per kind, each group named by its heading. A polite live
 * region states the number of matches as the GM types.
 *
 * The search itself is the pure `view/CampaignSearch.js`. This widget only
 * draws its groups and reports the chosen result to `onChoose`.
 * @param {HTMLElement} container
 * @param {{
 *   search: (query: string) => SearchGroup[],
 *   onChoose: (result: SearchResult) => void,
 * }} options
 * @returns {{ focus: () => void, close: () => void }}
 */
export function mountCampaignSearch(container, options) {
  const listId = uniqueId('campaign-search-list');
  const input = el('input', 'campaign-search__input');
  Object.assign(input, { type: 'search', placeholder: 'Search campaign', autocomplete: 'off' });
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', 'Search the campaign');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', listId);

  const list = el('div', 'campaign-search__list');
  list.id = listId;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Search results');
  const empty = el('p', 'campaign-search__empty');
  const popup = el('div', 'campaign-search__popup', list, empty);
  popup.hidden = true;
  const status = el('span', 'sr-only');
  status.setAttribute('role', 'status');

  const field = el('div', 'campaign-search__field', icon('search', { size: 16 }), input);
  const root = el('div', 'campaign-search', field, popup, status);
  root.setAttribute('role', 'search');
  container.append(root);

  /** The options in list order, each with the result it stands for. @type {{ node: HTMLElement, result: SearchResult }[]} */
  let shown = [];
  let active = -1;

  /** @param {number} index */
  function setActive(index) {
    shown[active]?.node.setAttribute('aria-selected', 'false');
    active = index;
    const current = shown[active];
    if (!current) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    current.node.setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', current.node.id);
    current.node.scrollIntoView({ block: 'nearest' });
  }

  /** @param {boolean} open */
  function setOpen(open) {
    popup.hidden = !open;
    input.setAttribute('aria-expanded', String(open && shown.length > 0));
  }

  /**
   * The text with the matched words marked.
   * @param {string} text
   * @param {string[]} terms
   * @param {string} className
   */
  function marked(text, terms, className) {
    return el(
      'span',
      className,
      ...highlight(text, terms).map((run) => (run.hit ? el('mark', '', run.text) : run.text)),
    );
  }

  function render() {
    const query = input.value;
    const terms = queryTerms(query);
    const groups = terms.length > 0 ? options.search(query) : [];
    list.innerHTML = '';
    shown = [];
    active = -1;
    input.removeAttribute('aria-activedescendant');
    for (const group of groups) {
      const headingId = uniqueId('campaign-search-group');
      const heading = el('div', 'campaign-search__group-label', group.label);
      heading.id = headingId;
      heading.setAttribute('role', 'presentation');
      const box = el('div', 'campaign-search__group', heading);
      box.setAttribute('role', 'group');
      box.setAttribute('aria-labelledby', headingId);
      for (const result of group.results) {
        const node = el(
          'div',
          'campaign-search__option',
          marked(result.title, terms, 'campaign-search__title'),
          result.detail ? marked(result.detail, terms, 'campaign-search__detail') : null,
        );
        node.id = uniqueId('campaign-search-option');
        node.setAttribute('role', 'option');
        node.setAttribute('aria-selected', 'false');
        const index = shown.length;
        // The press would move focus out of the input and close the list
        // before the click lands, so the press keeps focus where it is.
        node.addEventListener('mousedown', (event) => event.preventDefault());
        node.addEventListener('click', () => choose(index));
        node.addEventListener('mousemove', () => {
          if (active !== index) setActive(index);
        });
        shown.push({ node, result });
        box.append(node);
      }
      const more = group.total - group.results.length;
      if (more > 0) {
        const note = el('div', 'campaign-search__more', `${more} more. Add a word to narrow.`);
        note.setAttribute('role', 'presentation');
        box.append(note);
      }
      list.append(box);
    }
    const count = groups.reduce((sum, g) => sum + g.total, 0);
    empty.textContent = terms.length > 0 && count === 0 ? `No matches for "${query.trim()}".` : '';
    empty.hidden = empty.textContent === '';
    list.hidden = shown.length === 0;
    status.textContent =
      terms.length === 0
        ? ''
        : count === 0
          ? 'No matches.'
          : `${count} match${count === 1 ? '' : 'es'}.`;
    setOpen(terms.length > 0);
  }

  /** @param {number} index */
  function choose(index) {
    const picked = shown[index];
    if (!picked) return;
    close();
    input.blur();
    options.onChoose(picked.result);
  }

  function close() {
    setActive(-1);
    setOpen(false);
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', () => {
    if (input.value.trim()) render();
  });
  input.addEventListener('keydown', (event) => {
    const open = !popup.hidden;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) render();
      if (shown.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + shown.length) % shown.length);
    } else if (event.key === 'Enter') {
      if (!open || shown.length === 0) return;
      event.preventDefault();
      choose(active >= 0 ? active : 0);
    } else if (event.key === 'Escape') {
      // The first Escape closes the list and the second clears the text,
      // which is the native behavior of a search field.
      if (open) {
        event.preventDefault();
        close();
      }
    }
  });
  root.addEventListener('focusout', (event) => {
    if (!root.contains(/** @type {Node | null} */ (event.relatedTarget))) close();
  });

  return {
    focus: () => {
      input.focus();
      input.select();
    },
    close,
  };
}
