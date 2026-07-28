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
guide covers the API surface; that one covers the policy.

## Two layers

```
  src/app/*Wiring.js ......... mounts panels, owns callbacks and modals
          |
          v
  src/ui/<Panel>.js .......... feature panels: build DOM, return { update }
          |
          v
  src/ui/listPanel.js ........ the list-panel skeleton most feature panels
          |                    are a thin configuration of
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

That is the shape by hand. Most list panels, including the real
`mountQuestPanel`, get it from `mountListPanel` instead (below) and never write
this boilerplate.

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
  which section is expanded, which tab is showing. `LibraryPanel`'s `update`
  closes an open inline editor for exactly that reason, while its filter text
  and selected subtab survive, since the input and the tab strip are built once
  and only the lists redraw.
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
for the small lists most panels show. What keeps it cheap is that `update()` is
allowed to do nothing: a panel built on `mountListPanel` compares the rows it
would draw against the ones it last drew and returns early when they are the
same objects. That is why a party step can fire five panel refreshes without
five rebuilds. Three panels skip the rebuild differently: the travelogue diffs by
anchor id, the tile inspector builds once and re-points, and the character sheet
does the same behind a structure check (below). The initiative panel takes that
same split. It builds its rows once and collects writers for the round number,
each combatant's name and side, and each initiative, so those values land in
place. It rebuilds only when its shape would change: the viewer's role, the turn
index, the order's length or ids, who may press the action buttons, or the action
strip's contents, meaning the acting combatant's equipped weapons and castable
spells. During a fight that leaves the common refreshes, such as a damage roll, a
condition, or a spent slot, writing text into elements that already exist. Naming
the strip's items rather than the acting entity is what makes that hold on the
acting combatant's own turn, since an edit to that entity replaces the object
whether or not it touched a weapon or a spell. Copy those only when the panel is
large or grows continuously, and see
[Conventions](conventions.md#growing-lists-render-incrementally).

### The character sheet's structure check

The sheet is the one panel where clearing and rebuilding was expensive enough to
be worth designing around. A single HP tick used to discard roughly two hundred
elements — six ability badges with an inline SVG die each, every spell-slot pip,
the progression and spell sections, the condition chips — to move one bar's
width, and every tick commits, which fires the sibling panels too.

So it splits in two. `build()` creates the DOM once and collects a list of small
writers, each of which pushes one current value into an element it captured;
`render()` runs only those writers when it can. Whether it can is decided by
`sheetDeps(character, perms)` in `src/view/SheetStructure.js`: a flat list of
everything the DOM's *shape* comes from, compared against the last one with
`sameDeps`. Matching lists mean the only differences are values a writer can
write — a pool level, bonus HP, base AC, the name, the conditions — so the DOM
stays. Anything else (a class taken, an ability improved, an item equipped, a
pool added or resized, a permission change) rebuilds.

Two consequences are easy to get wrong if you extend the sheet:

- **Event handlers must read the live character, not the one they were built
  from.** They now outlive the change that follows them, so the sheet passes a
  `live()` getter around and `buildProgressSection` takes a getter rather than a
  character. A handler that closed over a build-time snapshot would silently undo
  whatever had been written in place since.
- **`sheetDeps` has to name every field the structural builders read.** Adding a
  read to the sheet, the progression section, or the spell section without adding
  it there gives you a stale display, and the compiler cannot catch it.

Comparing those fields by reference is sound because the entity layer never
mutates in place; see
[Conventions](conventions.md#tiles-are-frozen-once-a-node-holds-them).

### Handles that are not `{ update }`

Not every mount returns `update`. The other shapes, so you can recognize them:

| Shape | Used by | Why |
| --- | --- | --- |
| `{ setCharacter }`, plus `getCharacter` on two of them | `CharacterSheet`, `InventoryPanel`, `SpellbookPanel` | these three are scoped to one selected character, which they hold and re-render from; a sibling panel's edit is pushed in through `setCharacter` rather than re-read through a getter |
| a domain handle | `segSwitch` (`{ element, getValue, setValue, sync }`), `ThemeToggle`, `PalettePanel`, `TileInspector`, `Toast` (`{ show }`) | a control, not a list; there is nothing to re-render from state |
| `build<X>Form(...)` returning DOM plus readers | `ItemForm`, `SpellForm`, `EncounterTemplateForm`, `NPCTemplateForm`, `CharacterProgress` | inline forms are built per edit and thrown away, so they are constructed, not mounted |
| `Promise<result>` | `combatSetupModal`, `generateDialog`, `promptSpellDetail`, everything in `Modal.js` | a dialog is one question with one answer |
| `{ element, get, set }` | `buildDamageEditor`, `buildEffectsEditor` (`ItemFormEditors.js`) | a composite sub-widget inside a form: it owns a working copy, hands over `element` to mount, `get` to read at submit, and `set` so a preset picker can overwrite it |

When you add a composite form widget, use that last contract. It is what lets
`ItemForm` treat a damage-parts editor exactly like a text input.

## The list panel

Most rails are the same thing: a list of entities, each row with an edit and a
delete button, an empty state when there is nothing, and a "New ..." control at
one end. `mountListPanel(container, options)` (`src/ui/listPanel.js`) is that
shape once, and the quest, handout, NPC, encounter, library, and Build-rail
encounter panels are each a configuration of it. It returns the usual
`{ update }`. A panel with tabs mounts one of these per tab panel: the encounter
panel's Active and Nearby tabs are two list panels, and the equipment library's
five category subtabs are five.

The options split cleanly in two. The caller decides what the markup is:

| Option | What it does |
| --- | --- |
| `className` | the root element's class, and the stem of the row class (`quest-panel` gives `quest-panel__row`) |
| `rowClass` | the row's class when it cannot come from `className` — a list nested in a wider panel names its rows after the outer one |
| `getRows(gm)` | the entities to draw, already scoped and ordered |
| `buildBody(entry, ctx)` | the row's content, left of the buttons; one node or an array |
| `actions(entry, ctx)` | the row's buttons, as `{ icon, label, variant, onClick }` descriptors — `null` entries are dropped, so an optional control is a ternary |
| `buildExtras(entry, row, ctx)` | anything below the row's head: a stat bar, a read-aloud body |
| `bodyClass` / `actionsClass` / `headClass` | whether the body nodes, the buttons, and the pair of them get wrapper divs |
| `emptyMessage`, `rowModifiers`, `groupOf` | the empty-state text, extra row classes, and an optional section heading emitted when consecutive rows change group |
| `addButtons(gm)`, `addPlacement`, `addClass` | the add controls, and where they go: loose at the end of the list (`inline`, the default), leading it in a pinned `.panel-actions` row (`leading`), or trailing it in a plain one (`trailing`) |
| `gate()` | `false` for the read-only player view: no action buttons, no add controls |

And the helper owns the plumbing: the root element, clearing and rebuilding, the
row loop, the group headings, and one thing worth knowing about because it
changes how you write a handler.

**Every handler is awaited, and the panel re-renders unless the handler says
nothing happened.** "Nothing happened" is a returned `false` or `null` — which
is already what a cancelled dialog gives you, since `confirmModal` resolves
`false` and `promptModal` resolves `null`. A handler that returns nothing at all
counts as a change and re-renders. So the fourteen hand-written copies of

```js
const button = iconButton('edit', `Edit ${quest.title}`, async () => {
  if (await callbacks.onEdit(quest)) render();
});
```

collapse to a descriptor:

```js
actions: (quest) => [
  { icon: 'edit', label: `Edit ${quest.title}`, onClick: () => callbacks.onEdit(quest) },
],
```

The `ctx` handed to `buildBody`, `actions`, and `buildExtras` carries `gm` (the
resolved gate), `render` for a bespoke control that has to refresh the list, and
`action(spec, entry)` to build a button with those same semantics — that last
one is how a leading toggle, like the quest's complete button or the handout's
eye, gets wired even though it sits inside the body rather than in `actions`.

`update()`'s early-out compares row objects by identity, which
is only sound because the entity layer never mutates in place. A panel whose
output depends on state that is *not* in its rows has to pass `alwaysRender`.

## Buttons, icons, and empty states

### `src/ui/buttons.js`

Two button builders, a segmented switch, an empty-state paragraph, and the chip
pair. Twenty-six
modules import them, and no panel should call
`document.createElement('button')` for an ordinary control. The raw calls that
remain build controls with their own class vocabulary rather than `btn` — tabs,
menu items, tree rows, palette swatches, disclosure headers — and those are not
what these helpers cover.

```js
iconButton(name, ariaLabel, onClick, opts?) -> HTMLButtonElement
textButton(label, onClick, opts?)           -> HTMLButtonElement
segSwitch({ ariaLabel, options, value, onChange, className? })
                                            -> { element, getValue, setValue, sync }
