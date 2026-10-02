// Page behavior for the docs site: the theme button, the Menu button on
// narrow screens, the "On this page" heading list, a link on each heading,
// and a scroll box around each table. The page reads in full without it.

const THEME_KEY = 'campaign-builder:theme';
const root = document.documentElement;

/** The theme that shows now, from the pinned choice or the OS preference. */
function currentTheme() {
  if (root.dataset.theme === 'light' || root.dataset.theme === 'dark') return root.dataset.theme;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setupTheme() {
  const button = document.querySelector('.theme-toggle');
  if (!button) return;
  const label = () => {
    const other = currentTheme() === 'dark' ? 'light' : 'dark';
    button.textContent = other === 'dark' ? 'Dark' : 'Light';
    button.setAttribute('aria-label', `Switch to the ${other} theme`);
  };
  label();
  button.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // A blocked localStorage keeps the choice for this page only.
    }
    label();
  });
}

function setupMenu() {
  const button = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!button || !nav) return;
  const close = () => {
    nav.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
  };
  button.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
    if (open) nav.querySelector('a[aria-current], a')?.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      close();
      button.focus();
    }
  });
  document.addEventListener('click', (event) => {
    const target = /** @type {Node} */ (event.target);
    if (nav.classList.contains('is-open') && !nav.contains(target) && !button.contains(target)) {
      close();
    }
  });
}

function setupHeadings() {
  const prose = document.querySelector('.prose');
  const toc = document.querySelector('.toc');
  if (!prose) return;
  const headings = [...prose.querySelectorAll('h2[id], h3[id]')];
  // Read the titles before the # links join the headings.
  const titles = new Map(headings.map((heading) => [heading, heading.textContent.trim()]));

  for (const heading of prose.querySelectorAll('h2[id], h3[id], h4[id]')) {
    const link = document.createElement('a');
    link.className = 'heading-anchor';
    link.href = `#${heading.id}`;
    link.textContent = '#';
    link.setAttribute('aria-label', `Link to ${heading.textContent}`);
    heading.append(link);
  }

  for (const table of prose.querySelectorAll('table')) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.before(wrap);
    wrap.append(table);
  }

  // A short page gains nothing from a heading list.
  if (!toc || headings.length < 3) return;
  /** @param {HTMLOListElement} list */
  const fill = (list) =>
    new Map(
      headings.map((heading) => {
        const item = document.createElement('li');
        if (heading.tagName === 'H3') item.className = 'toc__sub';
        const link = document.createElement('a');
        link.href = `#${heading.id}`;
        link.textContent = titles.get(heading) ?? '';
        item.append(link);
        list.append(item);
        return [heading.id, link];
      }),
    );
  const links = fill(toc.querySelector('.toc__list'));
  toc.hidden = false;

  // Narrow screens hide the right column, so the same list also opens from a
  // box under the page title.
  const inline = document.createElement('details');
  inline.className = 'toc-inline';
  inline.innerHTML = '<summary>On this page</summary><ol></ol>';
  fill(inline.querySelector('ol'));
  const title = prose.querySelector('h1');
  const kicker = title?.nextElementSibling?.matches('p:has(> em:only-child)') ? title.nextElementSibling : title;
  if (kicker) kicker.after(inline);
  else prose.prepend(inline);
  inline.addEventListener('click', (event) => {
    if (/** @type {Element} */ (event.target).closest('a')) inline.open = false;
  });

  // Mark the last heading that has scrolled above the top quarter of the view.
  // Above the first heading, no link is marked.
  let active = null;
  const update = () => {
    const line = innerHeight / 4;
    let current = null;
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top > line) break;
      current = heading;
    }
    if (current === active) return;
    if (active) links.get(active.id)?.classList.remove('is-active');
    const link = current && links.get(current.id);
    link?.classList.add('is-active');
    // Keep the marked link in view inside the list, without moving the page.
    if (link && (link.offsetTop < toc.scrollTop || link.offsetTop > toc.scrollTop + toc.clientHeight - 40)) {
      toc.scrollTop = link.offsetTop - toc.clientHeight / 2;
    }
    active = current;
  };
  let queued = false;
  addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        update();
      });
    },
    { passive: true },
  );
  update();
}

setupTheme();
setupMenu();
setupHeadings();
