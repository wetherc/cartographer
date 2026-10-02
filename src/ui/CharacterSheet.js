import { getHP, damageCharacter, spendResource, restoreResource } from '../entities/Character.js';
import { xpForNextLevel } from '../entities/Experience.js';
import { armorClass } from '../entities/Armor.js';
import { speedNote, walkSpeed } from '../entities/Movement.js';
import { getSlotPools, getPactPool, isSlotPool, isPactPool } from '../entities/SpellSlots.js';
import { isHitDicePool } from '../entities/HitDice.js';
import { sheetDeps, sameDeps } from '../view/SheetStructure.js';
import { exhaustionReadout } from '../view/ExhaustionView.js';
import { d20Penalty } from '../entities/Exhaustion.js';
import { buildProgressSection } from './CharacterProgress.js';
import { buildFeaturesSection } from './CharacterFeatures.js';
import { levelUpBanner } from './CharacterLevelBanner.js';
import { abilityModifier, formatModifier } from '../entities/Modifiers.js';
import { effectiveStat } from '../entities/Stats.js';
import { passivePerception } from '../entities/Checks.js';
import { characterProficiency } from '../entities/Multiclass.js';
import { buildConditionsSection } from './CharacterConditions.js';
import { buildSpellsSection } from './CharacterSpells.js';
import { buildQuickRolls, buildSavesBlock, buildSkillsBlock } from './CharacterChecks.js';
import { buildStatBar, buildSlotLine } from './CharacterBars.js';
import { addPoolButton, poolEditButtons } from './PoolEditor.js';
import { isCustomPool, rechargeLabel } from '../entities/CustomPools.js';
import { statBadge } from './CharacterStatBadge.js';
import { iconButton, textButton, emptyState } from './buttons.js';
import { el } from './dom.js';
import { setTip } from './Tooltip.js';
import { numberField } from './formFields.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */
/** @typedef {import('../types/view.js').SheetPermissions} SheetPermissions */

/**
 * The header's XP line: the total against the start of the next level, or
 * the total alone at the top level.
 * @param {Character} character
 * @returns {string}
 */
function xpProgress(character) {
  const next = xpForNextLevel(character.level);
  return next === null ? `XP ${character.xp}` : `XP ${character.xp} / ${next}`;
}

/**
 * This returns the pools the head and the stepper list do not already own.
 * The head shows HP on its bar and spell and pact slots on the pip line.
 * Everything else here becomes a stepper row. Hit dice are the exception.
 * The progression section renders them instead.
 * @param {Character} character
 * @returns {ResourcePool[]}
 */
function customPools(character) {
  return character.resources.filter(
    (r) => r.id !== 'hp' && !isSlotPool(r) && !isPactPool(r) && !isHitDicePool(r),
  );
}

