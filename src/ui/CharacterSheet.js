import {
  addXP,
  getHP,
  setMaxHP,
  setBonusHP,
  setBaseAC,
  damageCharacter,
  spendResource,
  restoreResource,
  XP_PER_LEVEL,
} from '../entities/Character.js';
import { armorClass } from '../entities/Equipment.js';
import { getSlotPools, getPactPool, isSlotPool, isPactPool } from '../entities/SpellSlots.js';
import { isHitDicePool } from '../entities/HitDice.js';
import { sheetDeps, sameDeps } from '../view/SheetStructure.js';
import { mountConditionsBar } from './ConditionsBar.js';
import { buildProgressSection } from './CharacterProgress.js';
import { buildSpellsSection } from './CharacterSpells.js';
import { buildStatBar, buildSlotLine } from './CharacterBars.js';
import { statBadge } from './CharacterStatBadge.js';
import { iconButton, textButton, emptyState } from './buttons.js';
import { el } from './dom.js';
import { numberField } from './formFields.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */

/**
 * The pools the head and the stepper list own between them: HP on its bar,
 * spell and pact slots on the pip line, and everything else as a stepper row.
 * Hit dice are the exception, rendered by the progression section instead.
 * @param {Character} character
 * @returns {ResourcePool[]}
 */
function customPools(character) {
  return character.resources.filter(
    (r) => r.id !== 'hp' && !isSlotPool(r) && !isPactPool(r) && !isHitDicePool(r),
  );
}

/**
 * Mount a character card: a glanceable head (name / race / HP healthbar / spell
 * slots) over the full sheet — XP control, ability scores, and resource pools
 * (HP included) with spend/restore steppers. The card does not collapse; the
 * head and body always read top to bottom.
 * Renders an empty state when no character is selected (`null`).
 * `getPermissions` scopes what the viewer may touch: without `editBase` the
 * stats and XP render read-only, without `play` the pool steppers and
 * condition controls disappear too (a spectator's view of the sheet), and the
 * HP damage/heal steppers additionally require `hp` (GM-only — damage and
 * healing are adjudicated, not self-served).
 *
 * The sheet is built once and then re-pointed: a change that leaves its shape
 * alone (any pool level, bonus HP, base AC, the name, the conditions) writes
 * into the elements already on screen, and only a change of shape rebuilds. See
 * `view/SheetStructure.js` for what counts as shape.
 * @param {HTMLElement} container
 * @param {Character | null} initial
 * @param {(character: Character) => void} [onChange]
 * @param {() => { editBase: boolean, play: boolean, hp: boolean }} [getPermissions]
 * @param {{
 *   resolveSpells: (ids: string[]) => import('../types/spell.js').Spell[],
 *   onCast: (character: Character, spell: import('../types/spell.js').Spell) => void,
 * } | null} [spells]
 *   When provided, the sheet renders a read-only castable-spells section
 *   (cantrips and prepared spells, each opening a Cast/Close detail); learning
 *   and preparing live in the Spellbook tab. Omitted, no such section appears.
 * @param {(message: string) => void} [notify]
 *   Non-blocking surface for progression results (hit-die heals, level-up
 *   feature announcements); the host passes its toast stack.
 * @returns {{ getCharacter: () => Character | null, setCharacter: (character: Character | null) => void }}
 */
