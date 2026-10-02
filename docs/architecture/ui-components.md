---
---
# UI components

*Reference. Back to the [architecture overview](../architecture.md).*

This codebase has no component framework. A component is a plain function
that builds DOM elements and returns a handle. A small set of shared
builders and one CSS token file keep the components consistent.

Read this guide before you add anything to `src/ui/` or `styles/`. Almost
every widget pattern that you need already exists, and a copy built by hand
tends to miss the accessibility attributes that the shared builder sets.

[Conventions](conventions.md#ui-and-style) states the policy behind these
components: when to use a confirm dialog, how to style buttons, and what gets
a toast. This guide covers the API.

`docs/gallery.html` shows every builder named here, rendered from the real
modules, beside the call that built it and the classes that the call
produces. The gallery loads ES modules, so open it through the dev server:

1. Run `pnpm run dev`.
2. Open `http://127.0.0.1:8080/docs/gallery.html`.

To add a builder to the gallery, add a story to the matching file under
`docs/gallery/sections/`. The gallery reads the snippet from the source of
the story's own render function, so no second copy of the call exists.

[The builder contract](#the-builder-contract) is the normative part of this
guide: it says what any function in `src/ui/` looks like. The rest of the
guide describes the builders that exist. [Known gaps](#known-gaps) lists the
places where the code does not meet the contract.

## The layers

```
  src/app/*.js ............... mounts panels, owns callbacks and modals
          |
          v
  src/ui/<Panel>.js .......... feature panels: build DOM, return { update }
          |
          v
  src/ui/listPanel.js ........ the list-panel skeleton that most feature
          |                    panels configure
          v
  src/ui/buttons.js .......... shared builders: buttons, icons, dialogs,
  src/ui/icons.js             form fields, tabs, disclosures, toasts
  src/ui/Modal.js
  src/ui/formFields.js, SpecForm.js
  src/ui/Tabs.js, Disclosure.js, Toast.js, ContextMenu.js, dom.js
          |
          v
  styles/base.css ............ design tokens and every shared primitive
```

A feature panel does not build its own button, empty state, dialog, or
design value. It composes the layer below. The wiring layer above owns the
data and the decisions (see [The app wiring layer](app-wiring.md)).

## The builder contract

Everything in `src/ui/` is a function that returns DOM, or a handle over
DOM. The rules in this section apply to a new builder and to every change to
an existing one.

### Naming

| Form | Returns | Owns |
| --- | --- | --- |
| `mount<Name>(container, callbacks)` | A handle, usually `{ update }` | Creates the root element and appends it to `container` |
| `build<Name>(spec)` | Detached DOM, sometimes with readers beside it | Nothing. The caller appends it and decides its lifetime |
| `wire<Name>(element, options?)` | A handle over markup that the caller already has | State and ARIA only. It builds no elements |
| `open<Name>(...)` | A `Promise` | An element that comes and goes, such as a dialog or a menu. The promise resolves when the element closes |
| `noun(...)` | One element | A primitive with no lifecycle, such as `iconButton`, `chip`, `icon`, or `textField` |

A function that builds and mounts is a `mount`. A function that builds and
returns the result is a `build`. Name a builder after what it builds, not
after the feature that first used it.

### Arguments

A builder takes at most two positional arguments, then one options object. A
value gets a positional slot only when it is required, has no default, and
reads clearly in order at every call site: `iconButton(name, ariaLabel,
onClick, opts)`, `chip(label, opts)`. Everything else is a named key in the
object.

- Options are optional. The parameter defaults to `{}`, and every key has a
  defined behavior when it is absent.
- One name means one thing everywhere. `className`, `variant`, `ariaLabel`,
  `title`, `placeholder`, and `onChange` keep their meaning across modules.
- An existing option has one spelling. A per-variant boolean such as
  `{ danger: true }` is not an alternative to `{ variant: 'danger' }`.
- The second argument of a `mount` is named `callbacks` and contains
  functions. A panel that names it `options`, takes a bare function, or
  takes four positional arguments differs from every other panel, and the
  caller has to read the source to mount it.

### The `className` option

Every builder that returns an element accepts `opts.className` and appends
it to its own base class through `classNames`:

```js
el('div', classNames(['chip', opts.className]))
```

- The option appends and never replaces, so a caller that passes a class
  still gets the shared presentation. A builder that assigns
  `element.className = opts.className` throws away its own classes.
- A space-separated string is valid. `classList.add(opts.className)` throws
  on such a string, so combine classes through `classNames`.
- Every builder that returns an element has the option. Without it, a
  caller that needs one extra class builds the element by hand.

Use `className` for layout in one feature and for one-off modifiers. Do not
use it for a state that the builder already knows about.

### Semantic options

A caller says what it wants, and the builder owns the classes that produce
it:

```js
// yes
badge(label, { variant: 'danger' });
// no
el('span', 'badge badge--danger', label);
```

`variant` is the one name for this option. It maps to the `block--<variant>`
modifier of the block that the builder builds. The values are shared across
builders: `primary`, `danger`, `success`, and the neutral default when the
option is absent.

A block and its modifiers that exist in CSS with no builder to apply them
are a missing builder, however few call sites type the class. Typing the
class is the only choice those call sites have.

### The vocabulary test

`tests/uiVocabulary.test.js` checks these rules. It reads `src/` as text,
because the modules it covers build DOM and the test runner has no
document:

- A class that a builder owns is never typed by hand in another module.
  The `OWNERS` table in the test lists the owners. Call the builder and pass
  `className` for your own modifier. The one recorded exception is
  `Disclosure.js`, which puts `section-label` on a disclosure header.
- A shared module names its own block and the utility layer, and nothing
  else. A shared widget therefore does not depend on the classes of one
  feature.
- `innerHTML` is only ever assigned `''`. Content is built with `el`.
- A link (`<a>`) is only ever built in `buttons.js`.
- `style.css` imports every sheet under `styles/`, and every import
  resolves.

A failure prints the file, the line, and the builder to call instead. If you
add a builder with a class of its own, add its block to `OWNERS` in the
test.

### Settled decisions

- **`el` keeps its positional class string.** `el(tag, className,
  ...children)` is the leaf that everything else builds on. The nesting in
  the source reads as the nesting on the page, and an options object loses
  that.
- **The four update strategies stay.** Full rebuild, the list panel's
  guarded rebuild, the character sheet's build-once-and-repoint, and
  in-place mutation each fit a different cost. One strategy for all of them
  makes the sheet slow or the small panels complex.
- **The utility classes stay in the markup.** `u-row`, `u-col`, `u-wrap`,
  `u-g1` through `u-g4`, and `u-muted` are written at the call site, not
  folded into builder options. They style the space around and between
  elements, which the caller controls, and a builder owns only its own
  block. A `gap` option on every builder puts the same token scale behind a
  second vocabulary. A builder can still apply a utility inside the element
  it owns: `emptyState` adds `u-muted`, `labeled` adds `u-col u-g1 u-muted`,
  `checkbox` adds `u-muted`, and `buildInlineForm` adds `u-col u-g2`.
- **Styles live in CSS files.** The project has no CSS-in-JS and no
  framework. A builder applies classes and has no style declarations of its
  own. The source files run unbundled from any static server. esbuild
  (`scripts/build.cjs`) bundles them only for `pnpm run dev` and the
  production build.
- **No component base class and no registry.** A component is a function,
  so nothing registers and nothing extends a base.

## Mount points

Every panel mounts into an element that already exists in `index.html`. Find
the element with `mustGetElement(id)` (`src/ui/dom.js`), not with
`getElementById`:

```js
import { mustGetElement } from '../ui/dom.js';

const container = mustGetElement('encounter-container');
```

If the id is gone, `mustGetElement` throws
`Required element #x is missing from index.html`. Wiring runs at startup, so
a renamed id fails at load time. With `getElementById`, the panel silently
does not mount, and nobody notices until a GM clicks something.

### DOM helpers

`src/ui/dom.js` has the element primitives that every widget builds from:

| Function | Does |
| --- | --- |
| `el(tag, className?, ...children)` | Builds an element with a class and children. A string child becomes a text node, and a `null`, `undefined`, or `false` child is skipped, so `cond && node` works inline |
| `append(node, children)` | Appends children with the same rules as `el` |
| `classNames(parts)` | Joins the truthy parts of a class list |
| `setAttrs(node, attrs)` | Sets several attributes |
| `mustGetElement(id)` | Finds a mount point, or throws |
| `uniqueId(prefix)` | Returns an id that is unique in the document, for `aria-labelledby` and `aria-describedby` |

## The panel contract

A feature panel is a `mount<Name>(container, callbacks)` function. It
creates its own root element, appends the root to the container, draws once,
and returns a handle:

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

This example shows the pattern written by hand. Most list panels, including
the real `mountQuestPanel`, get it from `mountListPanel` (see
[The list panel](#the-list-panel)) and do not write this code.

The `{ update }` handle is the `Updatable` interface (`src/types/app.ts`),
and it is the whole refresh protocol between modules. A wiring module stores
the handle on `app.views.questPanel`. Anything that changes a quest calls
`app.views.questPanel.update()`, and does not need to know what the panel
draws.

An `update()` call needs no knowledge of the panel, because every panel
follows these rules:

- **Panels keep no campaign data of their own.** A panel draws from `get*`
  callbacks that it calls at render time (`getQuests()`, `getRole()`), so
  `update()` always reads the current state. A panel that caches campaign
  data needs a second way to mark the cache stale, which the single
  `update()` entry point exists to avoid. View state that is not campaign
  data belongs to the panel: which row is in edit mode, which section is
  open, which tab shows. For example, `LibraryPanel`'s `update` closes an
  open inline editor, but keeps its filter text and selected subtab. The
  input and the tab strip are built once, and only the lists redraw. The
  close also puts back the focused control and the scroll offsets from when
  the editor opened, because hiding the list resets them to the top.
- **Every mutation leaves through a callback.** Panels do not write state
  and do not open dialogs. A panel calls `callbacks.onEdit(id)`, and the
  wiring module prompts, writes, and redraws. Panels then contain only DOM
  code, so you can check them by eye and need no mocks.
- **Role gating is also a callback.** A panel that shows GM-only controls
  takes an optional `getRole`, and shows the GM view when it is absent:

  ```js
  const gmView = () => !callbacks.getRole || isGM(callbacks.getRole());
  ```

  In the Player view, the panel does not build edit, delete, or add controls
  at all.

By default, `render()` clears `innerHTML` and rebuilds. This fits the small
lists that most panels show. A panel built on `mountListPanel` also skips
the rebuild when nothing changed: it compares the rows it is about to draw
with the rows it last drew, and returns early when they are the same
objects. A party step can then fire five panel refreshes with no rebuild.

The travelogue, the tile inspector, and the character sheet avoid the
rebuild in their own ways. The travelogue compares anchor ids, the tile
inspector builds once and points its nodes at new values, and the character
sheet does the same behind a structure check (see below). Copy one of these
patterns only for a panel that is large or that grows without limit. See
[Conventions](conventions.md#incremental-rendering-of-growing-lists).

### The character sheet's structure check

The sheet is the one panel where a full rebuild costs enough to design
around. A rebuild on one HP tick discards about two hundred elements (six
ability badges, each with an inline SVG die, every spell-slot pip, the
progression and spell sections, and the condition chips) to move the width
of one bar. Every tick also commits, which refreshes the sibling panels too.

The sheet therefore splits its work. `build()` creates the DOM once and
collects a list of small writers, and each writer puts one current value
into an element that it captured. `render()` runs only those writers when it
can.

`sheetDeps(character, perms)` in `src/view/SheetStructure.js` decides whether
`render()` can skip the rebuild. It returns a flat list of every value that
the structure of the DOM depends on, and `sameDeps` compares it with the
last list:

- When the lists match, the only differences are values that a writer can
  write (a pool level, bonus HP, base AC, the name, the conditions), so the
  DOM stays.
- Any other change triggers a rebuild: a class taken, an ability improved,
  an item equipped, a pool added or resized, or a permission change.

The repoint path puts two limits on how you extend the sheet:

- **Event handlers read the live character, not the character they were
  built from.** A handler outlives the change that follows it, so the sheet
  passes a `live()` getter around, and `buildProgressSection` takes a getter
  and not a character. A handler that closes over a build-time snapshot
  silently undoes every change written since.
- **`sheetDeps` names every field that the structural builders read.** If
  you add a read to the sheet, the progression section, or the spell
  section without an entry in `sheetDeps`, the display goes stale, and the
  typecheck cannot catch the error.

This comparison by reference works because the entity layer never changes
data in place (see [Conventions](conventions.md#frozen-tiles)).

### Handles that are not `{ update }`

| Handle | Used by | Why |
| --- | --- | --- |
| `{ setCharacter }`, plus `getCharacter` on the sheet and the inventory | `CharacterSheet`, `InventoryPanel`, `SpellbookPanel` | These three panels are scoped to one selected character, which they keep and draw from. A sibling panel's edit arrives through `setCharacter` |
| A domain handle | `segSwitch` (`{ element, getValue, setValue, sync }`), `ThemeToggle` (`{ getTheme }`), `PalettePanel` (`{ getBrush, getScale, setKind, show, regionPicker }`), `TileInspector` (`{ setTile }`), `mountToasts` (`{ show }`) | A control and not a list, so there is nothing to redraw from state |
| DOM plus readers from `build<X>Form(...)` | `buildItemForm`, `buildSpellForm`, `buildFeatForm`, `buildCreatureTemplateForm` | An inline form is built for one edit and then discarded, so it is built and not mounted |
| `Promise<result>` | `combatSetupModal`, `generateDialog`, `promptSpellDetail`, and every dialog in `Modal.js` | A dialog asks one question and gets one answer |
| `{ element, get, set }` | `buildDamageEditor`, `buildEffectsEditor` (`ItemFormEditors.js`) | A composite widget inside a form. It keeps a working copy, gives `element` to mount, `get` to read at submit, and `set` so that a preset picker can overwrite it |

To add a composite form widget, use the last contract. `ItemForm` then
treats a damage-parts editor exactly like a text input.

## The list panel

Most rails show the same layout: a list of entities, a row for each entity
with its buttons, an empty state, and a "New ..." control at one end.
`mountListPanel(container, options)` (`src/ui/listPanel.js`) builds this
layout. The quest, handout, NPC, encounter, library, and Build-rail
encounter panels each configure it, and it returns the usual `{ update }`.

A panel with tabs mounts one list panel for each tab panel. The encounter
panel's Active tab is a list panel. Its Nearby tab is `NearbyList.js`,
which draws one disclosure line per group of foes from
`view/NearbyGroups.js` and mounts a list panel for the open group only.
The equipment library's five category subtabs are five list panels.

The caller decides the markup:

| Option | What it does |
| --- | --- |
| `className` | The root element's class, and the stem of the row class (`quest-panel` gives `quest-panel__row`) |
| `classes` | Every class below the root, in one object (see the next table) |
| `getRows(gm)` | The entities to draw, already scoped and ordered |
| `buildBody(entry, ctx)` | The row's content, left of the buttons: one node or an array |
| `actions(entry, ctx)` | The row's buttons, as `{ icon, label, variant, onClick }` descriptors. `null` entries are dropped, so an optional control is a ternary |
| `buildExtras(entry, row, ctx)` | Anything below the row's head, such as a stat bar or a read-aloud body |
| `emptyMessage` | The empty-state text |
| `groupOf(entry, gm)` | An optional section heading, shown when consecutive rows change group. A null group after a grouped row ends the group: the rows that follow go back to the root with no heading, and a later named group starts a new heading |
| `addButtons(gm)` | The add controls |
| `addPlacement` | Where the add controls go: at the end of the list (`inline`, the default), leading the list in a pinned `.panel-actions` row (`leading`), or trailing it in a plain row (`trailing`) |
| `gate()` | `false` for the read-only Player view, which shows no action buttons and no add controls |
| `dependsOn()` | One comparable value for anything the panel draws that its rows do not describe (see below) |

The `classes` object keeps the option list about behavior. Each entry is
optional. An omitted entry falls back to the stem, or drops the wrapper that
it names.

| `classes` entry | What it does |
| --- | --- |
| `row` | The row's class when it cannot come from the stem (a list nested in a wider panel names its rows after the outer panel) |
| `rowModifiers(entry, gm)` | Extra classes on one row, such as for a completed quest or a defeated foe |
| `body`, `actions`, `head` | Whether the body nodes, the buttons, and the pair of them get wrapper elements, and their classes |
| `group`, `groupHeading` | The element that collects one group's rows, and a class added to the group heading, which is always a `section-label` |
| `add` | The class on each add button, unless the button names its own. `leading` placement ignores it, because its pinned row styles the buttons |

The helper owns the root element, the clear and rebuild, the row loop, the
group headings, and the handler contract below. It also keeps keyboard
focus across a rebuild: `captureFocus` and `restoreFocus`
(`src/ui/focusMemory.js`) find the rebuilt control by its tag, type, class,
and accessible name. A root that scrolls itself, such as the quest log
below the Play shell width, keeps its scroll position across a rebuild too.
A root that grows with its content, such as the quest log in its sidebar
tab, keeps its old height until the rebuild ends, so the scrolling tab
panel around it does not clamp its scroll position while the root is
empty. Without either, the clear scrolls the list back to the top, and the
row under the pointer changes.

**The helper awaits every handler, and redraws unless the handler reports
that nothing happened.** A handler reports this by returning `false` or
`null`, which is what a cancelled dialog gives: `confirmModal` resolves
`false` and `promptModal` resolves `null`. A handler that returns nothing
counts as a change, and the panel redraws. A button that you write by hand
like this:

```js
const button = iconButton('edit', `Edit ${quest.title}`, async () => {
  if (await callbacks.onEdit(quest)) render();
});
```

becomes this descriptor:

```js
actions: (quest) => [
  { icon: 'edit', label: `Edit ${quest.title}`, onClick: () => callbacks.onEdit(quest) },
],
```

The `ctx` given to `buildBody`, `actions`, and `buildExtras` contains:

- `gm`, the resolved gate
- `render`, for a custom control that refreshes the list
- `action(spec, entry)`, which builds a button with the same handler
  contract

A leading toggle, such as the quest's complete button or the handout's eye,
uses `action` even though it sits inside the body and not in `actions`.

The early return in `update()` compares row objects by identity, which
works because the entity layer never changes data in place. The Active
encounter tab uses `dependsOn` for its Start combat button, which appears
and disappears with whether a fight is running. The guard compares that
value with `Object.is`, beside the rows and the gate. `repaintNeeded(last,
next)` is the decision itself, exported so that `tests/listPanel.test.js`
can test it with no DOM.

Build the `dependsOn` value from numbers, strings, or booleans. A fresh
object on each read differs from the last one every time. That turns the
guard off and also discards what the user typed into a row's input on every
refresh.

## Buttons, icons, and empty states

### `src/ui/buttons.js`

`src/ui/buttons.js` has the button and link builders, a segmented switch,
an empty-state paragraph, the chip pair, a status badge, and the section
label:

```js
iconButton(name, ariaLabel, onClick, opts?) -> HTMLButtonElement
textButton(label, onClick, opts?)           -> HTMLButtonElement
bareButton(children, onClick?, opts?)       -> HTMLButtonElement
iconLink(name, ariaLabel, href, opts?)      -> HTMLAnchorElement
textLink(label, href, opts?)                -> HTMLAnchorElement
segSwitch({ ariaLabel, options, value, onChange, className? })
                                            -> { element, getValue, setValue, sync }
emptyState(message)                         -> HTMLParagraphElement
chip(label, opts?)                          -> HTMLElement
removableChip(label, onRemove, opts?)       -> HTMLElement
badge(label, opts?)                         -> HTMLSpanElement
sectionLabel(text, opts?)                   -> HTMLElement
```

A panel does not create a `<button>` element itself:

- A control with the `btn` presentation is an `iconButton` or a
  `textButton`.
- A control that acts as a button for the keyboard but has no button
  presentation is a `bareButton`, whatever class it then takes. Examples
  are a tab, a menu item, a tree row, a disclosure header, a spell-slot pip,
  and a target card.

The only `<button>` elements written by hand are the static ones in
`index.html` (the sixteen tabs, the header file controls, the sidebar
toggle, and the Build and Library mode controls) and the palette swatch,
which is an image tile.

`iconButton` builds `btn btn--icon`. It requires an `ariaLabel`, because an
icon-only button has no other accessible name, and it uses that label as the
default tooltip. Pass `opts.title` only for a tooltip shorter than the
label.

`textButton` builds `btn` with an optional leading `opts.icon`. The visible
text is already the accessible name, so the builder sets `ariaLabel` only
when the caller passes one. Pass one when the label alone is unclear, such
as a weapon name whose action is "Attack with ...". A dialog's confirm
button passes `opts.type: 'submit'` with an `opts.value`, which the dialog
reads back from `returnValue`. An Escape dismissal leaves that value empty,
so the dialog can tell it from a confirm. Such a button needs no `onClick`,
so the argument is optional.

`bareButton` builds `btn-bare`, a reset that strips the browser's button
presentation. The look comes from `opts.className`, and the children are the
button's content, so an icon and a label can nest with no second builder.
`onClick` is optional, for a button that another helper wires:
`buildDisclosure` builds its header this way. A control whose visible
content is not its accessible name passes `opts.ariaLabel`.

`iconLink` and `textLink` build the same `btn` look on an `<a href>`, for a
control that opens a URL. A real link keeps the browser's middle-click,
modifier-click, and "Open in new tab" menu, and a `<button>` that sets
`location` has none of them. The label and tooltip rules match `iconButton`
and `textButton`. `opts.newTab` adds `target="_blank"` with `rel="noopener"`,
so the new page gets no handle on the app. `.btn` sets
`text-decoration: none`, so the link has no underline. The Party roster uses
both builders: an `iconLink` on each row opens a player tab for that
character, and a `textLink` below the list opens a spectator tab.

Both `btn` builders take `opts.variant`, which maps to a `btn--*` CSS
modifier:

| `variant` | Result |
| --- | --- |
| *(omitted)* | Neutral outlined button |
| `'primary'` | Accent-filled: the affirmative action of a form or dialog |
| `'danger'` | Danger-outlined, fills red on hover |
| `'success'` | Success-outlined, fills green on hover |

Every destructive control passes `variant: 'danger'`, stays visible (it does
not appear only on hover), and asks for confirmation first. See
[Conventions](conventions.md#confirmation-before-destructive-actions).

`segSwitch` builds a `role="group"` of buttons over one value. The header's
mode, role, and theme switches and the dice tray's d20 mode use it. Each
option is `{ value, label?, icon?, ariaLabel?, title? }`, so a choice can be
text, an icon, or both. The selected button gets the active class and
`aria-pressed` together. The caller appends `element` itself, so the dice
tray can put the switch inside a labelled row.

`setValue` selects a choice and reports it through `onChange`, the same path
that a click takes. The mode switch calls it right after mounting, to apply
the starting mode's body classes. `sync` repaints the buttons and reports
nothing. Use it when the value lives elsewhere and can change without the
switch, as the dice tray's selection object does.

`emptyState(message)` is the one `<p class="empty-state">`, and every list
panel's "nothing here yet" line uses it. The class sets only the margin, the
padding, and the italic style. The builder adds `u-muted`, which supplies
the muted color and the label size.

`chip(label)` is a `<span class="chip">` with the label in its own inner
span, so a caller can append to the chip without disturbing the text. With
`opts.onClick` it is a `<button class="btn-bare chip">` instead, which the
stat-block chips use to open their editor. The option decides the tag, so a
chip that looks clickable is always a button.

`removableChip(label, onRemove)` adds the trailing x (`.chip__remove`) that
calls `onRemove`. Pass `opts.removeLabel` when the visible label is not the
name of what the x removes: the conditions bar shows "Poisoned (3)", and its
button reads "Remove Poisoned". Status conditions, the effects that a weapon
inflicts, and tag-field pills all use these two builders. `opts.className`
takes a modifier for one feature.

`badge(label)` is the read-only marker on a list row. `opts.variant` covers
the three shared readings (`success`, `danger`, and `neutral`), which color
an NPC's disposition. A marker that means something outside that scale
passes `opts.className` for its own color: a prepared spell takes the mana
color, and a custom library entry takes the accent.

`sectionLabel(text)` is the sub-heading inside a panel section. It is a
`span` by default, because it labels the box beside it and does not open a
section. `opts.tag` makes it an `h3` or `h4` for a heading that the document
outline gives to a screen reader.

### `src/ui/icons.js`

```js
icon(name, { size = 18, className }?) -> SVGSVGElement
```

`icon` builds an SVG from a table of 24x24 stroke path data (`PATHS`).
Icons draw in `currentColor`, so they take the color of the button or text
around them and follow the theme with no extra work. The builder uses
`createElementNS` with path strings, never `innerHTML`.

Every icon is `aria-hidden="true"`. Icons here are decorative, and the
control around them owns the accessible name. `iconButton` therefore
requires a label.

These are the 40 names in `IconName`:

```
plus  minus  heal  remove  edit  save  export  import  dice  d20  add
check  chevron  circle  box  boxChecked  map  fit  target  sword  shield
clock  flag  scroll  sparkles  eye  eye-off  lock  give  sun  moon
monitor  warning  external  up  down  more  minimap  revert  pointer
```

An unknown name gives an empty SVG and no error, so a typo shows as a blank
gap. The typecheck catches the typo first, because `IconName` is a union of
string literals.

`minus` and `heal` are the fixed pair for HP that goes down and up.
`sword` marks attacks and foes, and never marks damage (see
[Conventions](conventions.md#hp-icons)). To add a glyph, add its path data
to `PATHS` and its name to `IconName`. Do not put an inline SVG at the call
site.

## Stat bars

```js
buildStatBar(pool, { modifier, label, critical?, bonus?, showLabel?, compact?,
                     band?, hero?, className? }) -> { element, update(pool, bonus) }
```

`buildStatBar` in `src/ui/CharacterBars.js` draws a pool such as HP as a
filled track. The full form is one wide line with a label, the track, and
the numbers, for the character sheet's head:

- `showLabel: false` keeps the numbers beside the track, for a combat board
  card.
- `compact` puts the numbers over a fixed-width track, for a roster row.
- `band` colors the whole fill by the remaining fraction, in three steps.
- `hero` wraps the bar onto two lines, with the label
  and the numbers over a tall track the full width of its box. The character
  sheet uses it for HP and puts the damage and heal buttons on a row under it.

The label still names the bar to a screen reader in every form. `update`
rewrites the fill, the numbers, and the label for a new value of the same
pool, so an HP tick changes four properties and rebuilds nothing.

## Fact lines

```js
factLine(label, value, { layout = 'stack', className }?) -> HTMLDivElement
```

`src/ui/FactLine.js` draws a label with the value that it names. The
initiative, AC, and HP of the active combatant (`CombatActiveColumn.js`),
the casting details in `SpellDetail.js`, and the lines of `LoadoutBlock.js`
all use it, so one class family covers every line of this kind.

The label is a `sectionLabel`, so every such line has the same case and
size. The value takes any `Child`, so a caller can pass a built node where
plain text is not enough: the detailed loadout passes a row of slot chips.

`layout: 'row'` puts the value beside the label, not under it. Use it for a
block of lines that reads as a table, and give the label a width in your own
sheet so that the values line up. The loadout block does both.

A fact line draws text. For a fraction drawn as a filled track, use
`buildStatBar`.

## Death-save block

```js
deathSaveBlock(state, { name, canAct, onRoll, onStabilize }) -> HTMLElement | null
```

`src/ui/DeathSaveBlock.js` draws the line that a character at 0 HP shows:
three success pips, three failure pips, and the Roll and Stabilize controls.
A stable character reads "Stable at 0 HP", and a dead one reads "Dead", with
no controls. The combat screen's active column and the character sheet both
call it, so the two cannot describe the same state differently.

The function returns null when the character has no tracker, which is the
usual case. A caller appends whatever comes back and tests nothing itself.
`canAct` gates the controls. On the combat screen it is `row.mayAct`, and on
the sheet it is the play permission.

The words and the pip counts come from `view/DeathSaveView.js`, which is
pure and unit tested. This module is the DOM around them.

## Exhaustion bar

```js
mountExhaustionBar(container, { getEntity, onSet, canEdit }) -> { update }
```

`src/ui/ExhaustionBar.js` draws the exhaustion row: a label and one pip for
each level, filled up to the current level. The character sheet, the NPC
panel, and the Encounters panel mount this row, so all three read the same.

A click on a pip sets the level to that pip. A click on the pip of the
current level removes one level. Each pip is a button with its own
accessible name, so the row works from the keyboard.

`onSet` reports the new level, and the owner writes it. The write always
goes through `app/exhaustion.js`, because the sixth level kills the
combatant and writes a log line.

Without `canEdit`, the row shows plain glyphs and no controls, and it is
hidden at level 0 because a spectator has nothing to read there. The
character sheet passes the GM-only `restore` permission as `canEdit`, so a
bound player can read the row but not click it. The NPC and Encounters
panels mount the row on GM rows only.

The words and the pips come from `view/ExhaustionView.js`, which is pure and
unit tested. This module is the DOM around them.

## Dialogs

`src/ui/Modal.js` wraps the native `<dialog>` element. Each entry point
returns a promise:

```js
promptModal(title, fields, options?) -> Promise<Record<string, string> | null>
alertModal(message, options?)        -> Promise<void>
confirmModal(message, options?)      -> Promise<boolean>
confirmDelete(name, detail?)         -> Promise<boolean>
```

Every dialog in the app shares one lifecycle:

1. Capture `document.activeElement` as the opener.
2. Build and append the dialog.
3. Call `showModal()`.
4. On `close`, remove the dialog and put focus back, then resolve.

Escape closes the dialog, because `<dialog>` does that natively. Nothing
here implements an overlay, a scrim, or a focus trap again.

Every dialog has a name. The title gets a unique id, and the dialog points
at it with `aria-labelledby`, so a screen reader announces the title and
not only "dialog". `confirmModal` defaults its title to the confirm label as a
question, such as "End combat?", or to "Confirm" when it has no label.
`confirmDelete` titles its dialog with the name, as in "Delete Wren Tallowby?".
`alertModal` defaults its title to "Notice". Both point `aria-describedby` at
the message.

A danger confirm opens with focus on Cancel, so a stray Enter cannot delete
or replace anything. `confirmModal` takes `confirmLabel` for the confirm
button and `cancelLabel` when the dismiss button does more than close, such
as "Keep saving paused".

On close, focus goes to the caller's `returnFocus` element when the caller
names one. A caller names it when the element that owns the interaction is
not always the element that had focus, such as a button that the browser
does not focus on click. Otherwise focus goes back to the opener. A dialog
often removes or rebuilds the control that opened it, so when neither
element is still in the document, focus goes to the `<main>` landmark.
`pickReturnFocus` in `src/ui/dialogFocus.js` makes this choice. It is a pure
function with its own tests.

The lifecycle itself is `openDialog`, also exported from `Modal.js`. Use it
for a dialog that is not a form, a message, or a question:

```js
openDialog({ className, title, form, returnFocus, build, result }) -> Promise<T>
```

- `build(close)` returns `{ body, actions, initialFocus, description }`: the
  content between the title and the button row, the buttons (wired to the
  `close(value)` that they receive), the element that takes focus on open,
  and the element that describes the dialog, if any.
- `result` maps the dialog's return value to the value that the promise
  resolves to. It runs while the dialog is still mounted, so it can read the
  dialog's inputs. It can return a promise when the value is not settled
  yet, which is how the dialog awaits the file field's decode.
- With `form: true`, the parts go inside a `<form method="dialog">`, so
  Enter submits, and a submit button's `value` becomes the return value.

Five dialogs live outside `Modal.js`, and all of them use `openDialog`:
`promptSpellDetail` (`SpellDetail.js`), `combatSetupModal`
(`CombatSetup.js`), `generateDialog` (`GenerateDialog.js`), the
ability-score breakdown (`CharacterStatBadge.js`), and `choiceModal`
(`ChoiceModal.js`). `choiceModal(message, choices, { title, checkLabel })`
shows one button for each choice beside Cancel, with an optional checkbox
under the message. It resolves with `{ choice, checked }`, and `choice` is
"cancel" for Cancel or Escape. Focus return and dismissal
have one owner, so these dialogs behave the same as the ones in `Modal.js`.

[Conventions](conventions.md#choosing-a-dialog) says which dialog to use:
`confirmModal` only for a question with two real answers, `choiceModal` for
a question with three or more, `alertModal` for a
blocking notification, `app.toasts.show` for one that dismisses itself, and
`confirmDelete(name, detail?)` for a plain entity delete. `confirmDelete`
owns the `Delete "X"?` wording and the danger button, so no call site
restates them.

### `promptModal` fields

A field is a `ModalField` record (`src/types/modal.ts`), and `type` picks
the widget:

| `type` | Widget | Value in the result record |
| --- | --- | --- |
| `'text'` *(default)* | `input.field` | The string |
| `'search'` | `input.field` with `type=search`. Enter in it does not submit the dialog, because it narrows another field. The rail form has no renderer for it | The string |
| `'number'` | `input.field` with `type=number`, honoring `min` and `max` | The string. An out-of-range value moves to the nearer bound on `change`, not on each keystroke |
| `'textarea'` | `textarea.field`, `rows` lines tall | The string |
| `'checkbox'` | One on/off box | `'1'` when checked, `''` when not |
| `'select'` | `select.field` over `options: { value, label, disabled? }[]` | The selected value |
| `'file'` | Image picker | A `data:` URL from `readImageFile` |
| `'multiselect'` | A scrollable checkbox group, capped by `max`. `columns` lays a short list out in columns with no scroll, `fixedHeight` stops a refilter from resizing the dialog, and `emptyText` fills an empty list | The checked values, joined by commas |
| `'tags'` | A pill list with an inline entry | The pills plus any unfinished text, joined by commas |
| `'pillgrid'` | An assignment grid of `rows` by `options`, one option for each row | `row:value` pairs, joined by commas |
| `'allocation'` | A distribution grid with a number input for each row, whose values add up to `total`. `unit` names what the rows count, such as "rays" | `row:count` pairs, joined by commas. A row given 0 is left out |
| `'button'` | An action button inside the form | `''`. It acts through `onChange` |
| `'note'` | A line of warning text with no input, a polite live region. `onChange` rewrites it with `setLabel` | `''` |

Every field also takes `name`, `label`, `value`, `full`, `newRow`, `hidden`,
`disabled`, `advanced`, and `section`. The text, number, and textarea fields take
`placeholder`.

- With `options.wide`, the form lays out two fields in each row. `full: true`
  spans both columns, and `newRow: true` starts a row. `newRow` keeps a pair
  that belongs together (such as weapon and armor) on one row when an odd
  number of fields comes before it.
- A field with `section` gets a `section-label` heading of that text above
  it, across both columns, with the `modal__section` class. The creature
  dialog and the Library template form group their fields this way. In the
  dialog, an advanced field shows no heading, because the disclosure summary
  names it. The Library form (`buildSpecForm`) has no disclosure, so it
  shows the advanced fields open under their own section heading.
- `options.submitRequires` names checkbox and text fields. The submit
  button stays disabled until each named checkbox is ticked and each named
  text field has text, and a named text field gets `aria-required`.
- A field marked `advanced` goes into one collapsed `<details>` block,
  captioned by `options.advancedLabel` (default "More options"). The block
  sits where the first advanced field appears, so a plain submit does not
  make the GM read past situational inputs.
- The buttons are the dismiss button (`options.cancelLabel`, default
  `'Cancel'`), then the submit button (`options.submitLabel`, default
  `'Create'`). Every form in the app puts the dismiss button on the left and
  the primary action on the right. Only the submit button, or Enter in a
  field, resolves the values. The dismiss button and Escape resolve `null`.
- `options.message` puts a paragraph above the fields, and the dialog points
  `aria-describedby` at it. Use it for a long prompt, and keep the field
  caption short.
- Dialog text wraps at `--modal-measure` (30rem). A long message, caption,
  or select stops at that width, so it does not stretch the dialog to 90vw.

A dialog rebuilt by hand tends to lose these behaviors:

- **The file field shows errors inline**, as a `<p class="modal__error"
  role="alert">` inside the dialog, not as a second alert dialog. It clears
  the input after a failure, so picking the same file again fires `change`
  again. The dialog awaits reads in progress before it collects the result,
  so a fast submit cannot drop the image.
- **`onChange` gets a handle on the whole form**, so one field can drive
  another (a tier select that stamps default stats again, or a class select
  that filters a spell list). The handle is
  `{ get, set, setOptions, setDisabled, setLabel, setRange, setHidden,
  setTotal, suspend }`, all keyed by field name. `get` is always
  synchronous, and `setTotal` applies to allocation fields only.
  `suspend(name, work)` closes the dialog while `work` runs, then opens it
  again with every value kept and focus on the field `name`. The "Pick on
  map" button uses it, because the page behind a modal dialog takes no
  clicks. `buildSpecForm` has no `suspend`.

The composite fields (`multiselect`, `tags`, `pillgrid`, `allocation`) keep
their own local state and redraw themselves. A refilter through
`setOptions` keeps the current selections, even the ones that leave the
option set.

The allocation field is the one field that can block a submit. It sets a
message on its first input through `setCustomValidity` whenever the rows do
not add up to `total`. The browser then refuses the submit and reports the
error as it does for any other invalid field. The rows scroll, but the line
with the remaining count does not, so the reason for a refused submit stays
in view.

## Inline forms

The Library rail's authoring forms render inline, not in a dialog, so they
build from `src/ui/formFields.js` and not from `Modal.js`:

```js
labeled(caption, control, opts?)    -> HTMLElement        // captions the control
captioned(caption, control, className) -> HTMLElement     // the wrapper under labeled
fieldRow(...children)               -> HTMLDivElement     // one horizontal group
checkbox(caption, checked, opts?)   -> { label, input }
checkboxInput(checked)              -> HTMLInputElement   // the bare box
textField(value, opts?)             -> HTMLInputElement
numberField(value, opts?)           -> HTMLInputElement
textareaField(value, opts?)         -> HTMLTextAreaElement
select(options, value, opts?)       -> HTMLSelectElement
setOptions(select, options, value)                        // refill an existing picker
buildInlineForm({ nameInput, rows, assemble, submitLabel, onSubmit,
                  onCancel?, afterSubmit?, className? }) -> HTMLDivElement
```

`labeled` picks its wrapper through `captioned` and `captionWrapperKind`:

- A single labelable control (an input, select, textarea, or button) goes
  inside a `<label>`. The caption is then the control's name, a click on
  the caption focuses it, and no `for`/`id` pair needs to stay in step.
- Anything else, such as a checkbox grid or a pill grid, goes inside a
  `<div role="group">` that the caption names through `aria-labelledby`. A
  `<label>` around such a group names only its first box, with the whole
  group's text.

`labeled`, `checkbox`, and the field builders take the shared options
`className` and `ariaLabel`. `select` accepts bare strings (the value is the
label) or `{ value, label }` pairs, so the same helper serves enum pickers
and labelled choices.

These controls are not only for the rail. `promptModal` builds a dialog's
plain text, number, select, and checkbox fields from the same functions, so
a field behaves the same in a dialog and in the rail. `numberField` owns the
range correction on `change` for both. It reads `min` and `max` from the
element, so a dialog that changes a field's range through `setRange` still
gets the correction.

`buildInlineForm` is the frame that the item, spell, feat, and spec forms
share. It wraps the form, puts the name field first with the shared
`form__wide` sizing, appends `rows` in order, and ends with the button row
(Cancel left of the primary submit, as in the dialogs).

- A submit reads the whole form through `assemble`, which returns the
  finished value, or `null` to refuse the submit.
- The frame refuses a blank name before `assemble` runs, so no form checks
  it again.
- `afterSubmit` runs after an accepted submit. The inventory's add row uses
  it to clear itself, and the editor for one item keeps its values on
  screen.

An `assemble` function reads its controls and passes the values to a pure
function, and does not build the finished value itself. The meaning of each
value then stays testable without a DOM. The item and spell forms do this
through `entities/ItemDraft.js` and `entities/SpellDraft.js`, which have the
tests. See [Entities](entities.md#the-ui-layer-over-entities).

### Spec forms

The creature template form builds no controls of its own. An entity that
the GM authors both in a dialog and in the rail describes its fields once,
as the `ModalField[]` that `promptModal` takes, and `src/ui/SpecForm.js`
renders the same list inline:

```js
buildSpecForm({ fields, assemble, submitLabel, onSubmit,
                onCancel?, onChange?, className? }) -> HTMLDivElement
```

- The first field is the entity's name and becomes the wide name input. The
  other fields go two to a row, honoring `full` and `newRow` as the wide
  dialog does.
- `assemble` receives the same record of field names to strings that
  `promptModal` resolves to, so both read a form back through the same
  functions.
- `onChange` receives the same `ModalFormHandle`, so a rule such as "stamp
  the default stats again when the tier changes" runs in both. The handle's
  `setTotal` does nothing here.

The spec itself is in `app/creatureFields.js` (see
[The app wiring layer](app-wiring.md)). The controls come from
`formFields.js` and `ModalFields.js`, the builders that the dialog uses. The
file, tags, pill-grid, allocation, and button kinds have no inline renderer.
A spec that uses one of them throws, so the form never silently drops a
field.

## Tabs and disclosures

Disclosures and most tab strips are wired over existing markup, not built.
The caller owns the elements, and the helper owns the state and the ARIA.

```js
wireTabs(tablist, { resolvePanel?, onSelect? }?) -> { select(tabId) }
```

`src/ui/Tabs.js` implements the ARIA tabs pattern over a `[role=tablist]` of
`[role=tab]` buttons. Each tab points at its `[role=tabpanel]` through
`aria-controls`. The helper keeps `aria-selected`, a roving `tabIndex` (only
the active tab is in the document tab order), and `panel.hidden` in step.

- Arrow Left and Arrow Right wrap around, and Home and End jump to the ends.
  Each key moves focus.
- A click selects a tab without moving focus.
- The first selected tab is the one already marked `aria-selected="true"`
  in the markup, or the first tab.

Most strips are written in `index.html`, so the caller only wires them. When
the tabs are known only at runtime, `buildTabs` builds the strip:

```js
buildTabs({ ariaLabel, className?, tabs: [{ id, label, panel }], selected?, onSelect? })
  -> { tablist, select(id) }
```

`buildTabs` creates the buttons, generates the id pairs that
`aria-controls` needs, marks up the panels that the caller passed, and gives
the result to `wireTabs`. `resolvePanel` finds the panels before they are in
the document. `onSelect` reports the caller's own tab id, including for the
first selection. The encounter panel's two tabs and the equipment library's
category subtabs use this path.

Selecting a tab only flips `hidden`, so the panels' contents stay in the DOM
across a tab click and refresh on their own schedule. Neither panel redraws
to move a highlight. Use one of these two helpers for every tab strip.

```js
buildDisclosure({ body, label?, headChildren?, className?, ariaLabel?, expanded?, onToggle? })
  -> { head, body, isExpanded, setExpanded }
wireDisclosure(button, body, { expanded?, onToggle? }?) -> { isExpanded, setExpanded }
```

`src/ui/Disclosure.js` keeps `aria-expanded` on the button, toggles the
`disclosure--open` class (which rotates the chevron through CSS), and sets
`body.hidden`. `setExpanded` runs once when the helper wires the button, so
`onToggle` also fires at that time. A panel that redraws rebuilds its DOM,
so pass the last known state as `expanded`, and record changes from
`onToggle`.

`buildDisclosure` also builds the header. The header is a `bareButton` with
the `disclosure` class and the chevron. With a `label`, it also gets
`section-label`, the shared group-heading treatment. A header with its own
look leaves out `label` and builds its content in `headChildren`, as the dice
tray does with a d20 icon and the text "Roll dice". A header with no visible
text names itself through `ariaLabel`. Anything between the label and the
chevron, such as an item count, goes in `headChildren`. The header and the
body come back as siblings, so a panel can put them in whatever box its
layout needs. Use `wireDisclosure` directly only for a header that the
caller builds itself.

## Keyboard grids

```js
rovingTarget(index, key, count, columns) -> number | null
columnsFromTops(tops)                    -> number
```

`src/ui/rovingIndex.js` is the pure half of a roving `tabindex` over a grid
of buttons. A grid of many small controls, such as the tile swatches of the
Build palette, keeps one Tab stop and moves focus inside itself with the
arrow keys. `rovingTarget` gives the index that a key moves to:

- Left and Right step one item and wrap at the ends of the list.
- Up and Down step one row and stop at the first and last row, so a held
  key does not loop through the grid.
- Home and End go to the first and last item.
- Any other key returns null, so the browser handles it.

`columnsFromTops` counts the items in the first rendered row from each
item's `offsetTop`. `PalettePanel.js` applies the result to its elements.
`Tabs.js` keeps its own version, because a tab strip also selects on an
arrow key.

## Toasts

```js
mountToasts(container, { duration = 3500 }?) -> { show(message, { level? }?) }
queueToastAfterReload(message)
flushQueuedToast(toasts)
```

`main.js` mounts one toast stack from `src/ui/Toast.js` on `document.body`
and puts the handle on the context as `app.toasts`, so no other module
imports `Toast.js`. The stack has two live regions:

| `level` | Region | Behavior |
| --- | --- | --- |
| `'status'` *(default)* | `role="status"`, `aria-live="polite"` | A screen reader announces it without interrupting. It dismisses itself after `duration` |
| `'error'` | `role="alert"`, `aria-live="assertive"` | A screen reader announces it at once. It stays four times as long and has a Dismiss button for keyboard users |

A click on any toast dismisses it early.

The queue functions carry one confirmation across a page reload through
`sessionStorage`. Use them for an action that completes after the current
document is gone, such as Undo, Import, or New.

Toasts render over map art, so they use the `--overlay-*` tokens and not the
page background colors (see [Tokens](#tokens)).

## Tooltips

```js
mountTooltips(container)                    -> { hide }
setTip(element, text)                       -> HTMLElement
tipPlacement(anchorRect, tipSize, viewport, margin?)
                                            -> { left, top, side }
```

`src/ui/Tooltip.js` is the app's hint for hover and focus. `main.js` mounts
one tooltip element on `document.body`, with listeners delegated to the
document. A widget gets a tooltip by marking an element with `setTip`, and
adds no listeners of its own. `setTip` writes a `data-tip` attribute and
clears any native `title`, so a control never shows two hint boxes. The text
can contain newlines, and the box keeps them.

The button builders route their `opts.title` through `setTip`, so most of
the app has tooltips with no change at each call.

- The pointer and the keyboard both show the hint, and the shown element
  gets `aria-describedby`, so a control reached by Tab reads the same text
  that a hover shows.
- A hover waits one second before it shows the hint, so a pointer that
  crosses a rail of icon buttons shows nothing. Keyboard focus shows the
  hint at once, because a Tab press is already a deliberate stop.
- A press, a scroll, or Escape hides the hint. The focus that a click gives
  to its own control shows no hint, so a pressed button does not bring the
  box straight back.
- A control removed from the page while it has focus fires no `focusout`,
  so a mutation observer hides the hint when its anchor leaves the
  document.

The tooltip element is a popover, which puts it in the browser's top layer.
A modal dialog is in that layer too, so without the popover a hint on a
control inside a dialog draws behind the dialog. `tipPlacement` is the pure
placement rule: above the anchor and centered on it, moved below when there
is no room above, and kept within the viewport.

`src/ui/TileTooltip.js` is a separate widget. It follows the cursor over the
map canvas and shows several lines of tile metadata, with no element to
anchor to. It shares the look and nothing else.

## Context menus

```js
openContextMenu(items: { label, onSelect, danger? }[], { clientX, clientY }, trigger?)
toggleMenuFrom(trigger, items)
markMenuButton(button)
clampToViewport(x, y, width, height, viewportWidth, viewportHeight, margin?)
```

`src/ui/ContextMenu.js` is the right-click counterpart to `Modal.js`, for
choices that do not need a dialog. It follows the behavior of a native
menu:

- Focus moves into the first item, and the arrow keys cycle through the
  items.
- Escape or a click outside closes the menu without choosing an item.
- Choosing an item closes the menu before the item's action runs.
- Only one menu is open at a time, so opening a second menu closes the
  first.

`openContextMenu` has no return value, because the items' own callbacks are
the result.

A menu button, such as the More button of a party row or a world-tree row,
opens its menu with `toggleMenuFrom(trigger, items)`. The menu opens below
the button and takes the button's accessible name as its own. The button
gets `aria-expanded="true"` while the menu is open, and a second press on it
closes the menu. The capture-phase press listener ignores a press on the
button, because it would close the menu and the click that follows would
open it again. `markMenuButton(button)` sets `aria-haspopup="menu"` and
`aria-expanded="false"` when the button is built.

An item with `danger: true` draws in the `--danger` colour, with a rule
above it when other items come first. The World tree and the party-row More
menu mark Delete this way.

`clampToViewport` is the pure positioning helper, in its own function so
that a unit test can reach it. It flips the menu away from a viewport edge,
so the menu never slides under one.

A context menu is not a `<dialog>`, so it stays outside the `Modal.js`
lifecycle.

## Image input

```js
readImageFile(file)                       -> Promise<string>  // a data: URL
fitDimensions(width, height, maxEdge)     -> { width, height } // pure
encodeSizes(width, height, maxEdge?)      -> { width, height }[] // pure
encodeAttempts(width, height, maxEdge?)   -> { width, height, quality }[] // pure
pickFit(candidates, limit)                -> string | null // pure
```

`src/ui/imageField.js` backs the `file` field. A picked image becomes part
of the campaign, so the module keeps each image small:

| Limit | Value |
| --- | --- |
| `MAX_SOURCE_BYTES` | 12,000,000 bytes. A larger file is refused before any decode |
| `MAX_EDGE` | 1280 px on the longest edge |
| `MAX_ENCODED_CHARS` | 250,000 characters in the stored `data:` URL |
| `QUALITY_STEPS` | JPEG qualities 0.82, 0.7, and 0.55, tried in order |

`readImageFile` downscales the image to `MAX_EDGE`, then walks
`encodeSizes`: the full edge, then half of it. At each size it draws the
image once. For a PNG source it encodes one PNG from that drawing. It then
encodes a JPEG at each quality step and gives the PNG and the JPEGs to
`pickFit`, which returns the shortest candidate under `MAX_ENCODED_CHARS`.
The first result that fits is stored. The error messages are sentences for
the GM, not codes, because they show directly in the dialog.

A saved campaign keeps its image payloads in IndexedDB (see "The image
store" in [Persistence](persistence.md)). The caps still bound what one
image adds to memory, to an exported campaign file, and to the localStorage
fallback that keeps images when IndexedDB is not available.

The arithmetic (`fitDimensions`, `encodeSizes`, `encodeAttempts`, `pickFit`)
is pure and unit tested. Check the canvas encode path in a browser.

## The CSS layer

### The import manifest

`style.css` contains only `@import`s of the feature sheets under `styles/`,
in cascade order, each with a one-line comment. A later sheet can override
an earlier one, so the order is part of the contract:

1. `base.css`: design tokens, element base, every shared primitive
2. `shell.css`: header, context menu, mode and role switches
3. `build.css`: Build mode's world tree, palette, and tile inspector
4. `layout.css`: play-surface columns, map viewport and controls, toasts
5. `widgets.css`: breadcrumb, dice tray, disclosure, stat bars, fact lines
6. `forms.css`: the inline authoring form's frame, rows, captions, and
   control sizes
7. `character.css`, `paperdoll.css`, `sheet-features.css`,
   `inventory-grid.css`, `session.css`, `party.css`, `story.css`,
   `quest.css`, `library.css`, `spells.css`, `combat.css`, `play-shell.css`,
   `build-shell.css`, `full-sheet.css`, `sheet-summary.css`: one sheet for
   each feature area
8. `responsive.css`: narrow-viewport stacking. **Keep this sheet last.**

Add a new feature sheet in the feature block, with an `@import` and a
comment that says what it covers. No `.js` file imports CSS.

### Tokens

Every color, space, radius, type value, shadow, and duration is a custom
property on `:root` in `styles/base.css`:

| Group | Tokens |
| --- | --- |
| Surfaces | `--bg`, `--surface`, `--surface-raised`, `--surface-sunken` |
| Lines | `--border`, `--border-strong` |
| Text | `--text`, `--text-muted` |
| Accents | `--accent`, `--accent-hover`, `--danger`, `--success`, `--warning`, `--mana`, and a `*-contrast` token for each of `--accent`, `--danger`, `--success`, `--warning`, and `--mana` |
| Focus and shadow | `--focus-ring`, `--shadow-tint`, `--shadow-1`, `--shadow-2`, `--shadow-3` |
| Over-map controls | `--overlay-bg`, `--overlay-text`, `--overlay-npc` |
| Spacing | `--space-1` (0.25rem) through `--space-6` (2rem) |
| Type | `--font-display`, `--font-title`, `--font-sans`, `--font-mono`, `--text-display`, `--text-heading`, `--text-body`, `--text-label`, `--line-body` |
| Radius | `--radius-sm`, `--radius`, `--radius-lg`, `--radius-pill` |
| Motion | `--transition-press` (40ms), `--transition-fast` (120ms), `--transition-base` (250ms) |

The character sheet's width measures (`--sheet-measure`,
`--sheet-measure-wide`, `--sheet-measure-side`, `--sheet-measure-body`) live
on `:root` in `styles/character.css` (see
[Layout and responsiveness](#layout-and-responsiveness)).

The token system follows these rules:

- **Never write a fallback** such as `var(--border, #ccc)`. A missing token
  renders as nothing, which shows the typo. A fallback hides it.
- **Every accent has a `*-contrast` partner**, and a filled element always
  sets its own text color from it. Add a new accent as a pair.

Elevation uses `color-mix` to fade `--shadow-tint` to the alpha it needs, so
shadows follow the theme without a second color.

### Theming

The app has one set of tokens. Each color is a single
`light-dark(light, dark)` declaration, resolved by the root `color-scheme`:

- `:root { color-scheme: light dark }` follows the operating system by
  default.
- `:root[data-theme='light']` and `:root[data-theme='dark']` pin the theme.
  The attribute selector outranks the bare `:root`, so an explicit choice
  always wins.
- `src/ui/ThemeToggle.js` writes `data-theme` on `<html>` (and removes it
  for System), and saves the choice under `campaign-builder:theme`.
- `src/boot.js`, a plain script that `index.html` loads at the top of
  `<body>`, applies the saved theme again before the first paint, so a
  reload in the dark theme does not flash light.

`--select-chevron` is the one themed value that is not a color. It is an
inline SVG data URI, and `light-dark()` resolves only `<color>` values, so it
cannot contain a `url()`. A `prefers-color-scheme` block and the two
`data-theme` blocks swap the arrow instead, so the token appears four times.

`--overlay-*` tokens are dark in both themes, because map controls, toasts,
tooltips, and the onboarding scrim float over map art and not over the page
background.

### Shared classes

Class names follow a BEM-like pattern: `block__element--modifier`. The
classes below are shared across features. Reuse the class, and keep only
layout (margins, grid placement) in the component's own class.

| Class | Sheet | Role |
| --- | --- | --- |
| `.btn` + `--primary`, `--danger`, `--success`, `--icon` | `base.css` | Every button, and every link with the button look, built through `buttons.js` |
| `.btn-bare` | `base.css` | The reset for a control that is a button with no button presentation, built through `bareButton` |
| `.field`, `.field-check` | `base.css` | Every input, select, and textarea, and the checkbox with its caption |
| `.form`, `__row`, `__label`, `__wide`, `__number` | `forms.css` | The inline authoring form and its parts, built through `formFields.js` |
| `.card`, `.card__title` | `base.css` | A bordered panel with an uppercase heading |
| `.seg-switch`, `__btn`, `__btn--active` | `base.css` | The segmented toggle (mode, theme, role, dice-tray d20) |
| `.row-select`, `--current` | `base.css` | The selectable full-width list row (world tree, roster) |
| `.section-label` | `base.css` | The in-panel sub-heading: uppercase, tracked, muted, built through `sectionLabel` |
| `.modal__section` | `base.css` | A section heading inside a long dialog, and inside the rail form that `buildSpecForm` builds from the same spec: a rule above it, and both columns of a wide dialog |
| `.empty-state` | `base.css` | The "nothing here yet" paragraph. The class sets margin, padding, and italic only. `emptyState()` adds `u-muted` for the color and size |
| `.chip`, `.chip__remove` | `base.css` | A small labeled tag, with or without an x, built through `buttons.js` |
| `.badge` + `--success`, `--danger`, `--neutral` | `base.css` | A read-only status marker on a list row. A color outside the three shared readings comes from a feature modifier |
| `.icon` | `base.css` | The SVG class that `icon()` applies |
| `.tabs`, `__tab`, `__panel` | `base.css` | A tab strip over a stack of panels |
| `.modal` and its parts | `base.css` | The native `<dialog>`, built through `Modal.js` |
| `.sr-only` | `base.css` | Visually hidden, still announced |
| `.disclosure`, `__chevron`, `--open` | `widgets.css` | A collapsible header, built through `Disclosure.js` |
| `.stat-bar`, `__track`, `__fill` | `widgets.css` | A filled track, built through `buildStatBar`, with `__fill--mana` and `__fill--critical`, the `--compact` pill form, and the `data-band` fill colors |
| `.fact-line`, `__label`, `__value`, `--row` | `widgets.css` | A label with its value, built through `factLine` |

### Utilities

`base.css` also has a small utility layer for the treatments that every
feature sheet would otherwise restate. A utility describes how something
looks, not what it is. An element keeps its own component class for the
rest of its styling and for any selector that targets it:

```js
el('span', 'npc-panel__location u-muted', label);
```

| Utility | Declarations |
| --- | --- |
| `.u-muted` | `font-size: var(--text-label)` and `color: var(--text-muted)`, for captions, hints, derived readouts, and row metadata |
| `.u-row` | `display: flex` and `align-items: center`: a horizontal bar with its items centered |
| `.u-col` | `display: flex` and `flex-direction: column`: a vertical stack |
| `.u-wrap` | `flex-wrap: wrap` |
| `.u-g1` through `.u-g4` | A gap on the `--space-*` scale |

`.u-row` and `.u-col` set no gap, because the spacing differs from one
container to the next. Pair them with a gap utility:

```js
el('div', 'encounter-panel__row u-col u-g1', head, chips);
```

A container that needs a different cross-axis alignment keeps its own
`align-items`. For example, `.character-sheet__head` sets `stretch`, and
`.travelog__item` sets `baseline` and does not use `.u-row`. A gap that is off
the scale or uneven (`gap: 0.15rem`, `gap: var(--space-1) var(--space-3)`)
also stays a declaration in the component's rule, beside a bare `.u-col`.

The utility layer comes before the feature sheets in the cascade, so a
component rule wins where both set the same property.
`.tile-inspector__field--inline` uses this: it sets its text back to the
full `--text` color, and keeps `u-muted` for the size. Every `.foo[hidden]`
companion rule does the same, and each one outranks the utility's
`display: flex`. Without that rule, the `hidden` attribute has no effect.

Add a new utility only when the pattern already repeats several times and
its values come from the token scale. A component-specific value belongs in
that component's rule. Weigh the markup changes too: `.tabs__panel` keeps its
column rule because `index.html` declares sixteen panels, and `u-col u-g4`
on each of them costs more than the rule saves. When a utility leaves a
component rule empty, delete the rule and remove the class from the markup.
Keep the class only if another selector still names it, as
`.character-sheet__features summary` does.

Two details of the `.field` rule look removable but are needed:

- Single-line controls get an explicit `height`. A bare `<select>` ignores
  `line-height` for its box size, and sits about 2.5 px shorter than a
  neighboring `<input>` without it.
- Selects opt into the customizable-select model (`appearance: base-select`
  and `::picker(select)`) as a progressive enhancement. An engine without
  this support drops the value and uses the `appearance: none` rule before
  it. The closed control is themed everywhere, and only a supporting engine
  also themes the popup.

### Layout and responsiveness

The layout is mostly flex with intrinsic sizing (`min()`,
`flex: 1 1 <rem basis>`, `repeat(auto-fit, minmax(...))`), so most reflow
happens with no media query. Grid is used for tabular content.

The few layout switches are in known places:

- **Viewport media queries.** `responsive.css` has two:
  - `@media (max-width: 68rem)` stacks the main columns with the map first
    (`.app-center` takes `order: -1`, because the Build rail comes before
    it in the markup) and shortens the map viewport.
  - `@media (max-width: 40rem)` shrinks the mini-map and moves it below
    the map controls.

  `combat.css` has one more, `@media (max-width: 1100px)`, which stacks the
  combat screen's columns. The fit that opens a map never draws a tile
  smaller than `READABLE_TILE_PX` (32 px, `src/map/MapGeometry.js`), so a
  narrow viewport shows a readable part of a large map and not all of it at
  a quarter size. The Fit button calls `fit({ whole: true })`, which drops
  that floor and shows the whole map.
- **Preference media queries.** `base.css` has the
  `prefers-color-scheme` block for the select chevron and a
  `prefers-reduced-motion` block (see [Accessibility](#accessibility)).
- **A container query for a component that reflows on its own width.**
  `.character-sheet` declares `container: character-sheet / inline-size`,
  and `styles/character.css` queries it at `50rem` to lay the sheet's
  sections out in two columns. The card's width depends on whether the
  sidebar is open and which rails the mode shows, so a viewport breakpoint
  can only guess it. Inside the query, the head (name and HP bar) and the
  level, AC, and XP banner sit across from each other on the first row, and
  a section column sits under each on the second row. The two tracks split
  the card `1.4fr` to `1fr`, and the body stops at `--sheet-measure-body`.
  Below the query, `--sheet-measure` caps the one stacked column.
- **Card width.** The sheet card fills the Sheet tab of the Play sidebar,
  so the sidebar width sets it. The sheet measures live on `:root` and not
  on `.character-sheet`, so a rule outside the sheet can read them.
  `.app-dock` caps its width at 30rem when it stacks below the map,
  because a roster row and the dice tray rows cannot fill more.
- **Play shell.** `styles/play-shell.css` makes Play mode a fixed screen
  of `100dvh` above the stacking point of `responsive.css`. A grid on
  `.app-center` draws the dock left of the map, the dock and each sidebar
  tab panel scroll on their own. The dock is a flex column. The dice tray
  takes its natural height at the bottom (`flex: none; margin-top: auto`),
  and the Party card takes the rest. The roster inside the Party card
  (`#party-container > .character-roster`) scrolls when the tray opens,
  and the card itself does not, because a scroll box clips the
  `.card__title` that straddles the card frame.
- **Build shell.** `styles/build-shell.css` makes Build mode the same kind
  of fixed screen. The Build rail width is `clamp(19rem, 22vw, 30rem)`, and
  the swatch grid uses `repeat(auto-fill, minmax(2.875rem, 1fr))`, so a
  wider window adds swatch columns. On the Paint tab the Palette card takes
  the height that Generate and Tools leave, and `.palette__sections`
  scrolls inside it down to a 7rem minimum. Below that, the tab panel
  scrolls. In the stacked layout the page scrolls and the sections have no
  scroll box.
- **Body classes for mode and role.** `body.mode-play`, `.mode-build`,
  `.mode-library`, `.mode-combat`, `.role-gm`, `.role-player`,
  `.role-locked`, and `.sidebar-collapsed` show or hide whole regions, so a
  mode switch flips a class and redraws nothing.

A flex child that contains text needs `min-width: 0`, or long content does
not shrink. The sheets use this rule more than forty times, and a missing
one is the usual cause of a panel that overflows its column.

### First paint stability

The browser lays out the page before any module runs, so anything that the
wiring changes afterward moves content that the reader already sees. A new
panel follows these rules so that the page stays still:

- **Decide the body classes up front.** A mode or role class hides whole
  rails. If `wireSessionControls` applied them, the page would lay out with
  every rail showing and then remove some of them. Instead, the `<body>`
  element's class attribute states the starting mode (`mode-play`) and the
  default role (`role-gm`). `src/boot.js`, a blocking script at the top of
  `<body>`, pins the theme and then reads the saved role and the player
  lock. It is a separate file and not an inline block, so the page's Content
  Security Policy can allow scripts from this origin only. Its defaults
  restate the defaults in `src/main.js`, so a change to one default is a
  change to both.
- **Reserve the space that a container will fill.** An empty container that
  grows later pushes everything under it down. `#breadcrumb-container`
  therefore reserves one crumb's height from the start, sized from the same
  tokens that build the crumb and not from a pixel constant.
- **Reserve the scrollbar.** `html` sets `scrollbar-gutter: stable`, so the
  columns do not all narrow at the moment the panels fill and the page
  grows past one screen.

## Accessibility

The shared layer handles these points, so a new panel does not restate
them:

- **Focus** is one global `:focus-visible` outline in `--focus-ring`. The
  map canvas draws a thicker accent ring, and tabs, context-menu items, and
  spellbook rows pair focus with their hover treatment. `.field:focus`
  changes only the border color, and the global outline still draws the
  ring.
- **Names on controls.** `iconButton` requires `aria-label`, icons are
  `aria-hidden`, and `labeled` names each form control through a `<label>`
  or a labelled group.
- **State in ARIA, not only in classes.** `wireTabs` writes
  `aria-selected`, and the CSS styles from it. `wireDisclosure` writes
  `aria-expanded`. Pill-grid pills use `aria-pressed`.
- **Announcements** go through live regions. The toast stack has a polite
  status region and an assertive alert region, the map has its own
  description live region, and file-field errors are `role="alert"`. The
  map's live region is rewritten only when the text changes, because a
  rewrite announces it again. It gives a count of the points of interest,
  and the points themselves are in a plain list after the map, so a node
  with long notes does not read them all on each navigation.
- **Focus return.** Every dialog puts focus back on its opener when it
  closes, and the list panels and the roster keep focus across a rebuild
  (`focusMemory.js`).
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, `base.css`
  cuts every animation and transition to 0.01 ms, so the reader sees the
  end state at once. The durations are near zero and not zero, so a
  `transitionend` or `animationend` listener still fires.

The app has no handling for these points:

- **Touch targets.** The app sets no minimum touch size. `.btn--icon` is
  1.75rem (28 px) square, under the usual 44 px guidance.
- **Forced colors and contrast preferences.** The app has no
  `forced-colors` or `prefers-contrast` rules.

## Known gaps

These are the places where the shared layer does not yet meet
[the builder contract](#the-builder-contract), or where the same treatment
is written more than once. Reuse the right builder rather than add another
copy. When a change passes through one of these places, fix it.

- **Builders with no `className` option.** `emptyState`, `fieldRow`,
  `checkboxInput`, `buildTagsField`, `openContextMenu`, and `mountToasts`
  give the caller no way to add a class.
- **Mount signatures that differ from the contract.**
  - The second argument is `callbacks` in most panels, but `options` or
    `opts` in `mountCharacterRoster`, `mountMiniMap`, `mountTileInspector`,
    `mountWorldTree`, and `mountDiceTray`.
  - `mountBreadcrumb` and `mountExitList` take a bare function.
  - `mountPalettePanel` takes five positional arguments,
    `mountSpellbookPanel` takes five, `mountInventoryPanel` takes eight, and
    `mountCharacterSheet` takes ten.
  - `mountActiveColumn`, `mountCombatRibbon`, `mountCombatLog`, and
    `mountRegionPicker` take no container and return their element for the
    caller to place.
- **Section-label treatment restated by hand.** `.stat-badge__key` in
  `character.css` and `.combat-board__heading` in `combat.css` each restate
  the uppercase, tracked treatment of `.section-label`. The builder exists,
  so these two rules are the remainder.

## Testing UI code

The panels and widgets in `src/ui/` are the DOM glue half of the project's
split, so you check them in a browser. Pure helpers that live in `src/ui/`
have unit tests where they sit:

| Test file | Helpers under test |
| --- | --- |
| `tests/imageField.test.js` | `fitDimensions`, `encodeSizes`, `encodeAttempts`, `pickFit` |
| `tests/context-menu.test.js` | `clampToViewport` |
| `tests/Tooltip.test.js` | `tipPlacement` |
| `tests/dialogFocus.test.js` | `pickReturnFocus` and `dialogPartId` |
| `tests/focusMemory.test.js` | `captureFocus`, `restoreFocus`, `controlSignature` (with stub nodes) |
| `tests/rovingIndex.test.js` | `rovingTarget`, `columnsFromTops` |
| `tests/listPanel.test.js` | `repaintNeeded` |
| `tests/formFields.test.js` | `captionWrapperKind`, `uniqueId` |
| `tests/ModalFields.test.js` | `assignPill`, `parseAssignments`, `formatAssignments` |
| `tests/CharacterRoster.test.js` | `rosterDependsOn` |
| `tests/CharacterChecks.test.js` | `training`, `saveRows`, `skillRows` |
| `tests/InitiativePanel.test.js` | `initiativeStatus` |
| `tests/CombatRibbon.test.js` | `chipName` |

When you add a decision to a panel, export it as a pure function beside the
panel and test it the same way.

Preview pages in `tests/` mount the real modules against fixtures built by
hand, without the rest of the app:

- `tests/ui-panels-preview.html`: the character sheet, inventory, and
  encounter panels
- `tests/map-canvas-preview.html`: the map canvas
- `tests/tile-preview.html`: the tile art
- `tests/save-manager-preview.html`: the save manager

Update these pages when a mount signature changes. A stale preview page can
hide a real error the next time someone opens it.

[Testing a change](../testing.md) gives the full loop, including how to check
both themes and the console.
