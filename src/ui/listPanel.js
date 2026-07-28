import { emptyState, iconButton, textButton } from './buttons.js';

/**
 * The list panel every rail is built from. Six panels used to hand-roll the
 * same skeleton — a wrapper div, a `render()` that clears it, an empty-state
 * branch, a row loop ending in edit/remove icon buttons, an "New ..." control,
 * and a returned `{ update: render }` — and each re-implemented the
 * await-the-handler-then-re-render idiom per button. That idiom is the reason
 * this module exists: a click handler here is awaited, and the panel re-renders
 * unless the handler reports that nothing happened by returning `false` or
 * `null` (the shape a cancelled dialog already returns). A `void` handler
 * counts as a change and re-renders.
 *
 * The caller keeps every decision about markup: `buildBody` returns the row's
 * content, the three optional `*Class` options say whether that content and the
 * action buttons get wrapper divs, and `buildExtras` appends whatever hangs
 * below the row's head (a stat bar, a read-aloud body). The helper owns the
 * plumbing around that: the root element, the GM/player gate, the row loop with
 * its optional group headings, and the add controls.
 *
 * `update()` also carries the cheap re-render guard. It reads the rows once and
 * bails when neither the GM flag nor any row object has changed. Entities here
 * are immutable — a mutation hands back a new object — so unchanged references
 * really do mean unchanged output, and the five panel refreshes a party step
 * fires collapse into no DOM work. A panel whose output depends on state
 * outside its rows must opt out with `alwaysRender`.
 */

/**
 * One wired button on a row. `pressed` sets `aria-pressed`, for the toggles
 * that flip a quest's status or a handout's visibility.
 * @template T
 * @typedef {{
 *   icon: import('./icons.js').IconName,
 *   label: string,
 *   title?: string,
 *   variant?: string,
 *   pressed?: boolean,
 *   onClick: (entry: T) => unknown,
 * }} RowAction
 */

/**
 * One of the panel's add controls, e.g. "New quest" or "From bestiary".
 * @typedef {{
 *   label: string,
 *   icon?: import('./icons.js').IconName,
 *   variant?: string,
 *   className?: string,
 *   onClick: () => unknown,
 * }} AddButton
 */

/**
 * What a row builder is handed: the resolved GM flag, the panel's `render` so
 * a bespoke control can refresh the list, and `action` to build a wired button
 * with the same await-then-render semantics the `actions` option gets.
 * @template T
 * @typedef {{
 *   gm: boolean,
 *   render: () => void,
 *   action: (spec: RowAction<T>, entry: T) => HTMLButtonElement,
 * }} RowContext
 */

/**
 * @template T
 * @typedef {object} ListPanelOptions
 * @property {string} className root element's class; also the row class stem
 *   (`<className>__row`).
 * @property {string} [rowClass] the row's class, when it cannot be derived from
 *   `className` — a panel whose list is nested inside a wider panel names its
 *   rows after the outer one.
 * @property {(gm: boolean) => T[]} getRows the rows to show, already scoped and
 *   ordered by the caller.
 * @property {(entry: T, ctx: RowContext<T>) => Node | Node[]} buildBody the
 *   row's content, left of the action buttons.
 * @property {string | ((gm: boolean) => string)} emptyMessage
 * @property {(entry: T, ctx: RowContext<T>) => (RowAction<T> | null | false)[]} [actions]
 * @property {(entry: T, gm: boolean) => (string | null | false)[]} [rowModifiers]
 *   extra classes on the row element.
 * @property {string} [bodyClass] wraps the body nodes in a div of this class.
 * @property {string} [actionsClass] wraps the action buttons in a div of this
 *   class.
 * @property {string | ((entry: T, gm: boolean) => string | null)} [headClass]
 *   wraps the body-and-actions pair in a div of this class.
 * @property {(entry: T, row: HTMLElement, ctx: RowContext<T>) => void} [buildExtras]
 *   appends below the row's head.
 * @property {(entry: T, gm: boolean) => string | null} [groupOf] emits a
 *   section heading whenever consecutive rows change group.
 * @property {string} [groupWrapperClass] collects each group's rows in a div.
 * @property {string} [groupHeadingClass]
 * @property {(gm: boolean) => (AddButton | null | false)[]} [addButtons]
 * @property {'inline' | 'leading' | 'trailing'} [addPlacement] where the add
 *   controls go: loose at the end of the list (the default), leading the panel
 *   in a pinned `.panel-actions` row, or trailing it in a plain one.
 * @property {string} [addClass] class on each add button, unless the button
 *   names its own. Skipped in `leading` placement, whose pinned row styles the
 *   buttons itself.
 * @property {() => boolean} [gate] false for the read-only player view, which
 *   drops the add controls; defaults to GM.
 * @property {boolean} [alwaysRender] skip `update`'s unchanged-rows guard.
 */

/**
 * @template T
 * @param {HTMLElement} container
 * @param {ListPanelOptions<T>} options
 * @returns {{ update: () => void }}
 */
