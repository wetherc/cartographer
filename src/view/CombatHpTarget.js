/**
 * Which combatant the GM's Damage and Heal box on the combat screen acts on.
 * The box names its target in its own select, so the GM sees who the number
 * goes to before clicking.
 */

/** @typedef {import('../combat/CombatView.js').CombatView} CombatView */

/**
 * The id the HP box targets. A pick in the box itself wins. Otherwise the
 * combatant inspected in the left column wins, because the box sits under
 * that combatant's name, then the card selected on the board. Each candidate
 * counts only when it is a row with HP, so a stale id falls through to the
 * next one. The box never falls back to the combatant whose turn it is, so a
 * Damage click with no target picked cannot hit the turn holder by default.
 * @param {CombatView} view
 * @param {{ picked?: string | null, selectedId?: string | null, inspectedId?: string | null }} ids
 * @returns {string | null} null when no candidate names a row with HP
 */
export function hpTargetId(view, { picked = null, selectedId = null, inspectedId = null }) {
  const withHP = new Set(view.rows.filter((r) => r.hp).map((r) => r.id));
  for (const id of [picked, inspectedId, selectedId]) {
    if (id && withHP.has(id)) return id;
  }
  return null;
}
