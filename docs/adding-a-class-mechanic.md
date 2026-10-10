# Adding a class mechanic

*How-to guide. For the character model behind these steps, read
[Entities](architecture/entities.md).*

The app has no registry of class mechanics. A class feature that does
something reads the class id or the feature name at the place where it
applies. For example, `ClassPools.js` asks for `level('fighter')`, and
`TurnActions.hasCunningAction` asks for `classLevelOf(character, 'rogue')`.
To add a mechanic, find the kind below that matches it and follow its steps.
A mechanic can need more than one kind. Rage, for example, is a pool, a turn
action, and a condition chip.

Each kind puts its rule in a pure module under `src/entities/` or
`src/combat/`, so `node --test` covers it. Run the test file named in each
section while you work, and run `pnpm run test` and `pnpm run typecheck`
before you commit.

## Show a feature on the sheet

1. Add the feature name to `featuresByLevel` of its class in
   `src/data/classCatalog.js`, at the class level that grants it.
2. Leave it as a plain string when the app does not model it. The sheet then
   lists it as text, and the GM applies it at the table.

`LevelUp.unlockedFeatures` collects every name that the class levels of a
character reach. The level-up toast names the new ones.

## Scale a value with the class level

Use this kind for a number that grows with the level, such as Extra Attack
or the dice of Sneak Attack.

1. Add the feature name to `featuresByLevel`, as above.
2. Read it in `src/entities/Features.js` with `hasFeature` or
   `featureSource`, and return the number. `attacksPerAction` and
   `sneakAttackDice` are the models.
3. Call the new reader where the value applies, for example in
   `combat/WeaponSwing.js` for an attack.
4. Test it in `tests/Features.test.js`.

The app derives the value on each read, so a save needs no new field.

## Count uses in a pool

Use this kind for a feature with a number of uses per rest, such as Second
Wind, Rage, or ki.

1. Add an id constant in `src/entities/PoolIds.js`, and add it to
   `CLASS_POOL_IDS` in the order that the sheet shows the pools.
2. Add a rule to `POOL_RULES` in `src/entities/ClassPools.js`, in the same
   order. The `uses` function gets `level(classId)` and `mod(ability)`, and
   returns `{ max, recharge }`. The `tier` helper reads a table of
   `[from level, count]` pairs. A `max` of 0 gives no pool.
3. Test the counts in `tests/ClassPools.test.js`. The test "the pools come
   out in the order of CLASS_POOL_IDS" fails when the two lists disagree.

`Progression.derive` runs `syncClassPools` on every write that can change a
level, so the pool appears, grows, and goes away with the class. A loaded
save gains the pool the same way, so no migration is needed. A rest refills
the pool by its `recharge`.

## Spend a use on a turn

Use this kind for a pool that the character spends from the combat action
bar.

1. Add a button to `turnActions` in `src/combat/TurnActions.js`. Give it the
   pool id as `poolId`, an action `cost` (or null), and a `group` label.
   Test it in `tests/TurnActions.test.js`.
2. Pass the uses left from `turnActionsOf` in
   `src/app/turnActionsWiring.js`, with `usesOf(found.entity, YOUR_POOL_ID)`.
3. Add the effect of the press to `useClassAction` in the same file. The
   function already checks the uses left and spends the action cost and one
   use. Write a log line through
   `app.actions.logEvent`.
4. Cover the press in `tests/turnActionsWiring.test.js`.

A class with several options on one pool can build its buttons in its own
module. `combat/ChannelDivinity.js` does this with `channelActions`, and
`turnActionsOf` appends that list.

## Ask for a pick at level up

Use this kind for a choice that the player makes once, such as Expertise or
a Fighting Style.

1. Write the feature in `featuresByLevel` as an object,
   `{ name, effects }` (`ClassFeatureDef` in `src/types/class.ts`). The
   effects use the feat effect vocabulary of `src/types/feat.ts`. The
   `EXPERTISE` and `fightingStyleFeature` constants at the top of
   `classCatalog.js` are the models.
2. Read the pick back where it applies. `entities/FightingStyle.js` reads
   the style ids from `character.featureChoices`, for example.
3. Test the grant in `tests/FeatureGrants.test.js`.

`FeatureGrants.js` treats an unlocked feature with effects and no record in
`featureChoices` as pending. `LevelAssignFlow.js` asks for each pending pick
when the class level is assigned, and the sheet offers the same pick later
for a character that skipped it. Undo of the grant gives back what it added.

A pick that the feat effect vocabulary cannot express needs its own flow.
The warlock picks are the model. `LevelAssignFlow.js` calls
`askWarlockPicks` when `classId === 'warlock'`, and
`LevelAssign.hasChoiceAt` stops the donor path from moving a class level
that invocations or a Mystic Arcanum claim. Add a branch in both places
for the new class.
