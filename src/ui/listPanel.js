import { emptyState, iconButton, sectionLabel, textButton } from './buttons.js';
import { el } from './dom.js';
import { captureFocus, restoreFocus } from './focusMemory.js';

/**
 * This is the list panel every rail builds from. Six panels used to
 * hand-roll the same skeleton: a wrapper div, a `render()` that clears
 * it, an empty-state branch, a row loop ending in edit or remove icon
 * buttons, a "New ..." control, and a returned `{ update: render }`. Each
 * panel also reimplemented the await-the-handler-then-rerender idiom per
 * button. That idiom is why this module exists. A click handler here is
 * awaited, and the panel rerenders unless the handler reports that
 * nothing happened, by returning `false` or `null`, the shape a
 * cancelled dialog already returns. A `void` handler counts as a change
 * and rerenders.
 *
 * The caller keeps every decision about markup. `buildBody` returns the
 * row's content. The `classes` bag holds every class the caller names
 * below the root, and `classes.body`, `classes.actions`, and
 * `classes.head` say whether that content and the action buttons get
 * wrapper divs. `buildExtras` appends whatever hangs below the row's head,
 * for example a stat bar or a read-aloud body. The helper owns the
 * plumbing around that: the root element, the GM or player gate, the row
 * loop with its optional group headings, and the add controls.
 *
 * `update()` also carries the cheap rerender guard. It reads the rows
 * once and stops when neither the GM flag nor any row object has
 * changed. Entities here are immutable, since a mutation hands back a
 * new object, so unchanged references mean unchanged output. The five
 * panel refreshes that a party step fires collapse into no DOM work. A
 * panel that draws something its rows do not describe names that state in
 * `dependsOn`, and the guard compares its value alongside the rows. This
 * is narrower than an unconditional repaint: a panel that opts out of the
 * guard entirely also throws away what the user typed into a row's input
 * on every refresh, and a cross-tab adoption refreshes every few seconds.
 *
 * A repaint that does happen keeps the keyboard position, through
 * `focusMemory.js`. Without that, every rebuild moved focus to the
 * document body, and a cross-tab save adoption rebuilds these panels
 * every few seconds.
 */

/**
 * One wired button on a row. `pressed` sets `aria-pressed`, for the
 * toggles that flip a quest's status or a handout's visibility.
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
 * One of the panel's add controls, for example "New quest" or "From bestiary".
 * @typedef {{
 *   label: string,
 *   icon?: import('./icons.js').IconName,
 *   variant?: string,
 *   className?: string,
 *   onClick: () => unknown,
 * }} AddButton
 */

/**
 * This is what a row builder is handed: the resolved GM flag, the
 * panel's `render` so a bespoke control can refresh the list, and
 * `action` to build a wired button with the same await-then-render
 * behavior the `actions` option gets.
 * @template T
 * @typedef {{
 *   gm: boolean,
 *   render: () => void,
 *   action: (spec: RowAction<T>, entry: T) => HTMLButtonElement,
 * }} RowContext
 */

/**
 * Every class the caller names below the root, in one place. The root's own
 * class is `className`, since it is also the stem the row class comes from.
 * Each entry here is optional, and an omitted one either falls back to the
 * stem or drops the wrapper it would have named.
 * @template T
 * @typedef {object} ListPanelClasses
 * @property {string} [row] the row's class, when it cannot be derived from
 *   the stem. A panel whose list is nested inside a wider panel names its
 *   rows after the outer one.
 * @property {(entry: T, gm: boolean) => (string | null | false)[]} [rowModifiers]
 *   extra classes on the row element, per row.
 * @property {string} [body] wraps the body nodes in a div of this class.
 * @property {string} [actions] wraps the action buttons in a div of this class.
 * @property {string | ((entry: T, gm: boolean) => string | null)} [head]
 *   wraps the body-and-actions pair in a div of this class.
 * @property {string} [group] collects each group's rows in a div of this class.
 * @property {string} [groupHeading] added to the group heading, which is a
 *   `section-label` heading whether or not this names anything.
 * @property {string} [add] class on each add button, unless the button names
 *   its own. This is skipped in `leading` placement, since its pinned row
 *   styles the buttons itself.
 */

/**
 * @template T
 * @typedef {object} ListPanelOptions
 * @property {string} className the root element's class. It is also the
 *   row class stem (`<className>__row`).
 * @property {ListPanelClasses<T>} [classes] the classes below the root.
 * @property {(gm: boolean) => T[]} getRows the rows to show, already scoped and
 *   ordered by the caller.
 * @property {(entry: T, ctx: RowContext<T>) => Node | Node[]} buildBody the
 *   row's content, left of the action buttons.
 * @property {string | ((gm: boolean) => string)} emptyMessage
 * @property {(entry: T, ctx: RowContext<T>) => (RowAction<T> | null | false)[]} [actions]
 * @property {(entry: T, row: HTMLElement, ctx: RowContext<T>) => void} [buildExtras]
 *   appends below the row's head.
 * @property {(entry: T, gm: boolean) => string | null} [groupOf] emits a
 *   section heading whenever consecutive rows change group.
 * @property {(gm: boolean) => (AddButton | null | false)[]} [addButtons]
 * @property {'inline' | 'leading' | 'trailing'} [addPlacement] where the
 *   add controls go: loose at the end of the list, the default, leading
 *   the panel in a pinned `.panel-actions` row, or trailing it in a plain one.
 * @property {() => boolean} [gate] false for the read-only player view,
 *   which drops the add controls. Defaults to GM.
 * @property {() => unknown} [dependsOn] whatever the panel draws that its
 *   rows do not describe, as one comparable value. `update` repaints when
 *   it differs from the last painted one, compared with `Object.is`. A
 *   panel that omits it draws from its rows and the gate alone.
 */

