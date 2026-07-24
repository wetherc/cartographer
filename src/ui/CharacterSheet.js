import {
  setStat,
  addXP,
  getHP,
  setMaxHP,
  setBonusHP,
  damageCharacter,
  spendResource,
  restoreResource,
  XP_PER_LEVEL,
} from '../entities/Character.js';
import { armorClass } from '../entities/Equipment.js';
import { getSlotPools, isSlotPool, slotLevelOf } from '../entities/SpellSlots.js';
import { abilityModifier, formatModifier } from '../entities/Modifiers.js';
import { wireDisclosure } from './Disclosure.js';
import { mountConditionsBar } from './ConditionsBar.js';
import { icon } from './icons.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */

/**
 * Build a stat bar (HP) shown on the collapsed card, one full-width line per
 * pool: a visible label, the fill track, and the numbers. Absence of the pool
 * (older saves) renders no bar rather than a fake full one.
 * @param {ResourcePool} pool
 * @param {{ modifier: string, label: string, critical?: boolean, bonus?: number }} opts
 *   `modifier` selects the fill colour; `critical` arms the low-fill red
 *   state; `bonus` appends a "+N" readout for temporary points on top of the
 *   pool (bonus HP).
 * @returns {HTMLElement}
 */
function buildStatBar(pool, opts) {
  const wrap = document.createElement('span');
  wrap.className = 'stat-bar';
  wrap.setAttribute('role', 'img');
  const bonusReadout = opts.bonus ? `, plus ${opts.bonus} bonus` : '';
  wrap.setAttribute('aria-label', `${opts.label} ${pool.current} of ${pool.max}${bonusReadout}`);

  const label = document.createElement('span');
  label.className = 'stat-bar__label';
  label.textContent = opts.label;
  wrap.appendChild(label);

  const track = document.createElement('span');
  track.className = 'stat-bar__track';
  const fill = document.createElement('span');
  fill.className = `stat-bar__fill stat-bar__fill--${opts.modifier}`;
  const ratio = pool.max > 0 ? pool.current / pool.max : 0;
  fill.style.width = `${Math.round(ratio * 100)}%`;
  if (opts.critical && ratio <= 0.25) fill.classList.add('stat-bar__fill--critical');
  track.appendChild(fill);

  const text = document.createElement('span');
  text.className = 'stat-bar__text';
  text.textContent = `${pool.current}/${pool.max}`;
  wrap.append(track, text);

  if (opts.bonus) {
    const bonus = document.createElement('span');
    bonus.className = 'stat-bar__bonus';
    bonus.textContent = `+${opts.bonus}`;
    bonus.title = 'Bonus HP';
    wrap.appendChild(bonus);
  }
  return wrap;
}

/**
 * Compact spell-slot readout: a column per spell level, the ordinal centered
 * above a two-wide grid of pips, filled pips being the slots still unspent.
 * Columns wrap under the pip area (not the label) when a high-level caster
 * outgrows the card width. With `onToggle` each pip is a button: clicking a
 * filled pip spends a slot of that level, clicking an empty one restores one
 * (slots drain and refill left to right, so it reads as toggling that pip).
 * Without it (a spectator's view) the line is a plain readout.
 * A non-caster (no slot pools) renders nothing.
 * @param {import('../types/entities.js').ResourcePool[]} pools
 * @param {((pool: import('../types/entities.js').ResourcePool, spent: boolean) => void) | null} onToggle
 * @returns {HTMLElement}
 */
