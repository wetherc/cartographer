import {
  setStat,
  addXP,
  getHP,
  spendResource,
  restoreResource,
  XP_PER_LEVEL,
} from '../entities/Character.js';
import { getSlotPools, slotLevelOf } from '../entities/SpellSlots.js';
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
 * @param {{ modifier: string, label: string, critical?: boolean }} opts
 *   `modifier` selects the fill colour; `critical` arms the low-fill red state.
 * @returns {HTMLElement}
 */
function buildStatBar(pool, opts) {
  const wrap = document.createElement('span');
  wrap.className = 'stat-bar';
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', `${opts.label} ${pool.current} of ${pool.max}`);

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
  return wrap;
}

/**
 * Compact spell-slot readout for the collapsed card: a column per spell level,
 * the ordinal centered above a two-wide grid of pips, filled pips being the
 * slots still unspent. Columns wrap under the pip area (not the label) when a
 * high-level caster outgrows the card width.
 * Replaces the old mana bar; a non-caster (no slot pools) renders nothing.
 * @param {import('../types/entities.js').ResourcePool[]} pools
 * @returns {HTMLElement}
 */
function buildSlotLine(pools) {
  const wrap = document.createElement('span');
  wrap.className = 'stat-bar slot-line';
  const readout = pools
    .map((p) => `level ${slotLevelOf(p)}: ${p.current} of ${p.max}`)
    .join(', ');
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', `Spell slots — ${readout}`);

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
      const pip = document.createElement('span');
      pip.textContent = i < pool.current ? '●' : '○';
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
 * @param {HTMLElement} container
 * @param {Character | null} initial
 * @param {(character: Character) => void} [onChange]
 * @returns {{ getCharacter: () => Character | null, setCharacter: (character: Character | null) => void }}
 */
export function mountCharacterSheet(container, initial, onChange = () => {}) {
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

    const hp = getHP(character);
    if (hp) summary.appendChild(buildStatBar(hp, { modifier: 'hp', label: 'HP', critical: true }));

    const slots = getSlotPools(character);
    if (slots.length > 0) summary.appendChild(buildSlotLine(slots));

    const head = document.createElement('div');
    head.className = 'character-sheet__head';
    head.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'character-sheet__body';

    const header = document.createElement('div');
    header.className = 'character-sheet__header';
    header.textContent = `Level ${character.level}`;
    body.appendChild(header);

    const xpRow = document.createElement('div');
    xpRow.className = 'character-sheet__xp';

    const xpLabel = document.createElement('span');
    xpLabel.textContent = `XP: ${character.xp} / ${character.level * XP_PER_LEVEL}`;

    const xpInput = document.createElement('input');
    xpInput.type = 'number';
    xpInput.className = 'field character-sheet__xp-input';
    xpInput.value = '0';
    xpInput.min = '0';
    xpInput.setAttribute('aria-label', 'XP to add');

    const xpButton = document.createElement('button');
    xpButton.type = 'button';
    xpButton.className = 'btn';
    xpButton.append(icon('add'), document.createTextNode('XP'));
    xpButton.addEventListener('click', () => {
      const amount = Number(xpInput.value);
      if (amount > 0) commit(addXP(character, amount));
    });

    xpRow.append(xpLabel, xpInput, xpButton);
    body.appendChild(xpRow);

    const statsList = document.createElement('div');
    statsList.className = 'character-sheet__stats';
    for (const [key, value] of Object.entries(character.stats)) {
      const row = document.createElement('div');
      row.className = 'character-sheet__stat-row';

      const label = document.createElement('label');
      label.className = 'character-sheet__stat-label';
      label.textContent = key;

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'field character-sheet__stat-input';
      input.value = String(value);
      input.addEventListener('change', () => {
        commit(setStat(character, key, Number(input.value)));
      });

      // The derived modifier (DEX 20 = +5), which initiative and checks use.
      const modifier = document.createElement('span');
      modifier.className = 'character-sheet__stat-mod';
      modifier.textContent = formatModifier(abilityModifier(value));
      modifier.title = `${key} modifier`;

      label.appendChild(input);
      row.append(label, modifier);
      statsList.appendChild(row);
    }
    body.appendChild(statsList);

    if (character.resources.length > 0) {
      const resources = document.createElement('div');
      resources.className = 'character-sheet__resources';
      for (const pool of character.resources) {
        const row = document.createElement('div');
        row.className = 'character-sheet__resource-row';

        const label = document.createElement('span');
        label.className = 'character-sheet__resource-label';
        label.textContent = `${pool.name} ${pool.current}/${pool.max}`;

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

        row.append(label, spendButton, restoreButton);
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