emptyState(message)                         -> HTMLParagraphElement
chip(label, opts?)                          -> HTMLSpanElement
removableChip(label, onRemove, opts?)       -> HTMLSpanElement
```

`iconButton` builds `btn btn--icon`, **requires** an `ariaLabel` (an icon-only
button has no other accessible name), and defaults the hover `title` to that
label. Pass `opts.title` only when you want a shorter tooltip than the label.

`textButton` builds `btn` with an optional leading `opts.icon`. Here the
visible text is already the accessible name, so `ariaLabel` is set only when
given, for cases where the label alone is ambiguous (a weapon name whose action
is really "Attack with ..."). A dialog's confirm button also passes
`opts.type: 'submit'` with the `opts.value` the dialog reads back from
`returnValue`, which is how an Escape dismissal (value left empty) stays
distinguishable from a confirm; such a button needs no `onClick`, so the
argument is optional.

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

`segSwitch` builds a `role="group"` of buttons over one value: the header's
mode, role, and theme switches and the dice tray's d20 mode. Each option is
`{ value, label?, icon?, ariaLabel?, title? }`, so a choice can be text, an icon,
or both, and the selected button gets the active class and `aria-pressed`
together. The caller appends `element` itself, which is what lets the dice tray
put the switch inside a labelled row. `setValue` selects a choice and reports it
through `onChange`, the same path a click takes; calling it right after mounting
is how the mode switch applies the starting mode's body classes. `sync` repaints
the buttons without reporting anything, for a caller whose value lives elsewhere
and can change without going through the switch, which is the dice tray's
selection object.

`emptyState(message)` is the one `<p class="empty-state">`. Every list panel's
"nothing here yet" line goes through it.

`chip(label)` is a `<span class="chip">` holding the label in its own inner
span, so a caller can append to the chip without disturbing the text.
`removableChip(label, onRemove)` adds the trailing x (`.chip__remove`) that
calls `onRemove`. Pass `opts.removeLabel` when the visible label is not the
thing being removed: the conditions bar shows "Poisoned (3)" but its button
should read "Remove Poisoned". Status conditions, the effects a weapon inflicts,
and tag-field pills all build through these; `opts.className` carries any
per-feature modifier.

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

Two naming conventions constrain which glyph you pick. `minus` and `heal` are
the fixed pair for HP moving down and up, everywhere; `sword` is reserved for
attack actions and is never used for damage. And if you need a new
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

All four share one lifecycle, and so does every other dialog in the app: capture
`document.activeElement` as the opener, build and append the dialog,
`showModal()`, and on `close` remove the dialog and refocus the opener before
resolving. Escape closes, because that is what `<dialog>` does natively. Nothing
here re-implements an overlay, a scrim, or a focus trap.

That lifecycle is `openDialog`, also exported from `Modal.js`, and it is where
you start if you need a dialog that is not a form, a message, or a question:

```js
openDialog({ className, title, form, build, result }) -> Promise<T>
```

You supply `build(close)`, which returns `{ body, actions, initialFocus }` — the
content between the title and the button row, the buttons themselves (wired to
the `close(value)` it was handed), and what takes focus on open. `result` maps
the dialog's return value to whatever your function promises; it runs while the
dialog is still mounted, so it may read its own inputs, and it may return a
promise when the value is not settled yet (that is how the file field's decode
is awaited). With `form: true` the parts go inside a `<form method="dialog">`,
which is what makes Enter submit and a submit button's `value` the return value.

The four dialogs that live outside `Modal.js` are all built this way:
`promptSpellDetail` (`SpellDetail.js`), `combatSetupModal` (`CombatSetup.js`),
`generateDialog` (`GenerateDialog.js`), and the ability-score breakdown
(`CharacterStatBadge.js`). Focus restoration and dismissal semantics have one
owner, so those four cannot drift from the `Modal.js` dialogs.

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
| `'allocation'` | distribution grid: a number input per row that must sum to `total` | `row:count` pairs, comma-joined; a row given 0 is left out |
| `'button'` | an in-form action button | `''` (it acts through `onChange`) |

Every field also takes `label`, `value`, `full`, `hidden`, and `disabled`. With
`options.wide` the form lays fields two per row and `full: true` spans both
columns. Actions are Cancel then submit (`options.submitLabel`, default
`'Create'`), which is the dismiss-left/primary-right ordering used on every
form surface in the app.

Two behaviors are easy to reimplement badly:

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

The composite fields (`multiselect`, `tags`, `pillgrid`, `allocation`) each keep
their own local state and re-render internally; a refilter through `setOptions`
preserves current selections even if they leave the option set.

The allocation field is also the one field that can block a submit. It writes a
message onto its first input through `setCustomValidity` whenever the rows do
not sum to `total`, so the browser refuses the submit and reports it the way it
reports any other invalid field. Its rows scroll and its remaining-count line
does not, so the reason a submit was refused cannot be scrolled out of sight.

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
setOptions(select, options, value)                // refill an existing picker
statInputRows(keys, stats)         -> { statInputs, rows, read }
buildInlineForm({ nameInput, rows, assemble, submitLabel, onSubmit,
                  onCancel?, afterSubmit?, className? }) -> HTMLDivElement
```

