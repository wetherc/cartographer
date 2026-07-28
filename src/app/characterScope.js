/**
 * The selected-character scope. It owns which character the character panels
 * are pointed at, writes an edited character back into the roster, and fans the
 * new value out to every panel that registered with it. Panels no longer name
 * each other, so a new tab costs one registration instead of an edit to every
 * panel already there.
 *
 * Pure logic: it holds ids and callbacks, never touches the DOM, and reads the
 * roster through the getter it is handed.
 */
import { replaceById } from '../entities/Roster.js';

/** @typedef {import('../types/entities.js').Character} Character */

/** A panel the scope can write a character into. */
/** @typedef {{ setCharacter: (character: Character | null) => void }} CharacterPanel */

/**
 * How a registered panel is reached. It is a getter rather than the panel
 * itself because a panel needs its commit handle before it is mounted, so the
 * variable holding it is still unassigned at registration time.
 * @typedef {() => CharacterPanel | null | undefined} PanelRef
 */

/**
 * @typedef {object} CharacterScope
 * @property {(panel: PanelRef) => { commit: (next: Character) => void }} register
 *   Join the scope. The returned `commit` is what the panel's own edit path
 *   calls: it writes the character back and updates the other panels.
 * @property {() => string | null} getSelectedId
 * @property {() => Character | null} getSelected
 * @property {(id: string | null) => void} select point every panel at a character
 * @property {() => void} reselect re-read the current selection from the roster
 * @property {(next: Character) => void} commit write back without touching panels
 * @property {(next: Character) => void} set write back and update every panel
 */

/**
 * @param {object} deps
 * @param {() => Character[]} deps.getCharacters
 * @param {(characters: Character[]) => void} deps.setCharacters
 * @param {() => void} deps.onCommit runs after a character is written back
 * @param {() => void} deps.onSelect runs after the selection changes
 * @param {string | null} [deps.selectedId] the character selected at startup
 * @returns {CharacterScope}
 */
export function createCharacterScope({
  getCharacters,
  setCharacters,
  onCommit,
  onSelect,
  selectedId = null,
}) {
  /** @type {PanelRef[]} */
  const panels = [];
  let selected = selectedId;

  /** @returns {Character | null} */
  const getSelected = () => getCharacters().find((c) => c.id === selected) ?? null;

  /**
   * Hand a character to every registered panel except `source`. The panel that
   * originated an edit has already re-rendered from its own commit path, so
   * writing back into it would only cost a second render.
   * @param {Character | null} character
   * @param {PanelRef | null} source
   */
  function broadcast(character, source) {
    for (const panel of panels) {
      if (panel === source) continue;
      panel()?.setCharacter(character);
    }
  }

  /** @param {Character} next */
  function commit(next) {
    setCharacters(replaceById(getCharacters(), next));
    onCommit();
  }

  /** @param {string | null} id */
  function select(id) {
    selected = id;
    broadcast(getSelected(), null);
    onSelect();
  }

  return {
    register(panel) {
      panels.push(panel);
      return {
        commit: (next) => {
          commit(next);
          broadcast(next, panel);
        },
      };
    },
    getSelectedId: () => selected,
    getSelected,
    select,
    reselect: () => select(selected),
    commit,
    set: (next) => {
      commit(next);
      broadcast(next, null);
    },
  };
}