export function mountCharacterSheet(
  container,
  initial,
  onChange = () => {},
  getPermissions = () => ({ editBase: true, play: true, hp: true }),
  spells = null,
  notify = () => {},
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
    const deps = sheetDeps(character, perms);
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
   * @param {{ editBase: boolean, play: boolean, hp: boolean }} perms
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

    // Top line: name / race. The HP bar and the spell-slot pips get a
    // full-width line each below it, so both read at a glance.
    const summary = el(
      'div',
      'character-sheet__summary',
      el(
        'span',
        'character-sheet__summary-top',
        name,
        character.race && el('span', 'character-sheet__race', character.race),
      ),
    );

    // Name, HP bar, and slot pips sit in the always-visible head; the sheet no
    // longer collapses, so the body's stats follow directly beneath.
    const head = el('div', 'character-sheet__head', summary);

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
      // Reads "HP  - [bar] +  current/max +bonus": steppers hug the track,
      // the numbers sit after them on the right.
      const bar = buildStatBar(hp, {
        modifier: 'hp',
        label: 'HP',
        critical: true,
        bonus: character.bonusHP ?? 0,
        flank,
      });
      head.appendChild(el('div', 'character-sheet__hp-line', bar.element));
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
      );
      head.appendChild(line.element);
      writers.push(() => {
        const next = live();
        const nextPact = getPactPool(next);
        line.update([...getSlotPools(next), ...(nextPact ? [nextPact] : [])]);
      });
    }

    const body = el('div', 'character-sheet__body');

    const acBadge = el('span', 'character-sheet__ac');
    acBadge.title =
      'Armor class: equipped body armor sets base AC + DEX per its weight class ' +
      '(light: full, medium: max +2, heavy: none); unarmored is base AC + DEX. ' +
      'Shields add +2; other equipped items add their flat bonuses.';

    // Level, derived AC, and XP progress share the section header line; the
    // controls below are laid out like stat rows, so their inputs line up
    // with the ability-score inputs underneath them.
    body.appendChild(
      el(
        'div',
        'character-sheet__header',
        el('span', '', `Level ${character.level}`),
        el(
          'span',
          'character-sheet__header-meta',
          acBadge,
          el(
            'span',
            'character-sheet__xp-progress',
            `XP ${character.xp} / ${character.level * XP_PER_LEVEL}`,
          ),
        ),
      ),
    );
    // Base AC is edited without changing the sheet's shape, so the derived
    // badge has to follow it.
    writers.push(() => {
      acBadge.textContent = `AC ${armorClass(live())}`;
    });

    /**
     * A labeled numeric row sharing the stat rows' key/input geometry.
     * @param {string} key
     * @param {number} value
     * @param {string} ariaLabel
     * @param {(value: number) => void} onCommit fires on change with the parsed value
     * @returns {{ row: HTMLElement, input: HTMLInputElement }}
     */
    function buildFieldRow(key, value, ariaLabel, onCommit) {
      const input = numberField(value, {
        min: 0,
        className: 'character-sheet__stat-input',
        ariaLabel,
      });
      input.addEventListener('change', () => onCommit(Number(input.value)));
      const row = el(
        'div',
        'character-sheet__field-row',
        el('span', 'character-sheet__stat-key', key),
        input,
      );
      return { row, input };
    }

    /**
     * Follow a field's value when it changes elsewhere, without overwriting a
     * number the viewer is part-way through typing.
     * @param {HTMLInputElement} input
     * @param {() => number} read
     */
    function followField(input, read) {
      writers.push(() => {
        if (document.activeElement === input) return;
        input.value = String(read());
      });
    }

    // The XP award is an action (input + button), so it stays on its own full
    // width row above the aligned field grid rather than in it.
    if (perms.editBase) {
      const { row: xpRow, input: xpInput } = buildFieldRow('XP', 0, 'XP to add', () => {});
      xpRow.classList.add('character-sheet__xp-row');
      const xpButton = textButton(
        'XP',
        () => {
          const amount = Number(xpInput.value);
          if (amount > 0) commit(addXP(live(), amount));
        },
        { icon: 'add' },
      );
      xpRow.appendChild(xpButton);
      body.appendChild(xpRow);
    }

    // The editable HP/AC fields sit in a grid that mirrors the ability-score
    // grid below, so their keys and inputs line up in the same columns.
    const fields = el('div', 'character-sheet__fields');

    // The GM's per-character max HP override; current HP clamps down if the
    // new maximum is below it.
    if (perms.editBase && hp) {
      const { row } = buildFieldRow('MAX HP', hp.max, `Maximum HP for ${character.name}`, (value) =>
        commit(setMaxHP(live(), value)),
      );
      fields.appendChild(row);
    }

    // Bonus HP from items/boons, tracked on top of the intrinsic pool; damage
    // drains it first. Editable by anyone who can play the character.
    if (perms.play && hp) {
      const { row, input } = buildFieldRow(
        'BONUS HP',
        character.bonusHP ?? 0,
        `Bonus HP for ${character.name}`,
        (value) => commit(setBonusHP(live(), value)),
      );
      fields.appendChild(row);
      // Damage drains bonus HP, so the field moves without being edited.
      followField(input, () => live().bonusHP ?? 0);
    }

    // Unarmored base AC, normally 10; effects like Mage Armor raise it. Only
    // in play while no body armor is equipped.
    if (perms.play) {
      const { row, input } = buildFieldRow(
        'BASE AC',
        character.baseAC ?? 10,
        `Unarmored base AC for ${character.name}`,
        (value) => commit(setBaseAC(live(), value)),
      );
      fields.appendChild(row);
      followField(input, () => live().baseAC ?? 10);
    }

    if (fields.children.length > 0) body.appendChild(fields);

    const statsList = el('div', 'character-sheet__stats');
    // Each ability reads as one d20-style badge showing the *effective* score
    // (base plus equipped-item buffs) over its derived modifier — the number a
    // player actually rolls with. The base and every contributing source live
    // one click away in the breakdown popover, so the common "what's my STR?"
    // question is answered at a glance without parsing "16 = 18 +4". Scores are
    // no longer edited inline; a dedicated character/level-up editor owns that.
    // Stats and equipment are both part of the sheet's shape, so a badge never
    // has to be re-pointed: it is rebuilt when its score can have moved.
    for (const key of Object.keys(character.stats)) {
      statsList.appendChild(statBadge(character, key));
    }
    body.appendChild(statsList);

    // Classes, pending levels/improvements, features, and hit dice: the
    // progression section owns them (null for a classless legacy character).
    // It reads the live character rather than a snapshot, because a hit-die
    // spend has to heal the HP the head may have changed since.
    const progress = buildProgressSection(live, {
      editBase: perms.editBase,
      play: perms.play,
      onCommit: commit,
      notify,
    });
    if (progress) body.appendChild(progress);

    // HP and spell slots are managed on the always-visible head lines, and hit
    // dice in the progression section, so the stepper list at the bottom only
    // carries the custom pools.
    const pools = customPools(character);
    if (pools.length > 0) {
      const resources = el('div', 'character-sheet__resources');
      pools.forEach((pool, index) => {
        const label = el('span', 'character-sheet__resource-label');
        const row = el('div', 'character-sheet__resource-row', label);
        writers.push(() => {
          const next = customPools(live())[index];
          if (next) label.textContent = `${next.name} ${next.current}/${next.max}`;
        });

        if (perms.play) {
          row.append(
            iconButton(
              'minus',
              `Spend one ${pool.name}`,
              () => commit(spendResource(live(), pool.id, 1)),
              { variant: 'danger' },
            ),
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
      body.appendChild(resources);
    }

    // Read-only castable spells: cantrips and prepared spells, each opening a
    // Cast/Close detail. Only for casters (the builder returns null otherwise)
    // and only when the host wired spell callbacks in.
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
      'character-sheet__conditions',
      el('span', 'section-label', 'Conditions'),
    );
    // The bar reads and reports the whole list, so it stays mounted across
    // ticks; only its chips are rebuilt, and only when they can have changed.
    const conditionsBar = mountConditionsBar(conditions, {
      getConditions: () => current?.conditions ?? [],
      onChange: (next) => commit({ ...live(), conditions: next }),
      canEdit: () => getPermissions().play,
    });
    body.appendChild(conditions);
    /** @type {import('../types/entities.js').Condition[]} */
    let shownConditions = character.conditions;
    writers.push(() => {
      const next = live().conditions;
      if (next === shownConditions) return;
      shownConditions = next;
      conditionsBar.update();
    });

    root.append(head, body);
    return () => {
      for (const write of writers) write();
    };
  }

  render();
  return {
    getCharacter: () => current,
    /** Sync in an externally-updated character (e.g. from a sibling panel) and re-render. */
    setCharacter: (next) => {
      current = next;
      render();
    },
  };
}
