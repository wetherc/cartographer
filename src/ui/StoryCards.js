import { textButton } from './buttons.js';
import { buildDisclosure } from './Disclosure.js';
import { el } from './dom.js';
import { browserStorage, readFolds, toggleFold } from '../view/FoldMemory.js';
import { tryWriteStored } from '../storage/Footprint.js';

const FOLD_KEY = 'campaign-builder:story-cards';

/**
 * Give each card of the Story tab a fold button, and put a jump row at the top
 * of the tab: one button per card with its row count. A jump button opens its
 * card and scrolls it into view, so the GM reaches NPCs and Handouts under a
 * long quest log at once. The fold state of each card is per browser.
 *
 * Each count is the `data-row-count` that the list panel inside the card
 * writes on its root, so the rows of a folded group count too. A
 * MutationObserver on that attribute reads it again after each repaint.
 * @param {HTMLElement} panel the Story tab panel
 * @param {{ id: string, label: string }[]} cards each card's element id and
 *   its name
 */
export function mountStoryCards(panel, cards) {
  const storage = browserStorage();
  const folds = readFolds(storage, FOLD_KEY, []);
  const jump = el('nav', 'story-jump');
  jump.setAttribute('aria-label', 'Jump to a story card');

  for (const spec of cards) {
    const card = document.getElementById(spec.id);
    if (!card) continue;
    // The disclosure body is a stand-in. The card class hides the content,
    // because the panel inside the card owns its children.
    let ready = false;
    const disclosure = buildDisclosure({
      body: el('div'),
      className: 'card-fold',
      expanded: !folds.has(spec.id),
      onToggle: (open) => {
        if (ready) setFolded(!open, true);
      },
    });
    const head = disclosure.head;
    // The name stays the same and aria-expanded gives the state, so a screen
    // reader does not announce the state twice, and focusMemory finds the
    // control again by its name after a repaint.
    head.setAttribute('aria-label', spec.label);
    card.prepend(head);

    /** @param {boolean} folded @param {boolean} store */
    function setFolded(folded, store) {
      card?.classList.toggle('card--folded', folded);
      if (store && folds.has(spec.id) !== folded)
        toggleFold(tryWriteStored, FOLD_KEY, folds, spec.id);
    }
    ready = true;
    setFolded(folds.has(spec.id), false);

    const count = el('span', 'story-jump__count', '0');
    const button = textButton(spec.label, () => {
      disclosure.setExpanded(true);
      card.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    button.append(count);
    jump.appendChild(button);

    /** @type {string | null} the count on screen */
    let shown = null;
    const recount = () => {
      const value = list?.dataset.rowCount ?? '0';
      if (value === shown) return;
      shown = value;
      count.textContent = value;
      button.setAttribute('aria-label', `${spec.label}, ${value}`);
    };
    // The list panel writes data-row-count on every paint. This observer
    // watches only that attribute and not the rows under it, so a repaint
    // queues one mutation record per card.
    const counter = new MutationObserver(recount);
    /** @type {HTMLElement | null} */
    let list = null;
    const findList = () => {
      list = card.querySelector(':scope > [data-row-count]');
      if (list) counter.observe(list, { attributeFilter: ['data-row-count'] });
      recount();
    };
    findList();
    // The panel root can mount after this function runs.
    new MutationObserver(findList).observe(card, { childList: true });
  }
  panel.prepend(jump);
}