function buildSlotLine(pools, onToggle) {
  const wrap = document.createElement('span');
  wrap.className = 'stat-bar slot-line';
  if (!onToggle) {
    const readout = pools
      .map((p) => `level ${slotLevelOf(p)}: ${p.current} of ${p.max}`)
      .join(', ');
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `Spell slots — ${readout}`);
  }

  const label = document.createElement('span');
  label.className = 'stat-bar__label';
  label.textContent = 'Slots';
  wrap.appendChild(label);

  /** @param {number} n */
  const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
  const groups = document.createElement('span');
  groups.className = 'slot-line__groups';
  for (const pool of pools) {
    const group = document.createElement('span');
    group.className = 'slot-line__group';
    const level = document.createElement('span');
    level.className = 'slot-line__level';
    level.textContent = ordinal(slotLevelOf(pool));
    const pips = document.createElement('span');
    pips.className = 'slot-line__pips';
    for (let i = 0; i < pool.max; i += 1) {
      const available = i < pool.current;
      /** @type {HTMLElement} */
      let pip;
      if (onToggle) {
        pip = document.createElement('button');
        pip.setAttribute('type', 'button');
        pip.className = 'slot-line__pip';
        pip.setAttribute(
          'aria-label',
          available
            ? `Spend a level ${slotLevelOf(pool)} slot`
            : `Restore a level ${slotLevelOf(pool)} slot`,
        );
        pip.title = available ? 'Click to spend' : 'Click to restore';
        pip.addEventListener('click', () => onToggle(pool, available));
      } else {
        pip = document.createElement('span');
      }
      pip.textContent = available ? '●' : '○';
      pips.appendChild(pip);
    }
    group.append(level, pips);
    groups.appendChild(group);
  }
  wrap.appendChild(groups);
  return wrap;
}

/**
 * Mount a character card: collapsed by default to a glanceable summary
 * (name / race / HP healthbar) behind an accessible disclosure button,
 * expanding to the full sheet — XP control, ability scores, and resource
 * pools (HP included) with spend/restore steppers.
 * Renders an empty state when no character is selected (`null`).
 * `getPermissions` scopes what the viewer may touch: without `editBase` the
 * stats and XP render read-only, and without `play` the pool steppers and
 * condition controls disappear too (a spectator's view of the sheet).
 * @param {HTMLElement} container
 * @param {Character | null} initial
 * @param {(character: Character) => void} [onChange]
 * @param {() => { editBase: boolean, play: boolean }} [getPermissions]
 * @returns {{ getCharacter: () => Character | null, setCharacter: (character: Character | null) => void }}
 */
