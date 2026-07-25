# Build plan

## Roadmap (prioritized)

Efficiency ships first, standalone. The 5e-fidelity work that follows is ordered
by dependency, not just value: the character foundation (classes, races,
backgrounds, proficiencies, hit dice) is the spine almost everything else needs,
so it precedes saves/skills, the weapon overhaul, and spellcasting. Each phase
is independently shippable and commit-worthy.

1. **Efficiency foundation** — canvas rAF batching, coord-indexed tiles,
   localStorage write reduction, append-only travelog, library merge
   memoization. (Detailed below.)
2. **Character foundation** — class, subclass, race + racial traits,
   background/origin, proficiency lists (weapon/armor/save/skill), hit dice,
   CON-based max HP, ASI/feat slots at level-up. Shared spine for 3-5, 8.
3. **Core d20 mechanics** — saving-throw and skill/ability-check rollers with
   proficiency + expertise; passive perception. Needs phase 2's proficiency
   lists.
4. **Weapon properties overhaul** — replace the 3-value `handling` enum with
   real property flags; martial/simple + proficiency gating. Needs phase 2.
5. **Spellcasting** — the full spell plan below; save-based spells consume
   phase 3's save roller, gating consumes phase 2's class field. (Detailed
   below.)
6. **Conditions with mechanical effect** — conditions drive advantage/
   disadvantage, auto-crit, lost turns, etc. Feeds attacks (phase 4) and saves
   (phase 3).
7. **Action economy & combat depth** — reactions, bonus actions, opportunity
   attacks, two-weapon fighting, extra attack, cover, range/distance.
8. **Survival mechanics** — death saves, concentration, exhaustion levels.
   Concentration ties to phases 5 and 6.
