# UI components

*Reference. Back to the [architecture overview](../architecture.md).*

This codebase has no component framework. A "component" here is a plain
function that builds DOM elements and returns a handle. The consistency comes
from a small set of shared builders plus one CSS token file. This guide is
the reference for both: what the shared builders are, what the contract of
each one is, and which CSS class or custom property to use instead of a new
one.

Read this guide before you add anything to `src/ui/` or `styles/`. Almost
every widget shape that you need already exists. The existing widgets became
centralized because the hand-rolled copies had drifted on accessibility
attributes.

The rules behind these components (when to use a confirm dialog, how buttons
are styled, what gets a toast) live in
[Conventions](conventions.md#ui-and-style). This guide covers the API
surface. Conventions covers the policy.

[The builder contract](#the-builder-contract) below is the normative part:
what any function in `src/ui/` must look like. The rest of the guide
describes the builders that exist today. Where the two disagree, the places
that have not caught up are listed under [Known
gaps](#known-gaps).

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
  src/ui/formFields.js, SpecForm.js
  src/ui/Tabs.js, Disclosure.js, Toast.js, ContextMenu.js, dom.js
          |
          v
  styles/base.css ............ design tokens + every shared primitive
```

Feature panels never hand-roll a button, an empty state, a dialog, or a
design value. They compose the layer below them. The wiring layer above owns
the data and the decisions. See [The app wiring layer](app-wiring.md).

## The builder contract

Everything in `src/ui/` is a function that returns DOM, or a handle over
DOM. These rules say what such a function looks like. They apply to a new
builder and to any change to an existing one.

### The name says the shape

| Form | Returns | Owns |
| --- | --- | --- |
| `mount<Name>(container, callbacks)` | a handle, usually `{ update }` | creates the root element and appends it to `container` |
| `build<Name>(spec)` | detached DOM, sometimes with readers beside it | nothing; the caller appends and decides the lifetime |
| `wire<Name>(element, options?)` | a handle over markup the caller already has | state and ARIA only. It builds no elements |
| `open<Name>(...)` | a `Promise` | a surface that comes and goes: a dialog, a menu. It resolves when the surface closes |
| `noun(...)` | one element | a primitive with no lifecycle: `iconButton`, `chip`, `icon`, `textField` |

A function that builds and mounts is a `mount`. A function that builds and
hands the result back is a `build`. A builder is never named after the
feature it was first written for.

### Two positionals, then one options object

A builder takes at most two positional arguments, then one options object. A
value earns a positional slot only when it is required, has no default, and
reads unambiguously in order at every call site: `iconButton(name,
ariaLabel, onClick, opts)`, `chip(label, opts)`. Everything else is a named
key in the object.

- Options are optional. The parameter defaults to `{}`, and every key has a
  defined behavior when it is absent.
- One name means one thing everywhere. `className`, `variant`, `ariaLabel`,
  `title`, `placeholder`, and `onChange` keep their meaning across modules.
  A `placeholder` is a positional in one field builder and an option in
  another only by accident, not by design.
- No second spelling of an existing option. A per-variant boolean
  (`{ danger: true }`) is not an alternative to `{ variant: 'danger' }`.
- A `mount`'s second argument is named `callbacks` and holds functions. A
  panel that spells it `options`, takes a bare function, or takes four
  positionals is inconsistent with every other panel, and the caller has to
  read the source to mount it.

### `className` appends, always

Every builder that returns an element accepts `opts.className` and appends
it to its own base class through `classNames`:

```js
el('div', classNames(['chip', opts.className]))
```

- It appends. It never replaces. A caller that passes a class still gets
  the shared presentation. A builder that assigns
  `element.className = opts.className` throws away its own contract.
- A space-separated string is valid. `classList.add(opts.className)` throws
  on one, so combine through `classNames` instead.
- No builder that returns an element leaves the option out. A missing
  `className` is what pushes a caller into hand-rolling the element.

`className` carries per-feature layout and one-off modifiers. It is not the
way to reach a state the builder already knows about.

### Semantic options, not class strings

A caller says what it wants. The builder owns the class vocabulary that
produces it.

```js
// yes
badge(label, { variant: 'danger' });
// no
el('span', 'badge badge--danger', label);
```

`variant` is the single name for this, and maps to the `block--<variant>`
modifier of whatever block the builder builds. The values are shared across
builders: `primary`, `danger`, `success`, and the neutral default when the
option is omitted.

A class contract that exists in CSS, as a block plus its modifiers, with no
builder that applies it, is a missing builder. That holds however few call
sites type the class today, because typing the class is the only option
they have.

### Deliberately not doing

These are settled, and recorded here so they are not reopened:

- **`el` keeps its positional class string.** `el(tag, className,
  ...children)` is the leaf that everything else builds on. Its value is
  that the nesting in the source reads as the nesting on the page, and an
  options bag costs exactly that.
- **The four update strategies stay.** Wholesale rebuild, the list panel's
  guarded rebuild, the character sheet's build-once-and-repoint, and
  in-place mutation each answer a different cost. Forcing one would make
  the sheet expensive or the small panels convoluted.
- **The utility classes stay in the markup.** `u-row`, `u-col`, `u-g1`
  through `u-g4`, and `u-muted` are written at the call site, not folded
  into builder options. They style the space around and between elements,
  which is the caller's business, while a builder owns only its own block.
  A `gap` option on every builder would put the same token scale behind a
  second vocabulary.
- **No CSS-in-JS, no framework, no build step.** Styling lives in CSS
  files. A builder applies the right class. It does not carry declarations.
- **No component base class and no registry.** A component here is a
  function. There is nothing to register with and nothing to extend.

## Mount points

Every panel mounts into an element that already exists in `index.html`. Use
`mustGetElement(id)` (`src/ui/dom.js`) to find it. Do not use
`getElementById` directly.

```js
import { mustGetElement } from '../ui/dom.js';

const container = mustGetElement('encounter-container');
```

`mustGetElement` throws `Required element #x is missing from index.html`
when the id is gone. This behavior is deliberate. Wiring runs at startup, so
a markup rename fails at load time instead of leaving a panel silently
unmounted, where no one notices until a GM clicks something.

## The panel contract

A feature panel is a `mount<Name>(container, callbacks)` function. It creates
its own root element, appends the element to the container, draws once, and
returns a handle:

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

This is the shape by hand. Most list panels, including the real
`mountQuestPanel`, get this shape from `mountListPanel` instead (below), and
never write this boilerplate.

The `{ update }` shape is the `Updatable` interface (`src/types/app.ts`). It
is the whole cross-module refresh protocol. A wiring module stores the
handle on `app.views.questPanel`. Anything that changes a quest calls
`app.views.questPanel.update()`, and does not need to know what the panel
draws.

An `update()` call works without any special knowledge of the panel, because
of how the panel is built:

- **Panels hold no campaign data of their own.** Everything a panel draws
  comes from a `get*` callback that it calls at render time (`getQuests()`,
  `getRole()`). Because of this, `update()` always re-reads the current
  state. A panel that cached its data needs its own way to mark the
  cache stale. The single `update()` entry point exists to avoid this.
  Transient view state is different, and it does belong to
  the panel: which row is in edit mode, which section is expanded, which tab
  shows. `LibraryPanel`'s `update` closes an open inline editor for this
  reason, but its filter text and selected subtab survive, because the input
  and the tab strip are built once and only the lists redraw.
- **Every mutation leaves through a callback.** Panels do not write state and
  do not open dialogs. They call `callbacks.onEdit(id)` and let the wiring
  module prompt, write, and redraw. This keeps panels DOM-only, so a
  contributor can check them by eye rather than by mock.
- **Role gating is also a callback.** Panels that show GM-only controls take
  an optional `getRole`, and default to the GM view when it is absent:

  ```js
  const gmView = () => !callbacks.getRole || isGM(callbacks.getRole());
  ```

  In the player view, the app does not build edit, delete, or add controls
  at all.

By default, `render()` clears `innerHTML` and rebuilds. This is fine for the
small lists that most panels show. The rebuild stays cheap because `update()`
can do nothing: a panel built on `mountListPanel` compares the rows it is
about to draw against the rows it last drew, and returns early when they are the same
objects. This is why a party step can fire five panel refreshes without five
rebuilds.

Three panels skip the rebuild in their own way. The travelogue compares
anchor ids. The tile inspector builds once and re-points. The character
sheet does the same behind a structure check (below). Copy this pattern only
when a panel is large or grows continuously. See
[Conventions](conventions.md#growing-lists-render-incrementally).

### The character sheet's structure check

The sheet is the one panel where clearing and rebuilding was expensive enough
to design around. A single HP tick used to discard about two hundred
elements (six ability badges, each with an inline SVG die, every
spell-slot pip, the progression and spell sections, the condition chips)
only to move the width of one bar. Every tick also commits, which fires the
sibling panels too.

Because of this, the sheet splits its work in two parts. `build()` creates
the DOM once, and collects a list of small writers. Each writer pushes one
current value into an element that it captured. `render()` runs only those
writers when it can.

`sheetDeps(character, perms)` in `src/view/SheetStructure.js` decides
whether `render()` can skip the rebuild. It is a flat list of everything the
shape of the DOM comes from, compared against the last list with
`sameDeps`. When the lists match, the only differences are values that a
writer can write (a pool level, bonus HP, base AC, the name, the
conditions), so the DOM stays. Anything else (a class taken, an ability
improved, an item equipped, a pool added or resized, a permission change)
triggers a rebuild.

The repoint path limits how a contributor can extend the sheet:

- **Event handlers must read the live character, not the character they
  were built from.** A handler now outlives the change that follows it, so
  the sheet passes around a `live()` getter, and `buildProgressSection`
  takes a getter rather than a character. A handler that closed over a
  build-time snapshot silently undoes any change written since.
- **`sheetDeps` must name every field that the structural builders read.**
  If a read is added to the sheet, the progression section, or the spell
  section without adding it there, the display goes stale, and the compiler
  cannot catch the error.

Comparing these fields by reference is sound, because the entity layer
never mutates data in place. See
[Conventions](conventions.md#tiles-are-frozen-once-a-node-holds-them).

### Handles that are not `{ update }`

Not every mount returns `update`. The other shapes are:

| Shape | Used by | Why |
| --- | --- | --- |
| `{ setCharacter }`, plus `getCharacter` on two of them | `CharacterSheet`, `InventoryPanel`, `SpellbookPanel` | these three are scoped to one selected character, which they hold and draw from. A sibling panel's edit is pushed in through `setCharacter` rather than read again through a getter |
| a domain handle | `segSwitch` (`{ element, getValue, setValue, sync }`), `ThemeToggle`, `PalettePanel`, `TileInspector`, `Toast` (`{ show }`) | a control, not a list. There is nothing to redraw from state |
| `build<X>Form(...)` returning DOM plus readers | `ItemForm`, `SpellForm`, `EncounterTemplateForm`, `NPCTemplateForm`, `CharacterProgress` | inline forms are built per edit and thrown away, so they are constructed, not mounted |
| `Promise<result>` | `combatSetupModal`, `generateDialog`, `promptSpellDetail`, everything in `Modal.js` | a dialog is one question with one answer |
| `{ element, get, set }` | `buildDamageEditor`, `buildEffectsEditor` (`ItemFormEditors.js`) | a composite sub-widget inside a form: it owns a working copy, hands over `element` to mount, `get` to read at submit, and `set` so a preset picker can overwrite it |

To add a composite form widget, use that last contract. It is what lets
`ItemForm` treat a damage-parts editor exactly like a text input.

## The list panel

Most rails share the same shape: a list of entities, each row with an edit
button and a delete button, an empty state for when there is nothing, and a
"New ..." control at one end. `mountListPanel(container, options)`
(`src/ui/listPanel.js`) builds this shape once. The quest, handout, NPC,
encounter, library, and Build-rail encounter panels are each a configuration
of it. `mountListPanel` returns the usual `{ update }`. A panel with tabs
mounts one list panel per tab panel: the encounter panel's Active and Nearby
tabs are two list panels, and the equipment library's five category subtabs
are five list panels.

The caller decides what the markup is:

| Option | What it does |
| --- | --- |
| `className` | the root element's class, and the stem of the row class (`quest-panel` gives `quest-panel__row`) |
| `classes` | every class below the root, in one bag (see the table after this one) |
| `getRows(gm)` | the entities to draw, already scoped and ordered |
| `buildBody(entry, ctx)` | the row's content, left of the buttons: one node or an array |
| `actions(entry, ctx)` | the row's buttons, as `{ icon, label, variant, onClick }` descriptors (`null` entries are dropped, so an optional control is a ternary) |
| `buildExtras(entry, row, ctx)` | anything below the row's head: a stat bar, a read-aloud body |
| `emptyMessage`, `groupOf` | the empty-state text, and an optional section heading shown when consecutive rows change group |
| `addButtons(gm)`, `addPlacement` | the add controls, and where they go: loose at the end of the list (`inline`, the default), leading it in a pinned `.panel-actions` row (`leading`), or trailing it in a plain one (`trailing`) |
| `gate()` | `false` for the read-only player view: no action buttons, no add controls |

Everything the caller classes below the root goes in `classes`, so the option
list above stays about behavior. Each entry is optional. An omitted one either
falls back to the stem or drops the wrapper it would have named.

| `classes` entry | What it does |
| --- | --- |
| `row` | the row's class when it cannot come from the stem (a list nested in a wider panel names its rows after the outer one) |
| `rowModifiers(entry, gm)` | extra classes on one row, for example a completed quest or a defeated foe |
| `body` / `actions` / `head` | whether the body nodes, the buttons, and the pair of them get wrapper divs |
| `group` / `groupHeading` | the div that collects one group's rows, and a class added to the group heading, which is a `section-label` either way |
| `add` | class on each add button, unless the button names its own. `leading` placement ignores it, since its pinned row styles the buttons itself |

The helper owns the plumbing: the root element, clearing and rebuilding, the
row loop, the group headings, and the handler contract below. That contract
changes how a handler is written.

**Every handler is awaited, and the panel redraws unless the handler
reports that nothing happened.** "Nothing happened" is a returned `false` or
`null`. This is already what a cancelled dialog gives, since `confirmModal`
resolves `false` and `promptModal` resolves `null`. A handler that returns
nothing at all counts as a change, and the panel redraws. So the fourteen
hand-written copies of

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

The `ctx` handed to `buildBody`, `actions`, and `buildExtras` carries `gm`
(the resolved gate), `render` for a custom control that must refresh the
list, and `action(spec, entry)` to build a button with the same behavior.
This last option is how a leading toggle, like the quest's complete button
or the handout's eye, gets wired even though it sits inside the body rather
than in `actions`.

`update()`'s early-out compares row objects by identity. This check is
sound only because the entity layer never mutates data in place. A panel
that draws something its rows do not describe passes `dependsOn`, a
function returning one comparable value, which the guard compares with
`Object.is` alongside the rows and the gate. The Active encounter tab uses
it for its Start combat button, which appears and disappears with whether a
fight is already running. `repaintNeeded(last, next)` is the decision
itself, exported so `tests/listPanel.test.js` can reach it without a DOM.

Build the value out of numbers, strings, or booleans. A fresh object per
read differs from the last one every time, which turns the guard off and
also discards what the user typed into a row's input on every refresh.

## Buttons, icons, and empty states

### `src/ui/buttons.js`

`src/ui/buttons.js` gives three button builders, a segmented switch, an
empty-state paragraph, the chip pair, a status badge, and the section label.
A panel must not build a `<button>` element itself. A control that carries the
`btn` presentation is an `iconButton` or a `textButton`. A control that is a
button for the keyboard but wears no button chrome is a `bareButton`, whatever
class it goes on to take: a tab, a menu item, a tree row, a disclosure header,
a spell-slot pip, a target card. The only `<button>` elements written by hand
are the sixteen static tabs in `index.html` and the palette swatch, which is
an image tile.

```js
iconButton(name, ariaLabel, onClick, opts?) -> HTMLButtonElement
textButton(label, onClick, opts?)           -> HTMLButtonElement
bareButton(children, onClick?, opts?)       -> HTMLButtonElement
segSwitch({ ariaLabel, options, value, onChange, className? })
                                            -> { element, getValue, setValue, sync }
emptyState(message)                         -> HTMLParagraphElement
chip(label, opts?)                          -> HTMLElement
removableChip(label, onRemove, opts?)       -> HTMLElement
badge(label, opts?)                         -> HTMLSpanElement
sectionLabel(text, opts?)                   -> HTMLElement
```

`iconButton` builds `btn btn--icon`. It requires an `ariaLabel`, because an
icon-only button has no other accessible name, and it defaults the hover
`title` to that label. Pass `opts.title` only for a shorter tooltip than the
label.

`textButton` builds `btn` with an optional leading `opts.icon`. Here the
visible text is already the accessible name, so the widget sets `ariaLabel`
only when the caller gives one, for cases where the label alone is
ambiguous (a weapon name whose action is really "Attack with ..."). A
dialog's confirm button also passes `opts.type: 'submit'` with an
`opts.value` that the dialog reads back from `returnValue`. This is how an
Escape dismissal (with the value left empty) stays distinguishable from a
confirm. Such a button needs no `onClick`, so the argument is optional.

`bareButton` builds `btn-bare`, the reset that strips the browser's button
presentation back to the surrounding text. The look comes from
`opts.className`, and the children are the button's content, so an icon and a
label can nest without a second builder. `onClick` is optional, for a button
another helper wires: `buildDisclosure` builds its header this way. A control
whose visible content is not its accessible name passes `opts.ariaLabel`.

Both `btn` builders take `opts.variant`, which maps straight to a `btn--*`
CSS modifier:

| `variant` | Result |
| --- | --- |
| *(omitted)* | neutral outlined button |
| `'primary'` | accent-filled, the affirmative action of a form or dialog |
| `'danger'` | danger-outlined, fills red on hover |
| `'success'` | success-outlined, fills green on hover |

`variant: 'danger'` is not decoration. Every destructive control passes it,
stays visible rather than appearing only on hover, and asks for confirmation
first. See
[Conventions](conventions.md#every-destructive-action-confirms-first).

`segSwitch` builds a `role="group"` of buttons over one value: the header's
mode, role, and theme switches, and the dice tray's d20 mode. Each option is
`{ value, label?, icon?, ariaLabel?, title? }`, so a choice can be text, an
icon, or both. The selected button gets the active class and
`aria-pressed` together. The caller appends `element` itself, which is what
lets the dice tray put the switch inside a labelled row.

`setValue` selects a choice and reports it through `onChange`, the same
path that a click takes. Calling `setValue` right after mounting is how the
mode switch applies the starting mode's body classes. `sync` repaints the
buttons without reporting anything, for a caller whose value lives
elsewhere and can change without going through the switch. This is the case
for the dice tray's selection object.

`emptyState(message)` is the one `<p class="empty-state">`. Every list panel's
"nothing here yet" line goes through it.

`chip(label)` is a `<span class="chip">` holding the label in its own inner
span, so a caller can append to the chip without disturbing the text. With
`opts.onClick` it is a `<button class="btn-bare chip">` instead, which is what
the stat-block chips use to open their editor. The tag follows from the option,
so there is no way to build a chip that looks clickable and is not.
`removableChip(label, onRemove)` adds the trailing x (`.chip__remove`) that
calls `onRemove`. Pass `opts.removeLabel` when the visible label is not the
thing being removed: the conditions bar shows "Poisoned (3)", but its
button reads "Remove Poisoned". Status conditions, the effects a weapon
inflicts, and tag-field pills all build through these. `opts.className`
carries any per-feature modifier.

`badge(label)` is the read-only marker on a list row. `opts.variant` covers the
three shared readings, `success`, `danger`, and `neutral`, which is how an
NPC's disposition colours itself. A marker that means something outside that
scale passes `opts.className` for its own colour: a prepared spell takes the
mana colour, and a custom library entry takes the accent.

`sectionLabel(text)` is the sub-heading inside a panel section. It is a span by
default, since these label the box beside them rather than open a section.
`opts.tag` makes it an `h3` or `h4` for a heading a screen reader should reach
through the document outline.

### `src/ui/icons.js`

```js
icon(name, { size = 18, className }?) -> SVGSVGElement
```

One function over a table of 24x24 stroke path data. Icons draw in
`currentColor`, so they inherit the color of whatever button or text they
sit in, and they theme themselves with no extra work. They are built with
`createElementNS` from path strings, never `innerHTML`.

Every icon is `aria-hidden="true"`. Icons here are decorative by
definition. The enclosing control owns the accessible name. This is why
`iconButton` requires a label.

The 28 names available (`IconName` in `icons.js`):

```
plus  minus  heal  remove  edit  save  export  import  dice  d20  add
check  chevron  map  fit  sword  shield  clock  flag  scroll  sparkles
eye  eye-off  lock  give  sun  moon  monitor
```

An unknown name yields an empty SVG rather than an error, so a typo shows
as a blank gap. The typecheck catches this: `IconName` is a string-literal
union, so a misspelled name fails `tsc`.

`minus` and `heal` are the fixed pair for HP moving down and up everywhere.
`sword` is reserved for attack actions and is never used for damage. To add
a new glyph, add its path data to `PATHS` and its name to the union rather
than placing an inline SVG at the call site.

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

This lifecycle is `openDialog`, also exported from `Modal.js`. Start here
to build a dialog that is not a form, a message, or a question:

```js
openDialog({ className, title, form, build, result }) -> Promise<T>
```

The caller supplies `build(close)`, which returns
`{ body, actions, initialFocus }`: the content between the title and the
button row, the buttons themselves (wired to the `close(value)` that they
were handed), and what takes focus on open. `result` maps the dialog's
return value to whatever the function promises. It runs while the dialog
is still mounted, so it can read its own inputs, and it can return a
promise when the value is not settled yet (this is how the file field's
decode is awaited). With `form: true`, the parts go inside a
`<form method="dialog">`, which is what makes Enter submit, and makes a
submit button's `value` become the return value.

The four dialogs that live outside `Modal.js` are all built this way:
`promptSpellDetail` (`SpellDetail.js`), `combatSetupModal`
(`CombatSetup.js`), `generateDialog` (`GenerateDialog.js`), and the
ability-score breakdown (`CharacterStatBadge.js`). Focus restoration and
dismissal semantics have one owner, so these four cannot drift from the
`Modal.js` dialogs.

Which dialog to use is a policy question, covered in
[Conventions](conventions.md#dialog-discipline): `confirmModal` only for
questions with two real answers, `alertModal` for blocking notifications,
`app.toasts.show` for non-blocking ones, and `confirmDelete(name, detail?)`
for plain entity deletes. `confirmDelete` owns the `Delete "X"?` wording and
the danger button, so no call site restates them.

### `promptModal` fields

A field is a `ModalField` record (`Modal.js`), and `type` picks the widget:

| `type` | Widget | Value in the result record |
| --- | --- | --- |
| `'text'` *(default)* | `input.field` | the string |
| `'number'` | `input.field type=number`, honoring `min`/`max` | the string. Out-of-range values clamp on `change`, not per keystroke |
| `'textarea'` | `textarea.field`, `rows` lines tall | the string |
| `'select'` | `select.field` over `options: { value, label, disabled? }[]` | the selected value |
| `'file'` | image picker | a `data:` URL produced by `readImageFile` |
| `'multiselect'` | scrollable checkbox group, capped by `max` | checked values, comma-joined |
| `'tags'` | pill list with inline entry | pills plus any unfinalized text, comma-joined |
| `'pillgrid'` | assignment grid: `rows` x `options`, one option per row | `row:value` pairs, comma-joined |
| `'allocation'` | distribution grid: a number input per row that must sum to `total` | `row:count` pairs, comma-joined. A row given 0 is left out |
| `'button'` | an in-form action button | `''` (it acts through `onChange`) |

Every field also takes `label`, `value`, `full`, `newRow`, `hidden`, and
`disabled`. With `options.wide` the form lays fields two per row, `full: true`
spans both columns, and `newRow: true` begins a row, which is what keeps a pair
that belongs together (weapon and armor) on one row when an odd number of
fields comes before it. Actions are Cancel then submit
(`options.submitLabel`, default `'Create'`), which is the
dismiss-left/primary-right ordering used on every form surface in the app.

A dialog rebuilt by hand tends to lose two of the wrapper's behaviors:

- **The file field shows errors inline**, as a `<p class="modal__error"
  role="alert">` inside the dialog, not as a nested alert modal. It also
  clears the input after a failure, so picking the same file again fires
  `change` again. In-flight reads are awaited before the result record is
  collected, so a fast submit cannot drop the image.
- **`onChange` gets a handle on the whole form**, so one field can drive
  another (a tier select re-stamping default stats, a class select
  refiltering a spell list). The handle is
  `{ get, set, setOptions, setDisabled, setLabel, setRange, setHidden }`,
  all keyed by field name, and `get` is always synchronous.

The composite fields (`multiselect`, `tags`, `pillgrid`, `allocation`) each
keep their own local state and redraw internally. A refilter through
`setOptions` preserves current selections even if the selections leave the
option set.

The allocation field is also the one field that can block a submit. It
writes a message onto its first input through `setCustomValidity` whenever
the rows do not sum to `total`, so the browser refuses the submit and
reports the error the way it reports any other invalid field. Its rows
scroll, but its remaining-count line does not, so the reason a submit was
refused cannot scroll out of sight.

## Inline forms

The Library rail's authoring forms render inline rather than in a dialog, so
they build from `src/ui/formFields.js` instead of `Modal.js`:

```js
labeled(caption, control)          -> HTMLLabelElement   // wraps the control
fieldRow(...children)              -> HTMLDivElement     // one horizontal group
checkbox(caption, checked)         -> { label, input }
checkboxInput(checked)             -> HTMLInputElement   // the bare box
textField(value, opts?)            -> HTMLInputElement
numberField(value, opts?)          -> HTMLInputElement
textareaField(value, opts?)        -> HTMLTextAreaElement
select(options, value)             -> HTMLSelectElement
setOptions(select, options, value)                // refill an existing picker
buildInlineForm({ nameInput, rows, assemble, submitLabel, onSubmit,
                  onCancel?, afterSubmit?, className? }) -> HTMLDivElement
```

`labeled` puts the control *inside* the `<label>`, so there is no `for`/`id`
pairing to keep in sync and nothing has to generate a unique id. `select`
accepts bare strings (value is the label) or `{ value, label }` pairs, so the
same helper serves enum pickers and labelled choices.

These controls are not rail-only. `promptModal` builds a dialog's plain text,
number, select, and checkbox fields from the same functions, so a field
behaves the same in a dialog as in the rail. `numberField` owns the
clamp-on-`change` for both, reading `min`/`max` off the element so a dialog
that restates a field's range through `setRange` still gets it enforced.

`buildInlineForm` is the envelope that all four forms share. It wraps the
form, puts the name field first with the shared `form__wide` sizing, appends
`rows` in order, and closes with the action row (Cancel left of the primary
submit, matching the modals). A submit reads the whole form through
`assemble`, which returns the finished value or `null` to refuse the
submit. A blank name is refused before `assemble` runs, so no form
re-implements that check. `afterSubmit` runs on an accepted submit, which
is how the inventory add row clears itself while the per-item editor keeps
its values on screen.

An `assemble` must read its controls and hand the values to a pure
function, rather than build the finished value itself. The item and spell
forms do this through `entities/ItemDraft.js` and `entities/SpellDraft.js`.
Their tests live there too. See
[Entities](entities.md#the-ui-layer-over-entities).

### One spec, two surfaces

The bestiary and NPC template forms build no controls of their own. An entity
the GM authors both in a dialog and in the rail describes its fields once as
the `ModalField[]` that `promptModal` takes, and `src/ui/SpecForm.js` renders
that same list inline:

```js
buildSpecForm({ fields, assemble, submitLabel, onSubmit,
                onCancel?, onChange?, className? }) -> HTMLDivElement
```

The first field is the entity's name and becomes the wide name input. The rest
lay out two per row, honoring `full` and `newRow` as the wide dialog does.
`assemble` receives the same field-name-to-string record that `promptModal`
resolves to, so both surfaces read a form back through the same functions, and
`onChange` receives the same `ModalFormHandle`, so a rule such as "re-stamp the
default stats when the tier changes" runs on both. The specs themselves are in
`app/encounterFields.js` and `app/npcFields.js`; see
[App wiring](app-wiring.md). The controls come from
`formFields.js` and `ModalFields.js`, the builders the dialog uses. The file,
tags, pill-grid, allocation, and button kinds have no inline renderer, and a
spec that reaches for one throws rather than dropping the field.

## Tabs and disclosures

Disclosures and most tab strips are "wire existing markup" helpers rather
than builders. The caller owns the elements. The helper owns the state and
the ARIA.

```js
wireTabs(tablist, { resolvePanel?, onSelect? }?) -> { select(tabId) }
```

`src/ui/Tabs.js` implements the full ARIA tabs pattern over a
`[role=tablist]` of `[role=tab]` buttons, each pointing at its
`[role=tabpanel]` through `aria-controls`. It maintains `aria-selected`, a
roving `tabIndex` so that only the active tab is in the document tab
order, and `panel.hidden`. Arrow Left and Arrow Right wrap around, and Home
and End jump to the ends, each moving focus. A click selects a tab without
stealing focus. The initially selected tab is whichever tab is already
marked `aria-selected="true"` in the markup, and defaults to the first tab.

Most strips are written out in `index.html`, so wiring them is all the
caller needs to do. When the tabs are only known at runtime, `buildTabs`
builds the strip instead:

```js
buildTabs({ ariaLabel, className?, tabs: [{ id, label, panel }], selected?, onSelect? })
  -> { tablist, select(id) }
```

It creates the buttons, generates the id pairing that `aria-controls`
needs, marks up the panels that the caller passed in, and hands the whole
thing to `wireTabs`. `resolvePanel` is how the panels are found before
they are in the document, and `onSelect` reports the caller's own tab id,
including for the initial selection. The encounter panel's two tabs and
the equipment library's category subtabs both use this path. Selecting a
tab only flips `hidden`, so the panels' contents survive a tab click and
refresh on their own schedule. Neither panel redraws to move a highlight.
Use one of these two helpers, never a third strip built by hand.

```js
buildDisclosure({ body, label?, headChildren?, className?, ariaLabel?, expanded?, onToggle? })
  -> { head, body, isExpanded, setExpanded }
wireDisclosure(button, body, { expanded?, onToggle? }?) -> { isExpanded, setExpanded }
```

`src/ui/Disclosure.js` keeps `aria-expanded` on the button, toggles the
`disclosure--open` class (which rotates the chevron through CSS), and sets
`body.hidden`. `setExpanded` runs once at wire time, so `onToggle` also
fires on init. Because a redrawing panel rebuilds its DOM, the documented
pattern is to pass the last known state in as `expanded`, and record
changes from `onToggle`.

`buildDisclosure` builds the header too: a `bareButton` carrying `disclosure`,
the chevron, and, when a `label` is given, `section-label` for the shared
group-heading treatment. A header made of icons instead, the dice tray's d20
summary, leaves `label` out and names itself through `ariaLabel`. Anything
between the label and the chevron, an item count for example, goes in
`headChildren`. The header and the body come back as siblings, so a panel can
put them in whatever box its own layout needs. Use `wireDisclosure` directly
only for a header a caller has to build itself.

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
choices that do not need a dialog. It carries native-menu semantics: focus
moves into the first item, arrows cycle, Escape or an outside click
dismisses the menu without choosing an item, and choosing an item closes
the menu before it runs the action. Only one menu is open at a time, so
opening a second menu closes the first. There is no return value: the
items' own callbacks are the result.

`clampToViewport` is the pure positioning helper, kept separate so that it
can be tested with a unit test. It flips the menu off a viewport edge
rather than letting the menu slide under one.

A context menu is not a `<dialog>`, so it stays outside the `Modal.js`
lifecycle rather than being folded into it.

## Image input

`src/ui/imageField.js` backs the `file` field. It exists because a picked
image lands in the campaign save, which is copied whole into every undo
slot and lives in a localStorage origin of about 5 MB. Because of this,
ingestion is bounded:

```js
readImageFile(file)                       -> Promise<string>  // a data: URL
fitDimensions(width, height, maxEdge)     -> { width, height } // pure
encodeAttempts(width, height, maxEdge?)   -> { width, height, quality }[] // pure
```

`readImageFile` rejects a source over `MAX_SOURCE_BYTES` (12 MB),
downscales the image to `MAX_EDGE` (1280 px longest edge), and then walks
`encodeAttempts` (three JPEG quality steps at full edge, then the same
three steps at half edge) until the encoded string is under
`MAX_ENCODED_CHARS` (250,000). It returns the first attempt that fits. For
a PNG source it also tries PNG and keeps whichever result is shorter. Its
error messages are GM-facing sentences, not error codes, because they
show directly in the dialog.

The arithmetic (`fitDimensions`, `encodeAttempts`) is pure and tested with
unit tests. The canvas encode path is checked in a browser.

Both size caps exist to survive the browser storage budget, not because
they are the right quality ceiling for a projected handout. The caps are
expected to go away when image payloads move to real files.

## The CSS layer

### One manifest, one cascade order

`style.css` contains nothing but `@import`s of the feature sheets under
`styles/`, in cascade order, with a one-line comment for each. A later
sheet can override an earlier one, so the order is the contract:

1. `base.css`: design tokens, element base, every shared primitive
2. `shell.css`: header, context menu, mode and role switches
3. `build.css`: Build mode's world tree, palette, tile inspector
4. `layout.css`: play-surface columns, map viewport, toasts
5. `widgets.css`: breadcrumb, dice tray, disclosure, stat bars
6. `forms.css`: the inline authoring form's wrapper, rows, captions, and
   control sizes
7. `character.css`, `session.css`, `party.css`, `story.css`, `library.css`,
   `spells.css`: one sheet per feature area
8. `responsive.css`: narrow-viewport stacking. **Keep this one last.**

Add a new feature sheet to the feature block, with an `@import` and a
comment that says what it covers. Nothing is imported from a `.js` file.

### Tokens

Every color, space, radius, type size, and shadow is a custom property
defined in one `:root` block in `styles/base.css`:

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
| Radius | `--radius-sm`, `--radius`, `--radius-lg`, `--radius-pill` |
| Motion | `--transition-press` (40ms), `--transition-fast` (120ms), `--transition-base` (250ms) |

The token system holds together only while both of these rules hold:

- **Never write a fallback** (`var(--border, #ccc)`). A missing token
  renders as nothing, which is visible. A fallback hides the typo instead.
- **Every accent has a `*-contrast` partner**, and a filled element always
  declares its own foreground color from it. Add new accents as a pair.

Elevation uses `color-mix` to fade `--shadow-tint` to the wanted alpha, so
shadows follow the theme without restating a color.

### Theming

There is one set of tokens, not two. Each color is a single
`light-dark(light, dark)` declaration resolved by the root `color-scheme`:

- `:root { color-scheme: light dark }` follows the OS preference by
  default.
- `:root[data-theme='light']` and `:root[data-theme='dark']` pin the
  theme. The attribute selector outranks the bare `:root`, so an explicit
  choice always wins.
- `src/ui/ThemeToggle.js` writes `data-theme` on `<html>` (and deletes it
  for System), and persists the choice under `campaign-builder:theme`.
- An inline script in `index.html`'s `<head>` re-applies the saved value
  before first paint, so a dark-theme reload does not flash light.

The one non-color themed value is `--select-chevron`, an inline SVG data
URI. `light-dark()` resolves `<color>` only, so it cannot hold a `url()`.
Instead, the arrow is swapped in a `prefers-color-scheme` block plus the
two `data-theme` blocks. This is why that token appears four times.

`--overlay-*` is the deliberate exception to all of this: pinned dark in both
themes, because map controls, toasts, tooltips, and the onboarding scrim float
over map art rather than the page surface.

### Shared classes

Class names are BEM-ish: `block__element--modifier`. Everything below
lives in `base.css` and is shared across features. Reuse the class, and
keep only layout (margins, grid placement) in the component's own class.

| Class | Role |
| --- | --- |
| `.btn` + `--primary`/`--danger`/`--success`/`--icon` | every button, built through `buttons.js` |
| `.btn-bare` | the reset for a control that is a button with no button chrome, built through `bareButton` |
| `.field` | every input, select, and textarea |
| `.form`, `__row`, `__label`, `__wide`, `__number` | the inline authoring form and its parts, built through `formFields.js` |
| `.card`, `.card__title` | a bordered panel with an uppercase heading |
| `.seg-switch`, `__btn`, `__btn--active` | segmented toggle (mode, theme, role, dice-tray d20) |
| `.row-select`, `--current` | selectable full-width list row (world tree, roster) |
| `.section-label` | in-panel sub-heading: uppercase, tracked, muted, built through `sectionLabel` |
| `.empty-state` | the "nothing here yet" paragraph |
| `.chip`, `.chip__remove` | a small labeled tag, with or without an x, built through `buttons.js` |
| `.badge` + `--success`/`--danger`/`--neutral` | a read-only status marker on a list row. A colour outside the three shared readings comes from a per-feature modifier |
| `.icon` | the SVG wrapper that `icon()` applies |
| `.tabs`, `__tab`, `__panel` | a tab strip over a stack of panels |
| `.modal` and its parts | the native `<dialog>`, built through `Modal.js` |
| `.sr-only` | visually hidden, still announced |

Two more shared shapes live one sheet up, next to the widget they were built
for: `.disclosure` / `__chevron` / `--open` and `.stat-bar` / `__track` /
`__fill` (plus `--mana` and `--critical`, the `--compact` pill variant, and
the `data-band` fill colors), both in `widgets.css`.

### Utilities

Alongside those shared classes, `base.css` carries a small utility layer,
for the treatments that kept getting restated in every feature sheet. A
utility describes how something looks, not what it is, so an element
keeps its own component class for the rest of its styling and for
anything that needs to select it:

```js
el('span', 'npc-panel__location u-muted', label);
```

There are two groups. `.u-muted` is the small secondary text used by
captions, hints, derived readouts, and row metadata: `font-size:
var(--text-label)` plus `color: var(--text-muted)`, the pair that about
thirty rules each spelled out separately.

The rest cover the two flex shapes that almost every container here uses.
`.u-row` is a horizontal bar with its items centered across it
(`display: flex` plus `align-items: center`). `.u-col` is a vertical
stack (`display: flex` plus `flex-direction: column`). `.u-wrap` adds
`flex-wrap: wrap`. Neither row nor column sets a gap, since the spacing
varies from one container to the next. Because of this, they pair with
`.u-g1` through `.u-g4` for a gap on the `--space-*` scale:

```js
el('div', 'encounter-panel__row u-col u-g1', head, chips);
```

A container that wants a different cross-axis alignment keeps its own
`align-items`: `.character-sheet__head` sets `stretch`, and
`.travelog__item` sets `baseline` and skips `.u-row` altogether. An
off-scale or asymmetric gap (`gap: 0.15rem`, `gap: var(--space-1)
var(--space-3)`) likewise stays a declaration in the component's rule
beside a bare `.u-col`.

The layer sits before the feature sheets in the cascade, so a component
rule always wins where the two set the same property.
`.tile-inspector__field--inline` relies on this: it takes its text back
to the full `--text` color while the element still carries `u-muted` for
the size. Every `.foo[hidden]` companion rule does the same, and each
must out-specify the utility's `display: flex` for the hidden attribute
to work.

Add a new utility only when the pattern is already repeated several times
and its values come from the token scale. Anything with a
component-specific value belongs in that component's rule. Weigh the
markup churn too: `.tabs__panel` keeps its column rule because sixteen
panels are declared in `index.html`, and putting `u-col u-g4` on each of
them costs more than the rule saves. When adopting a utility leaves
a component rule empty, delete the rule and drop the class, rather than
leaving a name in the markup with nothing behind it, unless another
selector still names it, as `.character-sheet__features summary` does.

Two details in `.field` look removable, but are not. Single-line
controls get an explicit `height`, because a bare `<select>` ignores
`line-height` for its box metrics, and otherwise sits about 2.5 px
shorter than a neighboring `<input>`. Selects opt into the
customizable-select model (`appearance: base-select` plus
`::picker(select)`) as a progressive enhancement. An engine without this
support drops the value and falls back to the `appearance: none` rule
above, so the closed control is themed everywhere, and only a supporting
engine also themes the popup.

### Layout and responsiveness

Layout is flex-dominant with intrinsic sizing (`min()`,
`flex: 1 1 <rem basis>`, `repeat(auto-fit, minmax(...))`), so most reflow
happens with no media query at all. Grid is reserved for genuinely
tabular content.

Because reflow is intrinsic, the few things that do switch on state are
centralized:

- **All layout media queries live in `responsive.css`**, and there is
  exactly one breakpoint: `@media (max-width: 68rem)`. Below it the main
  columns stack, and the map viewport shortens. The only other `@media`
  rule in the project is the `prefers-color-scheme` chevron block.
- **A component that reflows on its own width uses a container query,
  not a breakpoint.** There is one: `.character-sheet` declares
  `container: character-sheet / inline-size`, and `styles/character.css`
  queries it at `50rem` to deal the sheet's sections into two columns.
  The card's width depends on whether the sidebar is open and on which
  rails the current mode shows, so a viewport breakpoint only guesses
  at it. The query places four things by grid area: the head
  (name and HP bar) and the level/AC/XP banner across from each other
  on the first row, and a section column under each on the second row.
  Below the query, `--sheet-measure` caps the one stacked column. Inside
  the query, the two tracks split the card `1.4fr` to `1fr`, and the
  body stops at `--sheet-measure-body`, so both columns grow with the
  card up to a width that still reads well.
- **The card stops where the sheet does.** The three sheet measures live
  on `:root` rather than on `.character-sheet`, because
  `.belowmap-sheet` caps itself at `--sheet-measure-body` plus the
  card's padding and border, and a variable on the sheet is invisible
  to the card around it. Without that cap, a 2560- or 3840-wide screen
  gave the card hundreds of pixels that the sheet was unable to use,
  with the tab strip stretched across the empty part.
  `.belowmap-side` caps for the same reason, and `.app-belowmap` centers
  the pair so that the room left over sits outside both cards.
- **Mode and role are body classes, not breakpoints.** `body.mode-build`,
  `.mode-play`, `.mode-library`, `.role-gm`, `.role-player`,
  `.role-locked`, and `.sidebar-collapsed` gate whole regions, so
  switching modes is a class flip rather than a redraw.

A flex child that holds text needs `min-width: 0`, or long content
refuses to shrink. That guard appears over twenty times across the
sheets, and it is the usual explanation for a panel that overflows its
column.

### Keeping the first paint still

The page is laid out before any module runs, so anything the wiring
changes afterward moves content that the reader is already looking at. A
new panel must follow the habits that keep the page still:

- **Decide the body classes up front.** Because a mode or role class
  hides whole rails, waiting for `wireSessionControls` to apply them
  lays the page out with every rail showing, then yanks two of them
  away. An inline script at the top of `<body>` stamps the starting mode
  and role instead, alongside the `<head>` script that pins the theme.
  Its defaults deliberately restate the defaults in `src/main.js`, so
  changing one default means changing both.
- **Reserve space that a container will fill.** An empty container that
  later grows pushes everything under it down. For this reason,
  `#breadcrumb-container` holds one crumb's height from the start, sized
  from the same tokens that build the crumb, rather than a pixel
  constant.
- **Reserve the scrollbar too.** `html` sets `scrollbar-gutter: stable`,
  so that the moment the panels fill and the page passes one screen
  tall, every column does not narrow at once.

## Accessibility in practice

The shared layer already handles all of this, so a new surface does not
restate it:

- **Focus** is one global `:focus-visible` outline in `--focus-ring`,
  with two intentional escalations: the map canvas draws a thicker
  accent ring, and tabs, context-menu items, and spellbook rows pair
  focus with their hover treatment. `.field:focus` only recolors the
  border. The global outline still supplies the ring.
- **Names on controls**: `iconButton` requires `aria-label`, icons are
  `aria-hidden`, and form controls are wrapped by their `<label>`.
- **State in ARIA, not only in classes**: `wireTabs` writes
  `aria-selected`, and the CSS styles from it. `wireDisclosure` writes
  `aria-expanded`. Pillgrid pills use `aria-pressed`.
- **Announcements** go through live regions: the toast stack is
  `role="status" aria-live="polite"`, the map has its own description
  live region, and file-field errors are `role="alert"`. The map's live
  region is rewritten only when the text actually changed, because
  rewriting it re-announces it.
- **Focus return**: every dialog refocuses whatever opened it, on close.

Nothing in the app covers these gaps:

- No `prefers-reduced-motion` handling. The animated surfaces are the
  `.btn` transition, the disclosure chevron rotation, and the toast
  slide-in.
- No touch-target floor. `.btn--icon` is 1.75rem (28 px) square, well
  under the usual 44 px guidance.
- No `forced-colors` or `prefers-contrast` support.

## Known gaps

Places where the shared layer does not yet meet [the builder
contract](#the-builder-contract), or where the same thing is written more
than once. Reuse the right thing rather than adding to the pile, and when a
change happens to pass through one of these, close it.

Against the contract:

- **Several builders take no `className` at all.** `emptyState`, `fieldRow`,
  `checkboxInput`, `buildTagsField`, `openContextMenu`, and `mountToasts`
  give the caller no way to add a class.
- **Mount signatures have drifted.** The second argument is `callbacks` in
  most panels, `options` or `opts` in others, and a bare function in a few.
  `mountPalettePanel` takes four positionals, and `mountSpellbookPanel`
  takes five.

Class contracts with no builder, so the class is typed at the call site:

- **`.section-label`** is re-implemented ad hoc in `character.css`:
  `.character-sheet__field-row` and `.stat-badge__key` each restate the
  uppercase-and-tracked treatment with their own letter spacing. The builder
  exists, so these two rules are the remainder.

Repeated by hand:

- **The list-CRUD panel skeleton is written six times** (quests, handouts,
  NPCs, build encounters, encounters, library), and the `<dialog>` lifecycle
  seven times, four of them outside `Modal.js`.

If a widget fits one of these shapes, reuse the existing class or JS
builder rather than add the next copy. If a widget adds the shared
version instead, `base.css` is where it belongs.

## Testing UI code

No panel or widget in `src/ui/` has a unit test, by design. These
modules are the DOM glue half of the project's split, so a contributor
checks them in a browser instead. The exceptions are the pure helpers
that happen to live here: `fitDimensions` and `encodeAttempts`
(`tests/imageField.test.js`) and `clampToViewport`
(`tests/context-menu.test.js`) are arithmetic, so they are tested where
they sit.

Preview pages in `tests/` mount the real modules against hand-built
fixtures, without the rest of the app: `tests/ui-panels-preview.html`
for the character sheet, inventory, and encounter panels, plus the map
and tile previews beside it. Keep these pages current when a mount
signature changes. A stale preview page can mask a real error the next
time someone reaches for it.

See [`docs/testing.md`](../testing.md) for the full loop, including how
to check both themes and the console.