export function mountListPanel(container, options) {
  const root = document.createElement('div');
  root.className = options.className;
  container.appendChild(root);

  const placement = options.addPlacement ?? 'inline';

  /** @type {T[] | null} */
  let lastRows = null;
  /** @type {boolean | null} */
  let lastGM = null;

  /**
   * Wire one button so its handler is awaited and the panel re-renders unless
   * the handler says nothing changed.
   * @param {RowAction<T>} spec
   * @param {T} entry
   * @returns {HTMLButtonElement}
   */
  function action(spec, entry) {
    const button = iconButton(
      spec.icon,
      spec.label,
      async () => {
        const result = await spec.onClick(entry);
        if (result !== false && result !== null) render();
      },
      { variant: spec.variant, title: spec.title },
    );
    if (spec.pressed !== undefined) button.setAttribute('aria-pressed', String(spec.pressed));
    return button;
  }

  /**
   * @param {T} entry
   * @param {RowContext<T>} ctx
   * @returns {HTMLElement}
   */
  function buildRow(entry, ctx) {
    const row = document.createElement('div');
    row.className = options.rowClass ?? `${options.className}__row`;
    for (const modifier of options.rowModifiers?.(entry, ctx.gm) ?? []) {
      if (modifier) row.classList.add(modifier);
    }

    const body = options.buildBody(entry, ctx);
    /** @type {Node[]} */
    const parts = [];
    if (options.bodyClass) {
      const wrapper = document.createElement('div');
      wrapper.className = options.bodyClass;
      wrapper.append(...(Array.isArray(body) ? body : [body]));
      parts.push(wrapper);
    } else {
      parts.push(...(Array.isArray(body) ? body : [body]));
    }

    const buttons = (options.actions?.(entry, ctx) ?? [])
      .filter(/** @returns {spec is RowAction<T>} */ (spec) => Boolean(spec))
      .map((spec) => action(spec, entry));
    if (buttons.length > 0 && options.actionsClass) {
      const wrapper = document.createElement('div');
      wrapper.className = options.actionsClass;
      wrapper.append(...buttons);
      parts.push(wrapper);
    } else {
      parts.push(...buttons);
    }

    const headClass =
      typeof options.headClass === 'function'
        ? options.headClass(entry, ctx.gm)
        : (options.headClass ?? null);
    if (headClass) {
      const head = document.createElement('div');
      head.className = headClass;
      head.append(...parts);
      row.appendChild(head);
    } else {
      row.append(...parts);
    }

    options.buildExtras?.(entry, row, ctx);
    return row;
  }

  /** @param {boolean} gm @returns {HTMLElement[]} */
  function buildAddButtons(gm) {
    if (!gm) return [];
    return (options.addButtons?.(gm) ?? [])
      .filter(/** @returns {spec is AddButton} */ (spec) => Boolean(spec))
      .map((spec) =>
        textButton(
          spec.label,
          async () => {
            const result = await spec.onClick();
            if (result !== false && result !== null) render();
          },
          {
            icon: spec.icon,
            variant: spec.variant,
            className: placement === 'leading' ? undefined : (spec.className ?? options.addClass),
          },
        ),
      );
  }

  /** @param {boolean} gm @param {T[]} rows */
  function paint(gm, rows) {
    lastGM = gm;
    lastRows = rows;
    root.innerHTML = '';
    /** @type {RowContext<T>} */
    const ctx = { gm, render, action };

    const addButtons = buildAddButtons(gm);
    // Leading placement puts the add controls above the list so a long one
    // never buries them; the Build rail's authoring panels all want that.
    if (placement === 'leading' && addButtons.length > 0) {
      root.appendChild(actionsRow(addButtons, true));
    }

    if (rows.length === 0) {
      const message =
        typeof options.emptyMessage === 'function'
          ? options.emptyMessage(gm)
          : options.emptyMessage;
      root.appendChild(emptyState(message));
    }

    /** @type {string | null} */
    let lastGroup = null;
    /** @type {HTMLElement} */
    let host = root;
    for (const entry of rows) {
      const group = options.groupOf?.(entry, gm) ?? null;
      if (group !== null && group !== lastGroup) {
        lastGroup = group;
        host = root;
        if (options.groupWrapperClass) {
          host = document.createElement('div');
          host.className = options.groupWrapperClass;
          root.appendChild(host);
        }
        const heading = document.createElement('h3');
        heading.className = options.groupHeadingClass ?? 'section-label';
        heading.textContent = group;
        host.appendChild(heading);
      }
      host.appendChild(buildRow(entry, ctx));
    }

    if (placement === 'trailing' && addButtons.length > 0) {
      root.appendChild(actionsRow(addButtons, false));
    } else if (placement === 'inline') {
      root.append(...addButtons);
    }
  }

  function render() {
    const gm = options.gate ? options.gate() : true;
    paint(gm, options.getRows(gm));
  }

  function update() {
    const gm = options.gate ? options.gate() : true;
    const rows = options.getRows(gm);
    if (!options.alwaysRender && gm === lastGM && lastRows && sameRows(lastRows, rows)) return;
    paint(gm, rows);
  }

  render();
  return { update };
}

/**
 * @param {HTMLElement[]} buttons
 * @param {boolean} pinned
 * @returns {HTMLElement}
 */
function actionsRow(buttons, pinned) {
  const row = document.createElement('div');
  row.className = pinned ? 'panel-actions panel-actions--pinned' : 'panel-actions';
  row.append(...buttons);
  return row;
}

/**
 * Whether two row lists are the same objects in the same order. Sound only
 * because the entity layer never mutates in place.
 * @param {unknown[]} a
 * @param {unknown[]} b
 * @returns {boolean}
 */
function sameRows(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