/**
 * Mount a character card. A glanceable head, with name, race, HP
 * healthbar, and spell slots, sits over the full sheet, which shows the
 * ability scores and the resource pools, HP included, with spend and
 * restore steppers. The card does not collapse. The head and body always
 * read top to bottom. The sections of the body sit in two columns, side by
 * side on a card wide enough for both, and stack in source order on a
 * narrow one. The castable-spells section spans the full width beneath them.
 *
 * The numbers a GM sets rather than a character earns are not here. Maximum
 * HP, bonus HP, unarmored base AC, and an XP grant belong to the party
 * roster's per-character controls, so the sheet reports them and the roster
 * writes them.
 *
 * The sheet shows an empty state when no character is selected (`null`).
 * `getPermissions` scopes what the viewer can touch. Without `play`, the
 * pool steppers and condition controls disappear, for a spectator's view of
 * the sheet. The HP damage and heal steppers also require `hp`. Putting a
 * spent spell slot or pool point back requires `restore`. All three are
 * GM-only, since damage, healing, and recovery are adjudicated, not
 * self-served. `editBase` still reaches the progression section.
 *
 * The sheet builds once and then re-points. A change that leaves its shape
 * unchanged, for example any pool level, bonus HP, base AC, the name, or
 * the conditions, writes into the elements already on screen. Only a
 * change of shape rebuilds it. See `view/SheetStructure.js` for what
 * counts as shape.
 * @param {HTMLElement} container
 * @param {Character | null} initial
 * @param {(character: Character) => void} [onChange]
 * @param {() => SheetPermissions} [getPermissions]
 * @param {{
 *   resolveSpells: (ids: string[]) => import('../types/spell.js').Spell[],
 *   onCast: (character: Character, spell: import('../types/spell.js').Spell) => void,
 *   catalogStamp?: () => unknown,
 *   onConcentrationEnd?: (
 *     character: Character,
 *     held: import('../types/entities.js').ConcentrationState,
 *   ) => void,
 * } | null} [spells]
 *   If `spells` is set, the sheet renders a read-only castable-spells
 *   section, with cantrips and prepared spells, each opening a Cast or
 *   Close detail. Learning and preparing spells live in the Spellbook tab.
 *   If `spells` is omitted, no such section appears. `catalogStamp`
 *   returns a value that changes whenever the spell catalog that
 *   `resolveSpells` reads also changes. This makes a library edit rebuild
 *   the section instead of leaving the pre-edit spell on screen.
 *   `onConcentrationEnd` runs when the caster stops holding a spell from
 *   this sheet, with the spell they were holding. The sheet owns only one
 *   character, so the host must remove the effect from the creatures that
 *   spell was affecting.
 * @param {(message: string) => void} [notify]
 *   This is a non-blocking surface for progression results, for example
 *   hit-die heals and level-up feature announcements. The host passes its
 *   toast stack.
 * @param {import('./CharacterChecks.js').CheckHandler | null} [onCheck]
 *   This runs when a save or skill row is clicked, with the kind of roll and
 *   the key that names it. Without it, the two blocks report their bonuses
 *   and roll nothing.
 * @param {{ onRoll: () => void, onStabilize: () => void } | null} [deathSaves]
 *   The two controls of the death-save block, which shows only while the
 *   character is at 0 HP. Both write through the host, not through the sheet:
 *   a death save throws the dice tray and lands in the log, which the sheet
 *   cannot reach. Without them, the block still shows its pips and offers no
 *   controls.
 * @param {{ onSet: (level: number) => void } | null} [exhaustion]
 *   The write behind the exhaustion pips. It goes through the host for the same
 *   reason a death save does: the sixth level kills, and the write that kills
 *   also logs. Without it, the pips are read-only.
 * @param {{ onStep: (amount: number, isHeal: boolean) => void } | null} [hpStep]
 *   The write behind the HP steppers. It goes through the host, because a
 *   step to 0 HP starts the death-save tracker, a step on a character at 0
 *   HP costs a death save, and a step on a concentrating character calls for
 *   the CON save, all of which log. Without it, the steppers change the HP
 *   pool alone.
 * @param {(() => void) | null} [openFull]
 *   Opens the full-page sheet. The Level up button of the banner calls it
 *   first, so the GM lands on the Progression section of the full sheet,
 *   where the improvement and feature choices are. Without it, the banner
 *   stays in the card it was built in.
 * @returns {{ getCharacter: () => Character | null, setCharacter: (character: Character | null) => void }}
 */