`labeled` puts the control *inside* the `<label>`, so there is no `for`/`id`
pairing to keep in sync and nothing has to generate a unique id. `select`
accepts bare strings (value is the label) or `{ value, label }` pairs, so the
same helper serves enum pickers and labelled choices.

`statInputRows(keys, stats)` is the shared ability-score block: one clamped
number field per key, two per row, plus a `read()` that returns the record. Its
modal counterpart is `src/app/statFields.js`, so the stat block has one
definition for inline forms and one for dialogs rather than one per form.

`buildInlineForm` is the envelope all four forms share. It wraps the form, puts
the name field first with the wide name-input styling, appends `rows` in order,
and closes with the action row (Cancel left of the primary submit, matching the
modals). A submit reads the whole form through `assemble`, which returns the
finished value or `null` to refuse the submit; a blank name is refused before
`assemble` runs, so no form re-implements that check. `afterSubmit` runs on an
accepted submit, which is how the inventory add row clears itself while the
per-item editor keeps its values on screen.

## Tabs and disclosures

Disclosures and most tab strips are "wire existing markup" helpers rather than
builders. The caller owns the elements; the helper owns the state and the ARIA.

```js
wireTabs(tablist, { resolvePanel?, onSelect? }?) -> { select(tabId) }
```

`src/ui/Tabs.js` implements the full ARIA tabs pattern over a
`[role=tablist]` of `[role=tab]` buttons, each pointing at its
`[role=tabpanel]` via `aria-controls`. It maintains `aria-selected`, a roving
`tabIndex` so only the active tab is in the document tab order, and
`panel.hidden`. Arrow Left/Right wrap around and Home/End jump to the ends,
each moving focus; a click selects without stealing focus. The initially
selected tab is whichever is already marked `aria-selected="true"` in the
markup, defaulting to the first.