/**
 * What one paint drew from: the resolved gate, the row objects, and the
 * value of `dependsOn` at that moment.
 * @template T
 * @typedef {{ gm: boolean, rows: T[], dependsOn: unknown }} PaintState
 */

/**
 * @template T
 * @param {HTMLElement} container
 * @param {ListPanelOptions<T>} options
 * @returns {{ update: () => void }}
 */
export function mountListPanel(container, options) {
  const root = el('div', options.className);
  container.appendChild(root);

  const placement = options.addPlacement ?? 'inline';
  /** @type {ListPanelClasses<T>} */
  const classes = options.classes ?? {};

  /**
   * What the last paint drew from, or null before the first one.
   * @type {PaintState<T> | null}
   */
  let last = null;

  /**
   * Wire one button so its handler is awaited and the panel rerenders
   * unless the handler says nothing changed.
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
    const row = el('div', classes.row ?? `${options.className}__row`);
    for (const modifier of classes.rowModifiers?.(entry, ctx.gm) ?? []) {
      if (modifier) row.classList.add(modifier);
    }

    const body = options.buildBody(entry, ctx);
    /** @type {Node[]} */
    const parts = [];
    if (classes.body) {
      parts.push(el('div', classes.body, ...(Array.isArray(body) ? body : [body])));
    } else {
      parts.push(...(Array.isArray(body) ? body : [body]));
    }

    const buttons = (options.actions?.(entry, ctx) ?? [])
      .filter(/** @returns {spec is RowAction<T>} */ (spec) => Boolean(spec))
      .map((spec) => action(spec, entry));
    if (buttons.length > 0 && classes.actions) {
      parts.push(el('div', classes.actions, ...buttons));
    } else {
      parts.push(...buttons);
    }

    const headClass =
      typeof classes.head === 'function' ? classes.head(entry, ctx.gm) : (classes.head ?? null);
    if (headClass) {
      row.appendChild(el('div', headClass, ...parts));
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
            className: placement === 'leading' ? undefined : (spec.className ?? classes.add),
          },
        ),
      );
  }

  /** @param {boolean} gm @param {T[]} rows @param {unknown} dependsOn */
  function paint(gm, rows, dependsOn) {
    last = { gm, rows, dependsOn };
    // Clearing the root drops focus to the document body. Note where it
    // was, and put it back once the rows exist again.
    const memo = captureFocus(root, document.activeElement);
    root.innerHTML = '';
    /** @type {RowContext<T>} */
    const ctx = { gm, render, action };

    const addButtons = buildAddButtons(gm);
    // Leading placement puts the add controls above the list, so a long
    // list never buries them. The Build rail's authoring panels all want that.
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
        if (classes.group) {
          host = el('div', classes.group);
          root.appendChild(host);
        }
        host.appendChild(sectionLabel(group, { tag: 'h3', className: classes.groupHeading }));
      }
      host.appendChild(buildRow(entry, ctx));
    }

    if (placement === 'trailing' && addButtons.length > 0) {
      root.appendChild(actionsRow(addButtons, false));
    } else if (placement === 'inline') {
      root.append(...addButtons);
    }

    restoreFocus(root, memo);
  }

  function render() {
    const gm = options.gate ? options.gate() : true;
    paint(gm, options.getRows(gm), options.dependsOn?.());
  }

  function update() {
    const gm = options.gate ? options.gate() : true;
    const next = { gm, rows: options.getRows(gm), dependsOn: options.dependsOn?.() };
    if (!repaintNeeded(last, next)) return;
    paint(next.gm, next.rows, next.dependsOn);
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
  return el('div', pinned ? 'panel-actions panel-actions--pinned' : 'panel-actions', ...buttons);
}

/**
 * Whether `update` has to repaint. The first call always does. After that,
 * a repaint is needed when the gate flipped, when `dependsOn` reports a
 * different value, or when the rows are not the same objects in the same
 * order.
 * @template T
 * @param {PaintState<T> | null} last the last paint, or null before the first.
 * @param {PaintState<T>} next
 * @returns {boolean}
 */
export function repaintNeeded(last, next) {
  if (!last) return true;
  if (last.gm !== next.gm) return true;
  if (!Object.is(last.dependsOn, next.dependsOn)) return true;
  return !sameRows(last.rows, next.rows);
}

/**
 * Whether two row lists hold the same objects in the same order. This is
 * sound only because the entity layer never mutates in place.
 * @param {unknown[]} a
 * @param {unknown[]} b
 * @returns {boolean}
 */
function sameRows(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
