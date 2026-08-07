import {
  getHP,
  damageCharacter,
  spendResource,
  restoreResource,
  XP_PER_LEVEL,
} from '../entities/Character.js';
import { armorClass } from '../entities/Armor.js';
import { speedNote, walkSpeed } from '../entities/Movement.js';
import { getSlotPools, getPactPool, isSlotPool, isPactPool } from '../entities/SpellSlots.js';
import { isHitDicePool } from '../entities/HitDice.js';
import { sheetDeps, sameDeps } from '../view/SheetStructure.js';
import { CONCENTRATING } from '../entities/Conditions.js';
import { drop as dropConcentration } from '../entities/Concentration.js';
import { mountConditionsBar } from './ConditionsBar.js';
import { deathSaveBlock } from './DeathSaveBlock.js';
import { mountExhaustionBar } from './ExhaustionBar.js';
import { exhaustionReadout } from '../view/ExhaustionView.js';
import { buildProgressSection } from './CharacterProgress.js';
import { buildSpellsSection } from './CharacterSpells.js';
import { buildSavesBlock, buildSkillsBlock } from './CharacterChecks.js';
import { buildStatBar, buildSlotLine } from './CharacterBars.js';
import { statBadge } from './CharacterStatBadge.js';
import { iconButton, sectionLabel, textButton, emptyState } from './buttons.js';
import { el } from './dom.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */
/** @typedef {import('../types/view.js').SheetPermissions} SheetPermissions */

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
) {
  let current = initial;

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
    const body = el('div', 'character-sheet__body', head, headSide);
    const main = el('div', 'character-sheet__col character-sheet__col--main');
    const side = el('div', 'character-sheet__col character-sheet__col--side');

    const hp = getHP(character);
    if (hp) {
      /** @type {{ before: HTMLElement, after: HTMLElement } | undefined} */
      let flank;
      if (perms.hp) {
        // Bonus HP absorbs the hit before the pool does.
        const damageButton = iconButton(
          'minus',
          `Damage ${character.name} by 1`,
          () => commit(damageCharacter(live(), 1)),
          { variant: 'danger', className: 'character-sheet__hp-step' },
        );
        const healButton = iconButton(
          'heal',
          `Heal ${character.name} by 1`,
          () => commit(restoreResource(live(), 'hp', 1)),
          { variant: 'success', className: 'character-sheet__hp-step' },
        );
        flank = { before: damageButton, after: healButton };
      }
      // This reads as "HP - [bar] + current/max +bonus". The steppers sit
      // next to the track, and the numbers sit after them on the right.
      const bar = buildStatBar(hp, {
        modifier: 'hp',
        label: 'HP',
        critical: true,
        bonus: character.bonusHP ?? 0,
        flank,
      });
      head.appendChild(el('div', 'character-sheet__hp-line u-row u-g1', bar.element));
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
      // A non-caster keeps the space the pips would take. Without this, the
      // whole sheet below the header rises when the GM selects a non-caster
      // after a caster.
      const spacer = el('span', 'slot-line slot-line--empty');
      spacer.setAttribute('aria-hidden', 'true');
      headSide.appendChild(spacer);
    }

    const acBadge = el('span', 'character-sheet__ac');
    acBadge.title =
      'Armor class: equipped body armor sets base AC + DEX per its weight class ' +
      '(light: full, medium: max +2, heavy: none); unarmored is base AC + DEX, ' +
      'or the unarmored defense of a Barbarian or a Monk when that is higher. ' +
      'A shield adds its own bonus; other equipped items add their flat bonuses.';

    const speedBadge = el('span', 'character-sheet__speed u-muted');

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
        speedBadge,
        tiredBadge,
        el(
          'span',
          'character-sheet__xp-progress u-muted',
          `XP ${character.xp} / ${character.level * XP_PER_LEVEL}`,
        ),
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
      speedBadge.title = speedNote(shown);
      const tired = exhaustionReadout(shown);
      tiredBadge.textContent = tired.badge;
      tiredBadge.title = tired.note;
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
    main.appendChild(statsList);

    // The saves and the skills read from the ability scores, the level, the
    // proficiency lists, and the equipped items, and every one of those is
    // already part of the sheet's shape. A change to any of them rebuilds the
    // sheet, so neither block is ever re-pointed. Only a viewer who can act on
    // the character gets rows that roll. A spectator sees the numbers.
    const checkOpts = onCheck && perms.play ? { onCheck } : {};
    // The six saves belong with the ability scores they derive from, so they
    // close the left column's block of numbers.
    main.appendChild(buildSavesBlock(character, checkOpts));

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
    if (progress) side.appendChild(progress);

    // HP and spell slots are managed on the always-visible head lines. Hit
    // dice are managed in the progression section. The stepper list at the
    // bottom carries only the custom pools.
    const pools = customPools(character);
    if (pools.length > 0) {
      const resources = el('div', 'character-sheet__resources u-col u-g2');
      pools.forEach((pool, index) => {
        const label = el('span', 'character-sheet__resource-label');
        const row = el('div', 'character-sheet__resource-row u-row u-g2 u-muted', label);
        writers.push(() => {
          const next = customPools(live())[index];
          if (next) label.textContent = `${next.name} ${next.current}/${next.max}`;
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
        resources.appendChild(row);
      });
      main.appendChild(resources);
    }

    // The 18 skills go in the body rather than in either column, so they span
    // the full card width and flow into as many short columns as it holds. In
    // one column they would be the longest thing on the sheet.
    const skills = buildSkillsBlock(character, checkOpts);
    skills.classList.add('character-sheet__skills');
    body.appendChild(skills);

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
      if (spellsSection) body.appendChild(spellsSection);
    }

    const conditions = el(
      'div',
      'character-sheet__conditions u-col u-g1',
      sectionLabel('Conditions'),
    );
    /**
     * Stop the character from holding the spell it was concentrating on,
     * from whichever control triggered this. Tell the host which spell
     * ended, so the creatures it affected go free.
     * @param {Character} from the character to drop it from
     */
    function endConcentration(from) {
      const held = from.concentration;
      commit(dropConcentration(from));
      if (held) spells?.onConcentrationEnd?.(from, held);
    }

    // The bar reads and reports the whole list, so it stays mounted across
    // ticks. Only its chips are rebuilt, and only when they can have changed.
    const conditionsBar = mountConditionsBar(conditions, {
      getConditions: () => current?.conditions ?? [],
      // Removing the Concentrating chip by hand means the spell ended, so
      // the state behind it must end too. Without this, the chip and the held
      // spell can disagree.
      onChange: (next) => {
        const held = live();
        const kept = next.some((c) => c.name.toLowerCase() === CONCENTRATING.toLowerCase());
        const withConditions = { ...held, conditions: next };
        if (held.concentration && !kept) endConcentration(withConditions);
        else commit(withConditions);
      },
      canEdit: () => getPermissions().play,
    });
    // This names the held spell beside the chip that marks it, with a
    // control to end it early. A caster can stop concentrating at any time.
    const concentration = el('div', 'character-sheet__concentration u-row u-wrap u-g1');
    conditions.appendChild(concentration);
    /** @type {import('../types/entities.js').ConcentrationState | null | undefined} */
    let shownConcentration;
    function renderConcentration() {
      const held = live().concentration;
      shownConcentration = held;
      concentration.replaceChildren();
      if (!held) return;
      concentration.appendChild(el('span', 'u-muted', `Concentrating on ${held.spellName}`));
      if (getPermissions().play) {
        concentration.appendChild(
          textButton('Drop', () => endConcentration(live()), {
            variant: 'danger',
            ariaLabel: `Drop concentration on ${held.spellName}`,
          }),
        );
      }
    }
    renderConcentration();
    // Exhaustion sits under the chips, because it reads as one of them even
    // though it is a level rather than an on-or-off state. The pips write
    // through the host, so the sixth level can kill and log. The bar needs no
    // writer of its own: the level is part of the sheet's shape, so a change to
    // it rebuilds the card along with the save and skill bonuses it moves.
    // The pips take the GM-only `restore` permission, not `play`: exhaustion
    // is a GM ruling, and the sixth pip kills, so a bound player only reads
    // the row. The two creature panels gate their bars the same way.
    mountExhaustionBar(conditions, {
      getEntity: () => live(),
      onSet: (level) => exhaustion?.onSet(level),
      canEdit: () => getPermissions().restore && Boolean(exhaustion),
    });
    // The death-save tracker sits under concentration and shows only while
    // the character is at 0 HP. The combat screen draws the same block from
    // the same builder, so the two surfaces cannot describe it differently.
    const dying = el('div', 'character-sheet__death-saves');
    conditions.appendChild(dying);
    /** @type {import('../types/entities.js').DeathSaveState | null | undefined} */
    let shownDeathSaves;
    function renderDeathSaves() {
      const state = live().deathSaves;
      shownDeathSaves = state;
      dying.replaceChildren();
      const block = deathSaveBlock(state, {
        name: live().name,
        canAct: getPermissions().play && Boolean(deathSaves),
        onRoll: () => deathSaves?.onRoll(),
        onStabilize: () => deathSaves?.onStabilize(),
      });
      if (block) dying.appendChild(block);
    }
    renderDeathSaves();
    side.appendChild(conditions);
    /** @type {import('../types/entities.js').Condition[]} */
    let shownConditions = character.conditions;
    writers.push(() => {
      const next = live().conditions;
      if (next !== shownConditions) {
        shownConditions = next;
        conditionsBar.update();
      }
      if (live().concentration !== shownConcentration) renderConcentration();
      if (live().deathSaves !== shownDeathSaves) renderDeathSaves();
    });

    root.appendChild(body);
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