Most strips are written out in `index.html`, so wiring them is all the caller
needs. When the tabs are only known at runtime, `buildTabs` builds the strip
instead:

```js
buildTabs({ ariaLabel, className?, tabs: [{ id, label, panel }], selected?, onSelect? })
  -> { tablist, select(id) }
```

It creates the buttons, generates the id pairing `aria-controls` needs, marks up
the panels the caller passed in, and hands the whole thing to `wireTabs` —
`resolvePanel` is how the panels are found before they are in the document, and
`onSelect` reports the caller's own tab id, including for the initial selection.
The encounter panel's two tabs and the equipment library's category subtabs are
both this. Selecting a tab only flips `hidden`, so the panels' contents survive
a tab click and refresh on their own schedule; neither panel re-renders to move
a highlight. Use one of these two helpers, never a third strip by hand.

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

A context menu is not a `<dialog>`, so it stays outside the
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

Two rules, both of which the token system depends on:

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
| `.chip`, `.chip__remove` | a small labeled tag, with or without an x; built through `buttons.js` |
| `.badge` | a read-only status marker on a list row; the color comes from a per-feature modifier |
| `.icon` | the SVG wrapper `icon()` applies |
| `.sr-only` | visually hidden, still announced |

Three more shared shapes live one sheet up, next to the widget they were built
for: `.disclosure` / `__chevron` / `--open` and `.stat-bar` / `__track` /
`__fill` (plus `--mana` and `--critical`) in `widgets.css`, and `.tabs` /
`__tab` / `__panel` in `layout.css`.