9. **NPC/mob depth** — HP + AC on NPCs, challenge rating, saves/skills, caster
   support (overlaps the spell plan's NPC phase).
10. **AC refinements** — unarmored defense, configurable shield, armor
    proficiency / strength requirement / stealth disadvantage.
11. **Feats library** — a feat catalog with effects, consuming phase 2's feat
    slots.

The following ships on its own track, independent of the feature phases above —
it can begin as soon as there is something worth distributing and is revisited
each release:

- **Production deployment** — package the app as a standalone cross-platform
  desktop executable (Tauri v2) with a minifying build pipeline, so a GM never
  runs an HTTP server. (Detailed below.)

Detailed sections follow: the efficiency foundation and the spellcasting plan in
full, a "5e mechanics gaps" section covering phases 2-4 and 6-11, and the
production-deployment plan.

## Efficiency foundation (do first)

Status: **all six items shipped** (rAF batching + per-frame derived data in
`5e81fcb`, coord-indexed tiles in `e4603de`, localStorage write reduction in
`c8c31ed`, append-only travelog in `0b12576`, library memoization below).
The efficiency considerations future work should respect are summarized in
`docs/architecture.md` ("Efficiency practices").

Rationale: most collections (characters, encounters, NPCs, quests, handouts,
library templates) are small-n; their O(n)/O(n^2) scans are cheap in absolute
terms and are deliberately left alone. The real cost is concentrated in the map
canvas, the whole-campaign localStorage blob, the unbounded travelog, and the
non-memoized library merge. These items target that cost and nothing else — no
framework, virtual DOM, central store, or reactive layer is introduced; the
existing manual view fan-out stays.

### 1. Coalesce and batch canvas redraws — done

`MapCanvas.render()` used to fire on every `pointermove` during a pan and every
wheel tick, and `syncPartyMarker` (`src/app/mapWiring.js:110-120`) fires four
setters per party move.

- Done: `render()` coalesces through a single `requestAnimationFrame`
  (`src/map/MapCanvas.js:373`), so pointermove/wheel bursts and the four
  party-marker setters collapse into one redraw per frame.

### 2. Compute per-frame derived data once — done

Each `render()` used to rebuild derived data from full tile scans repeatedly
(`_revealedIds` three times per frame, `spanBlocks` and `groupImageChunks`
re-scanning all tiles).

- Done: `render()` computes `_revealedIds` and `spanBlocks` once into a `frame`
  object (`src/map/MapRenderer.js:84`) that the group/span/region passes share.

### 3. Index tiles by coordinate — done

`node.tiles` is a flat `Tile[]`; every per-tile op used to be an O(n) scan, so
a paint drag was O(cells * tiles).

- Done: `src/map/TileIndex.js` holds a WeakMap-cached id->tile / id->position
  index per node (safe because nodes are replaced immutably on every tile
  mutation); `getTile`/`setTile`/`updateTileMetadata` (`src/map/TileGrid.js`),
  `setTileRevealed` (`src/map/FogOfWar.js`), and `MapCanvas`'s inline lookups
  go through it. Paint drag is O(cells).

### 4. Reduce localStorage write cost — done (IndexedDB part deferred)

Every autosave (5s poll, `src/app/campaignActions.js:180`) used to call
`snapshotCurrentSave()`, which reloaded and re-parsed the save, then
reserialized it — plus all older snapshots, quote-escaped — into a 20-deep
single-key history ring.

- Done: the history ring stores one raw snapshot string per key with a small
  numeric index (`snapshotRawHistory`, `src/storage/SaveManager.js:253`); a
  push writes only the new string and the index, never re-serializing older
  snapshots. `snapshotPersistedSave` pushes the persisted save string as-is —
  no parse or re-serialize at all — and a snapshot identical to the newest is
  skipped. History depth reduced 20 -> 10. (The code warns near quota at
  `QUOTA_WARN_BYTES = 3 MB`.)
- Deferred: moving large tile-image blobs to IndexedDB — superseded for the
  packaged target by the production-deployment plan's file-based persistence
  (section 3 there); revisit only if the browser build hits quota in practice.

### 5. Stop rebuilding the whole travelog per event — done

`TravelogPanel` used to do `innerHTML = ''` plus a reversed copy of the entire
list on every `logEvent`. (The master list was already capped at
`TRAVELOG_LIMIT = 200` by `appendEntry`, so the real cost was the per-event
full rebuild, not unbounded growth.)

- Done: the panel builds its skeleton (empty state, list, Clear button) once;
  `update` prepends only the entries logged since the last call — computed by
  the pure `entriesAfter` helper (`src/log/Travelogue.js:48`) — and rebuilds
  from scratch only when the tracked newest id is gone (log cleared or
  replaced). Rendered rows are trimmed to `TRAVELOG_LIMIT`
  (`src/ui/TravelogPanel.js:74`).

### 6. Memoize the library `active*` getters — done

Every `active*` getter used to rebuild the defaults and re-run the merge from
scratch on each call, and each is called multiple times per library render and
picker open.

- Done: the merged active lists are built lazily into a module-level cache
  (`src/library/Library.js:360`) and reused until `setActiveLibrary`
  (`src/library/Library.js:363`) replaces the active library, which every
  mutation path (`setCustom` in `src/app/libraryWiring.js:89`, the reset
  button) already goes through — one invalidation point instead of one per
  caller. Covers `activeEquipmentEntries`, `activeWeapons`, `activeArmors`,
  `activeBestiaryEntries`, and `activeNPCEntries`; done now so the spell
  corpus (added later) is cheap from day one.

### Build order

1. Canvas rAF batching (items 1 and 2).
2. Coord-indexed tiles (item 3).
3. localStorage write reduction (item 4).
4. Travelog append-only render (item 5).
5. Library `active*` memoization (item 6).

Each item is independent; ship and commit separately. Pure logic (tile index,
merge memo) gets unit tests; canvas/travelog changes are verified visually with
Playwright. Watch the "keep files under 500 LOC" rule when touching
`MapRenderer`/`MapCanvas`.

## Spellcasting (per 5e rules)

Status: **planned, not started.**

Goal: full spell support — a pre-filled 5e spell library in the Library rail,
characters learning spells and cantrips, casting in and out of combat with
correct targeting/damage/healing, and NPC/mob casting when their class supports
it.

### Design decisions

- **Spell library scope**: a curated common set (~60-90 spells spanning all
  levels plus cantrips), each fully structured. `docs/spells-missing.md`
  documents the SRD spells not yet authored so the corpus can be filled in
  later. The schema is identical for authored and imported spells, so gaps
  close by hand-authoring or JSON import without code changes.
- **Class gating**: casters carry a real `class` field. The class drives caster
  type (full/half/third/pact), spell ability (int/wis/cha), which spell list is
  available, cantrips-known progression, and known-vs-prepared behavior.

### New data model

- `src/types/spell.ts` — `Spell`:
  - Descriptive: `id, name, level` (0 = cantrip), `school, classes[],
    castingTime, range, components, duration, concentration, ritual,
    description`.
  - Mechanics `effect`, discriminated by `kind`:
    - `attack` — spell attack roll vs AC, `damage: DamagePart[]` (reuse the
      existing type from `src/types/entities.ts`).
    - `save` — `saveAbility`, `damage`, `halfOnSave`, optional `condition`.
    - `heal` — healing dice.
    - `utility` — text only.
  - `scaling` — extra dice/targets per slot level above base; cantrips scale by
    caster level (5/11/17).
- `src/types/class.ts` + `src/entities/Classes.js` — `CLASS_TABLE`: per class →
  caster type, spell ability, spell-list id, cantrips-known curve,
  known/prepared rule, ritual flag.

### Extend existing types

- `Character` (`src/types/entities.ts`): add `class?, subclass?` and
  `spellbook: { cantrips[], known[], prepared[] }` (spell ids).
- `Encounter` and `NPC`: optional `class?`, `casterLevel?`, `spellbook?`, and
  slot pools, so foes and NPCs can cast.
- `CustomLibrary` (`src/types/library.ts`): add a fourth kind, `spells`.

### Slots

Extend `src/entities/SpellSlots.js`. The current `SLOT_TABLE` is full-caster
only; add half- and third-caster tables plus `slotsForClass(className, level)`.
`withSpellSlots` and `syncSlotsToLevel` become class-aware. Warlock pact magic
(short-rest slots at a single level) is special-cased or deferred — see
caveats.

### Pure logic

- `src/entities/Casting.js` — `castSpell(caster, spell, { slotLevel, targets,
  rng, preRoll })`:
  - Returns roll result(s) plus new caster state with the slot spent; cantrips
    spend nothing.
  - Attack spells: reuse `roll`/`attackTweak` vs target AC; crit doubles dice.
  - Save spells: target rolls the save vs DC; full or half damage via
    `rollDamage`.
  - Heal spells: healing dice applied to target via `withHP`.
  - Scaling by `slotLevel` (leveled spells) or caster level (cantrips).
  - Validates known/prepared, slot availability, and `slotLevel >= spell.level`.
- Derived helpers (in `Character.js` or `Classes.js`): save DC
  `8 + prof + abilityMod`, spell attack `prof + abilityMod`, keyed to the
  class's spell ability.
- `Character.js`: `learnSpell/unlearnSpell/learnCantrip/prepareSpell` enforcing
  class limits. `withDefaults` migration adds an empty `spellbook`; legacy
  slot-only casters keep working.

### Shared id-index helper

Spellbooks store spell ids (`known/prepared/cantrips`), so casting and spellbook
render resolve ids to `Spell` objects repeatedly — a linear `.find` over the
spell library each time. Rather than a spell-only fix, add one small generic
helper and reuse it:

- `src/util/indexById.js` (pure, unit-tested) — `indexById(items) -> Map<id,
  item>`.
- Spells: build the index once when the active library is set (piggyback on the
  library memoization from efficiency item 6); `Casting.js`, `getSpells`, and the
  spellbook UI look up through the `Map`.
- Extend the same helper to the other id-keyed collections it fits:
  - Combat: build id -> entity `Map`s for `state.encounters/characters/npcs`
    once at combat start, so the O(order * entities) defender assembly and the
    per-participant lookups in `weaponAttack` (`src/app/weaponAttack.js:45-69`)
    and the new `castSpellAction` become O(1). Small-n today, but adding NPC/mob
    casters grows the participant set and the fix is free once the helper exists.
- Not applied to the small top-level `.find` scans in the `*Wiring.js` files
  where the collection is not iterated in an inner loop — those stay as-is.

### Library rail (fourth kind: spells)

- `src/data/spells.js` — the curated `DEFAULT_SPELLS`.
- `Library.js`: merge/override by name (as NPCs do); add an `activeSpells`
  getter.
- `LibraryStore.js`: `normalizeLibrary`, export, and import include `spells`;
  files without the key default to the curated set.
- `libraryWiring.js`: a spells sub-list with reset/export. New
  `src/app/spellForm.js` + `src/ui/SpellForm.js` authoring dialog.
  `LibraryPanel.js`: a fourth list.

### Combat integration (`src/app/encounterWiring.js`)

- `castSpellAction(participant, spell)` mirroring `weaponAttack`: a pre-roll
  modal (reuse `promptModal`) picks slot level, target(s) from the defenders,
  Bless/Bane tweaks, and the target's save bonus.
- Apply results via the existing `applyDamage` / `damageCharacter` / `heal`.
- `InitiativePanel.js`: a "Cast" button plus `getSpells(participant)` and
  `onCastSpell` callbacks. `getSpells` returns the party spellbook for
  characters and the stored spellbook for foes/NPCs.

### Out-of-combat casting (`src/ui/CharacterSheet.js`)

- A new Spells section: known cantrips and prepared spells, each with a Cast
  button opening a modal (slot level, target self/ally/enemy, resolve
  damage/heal, log to the dice tray/session).
- A learn-spell picker filtered by class from `activeSpells`; prepare toggles;
  a cantrip picker — all respecting class limits.
- `partyWiring.js`: replace the yes/no "Spellcaster" select in the new-character
  flow with a class select; slots derive from the class.

### NPC / mob casting

- The encounter dialog (`encounterForm.js`) and `npcForm.js` gain an optional
  caster section: pick a class, derive slots from level, pick spells from the
  library.
- `createEncounter`/`createNPC` and `toTemplate`/`fromTemplate` carry the
  spellbook so bestiary and NPC templates persist casters.

### Styles

New `styles/spells.css` (spell cards, school color coding, cast modal, spellbook
section) added to the `style.css` manifest.

### Tests

- `Casting.test.js` — attack/save/heal/scaling/slot-spend/validation.
- `Classes.test.js` — slot tables (full/half/third), DC/attack derivation.
- `indexById.test.js` — the shared id-index helper.
- Spell merge added to `Library.test.js`; `SpellSlots` extension tests;
  `LibraryStore` migration tests.

### Docs

- `docs/spells-missing.md` — the curated-vs-full-SRD gap list.
- Updates to `docs/gm-guide.md`, the README feature list, and this file.

### Build order

(Assumes the efficiency foundation above has already shipped — the library
memoization in particular.)

1. `indexById` helper + tests; wire the spell index into the memoized active
   library.
2. Types + data: `Spell`, `Class`, `spells.js`, `Classes.js`, slot-table
   extension. Tests.
3. Character spellbook + class field + DC/attack helpers + migration. Tests.
4. Library rail spells kind (data/merge/store/wiring/form/panel).
5. `Casting.js` resolver (looks up spells via the id index). Tests.
6. Combat integration (Cast button + action + targeting); build id -> entity
   `Map`s at combat start and use them in `weaponAttack` + `castSpellAction`.
7. Out-of-combat casting + learn/prepare UI on the sheet.
8. NPC/mob casting.
9. Styles polish, docs, missing-spell doc, Playwright visual verification.

### Caveats / deferred

- **Warlock pact magic** — a distinct slot mechanic; case-handled or deferred,
  noted in the docs.
- **Concentration** — tracked as a condition (one concentration spell at a
  time); optional, likely a late phase.
- **Area targeting** — reduced to multi-select of combat participants; no map
  geometry.
- **Ritual casting / material component cost** — flagged in the data but not
  enforced initially.
- **Prerequisite**: the class/race/background foundation (gaps phase 2 below)
  ships before this. The spell plan's own "add a `class` field" step folds into
  that phase rather than duplicating it.

## 5e mechanics gaps

Prioritized fixes and new features closing the distance to the 5e ruleset.
Ordered as roadmap phases 2-4 and 6-11 (phase 1 = efficiency, phase 5 =
spellcasting, both detailed above). Current state per area is characterized
inline so the gap is explicit.

### Phase 2 — Character foundation

The spine. Today `Character` carries only `race` as a bare string and derives
proficiency bonus from level on the fly; there is no class, background, feat, or
proficiency concept (`src/types/entities.ts:163-184`, `src/entities/Character.js:178-195`).

- **Classes** — `src/data/classes.js` + `src/types/class.ts` (shared with the
  spell plan's `Classes.js`): hit die, saving-throw proficiencies, armor/weapon
  proficiency categories, skill choices, caster type/ability, subclass level,
  ASI levels (4/8/12/16/19), features-by-level scaffold. Add `class`, `subclass`
  to `Character`.
- **Races / origins** — `src/data/races.js` + `src/types/race.ts`: ability-score
  increases, size, speed, darkvision, damage resistances, innate traits/
  proficiencies. Replace the free-string `race` with a race id + a stored
  snapshot of applied traits (so a hand-typed race still round-trips).
- **Backgrounds** — `src/data/backgrounds.js`: skill/tool/language proficiencies,
  a starting feat (2024-style) or feature.
- **Proficiency lists on `Character`** — `proficiencies: { saves[], skills[],
  weapons[], armor[], tools[], languages[] }` plus `expertise[]`. Assembled from
  class + race + background; hand-editable.
- **Hit dice + CON-based HP** — max HP derived from class hit die + CON mod per
  level (average or rolled), not the current flat `hpGrowth` percentage
  (`Character.js:189-193`). Store hit dice as a spendable resource for short
  rests (feeds phase 8).
- **Level-up** — extend `addXP`/`syncSlotsToLevel` (`Character.js:178-195`) to
  grant ASI/feat choices at class ASI levels, add hit dice + HP, and unlock
  level-gated features. Migration: existing characters get an empty
  proficiency/class scaffold and keep working (race string preserved).
- Unit tests: HP-by-hit-die, proficiency assembly, level-up feature/ASI grants.

### Phase 3 — Core d20 mechanics (saves, skills, checks)

Entirely absent today: no saving throws, skills, ability checks, expertise, or
passive scores anywhere (`src/entities/Modifiers.js` offers only
`abilityModifier` and `proficiencyBonus`).

- `src/entities/Checks.js` (pure) — `savingThrow(entity, ability, dc, opts)`,
  `abilityCheck(entity, ability|skill, dc, opts)`: d20 + ability mod +
  (proficiency if proficient) + (double proficiency if expertise), vs DC, with
  advantage/disadvantage. Reuse `DiceRoller`.
- `SKILL_ABILITIES` map (18 skills to abilities). Passive score helper
  (`10 + modifiers`, e.g. passive perception).
- UI: saving-throw and skill blocks on the character sheet
  (`src/ui/CharacterSheet.js`) with proficiency/expertise dots; roll buttons
  routing to the dice tray/session log.
- Consumed by save-based spells (phase 5), condition-imposed saves (phase 6),
  and death saves (phase 8).
- Tests: `Checks.test.js` — proficiency/expertise math, advantage, passive.

### Phase 4 — Weapon properties overhaul

Today weapons collapse to `handling: 'melee'|'finesse'|'ranged'`, whose only
effect is picking STR vs DEX (`src/entities/Equipment.js:84-93`,
`src/types/entities.ts:110`). Finesse hard-selects DEX rather than "higher of
STR/DEX"; proficiency is assumed for everyone (`weaponAttack.js:124`).

- Replace `handling` with a `properties` set on the weapon type: `finesse`
  (use higher of STR/DEX), `versatile` (alt damage die two-handed),
  `two-handed`, `light`, `heavy`, `reach`, `thrown`, `ammunition`, `loading`,
  plus `category: 'simple'|'martial'`, `melee|ranged`, and `range: { normal,
  long }`. Keep `damage: DamagePart[]` (already type-aware) and migrate presets
  (`WEAPON_PRESETS`, `Equipment.js:100-203`) to the new shape with a back-compat
  reader for saved custom weapons.
- Attack resolution (`weaponAttack`, `src/app/weaponAttack.js`): finesse =
  higher mod; add proficiency only if the attacker is proficient with the
  weapon's category/type (phase 2 lists), else ability mod only; long-range
  imposes disadvantage; `light` enables the phase-7 two-weapon path.
- Tests: ability selection (finesse), proficiency gating, versatile damage.

### Phase 6 — Conditions with mechanical effect

The 16-condition picklist exists but conditions are pure display chips with an
optional round timer and zero rule effect (`src/entities/Conditions.js:9-73`,
`src/ui/ConditionsBar.js`); NPCs have no conditions field at all
(`src/types/npc.ts`).

- Model condition effects in a `CONDITION_EFFECTS` table: attacks against
  prone/restrained/paralyzed/etc. gain advantage; the afflicted's attacks/checks
  get disadvantage; incapacitated/stunned/paralyzed/unconscious remove actions
  and reactions; unconscious/paralyzed melee hits auto-crit; poisoned imposes
  disadvantage on attacks and ability checks; etc.
- Feed these into the attack path (phase 4) and check/save path (phase 3) so
  advantage/disadvantage is set by game state, not only the manual dice-tray
  toggle. Turn skipping honored by the initiative advance (`Initiative.js`).
- Add a `conditions` field to `NPC` (and give NPCs enough of a stat surface to
  matter — overlaps phase 9).
- Tests: `Conditions.test.js` — effect resolution, advantage stacking rules
  (advantage + disadvantage cancel).

### Phase 7 — Action economy & combat depth

No action economy exists — turns simply advance (`src/combat/Initiative.js:63-75`);
no reactions, bonus actions, opportunity attacks, extra attack, cover, or
distance.

- Per-turn action budget on the combat participant: action, bonus action,
  reaction, movement; reset on turn start; consumed by attacks/casts.
- Opportunity attacks (reaction-gated), two-weapon fighting (bonus-action,
  off-hand loses ability mod unless a feature says otherwise; needs `light`
  from phase 4), extra attack (from class features, phase 2), cover (+2/+5 AC
  or the disadvantage variant), range/distance-driven disadvantage (needs map
  distance between tokens).
- Sneak attack and other damage-rider class features hook the damage step.
- Largest, least foundational phase; sits late deliberately.

### Phase 8 — Survival mechanics

Dropping to 0 HP only logs a message today (`weaponAttack.js:211-214`); no
death saves, concentration checks, or exhaustion effects.

- **Death saves** — a 3-success/3-failure tracker on `Character` triggered at 0
  HP; nat 20 revives at 1 HP, nat 1 counts double, damage while down = auto
  failure (crit = two). Stabilization. UI on the sheet + initiative panel.
- **Concentration** — one concentration effect at a time (from phase 5 spells);
  taking damage forces a CON save (DC 10 or half damage) via phase 3; failure or
  a new concentration spell drops it. Ties to the `Concentrating` condition
  (phase 6).
- **Exhaustion** — six levels with cumulative penalties (2024 or 2014 variant);
  long rest removes one level.
- Tests: death-save resolution, concentration-save trigger, exhaustion penalty
  application.

### Phase 9 — NPC/mob depth

`NPC` has no HP or AC (attack code falls back to AC 10,
`weaponAttack.js:68`); `Encounter` has a flat stat block with no CR, class,
or saves (`src/types/entities.ts:38-63`, `src/entities/Modifiers.js:10-12`).

- Give `NPC` HP, AC, optional weapon/armor, and conditions so NPCs are
  first-class combatants (or converge NPC and Encounter onto a shared
  combatant shape).
- Add challenge rating to `Encounter` (drives an XP-budget encounter-difficulty
  hint) and optional save/skill proficiencies + class for caster/statblock
  enemies. Overlaps the spell plan's NPC/mob casting phase.

### Phase 10 — AC refinements

Armor is the best-modeled subsystem (weight class + dex cap + shield,
`src/entities/Equipment.js:444-472`), but a few 5e rules are missing.

- Unarmored defense formulas (Barbarian CON, Monk WIS) selected by class
  (phase 2). Configurable shield bonus (currently hard-coded +2,
  `Equipment.js:59`). Armor proficiency gating (non-proficient = disadvantage
  on STR/DEX rolls and no casting). Armor strength requirement (speed penalty)
  and stealth disadvantage flags on armor presets.

### Phase 11 — Feats library

No feats exist. After phase 2 grants feat slots:

- A feat catalog (`src/data/feats.js` + a Library rail kind, mirroring the spell
  library's fourth-kind pattern) with structured effects (ability increases,
  proficiencies, and hooks into attacks/saves/checks). Apply chosen feats to the
  character's derived stats and proficiency lists.

## Production deployment (standalone desktop app)

Ship the app as a self-contained, cross-platform desktop executable so the GM
double-clicks one file — no Python/Node, no manually run HTTP server, no browser
setup. Runs on Windows, macOS, and Linux.

### Decisions

- **Shell: Tauri v2.** The frontend renders in each OS's built-in webview inside
  a native window; Tauri serves the bundled assets over its internal `tauri://`
  protocol, so ES-module imports and relative `fetch` work exactly as they do
  over HTTP today — the "run a local server" step is gone, and nothing is served
  on a real port. Binaries land around ~5 MB because no browser runtime is
  bundled.
- **Distribution: unsigned per-OS binaries for v1.** Emit `.exe`/`.msi` (Windows),
  `.dmg`/`.app` (macOS), and `.AppImage`/`.deb` (Linux). No code signing or
  auto-update yet; document the one-time "unidentified developer" click-through
  per OS. Signing + an updater is a later upgrade (caveats below).
- **Dependency posture preserved.** The runtime stays zero-dependency: the app
  JavaScript gains no libraries, and Tauri adds no bundled runtime (it uses the
  OS webview). The new tools — a bundler, the Tauri CLI, and the Rust toolchain
  — are strictly build-time, consistent with how `tsc` and `eslint` are already
  invoked via `pnpm ... dlx`. The `file://` single-HTML fallback is recorded
  under caveats in case the Rust toolchain is ever unwanted.

### 1. Build pipeline (minify + optimize)

The dev workflow is untouched: raw ES modules served over HTTP on
`localhost:8934` for iteration. Production adds a build that emits an optimized
`dist/`.

- **Bundler: esbuild**, run via `pnpm --package=esbuild dlx esbuild` (no
  installed dependency, matching the project's dlx pattern). It bundles the ES
  module graph rooted at `src/main.js`, tree-shakes, and minifies JS.
- **CSS**: bundle and minify through the `style.css` import manifest (esbuild's
  css loader follows the `@import` chain in `styles/`), producing one minified
  stylesheet.
- **Assets**: copy `index.html`, SVG tiles, and any static art into `dist/`,
  hashing filenames for cache-busting; small SVGs may be inlined. `data:`-URL
  tile images that GMs create are runtime data, not build inputs.
- **Output target**: modern evergreen webview only (the OS webviews Tauri
  targets), so esbuild's `target` can be recent ES — smaller output, no legacy
  transpile overhead.
- Wire it as an npm script (`build`) that Tauri's config calls as its
  `beforeBuildCommand`; `distDir` points at `dist/`.

### 2. Tauri shell

- Add `src-tauri/` (Rust crate + `tauri.conf.json`): `beforeBuildCommand` = the
  esbuild build, `beforeDevCommand` = the existing dev server, `distDir`/
  `devUrl` set accordingly, window title/size/min-size, and an app icon set
  (generated with `tauri icon` from one source PNG).
- **CSP**: Tauri ships a strict Content-Security-Policy. The app is
  self-contained, but the config must allow `img-src 'self' data:` (GM tile
  images are `data:` URLs) and the `tauri:` asset origin; no external hosts are
  needed, which keeps the policy tight.
- No `http-server`/Python anywhere in the shipped product.

### 3. Storage & file-IO adapter

Three browser-only assumptions must be abstracted so they work packaged (and
still work in the dev/web build):

- **Library file load.** Today the app `fetch`es `library/campaign-library.json`
  at startup when localStorage is empty (`src/storage/LibraryStore.js:64`). In
  the packaged app there is no writable sibling folder. Bake the curated default
  library into the bundle as the fallback, and store GM overrides in the OS
  app-data directory via Tauri's fs plugin.
- **Export / import.** Replace the browser download/upload
  (`downloadLibrary`/`readLibraryFromFile`, `LibraryStore.js:80,96`) and any
  campaign save/load file paths with Tauri's native file dialog + fs plugin when
  running under Tauri.
- **Campaign persistence & the 5 MB cap.** Browser localStorage caps near 5 MB —
  already a flagged risk with map tiles and `data:` images (efficiency item 4).
  Under Tauri, persist the campaign save as a JSON (or compressed) file in
  app-data via the fs plugin, removing the quota ceiling entirely and
  superseding the IndexedDB idea from efficiency item 4 for the packaged target.
- Implement as one small `src/platform/storage.js` adapter with two backends —
  `browser` (current behavior, kept for dev and any web deployment) and `tauri`
  (fs + dialog) — selected at startup by feature-detecting the Tauri global.
  Pure adapter logic is unit-tested; the Tauri backend is smoke-tested in the
  packaged app.

### 4. Cross-platform packaging & CI

- **GitHub Actions matrix** (`windows-latest`, `macos-latest`, `ubuntu-latest`)
  running `tauri build`, each producing that OS's artifacts, attached to a
  tagged GitHub Release. macOS should build both Apple-silicon and Intel (or a
  universal binary).
- Artifacts: Windows `.msi`/`.exe`, macOS `.dmg`, Linux `.AppImage` + `.deb`.
- Unsigned: the workflow documents the per-OS bypass (macOS right-click-Open /
  Gatekeeper, Windows SmartScreen "More info -> Run anyway") in the release notes
  and README.

### 5. Ease of use

- One download per OS; double-click to run; no install of any toolchain, no
  server, no terminal.
- First run seeds the app-data dir and loads the baked-in default library.
- Sensible default window size; remembers size/position across launches.
- In-app "export campaign" / "export library" and "import" buttons use native
  file dialogs so backups and sharing are obvious.

### 6. Efficiency (production-specific)

- Minified, tree-shaken JS + minified CSS; hashed assets for cache reuse across
  launches.
- The runtime efficiency foundation (roadmap phase 1) does the heavy lifting for
  interaction performance; this build layer handles bundle size and cold-start
  load.
- File-based campaign persistence (section 3) removes the localStorage
  serialize-and-quota pressure for the desktop target.

### 7. Testing & release

- Typecheck (`tsc --noEmit`), the unit suite, and lint continue to gate via the
  existing pre-commit hook; add a CI job that also runs `tauri build` per OS so
  packaging breakage is caught.
- Smoke-test each packaged binary: launch, create/save/reload a campaign,
  export/import a library, render the map.
- Document the build + release steps in `docs/deployment.md` and update the
  README (which currently tells GMs to run `http-server`).

### Caveats / deferred

- **Unsigned binaries** trip OS trust prompts (macOS Gatekeeper, Windows
  SmartScreen). Signing + notarization is a later upgrade needing paid Apple and
  Windows certificates.
- **No auto-update** in v1 — updates are a manual re-download. A Tauri updater
  (which effectively wants signing) is deferred.
- **Build-time Rust toolchain** is required to produce binaries (CI hides this
  from contributors who only touch the frontend). If that is ever unacceptable,
  the fallback is a single self-contained `index.html` (all modules + CSS
  inlined by esbuild, default library embedded, file-IO via download/upload)
  that the GM opens directly — no executable, but also no server.
- **Webview rendering differences** across OS webviews (WebKit on macOS,
  WebView2/Chromium on Windows, WebKitGTK on Linux) require the per-OS smoke
  test; the app's plain DOM/Canvas surface keeps this risk low.