export function mountCharacterSheet(
  container,
  initial,
  onChange = () => {},
  getPermissions = () => ({ editBase: true, play: true }),
) {
  let current = initial;
  // Survives re-renders (every edit re-renders) but stays per-mount, so the
  // card the GM opened doesn't snap shut after each stat change.
  let expanded = false;

  const root = document.createElement('div');
  root.className = 'character-sheet';
  container.appendChild(root);

  /** @param {Character} next */
  function commit(next) {
    current = next;
    onChange(next);
    render();
  }

  function render() {
    root.innerHTML = '';

    // Captured non-null so listeners created below keep the narrowing.
    const character = current;
    if (!character) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No character selected.';
      root.appendChild(empty);
      return;
    }
    const perms = getPermissions();

    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'disclosure character-sheet__summary';

    // Top line: name / race / chevron. The HP bar and the spell-slot pips get
    // a full-width line each below it, so both read at a glance.
    const summaryTop = document.createElement('span');
    summaryTop.className = 'character-sheet__summary-top';

    const name = document.createElement('span');
    name.className = 'character-sheet__name';
    name.textContent = character.name;
    summaryTop.appendChild(name);

    if (character.race) {
      const race = document.createElement('span');
      race.className = 'character-sheet__race';
      race.textContent = character.race;
      summaryTop.appendChild(race);
    }

    summaryTop.appendChild(icon('chevron', { className: 'disclosure__chevron' }));
    summary.appendChild(summaryTop);

    // The HP bar and slot pips live outside the disclosure button (buttons
    // can't nest), so they stay visible AND operable whether the card is
    // collapsed or expanded — no scrolling to the bottom of the sheet to
    // apply damage or spend a slot. Only the name row toggles the card.
    const head = document.createElement('div');
    head.className = 'character-sheet__head';
    head.appendChild(summary);

    const hp = getHP(character);
    if (hp) {
      const hpLine = document.createElement('div');
      hpLine.className = 'character-sheet__hp-line';
      const bar = buildStatBar(hp, {
        modifier: 'hp',
        label: 'HP',
        critical: true,
        bonus: character.bonusHP ?? 0,
      });
      if (perms.play) {
        const damageButton = document.createElement('button');
        damageButton.type = 'button';
        damageButton.className = 'btn btn--icon btn--danger character-sheet__hp-step';
        damageButton.setAttribute('aria-label', `Damage ${character.name} by 1`);
        damageButton.appendChild(icon('minus'));
        // Bonus HP absorbs the hit before the pool does.
        damageButton.addEventListener('click', () => commit(damageCharacter(character, 1)));

        const healButton = document.createElement('button');
        healButton.type = 'button';
        healButton.className = 'btn btn--icon btn--success character-sheet__hp-step';
        healButton.setAttribute('aria-label', `Heal ${character.name} by 1`);
        healButton.appendChild(icon('plus'));
        healButton.addEventListener('click', () => commit(restoreResource(character, 'hp', 1)));

        hpLine.append(damageButton, bar, healButton);
      } else {
        hpLine.appendChild(bar);
      }
      head.appendChild(hpLine);
    }

    const slots = getSlotPools(character);
    if (slots.length > 0) {
      head.appendChild(
        buildSlotLine(
          slots,
          perms.play
            ? (pool, spent) =>
                commit(
                  spent
                    ? spendResource(character, pool.id, 1)
                    : restoreResource(character, pool.id, 1),
                )
            : null,
        ),
      );
    }

    const body = document.createElement('div');
    body.className = 'character-sheet__body';

    // Level, derived AC, and XP progress share the section header line; the
    // controls below are laid out like stat rows, so their inputs line up
    // with the ability-score inputs underneath them.
    const header = document.createElement('div');
    header.className = 'character-sheet__header';
    const levelText = document.createElement('span');
    levelText.textContent = `Level ${character.level}`;
    const headerMeta = document.createElement('span');
    headerMeta.className = 'character-sheet__header-meta';
    const acBadge = document.createElement('span');
    acBadge.className = 'character-sheet__ac';
    acBadge.textContent = `AC ${armorClass(character)}`;
    acBadge.title = 'Armor class: 10 + DEX modifier + equipped armor and shield bonuses';
    const xpProgress = document.createElement('span');
    xpProgress.className = 'character-sheet__xp-progress';
    xpProgress.textContent = `XP ${character.xp} / ${character.level * XP_PER_LEVEL}`;
    headerMeta.append(acBadge, xpProgress);
    header.append(levelText, headerMeta);
    body.appendChild(header);

    /**
     * A labeled numeric row sharing the stat rows' key/input geometry.
     * @param {string} key
     * @param {number} value
     * @param {string} ariaLabel
     * @param {(value: number) => void} onCommit fires on change with the parsed value
     * @returns {{ row: HTMLElement, input: HTMLInputElement }}
     */
    function buildFieldRow(key, value, ariaLabel, onCommit) {
      const row = document.createElement('div');
      row.className = 'character-sheet__field-row';
      const keyText = document.createElement('span');
      keyText.className = 'character-sheet__stat-key';
      keyText.textContent = key;
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'field character-sheet__stat-input';
      input.value = String(value);
      input.min = '0';
      input.setAttribute('aria-label', ariaLabel);
      input.addEventListener('change', () => onCommit(Number(input.value)));
      row.append(keyText, input);
      return { row, input };
    }

    if (perms.editBase) {
      const { row: xpRow, input: xpInput } = buildFieldRow('XP', 0, 'XP to add', () => {});
      const xpButton = document.createElement('button');
      xpButton.type = 'button';
      xpButton.className = 'btn';
      xpButton.append(icon('add'), document.createTextNode('XP'));
      xpButton.addEventListener('click', () => {
        const amount = Number(xpInput.value);
        if (amount > 0) commit(addXP(character, amount));
      });
      xpRow.appendChild(xpButton);
      body.appendChild(xpRow);

      // The GM's per-character max HP override; current HP clamps down if the
      // new maximum is below it.
      if (hp) {
        const { row } = buildFieldRow('MAX HP', hp.max, `Maximum HP for ${character.name}`, (value) =>
          commit(setMaxHP(character, value)),
        );
        body.appendChild(row);
      }
    }

    // Bonus HP from items/boons, tracked on top of the intrinsic pool; damage
    // drains it first. Editable by anyone who can play the character.
    if (perms.play && hp) {
      const { row } = buildFieldRow(
        'BONUS HP',
        character.bonusHP ?? 0,
        `Bonus HP for ${character.name}`,
        (value) => commit(setBonusHP(character, value)),
      );
      body.appendChild(row);
    }

    const statsList = document.createElement('div');
    statsList.className = 'character-sheet__stats';
    for (const [key, value] of Object.entries(character.stats)) {
      const row = document.createElement('div');
      row.className = 'character-sheet__stat-row';

      const label = document.createElement('label');
      label.className = 'character-sheet__stat-label';

      // Fixed-width key so the score inputs align down the column.
      const keyText = document.createElement('span');
      keyText.className = 'character-sheet__stat-key';
      keyText.textContent = key;
      label.appendChild(keyText);

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'field character-sheet__stat-input';
      input.value = String(value);
      input.disabled = !perms.editBase;
      input.addEventListener('change', () => {
        commit(setStat(character, key, Number(input.value)));
      });

      // The derived modifier (DEX 20 = +5), which initiative and checks use.
      const modifier = document.createElement('span');
      modifier.className = 'character-sheet__stat-mod';
      modifier.textContent = formatModifier(abilityModifier(value));
      modifier.title = `${key} modifier`;

      // Score and its modifier read as one unit, visually separated from the
      // next column's label by the stats grid's gutter.
      const valueGroup = document.createElement('span');
      valueGroup.className = 'character-sheet__stat-value';
      valueGroup.append(input, modifier);
      label.appendChild(valueGroup);
      row.appendChild(label);
      statsList.appendChild(row);
    }
    body.appendChild(statsList);

    // HP and spell slots are managed on the always-visible head lines, so the
    // stepper list at the bottom only carries the custom pools.
    const customPools = character.resources.filter((r) => r.id !== 'hp' && !isSlotPool(r));
    if (customPools.length > 0) {
      const resources = document.createElement('div');
      resources.className = 'character-sheet__resources';
      for (const pool of customPools) {
        const row = document.createElement('div');
        row.className = 'character-sheet__resource-row';

        const label = document.createElement('span');
        label.className = 'character-sheet__resource-label';
        label.textContent = `${pool.name} ${pool.current}/${pool.max}`;
        row.appendChild(label);

        if (perms.play) {
          const spendButton = document.createElement('button');
          spendButton.type = 'button';
          spendButton.className = 'btn btn--icon btn--danger';
          spendButton.setAttribute('aria-label', `Spend one ${pool.name}`);
          spendButton.appendChild(icon('minus'));
          spendButton.addEventListener('click', () => commit(spendResource(character, pool.id, 1)));

          const restoreButton = document.createElement('button');
          restoreButton.type = 'button';
          restoreButton.className = 'btn btn--icon btn--success';
          restoreButton.setAttribute('aria-label', `Restore one ${pool.name}`);
          restoreButton.appendChild(icon('plus'));
          restoreButton.addEventListener('click', () => commit(restoreResource(character, pool.id, 1)));

          row.append(spendButton, restoreButton);
        }
        resources.appendChild(row);
      }
      body.appendChild(resources);
    }

    const conditions = document.createElement('div');
    conditions.className = 'character-sheet__conditions';
    const conditionsLabel = document.createElement('span');
    conditionsLabel.className = 'character-sheet__section-label';
    conditionsLabel.textContent = 'Conditions';
    conditions.appendChild(conditionsLabel);
    mountConditionsBar(conditions, {
      getConditions: () => current?.conditions ?? [],
      onChange: (next) => commit({ ...character, conditions: next }),
      canEdit: () => getPermissions().play,
    });
    body.appendChild(conditions);

    wireDisclosure(summary, body, { expanded, onToggle: (next) => { expanded = next; } });
    root.append(head, body);
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