### Utilities

Alongside those shared classes `base.css` carries a small utility layer, for the
treatments that kept getting restated in every feature sheet. A utility says how
something looks, not what it is, so an element keeps its own component class for
the rest of its styling and for anything that needs to select it:

```js
el('span', 'npc-panel__location u-muted', label);
```

There is one so far. `.u-muted` is the small secondary text used by captions,
hints, derived readouts, and row metadata — `font-size: var(--text-label)` plus
`color: var(--text-muted)`, the pair that roughly thirty rules each spelled out.

The layer sits before the feature sheets in the cascade, so a component rule
always wins where the two set the same property. `.tile-inspector__field--inline`
relies on that: it takes its text back to the full `--text` color while the
element still carries `u-muted` for the size.

Add one only when the pattern is already repeated several times and its values
come from the token scale. Anything with a component-specific value belongs in
that component's rule. When adopting `u-muted` leaves a component rule empty,
delete the rule and drop the class rather than leaving a name in the markup with
nothing behind it.

`.field` carries two details that look removable and are not. Single-line controls get an
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

### Keeping the first paint still

The page is laid out before any module has run, so anything the wiring changes
afterwards moves content the reader is already looking at. Three habits keep
that from happening, and a new panel should follow them:

- **Decide the body classes up front.** Because a mode or role class hides
  whole rails, waiting for `wireSessionControls` to apply them would lay the
  page out with every rail showing and then yank two of them away. An inline
  script at the top of `<body>` stamps the starting mode and role instead,
  alongside the `<head>` script that pins the theme. Its defaults deliberately
  restate `src/main.js`'s, so changing a default means changing both.
- **Reserve space a container will fill.** An empty container that later grows
  pushes everything under it down. `#breadcrumb-container` holds one crumb's
  height from the start for that reason, sized from the same tokens the crumb
  is built from rather than a pixel constant.
- **Reserve the scrollbar too.** `html` sets `scrollbar-gutter: stable`, so the
  moment the panels fill and the page passes one screen tall, every column does
  not narrow at once.

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

Reuse the right thing rather than adding to the pile.

- **Transition durations are untokenized**: `0.12s`, `120ms`, `0.15s`, `0.2s`,
  and `0.25s` all appear, with no `--transition-*` token.
- **The list-CRUD panel skeleton is written six times** (quests, handouts,
  NPCs, build encounters, encounters, library), and the `<dialog>` lifecycle
  seven times, four of them outside `Modal.js`.
- **`.section-label` is re-implemented ad hoc** in `character.css`:
  `.character-sheet__field-row` and `.stat-badge__key` each restate the
  uppercase-and-tracked treatment with their own letter spacing.

If you are adding a widget that fits one of these shapes, reuse the existing
class or JS builder rather than adding the next copy; if you are adding the
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
