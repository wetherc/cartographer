# UI components

*Back to the [architecture overview](../architecture.md).*

There is no component framework here. A "component" in this codebase is a
plain function that builds DOM elements and returns a handle, and the
consistency comes from a small set of shared builders plus one CSS token file.
This guide is the reference for both: what the shared builders are, what each
one's contract is, and which CSS class or custom property you should reach for
instead of writing your own.

Read it before adding anything to `src/ui/` or `styles/`. Almost every widget
shape you need already exists, and the ones that exist got centralized because
the hand-rolled copies had drifted on accessibility attributes.

The rules behind these components (when to confirm, how buttons are styled,
what gets a toast) live in [Conventions](conventions.md#ui-and-style). This
guide is the API surface; that one is the policy.

## Two layers

```
  src/app/*Wiring.js ......... mounts panels, owns callbacks and modals
          |
          v
  src/ui/<Panel>.js .......... feature panels: build DOM, return { update }
          |
          v
  src/ui/buttons.js .......... shared builders: buttons, icons, dialogs,
  src/ui/icons.js             form fields, tabs, disclosures, toasts
  src/ui/Modal.js
  src/ui/formFields.js
  src/ui/Tabs.js, Disclosure.js, Toast.js, ContextMenu.js, dom.js
          |
          v
  styles/base.css ............ design tokens + .btn/.field/.card primitives
```

Feature panels never hand-roll a button, an empty state, a dialog, or a design
value. They compose the layer below them. The wiring layer above owns the data
and the decisions; see [The app wiring layer](app-wiring.md).

## Mount points

Every panel mounts into an element that already exists in `index.html`. Look it
up with `mustGetElement(id)` (`src/ui/dom.js`), never `getElementById`
directly:

```js
import { mustGetElement } from '../ui/dom.js';

const container = mustGetElement('encounter-container');
```

It throws `Required element #x is missing from index.html` when the id is gone.
That is deliberate: wiring runs at startup, so a markup rename fails loudly on
load instead of leaving a silently unmounted panel that nobody notices until a
GM clicks something.

## The panel contract

A feature panel is a `mount<Name>(container, callbacks)` function. It creates
its own root element, appends it to the container, renders once, and returns a
handle:

```js
export function mountQuestPanel(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'quest-panel';
  container.appendChild(root);

  function render() {
    root.innerHTML = '';
    // ... build rows from callbacks.getQuests()
  }

  render();
  return { update: render };
}
```

That `{ update }` shape is the `Updatable` interface (`src/types/app.ts`), and
it is the whole cross-module refresh protocol. A wiring module stores the
handle on `app.views.questPanel`; anything that changes a quest calls
`app.views.questPanel.update()` and does not need to know what the panel
renders.

Three rules make this work:

- **Panels hold no campaign data of their own.** Everything a panel draws comes
  from a `get*` callback that it calls *at render time* (`getQuests()`,
  `getRole()`), so `update()` always re-reads current state. A panel that
  cached its data would need its own invalidation, which is exactly what the
  single `update()` entry point exists to avoid. Transient view state is a
  different matter and does belong to the panel: which row is in edit mode,
  which section is expanded. `LibraryPanel`'s `update` clears its `editing` row
  for exactly that reason.
- **Every mutation leaves through a callback.** Panels do not write state and
  do not open dialogs; they call `callbacks.onEdit(id)` and let the wiring
  module prompt, write, and re-render. That is what keeps panels DOM-only and
  testable by eye rather than by mock.
- **Role gating is a callback too.** Panels that show GM-only affordances take
  an optional `getRole` and default to the GM view when it is absent:

  ```js
  const gmView = () => !callbacks.getRole || isGM(callbacks.getRole());
  ```

  In the player view, edit, delete, and add controls are simply not built.

`render()` clearing `innerHTML` and rebuilding is the default, and it is fine
for the small lists most panels show. Two panels deliberately do not: the
travelogue diffs by anchor id and the tile inspector builds once and re-points.
Copy those only when the list is large or grows continuously, and see
[Conventions](conventions.md#growing-lists-render-incrementally).

### Handles that are not `{ update }`

Not every mount returns `update`. The other shapes, so you can recognize them:

| Shape | Used by | Why |
| --- | --- | --- |
| `{ setCharacter }`, plus `getCharacter` on two of them | `CharacterSheet`, `InventoryPanel`, `SpellbookPanel` | these three are scoped to one selected character, which they hold and re-render from; a sibling panel's edit is pushed in through `setCharacter` rather than re-read through a getter |
| a domain handle | `ModeSwitch` (`{ getMode, setMode }`), `RoleSwitch`, `ThemeToggle`, `PalettePanel`, `TileInspector`, `Toast` (`{ show }`) | a control, not a list; there is nothing to re-render from state |
| `build<X>Form(...)` returning DOM plus readers | `ItemForm`, `SpellForm`, `EncounterTemplateForm`, `NPCTemplateForm`, `CharacterProgress` | inline forms are built per edit and thrown away, so they are constructed, not mounted |
| `Promise<result>` | `combatSetupModal`, `generateDialog`, `promptSpellDetail`, everything in `Modal.js` | a dialog is one question with one answer |
| `{ element, get, set }` | `buildDamageEditor`, `buildEffectsEditor` (`ItemFormEditors.js`) | a composite sub-widget inside a form: it owns a working copy, hands over `element` to mount, `get` to read at submit, and `set` so a preset picker can overwrite it |

When you add a composite form widget, use that last contract. It is what lets
`ItemForm` treat a damage-parts editor exactly like a text input.

## Buttons, icons, and empty states

### `src/ui/buttons.js`

Two builders and one paragraph. Eighteen modules import them, and no panel
should call `document.createElement('button')` for an ordinary control.

```js
iconButton(name, ariaLabel, onClick, opts?) -> HTMLButtonElement
textButton(label, onClick, opts?)           -> HTMLButtonElement
emptyState(message)                         -> HTMLParagraphElement
```

`iconButton` builds `btn btn--icon`, **requires** an `ariaLabel` (an icon-only
button has no other accessible name), and defaults the hover `title` to that
label. Pass `opts.title` only when you want a shorter tooltip than the label.

`textButton` builds `btn` with an optional leading `opts.icon`. Here the
visible text is already the accessible name, so `ariaLabel` is set only when
given, for cases where the label alone is ambiguous (a weapon name whose action
is really "Attack with ...").

Both take `opts.variant`, which maps straight to a `btn--*` CSS modifier:

| `variant` | Result |
| --- | --- |
| *(omitted)* | neutral outlined button |
| `'primary'` | accent-filled; the affirmative action of a form or dialog |
| `'danger'` | danger-outlined, fills red on hover |
| `'success'` | success-outlined, fills green on hover |

`variant: 'danger'` is not decoration. Every destructive control passes it and
stays visible rather than appearing on hover, and it confirms first. See
[Conventions](conventions.md#every-destructive-action-confirms-first).

`emptyState(message)` is the one `<p class="empty-state">`. Every list panel's
"nothing here yet" line goes through it.

### `src/ui/icons.js`

```js
icon(name, { size = 18, className }?) -> SVGSVGElement
```

One function over a table of 24x24 stroke path data. Icons draw in
`currentColor`, so they inherit the color of whatever button or text they sit
in and theme themselves with no extra work. They are built with
`createElementNS` from path strings, never `innerHTML`.

Every icon is `aria-hidden="true"`. Icons here are decorative by definition;
the enclosing control owns the accessible name. That is why `iconButton`
requires a label.

The 28 names available (`IconName` in `icons.js`):

```
plus  minus  heal  remove  edit  save  export  import  dice  d20  add
check  chevron  map  fit  sword  shield  clock  flag  scroll  sparkles
eye  eye-off  lock  give  sun  moon  monitor
```

An unknown name yields an empty SVG rather than throwing, so a typo shows as a
blank gap. The typecheck is what catches it: `IconName` is a string-literal
union, so a misspelled name fails `tsc`.

Two naming notes worth knowing before you pick a glyph. `minus` and `heal` are
the fixed pair for HP moving down and up, everywhere; `sword` is reserved for
attack actions and is deliberately *not* used for damage. And if you need a new
glyph, add its path data to `PATHS` and its name to the union rather than
inlining an SVG at the call site.

## Dialogs

`src/ui/Modal.js` wraps the native `<dialog>` element and is the most-imported
module in `src/ui/` (24 modules). Four entry points, each returning a promise:

```js
promptModal(title, fields, options?) -> Promise<Record<string, string> | null>
alertModal(message, options?)        -> Promise<void>
confirmModal(message, options?)      -> Promise<boolean>
confirmDelete(name, detail?)         -> Promise<boolean>
```

All four share one lifecycle: capture `document.activeElement` as the opener,
build and append the dialog, `showModal()`, and on `close` remove the dialog
and refocus the opener before resolving. Escape closes, because that is what
`<dialog>` does natively. Nothing here re-implements an overlay, a scrim, or a
focus trap.

Which one to use is a policy question, covered in
[Conventions](conventions.md#dialog-discipline): `confirmModal` only for
questions with two real answers, `alertModal` for blocking notifications,
`app.toasts.show` for non-blocking ones, and `confirmDelete(name, detail?)` for
plain entity deletes, since it owns the `Delete "X"?` wording and the danger
button so no call site restates them.

### `promptModal` fields

A field is a `ModalField` record (`Modal.js`), and `type` picks the widget:

| `type` | Widget | Value in the result record |
| --- | --- | --- |
| `'text'` *(default)* | `input.field` | the string |
| `'number'` | `input.field type=number`, honoring `min`/`max` | the string; out-of-range values clamp on `change`, not per keystroke |
| `'select'` | `select.field` over `options: { value, label, disabled? }[]` | the selected value |
| `'file'` | image picker | a `data:` URL produced by `readImageFile` |
| `'multiselect'` | scrollable checkbox group, capped by `max` | checked values, comma-joined |
| `'tags'` | pill list with inline entry | pills plus any unfinalized text, comma-joined |
| `'pillgrid'` | assignment grid: `rows` x `options`, one option per row | `row:value` pairs, comma-joined |
| `'button'` | an in-form action button | `''` (it acts through `onChange`) |

Every field also takes `label`, `value`, `full`, `hidden`, and `disabled`. With
`options.wide` the form lays fields two per row and `full: true` spans both
columns. Actions are Cancel then submit (`options.submitLabel`, default
`'Create'`), which is the dismiss-left/primary-right ordering used on every
form surface in the app.

Two behaviors worth knowing because they are easy to reimplement badly:

- **The file field reports errors inline**, as a `<p class="modal__error"
  role="alert">` inside the dialog, not as a nested alert modal. It also clears
  the input after a failure so re-picking the same file fires `change` again,
  and in-flight reads are awaited before the result record is collected, so a
  fast submit cannot drop the image.
- **`onChange` gets a handle on the whole form**, so one field can drive
  another (a tier select re-stamping default stats, a class select refiltering
  a spell list). The handle is
  `{ get, set, setOptions, setDisabled, setLabel, setRange, setHidden }`, all
  keyed by field name, and `get` is always synchronous.

The composite fields (`multiselect`, `tags`, `pillgrid`) each keep their own
local state and re-render internally; a refilter through `setOptions` preserves
current selections even if they leave the option set.

## Inline forms

The Library rail's authoring forms render inline rather than in a dialog, so
they build from `src/ui/formFields.js` instead of `Modal.js`:

```js
labeled(caption, control)          -> HTMLLabelElement   // wraps the control
fieldRow(...children)              -> HTMLDivElement     // one horizontal group
checkbox(caption, checked)         -> { label, input }
textField(value, placeholder?)     -> HTMLInputElement
numberField(value, { min }?)       -> HTMLInputElement
textareaField(value, opts?)        -> HTMLTextAreaElement
select(options, value)             -> HTMLSelectElement
statInputRows(keys, stats)         -> { statInputs, rows, read }
formActions({ submitLabel, onSubmit, onCancel? }) -> HTMLDivElement
```

`labeled` puts the control *inside* the `<label>`, so there is no `for`/`id`
pairing to keep in sync and nothing has to generate a unique id. `select`
accepts bare strings (value is the label) or `{ value, label }` pairs, so the
same helper serves enum pickers and labelled choices.

`statInputRows(keys, stats)` is the shared ability-score block: one clamped
number field per key, two per row, plus a `read()` that returns the record. Its
modal counterpart is `src/app/statFields.js`, so the stat block has one
definition for inline forms and one for dialogs rather than one per form.

`formActions` is the only correct way to build a form's action row. It places
Cancel left of the primary submit, matching the modals.

## Tabs and disclosures

Both are "wire existing markup" helpers rather than builders. The caller owns
the elements; the helper owns the state and the ARIA.

```js
wireTabs(tablist) -> { select(tabId) }
```

`src/ui/Tabs.js` implements the full ARIA tabs pattern over a
`[role=tablist]` of `[role=tab]` buttons, each pointing at its
`[role=tabpanel]` via `aria-controls`. It maintains `aria-selected`, a roving
`tabIndex` so only the active tab is in the document tab order, and
`panel.hidden`. Arrow Left/Right wrap around and Home/End jump to the ends,
each moving focus; a click selects without stealing focus. The initially
selected tab is whichever is already marked `aria-selected="true"` in the
markup, defaulting to the first.

Two panels still hand-roll a tab strip and both are missing the Home/End
handling. Use `wireTabs`; do not add a third.

```js
wireDisclosure(button, body, { expanded?, onToggle? }?) -> { isExpanded, setExpanded }
```

`src/ui/Disclosure.js` keeps `aria-expanded` on the button, toggles the
`disclosure--open` class (which rotates the chevron via CSS), and sets
`body.hidden`. `setExpanded` runs once at wire time, so `onToggle` also fires
on init. Because a re-rendering panel rebuilds its DOM, the documented pattern
is to pass the last known state in as `expanded` and record changes from
`onToggle`.

## Toasts

```js
mountToasts(container, { duration = 3500 }?) -> { show(message) }
queueToastAfterReload(message)
flushQueuedToast(toasts)
```

`src/ui/Toast.js` mounts one stack on `document.body` in `main.js`, and the
handle is injected app-wide as `app.toasts`, so no module imports it directly.
The stack is `role="status" aria-live="polite"`, which announces messages to a
screen reader without stealing focus. Toasts self-dismiss and a click dismisses
early.

The two queue functions carry one confirmation across a page reload through
`sessionStorage`, for actions (like adopting another tab's save) whose
completion happens after the current document is gone.

Toasts render over map art, so they use the `--overlay-*` tokens rather than
the page surface colors, for the reason given under the tokens below.

## Context menus

```js
openContextMenu(items: { label, onSelect }[], { clientX, clientY })
clampToViewport(x, y, width, height, viewportWidth, viewportHeight, margin?)
```

`src/ui/ContextMenu.js` is the right-click counterpart to `Modal.js`, for
choices that do not warrant a dialog. It carries native-menu semantics: focus
moves into the first item, arrows cycle, Escape or an outside click dismisses
without choosing, and choosing closes the menu before running the action. Only
one menu is open at a time, so opening a second closes the first. There is no
return value; the items' own callbacks are the result.

`clampToViewport` is the pure positioning helper, kept separate so it can be
unit tested. It flips the menu off a viewport edge rather than letting it slide
under one.

A context menu is deliberately *not* a `<dialog>`, so it stays outside the
`Modal.js` lifecycle rather than being folded into it.

## Image input

`src/ui/imageField.js` backs the `file` field, and it exists because a picked
image lands in the campaign save, which is copied whole into every undo slot
and lives in a roughly 5 MB localStorage origin. Ingestion is therefore
bounded:

```js
readImageFile(file)                       -> Promise<string>  // a data: URL
fitDimensions(width, height, maxEdge)     -> { width, height } // pure
encodeAttempts(width, height, maxEdge?)   -> { width, height, quality }[] // pure
```

`readImageFile` rejects a source over `MAX_SOURCE_BYTES` (12 MB), downscales to
`MAX_EDGE` (1280 px longest edge), and then walks `encodeAttempts` (three JPEG
quality steps at full edge, then the same three at half edge) until the encoded
string is under `MAX_ENCODED_CHARS` (250,000), returning the first that fits.
For a PNG source it also tries PNG and keeps whichever is shorter. Its
rejections are GM-facing sentences, not error codes, because they surface
directly in the dialog.

The arithmetic (`fitDimensions`, `encodeAttempts`) is pure and unit-tested; the
canvas encode path is verified in a browser.

Both size caps are there to survive the browser storage budget, not because
they are the right quality ceiling for a projected handout. They are expected
to go away when image payloads move to real files.

## The CSS layer

### One manifest, one cascade order

`style.css` contains nothing but `@import`s of the feature sheets under
`styles/`, in cascade order, with a one-line comment each. Later sheets may
override earlier ones, so the order is the contract:

1. `base.css` — design tokens, element base, the `.btn`/`.field`/`.card`
   primitives
2. `shell.css` — header, modal dialog, mode and role switches
3. `build.css` — Build mode: world tree, palette, tile inspector
4. `layout.css` — play-surface columns, map viewport, toasts, sidebar tabs
5. `widgets.css` — breadcrumb, dice tray, disclosure, stat bars
6. `character.css`, `session.css`, `party.css`, `story.css`, `library.css`,
   `spells.css` — one per feature area
7. `responsive.css` — narrow-viewport stacking; **keep last**

A new feature sheet goes in the feature block and gets an `@import` with a
comment saying what it covers. Nothing is imported from a `.js` file.

### Tokens

Every color, space, radius, type size, and shadow is a custom property defined
in one `:root` block in `styles/base.css`:

| Group | Tokens |
| --- | --- |
| Surfaces | `--bg`, `--surface`, `--surface-raised`, `--surface-sunken` |
| Lines | `--border`, `--border-strong` |
| Text | `--text`, `--text-muted` |
| Accents | `--accent`, `--accent-hover`, `--danger`, `--success`, `--warning`, `--mana`, each with a matching `*-contrast` |
| Focus and shadow | `--focus-ring`, `--shadow-tint`, `--shadow-1/2/3` |
| Over-map chrome | `--overlay-bg`, `--overlay-text`, `--overlay-npc` |
| Spacing | `--space-1` (0.25rem) through `--space-6` (2rem) |
| Type | `--font-sans`, `--font-mono`, `--text-display`, `--text-heading`, `--text-body`, `--text-label`, `--line-body` |
| Radius | `--radius-sm`, `--radius`, `--radius-lg` |

Two rules, both load-bearing:

- **Never write a fallback** (`var(--border, #ccc)`). A missing token renders
  as nothing, which is visible; a fallback hides the typo instead.
- **Every accent has a `*-contrast` partner**, and a filled element always
  declares its own foreground from it. Add new accents as a pair.

Elevation uses `color-mix` to fade `--shadow-tint` to the wanted alpha, so
shadows follow the theme without restating a color.

### Theming

There is one set of tokens, not two. Each color is a single
`light-dark(light, dark)` declaration resolved by the root `color-scheme`:

- `:root { color-scheme: light dark }` follows the OS preference by default.
- `:root[data-theme='light']` and `:root[data-theme='dark']` pin it. The
  attribute selector outranks the bare `:root`, so an explicit choice always
  wins.
- `src/ui/ThemeToggle.js` writes `data-theme` on `<html>` (deleting it for
  System) and persists the choice under `campaign-builder:theme`.
- An inline script in `index.html`'s `<head>` re-applies the saved value before
  first paint, so a dark-theme reload does not flash light.

The one non-color themed value is `--select-chevron`, an inline SVG data URI.
`light-dark()` resolves `<color>` only, so it cannot hold a `url()`; the arrow
is instead swapped in a `prefers-color-scheme` block plus the two `data-theme`
blocks, which is why that token appears four times.

`--overlay-*` is the deliberate exception to all of this: pinned dark in both
themes, because map controls, toasts, tooltips, and the onboarding scrim float
over map art rather than the page surface.

### Shared classes

Class names are BEM-ish: `block__element--modifier`. Everything below lives in
`base.css` and is shared across features; reuse the class and keep only layout
(margins, grid placement) in your own component class.

| Class | Role |
| --- | --- |
| `.btn` + `--primary`/`--danger`/`--success`/`--icon` | every button; built through `buttons.js` |
| `.field` | every input, select, and textarea |
| `.card`, `.card__title` | a bordered panel with an uppercase heading |
| `.seg-switch`, `__btn`, `__btn--active` | segmented toggle (mode, theme, role, dice-tray d20) |
| `.row-select`, `--current` | selectable full-width list row (world tree, roster) |
| `.section-label` | in-panel sub-heading: uppercase, tracked, muted |
| `.empty-state` | the "nothing here yet" paragraph |
| `.icon` | the SVG wrapper `icon()` applies |
| `.sr-only` | visually hidden, still announced |

Three more shared shapes live one sheet up, next to the widget they were built
for: `.disclosure` / `__chevron` / `--open` and `.stat-bar` / `__track` /
`__fill` (plus `--mana` and `--critical`) in `widgets.css`, and `.tabs` /
`__tab` / `__panel` in `layout.css`.

`.field` carries two details worth not undoing. Single-line controls get an
explicit `height`, because a bare `<select>` ignores `line-height` for its box
metrics and otherwise sits about 2.5 px shorter than a neighboring `<input>`.
And selects opt into the customizable-select model (`appearance: base-select`
plus `::picker(select)`) as a progressive enhancement: an engine without it
drops the value and falls back to the `appearance: none` rule above, so the
closed control is themed everywhere and only a supporting engine also themes
the popup.

### Layout and responsiveness

Layout is flex-dominant with intrinsic sizing (`min()`,
`flex: 1 1 <rem basis>`, `repeat(auto-fit, minmax(...))`), so most reflow
happens with no media query at all. Grid is reserved for genuinely tabular
content.

Two things follow from that:

- **All layout media queries live in `responsive.css`**, and there is exactly
  one breakpoint: `@media (max-width: 68rem)`. Below it the main columns stack
  and the map viewport shortens. The only other `@media` in the project is the
  `prefers-color-scheme` chevron block.
- **Mode and role are body classes, not breakpoints.** `body.mode-build`,
  `.mode-play`, `.mode-library`, `.role-gm`, `.role-player`, `.role-locked`,
  and `.sidebar-collapsed` gate whole regions, so switching modes is a class
  flip rather than a re-render.

A flex child that holds text needs `min-width: 0` or long content will refuse
to shrink. That guard appears over twenty times across the sheets, and it is
the usual explanation for a panel that overflows its column.

## Accessibility in practice

What the shared layer already handles, so you do not restate it:

- **Focus** is one global `:focus-visible` outline in `--focus-ring`, with two
  intentional escalations: the map canvas draws a thicker accent ring, and
  tabs, context-menu items, and spellbook rows pair focus with their hover
  treatment. `.field:focus` only recolors the border; the global outline still
  supplies the ring.
- **Names on controls**: `iconButton` requires `aria-label`, icons are
  `aria-hidden`, and form controls are wrapped by their `<label>`.
- **State in ARIA, not only in classes**: `wireTabs` writes `aria-selected` and
  the CSS styles from it; `wireDisclosure` writes `aria-expanded`; pillgrid
  pills use `aria-pressed`.
- **Announcements** go through live regions: the toast stack is
  `role="status" aria-live="polite"`, the map has its own description live
  region, and file-field errors are `role="alert"`. The map's live region is
  only rewritten when the text actually changed, because rewriting it
  re-announces it.
- **Focus return**: every dialog refocuses whatever opened it on close.

Three known gaps, so nobody assumes they are covered:

- No `prefers-reduced-motion` handling. The animated surfaces are the `.btn`
  transition, the disclosure chevron rotation, and the toast slide-in.
- No touch-target floor. `.btn--icon` is 1.75rem (28 px) square, well under the
  usual 44 px guidance.
- No `forced-colors` or `prefers-contrast` support.

## Known duplication

Worth knowing so you reuse the right thing and do not add to the pile.

- **Chips and badges have no shared class.** Around ten near-identical
  implementations exist across `party.css`, `session.css`, `library.css`,
  `spells.css`, `character.css`, and `shell.css`. There are really two families
  (a `--radius-sm` badge and a pill), the split is not encoded in the naming,
  and the pill radius is a literal `999px` repeated in five sheets with no
  `--radius-pill` token. The removable "x" chip button exists three times in JS
  and three times in CSS, and one copy has already drifted.
- **Transition durations are untokenized**: `0.12s`, `120ms`, `0.15s`, `0.2s`,
  and `0.25s` all appear, with no `--transition-*` token.
- **The list-CRUD panel skeleton is written six times** (quests, handouts,
  NPCs, build encounters, encounters, library), and the `<dialog>` lifecycle
  seven times, four of them outside `Modal.js`.
- **`.section-label` and `.empty-state` are each re-implemented ad hoc** in
  `character.css` rather than reused.

If you are adding a widget that fits one of these shapes, reuse the existing
class or JS builder and resist adding the next copy; if you are adding the
shared version, `base.css` is where it belongs.

## Testing UI code

No panel or widget in `src/ui/` has a unit test, by design. These modules are
the DOM glue half of the project's split, so they get checked in a browser
instead. The exceptions are the pure helpers that happen to live here:
`fitDimensions` and `encodeAttempts` (`tests/imageField.test.js`) and
`clampToViewport` (`tests/context-menu.test.js`) are arithmetic, so they are
tested where they sit.

Preview pages in `tests/` mount the real modules against hand-built fixtures
without the rest of the app: `tests/ui-panels-preview.html` for the character
sheet, inventory, and encounter panels, plus the map and tile previews beside
it. Keep them current when a mount signature changes, since a stale preview
page will mask a real bug the next time someone reaches for it.

See [`docs/testing.md`](../testing.md) for the full loop, including checking
both themes and the console.