export function mountCharacterSheet(
  container,
  initial,
  onChange = () => {},
  getPermissions = () => ({ editBase: true, play: true, hp: true, restore: true }),
  spells = null,
  notify = () => {},
  onCheck = null,
  deathSaves = null,
  exhaustion = null,
  hpStep = null,
  openFull = null,
) {
  let current = initial;
  // The HP amount field is rebuilt on each render. This value refills it,
  // so a GM who types 7 can press Heal again without typing it twice.
  let hpAmount = 1;

  const root = el('div', 'character-sheet');
  container.appendChild(root);

  /**
   * The character every event handler works from. Handlers outlive the render
   * that created them now, so they must read the live value rather than close
   * over the one that was current when they were built.
   * @returns {Character}
   */
  const live = () => /** @type {Character} */ (current);

  /** @param {Character} next */
  function commit(next) {
    current = next;
    onChange(next);
    render();
  }

  /**
   * The progression section of the last build. The level-up banner moves
   * focus to it when the next step is an improvement or a feature choice.
   * @type {HTMLElement | null}
   */
  let progressSection = null;

  /**
   * Mark a piece of the sheet for the full sheet alone. The sidebar card is
   * the summary, and sheet-summary.css hides these pieces there. The same DOM
   * moves between the two places, so the mark is a class, not a second build.
   * @template {HTMLElement} T
   * @param {T} node
   * @returns {T}
   */
  const fullOnly = (node) => {
    node.classList.add('sheet-full-only');
    return node;
  };

  /** The structure the DOM currently reflects, and how to re-point it. */
  /** @type {unknown[] | null} */
  let builtDeps = null;
  /** @type {(() => void) | null} */
  let repoint = null;

  function render() {
    const character = current;
    if (!character) {
      builtDeps = null;
      repoint = null;
      root.innerHTML = '';
      root.appendChild(emptyState('No character selected.'));
      return;
    }
    const perms = getPermissions();
    const deps = sheetDeps(character, perms, spells?.catalogStamp?.());
    if (repoint && sameDeps(builtDeps, deps)) {
      repoint();
      return;
    }
    root.innerHTML = '';
    repoint = build(character, perms);
    builtDeps = deps;
    repoint();
  }

  /**
   * Build the whole card for a character whose shape is new, returning the
   * function that writes the current values into it.
   * @param {Character} character
   * @param {SheetPermissions} perms
   * @returns {() => void}
   */
  function build(character, perms) {
    /** The value writers collected while building, run in order on every tick. */
    /** @type {(() => void)[]} */
    const writers = [];

    const name = el('span', 'character-sheet__name');
    writers.push(() => {
      name.textContent = live().name;
    });

    // The top line shows name and race. The HP bar and the spell-slot pips
    // each get a full-width line below it, so both read at a glance.
    const summary = el(
      'div',
      'character-sheet__summary u-col u-g1',
      el(
        'span',
        'character-sheet__summary-top u-row u-g2',
        name,
        character.race && el('span', 'character-sheet__race', character.race),
      ),
    );

    // Two headline blocks lead the sheet, one per column. The name sits
    // over the HP bar on the left. The level, AC, and XP banner sits over
    // the spell-slot pips on the right. On a wide card, they read across
    // from each other, line for line.
    const head = el('div', 'character-sheet__head u-col u-g1', summary);
    const headSide = el('div', 'character-sheet__head-side u-col u-g1');

    // Under them, the body lays its sections out in two columns. One
    // column holds the numbers a player reads constantly: XP, the HP and
    // AC fields, ability scores, and pools. The other holds the state that
    // moves during play: progression and conditions. Below the width where
    // both columns keep a readable measure, everything stacks in the order
    // it is appended here. Castable spells go in the body and span both
    // columns, since a caster's list needs the whole width.
    const levelBanner = levelUpBanner(character, {
      editBase: perms.editBase,
      live,
      onCommit: commit,
      notify,
      getProgress: () => progressSection,
      openFull,
    });
    const body = el('div', 'character-sheet__body', head, headSide);
    const main = el('div', 'character-sheet__col character-sheet__col--main');
    const side = el('div', 'character-sheet__col character-sheet__col--side');

    const hp = getHP(character);
    if (hp) {
      /** @type {HTMLElement | null} */
      let controls = null;
      if (perms.hp) {
        // The amount field sets how many HP each step button moves, so a big
        // hit or heal is one click. An empty or bad entry counts as 1.
        const amountInput = numberField(hpAmount, { min: 1 });
        amountInput.classList.add('character-sheet__hp-amount');
        amountInput.setAttribute('aria-label', `HP amount for ${character.name}`);
        const amount = () => (hpAmount = Math.max(1, Math.floor(Number(amountInput.value)) || 1));
        // Bonus HP absorbs the hit before the pool does.
        const damageButton = textButton(
          'Damage',
          () =>
            hpStep ? hpStep.onStep(amount(), false) : commit(damageCharacter(live(), amount())),
          {
            icon: 'minus',
            variant: 'danger',
            className: 'character-sheet__hp-step',
            ariaLabel: `Damage ${character.name}`,
          },
        );
        const healButton = textButton(
          'Heal',
          () =>
            hpStep
              ? hpStep.onStep(amount(), true)
              : commit(restoreResource(live(), 'hp', amount())),
          {
            icon: 'heal',
            variant: 'success',
            className: 'character-sheet__hp-step',
            ariaLabel: `Heal ${character.name}`,
          },
        );
        controls = el(
          'div',
          'character-sheet__hp-controls u-row u-g2',
          damageButton,
          amountInput,
          healButton,
        );
      }
      // The HP block reads top to bottom: the label and the numbers, a tall
      // bar the width of the card, then the damage and heal buttons with the
      // amount between them. A GM reads the bar from across the table.
      const bar = buildStatBar(hp, {
        modifier: 'hp',
        label: 'HP',
        critical: true,
        bonus: character.bonusHP ?? 0,
        hero: true,
      });
      head.appendChild(el('div', 'character-sheet__hp-line u-col u-g2', bar.element, controls));
      writers.push(() => {
        const pool = getHP(live());
        if (pool) bar.update(pool, live().bonusHP ?? 0);
      });
    }

    const pact = getPactPool(character);
    const slots = [...getSlotPools(character), ...(pact ? [pact] : [])];
    if (slots.length > 0) {
      const line = buildSlotLine(
        slots,
        perms.play
          ? (pool, spent) =>
              commit(
                spent ? spendResource(live(), pool.id, 1) : restoreResource(live(), pool.id, 1),
              )
          : null,
        perms.restore,
      );
      // The pips ride under the banner, which puts them across from the HP bar.
      headSide.appendChild(line.element);
      writers.push(() => {
        const next = live();
        const nextPact = getPactPool(next);
        line.update([...getSlotPools(next), ...(nextPact ? [nextPact] : [])]);
      });
    } else {
      // In the two-column sheet, a non-caster keeps the space the pips would
      // take. Without this, the whole sheet below the header rises when the
      // GM selects a non-caster after a caster. The stacked sheet hides the
      // spacer (widgets.css).
      const spacer = el('span', 'slot-line slot-line--empty');
      spacer.setAttribute('aria-hidden', 'true');
      headSide.appendChild(spacer);
    }

    const acBadge = tipBadge(
      el('span', 'character-sheet__ac'),
      'Armor class: equipped body armor sets base AC + DEX per its weight class ' +
        '(light: full, medium: max +2, heavy: none); unarmored is base AC + DEX, ' +
        'or the unarmored defense of a Barbarian or a Monk when that is higher. ' +
        'A shield adds its own bonus; other equipped items add their flat bonuses.',
    );

    const speedBadge = el('span', 'character-sheet__speed u-muted');
    // Initiative, passive Perception, and the proficiency bonus are the other
    // numbers a GM asks for in play, so they join AC and speed on one line.
    const initBadge = el('span', 'character-sheet__init u-muted');
    const ppBadge = el('span', 'character-sheet__pp u-muted');
    tipBadge(ppBadge, 'Passive Perception');
    const profBadge = el('span', 'character-sheet__prof u-muted');
    tipBadge(profBadge, 'Proficiency bonus');

    // A penalty that reaches every d20 roll belongs in the headline, not only
    // beside the conditions. The badge is empty at level 0, which is where most
    // characters sit, so the line reads as it did before exhaustion existed.
    const tiredBadge = el('span', 'character-sheet__exhaustion');

    // Level, derived AC, and XP progress share one banner line, the first line
    // of the right-hand headline block.
    const banner = el(
      'div',
      'character-sheet__header',
      el('span', '', `Level ${character.level}`),
      el(
        'span',
        'character-sheet__header-meta u-muted',
        acBadge,
        initBadge,
        speedBadge,
        ppBadge,
        profBadge,
        tiredBadge,
        el('span', 'character-sheet__xp-progress u-muted', xpProgress(character)),
      ),
    );
    // The banner is built after the pip line but reads above it.
    headSide.prepend(banner);
    body.append(main, side);
    // An edit to base AC does not change the sheet's shape, so the derived
    // badge must follow it.
    writers.push(() => {
      const shown = live();
      acBadge.textContent = `AC ${armorClass(shown)}`;
      // Speed follows a STR edit as well, because armor too heavy for the
      // wearer costs 10 feet.
      speedBadge.textContent = `${walkSpeed(shown)} ft`;
      // Initiative rolls with the exhaustion penalty, as in rollInitiative.
      const dex = abilityModifier(effectiveStat(shown, 'dex').total);
      const tiredInit = d20Penalty(shown);
      initBadge.textContent = `Init ${formatModifier(dex + tiredInit)}`;
      tipBadge(
        initBadge,
        tiredInit
          ? `Initiative bonus: DEX modifier ${formatModifier(dex)}, exhaustion ${tiredInit}`
          : 'Initiative bonus (DEX modifier)',
      );
      ppBadge.textContent = `PP ${passivePerception(shown)}`;
      profBadge.textContent = `Prof ${formatModifier(characterProficiency(shown))}`;
      tipBadge(speedBadge, speedNote(shown));
      const tired = exhaustionReadout(shown);
      tiredBadge.textContent = tired.badge;
      tipBadge(tiredBadge, tired.badge && tired.note);
      tiredBadge.classList.toggle('character-sheet__exhaustion--fatal', tired.fatal);
    });

    const statsList = el('div', 'character-sheet__stats');
    // Each ability shows as one d20-style badge with the effective score,
    // base plus equipped-item buffs, over its derived modifier. This is
    // the number a player rolls with. The base and every contributing
    // source sit one click away, in the breakdown popover. This answers
    // the common question "what is my STR" at a glance, without the need
    // to parse "16 = 18 +4". Scores are no longer edited inline. A
    // dedicated character or level-up editor owns that. Stats and
    // equipment are both part of the sheet's shape, so a badge is never
    // re-pointed. It is rebuilt when its score can have moved.
    for (const key of Object.keys(character.stats)) {
      statsList.appendChild(statBadge(character, key));
    }
    main.appendChild(fullOnly(statsList));

    // The saves and the skills read from the ability scores, the level, the
    // proficiency lists, and the equipped items, and every one of those is
    // already part of the sheet's shape. A change to any of them rebuilds the
    // sheet, so neither block is ever re-pointed. Only a viewer who can act on
    // the character gets rows that roll. A spectator sees the numbers.
    const checkOpts = onCheck && perms.play ? { onCheck } : {};
    // The six saves belong with the ability scores they derive from, so they
    // close the left column's block of numbers.
    main.appendChild(fullOnly(buildSavesBlock(character, checkOpts)));
    // The summary card rolls the same checks and saves from one compact grid
    // in place of the badges and the save list.
    const quick = buildQuickRolls(character, checkOpts);
    quick.classList.add('sheet-summary-only');
    main.appendChild(quick);

    // The progression section owns classes, pending levels and
    // improvements, features, and hit dice. It returns null for a
    // classless legacy character. It reads the live character, not a
    // snapshot, since a hit-die spend must heal the HP that the head can
    // have changed since.
    const progress = buildProgressSection(live, {
      editBase: perms.editBase,
      play: perms.play,
      onCommit: commit,
      notify,
    });
    if (progress) side.appendChild(fullOnly(progress));

    // HP and spell slots are managed on the always-visible head lines. Hit
    // dice are managed in the progression section. The stepper list at the
    // bottom carries only the custom pools.
    const pools = customPools(character);
    if (pools.length > 0 || perms.editBase) {
      const resources = el('div', 'character-sheet__resources u-col u-g2');
      pools.forEach((pool, index) => {
        const label = el('span', 'character-sheet__resource-label');
        const row = el('div', 'character-sheet__resource-row u-row u-g2 u-muted', label);
        writers.push(() => {
          const next = customPools(live())[index];
          if (next)
            label.textContent = `${next.name} ${next.current}/${next.max} (${rechargeLabel(next)})`;
        });

        if (perms.play) {
          row.appendChild(
            iconButton(
              'minus',
              `Spend one ${pool.name}`,
              () => commit(spendResource(live(), pool.id, 1)),
              { variant: 'danger' },
            ),
          );
        }
        // A player can spend a pool point. Only the GM can restore one,
        // the same rule as spell slots.
        if (perms.restore) {
          row.appendChild(
            iconButton(
              'plus',
              `Restore one ${pool.name}`,
              () => commit(restoreResource(live(), pool.id, 1)),
              { variant: 'success' },
            ),
          );
        }
        if (perms.editBase && isCustomPool(pool))
          row.append(...poolEditButtons(pool, live, commit).map(fullOnly));
        resources.appendChild(row);
      });
      if (perms.editBase)
        resources.appendChild(fullOnly(el('div', 'u-row', addPoolButton(live, commit))));
      main.appendChild(pools.length > 0 ? resources : fullOnly(resources));
    }

    // The 18 skills go in the body rather than in either column, so they span
    // the full card width and flow into as many short columns as it holds. In
    // one column they would be the longest thing on the sheet.
    const skills = buildSkillsBlock(character, checkOpts);
    skills.classList.add('character-sheet__skills');
    body.appendChild(skills);

    // The feature cards span the full width under the skills, so the grid
    // takes as many card columns as the sheet is wide.
    const features = buildFeaturesSection(live, { editBase: perms.editBase, onCommit: commit });
    if (features) body.appendChild(fullOnly(features));

    // This is a read-only list of castable spells grouped by level, each
    // opening a Cast or Close detail. It shows only for casters, since the
    // builder returns null otherwise, and only when the host wires in
    // spell callbacks. It sits in the body, not in either column, so it
    // spans the full card width beneath them.
    if (spells) {
      const spellsSection = buildSpellsSection(character, {
        play: perms.play,
        resolveSpells: spells.resolveSpells,
        onCast: (spell) => spells.onCast(live(), spell),
      });
      if (spellsSection) body.appendChild(fullOnly(spellsSection));
    }

    const conditions = buildConditionsSection(character, {
      live,
      commit,
      getPermissions,
      onConcentrationEnd: spells?.onConcentrationEnd,
      exhaustion,
      deathSaves,
    });
    side.appendChild(conditions.element);
    writers.push(conditions.write);

    if (levelBanner) root.appendChild(levelBanner);
    root.appendChild(body);
    progressSection = progress;
    return () => {
      for (const write of writers) write();
    };
  }

  render();
  return {
    getCharacter: () => current,
    /** Sync an externally updated character, for example from a sibling panel, and rerender. */
    setCharacter: (next) => {
      current = next;
      render();
    },
  };
}

/**
 * Give a headline badge a tooltip and put it in the Tab order, so a keyboard
 * user reads the same hint that a hover shows. A badge with no hint, such as
 * the empty exhaustion badge at level 0, leaves the Tab order.
 * @param {HTMLElement} badge
 * @param {string} text
 * @returns {HTMLElement}
 */
function tipBadge(badge, text) {
  setTip(badge, text);
  if (text) badge.tabIndex = 0;
  else badge.removeAttribute('tabindex');
  return badge;
}
