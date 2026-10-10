# Extending the app

*How-to guide. Read [Architecture](architecture.md) first for the split
between pure modules and DOM glue.*

For each common kind of change, the steps name the files to edit in order
and the test file that fails when a step is missing. Run that test file alone while you work, for example
`node --test tests/ConditionEffects.test.js`, and run `pnpm run typecheck`
at the end.

## A condition with a rule

A condition is a free string on a creature or a character, so the GM can
add any name. A condition has a rule only when it has a row in the rules
table.

1. Add the name to the pick-list `CONDITIONS` in
   `src/entities/Conditions.js`, so the condition menu offers it.
2. Add a row to `CONDITION_EFFECTS` in `src/entities/ConditionEffects.js`.
   The key is the lower-case name, because `conditionKey` lower-cases a
   chip before the lookup. The `ConditionEffect` typedef above the
   table lists each field, such as `attacks`, `attacksAgainst`, `checks`,
   `saveAdvantage`, `noActions`, and `noTurn`. The roll sites read the table
   through `rollMode` and the other helpers in the same file, so a new row
   needs no change at the roll sites.
3. Add cases to `tests/ConditionEffects.test.js` for each field that the
   row sets. `tests/Conditions.test.js` covers the pick-list.

## A class feature

[Adding a class mechanic](adding-a-class-mechanic.md) covers this change. It
has one section for each kind of feature: a name on the sheet, a value that
scales with the class level, a pool of uses, a use spent on a turn, and a
pick at level up.

## A spell effect kind

A spell has one effect, and `effect.kind` picks the code that resolves it.
The kinds are `attack`, `save`, `heal`, `buff`, `summons`, and `utility`.

1. Add the kind to the `SpellEffect` union in `src/types/spell.ts`, with
   the fields that the kind needs.
2. Add the kind to `SPELL_EFFECT_KINDS` in `src/data/spells.js`.
3. Add a row to `SPELL_KINDS` in `src/entities/SpellKinds.js`. The row gives
   the label of the spell form's Effect select, and the `helps` and
   `targetFree` flags that the cast dialog reads. The table is typed as a
   record over every kind, so the typecheck fails when the row is missing.
4. Add a branch for the kind in `src/entities/Casting.js`, beside the
   `effect.kind === 'heal'` branch and the others, to say what the cast
   rolls.
5. Write the outcome in `src/app/spellOutcomes.js`, and add the fields of
   the kind to the spell form in `src/ui/SpellForm.js`.
6. Run `tests/SpellKinds.test.js`, which checks that the key order of
   `SPELL_KINDS` matches `SPELL_EFFECT_KINDS`, and add cases for the new
   branch to `tests/Casting.test.js`.

## A sidebar panel

A panel follows the panel contract in
[UI components](architecture/ui-components.md#the-panel-contract): a
`mount<Name>(container, callbacks)` function that returns `{ update }`. A
list of rows gets that contract from `mountListPanel` in `src/ui/listPanel.js`.

1. Add the container element to `index.html`, inside the tab that shows the
   panel.
2. Write the panel in `src/ui/`. Keep the rules for its rows in a pure
   module under `src/view/` or the matching area, so `node --test` covers
   them.
3. Mount the panel in the wiring module of its feature area, and store the
   handle on `app.views`, as `storyWiring.js` does with
   `app.views.questPanel`. Add the view name to the `AppViews` interface
   in `src/types/app.ts`.
4. When the panel shows campaign state, add the view to the list in
   `rehydrateCampaign` (`src/app/rehydrate.js`). A panel left out of that
   list keeps stale rows after another tab saves.
5. Check the panel in the browser, in the light and dark themes and at
   phone width. [Testing a change](testing.md#check-a-change-in-the-browser)
   shows how. `tests/mountOrder.test.js` fails when the new wiring changes
   the mount order that other modules depend on.

## A campaign field

A campaign field is a top-level value of the save, such as `quests` or
`clock`.

1. Add the field to `CampaignState` in `src/types/storage.ts`.
2. Add an entry to `BY_KEY` in `src/storage/CampaignFields.js`. The entry
   gives the value that a save without the field reads as (`empty`), the
   coercion that a load runs on the stored value (`coerce`), and the name
   that an Undo or Redo toast uses (`label`). The table is typed against
   `CampaignState`, so the typecheck fails when the entry is missing.
3. Put a coercion for a new record type in `src/storage/RecordCoercion.js`,
   so a hand-edited import with a bad value loads as the empty value.

The save, the load, and the cross-tab sync read the field list from
`CAMPAIGN_FIELDS`, so they need no change. `tests/CampaignFields.test.js`
checks the table. Add a round trip case for the new field there, and a
coercion case to `tests/LoadCoercion.test.js`.
