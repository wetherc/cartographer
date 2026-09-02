import type { RollRider } from './entities.js';
import type { Ability } from './spell.js';
import type { ArmorProficiency } from './class.js';

/**
 * A pick-n choice over a list of options. An empty `from` means the whole
 * vocabulary of the field: every skill for a skill choice, every ability for
 * a save choice. A fixed grant is a choice whose count equals its list, which
 * the take-feat flow resolves without asking.
 */
export interface ProficiencyChoice {
  choose: number;
  from: string[];
}

/**
 * One mechanical effect of a feat. A feat carries zero or more of these.
 * Effects the engine cannot model stay in the description text, and the GM
 * applies them at the table.
 */
export type FeatEffect =
  /** Raise one ability score by 1, picked from `abilities`. An empty list
   * means any of the six. The score cap of 20 still applies. */
  | { kind: 'asi'; abilities: Ability[] }
  /** Grant proficiencies. Skill, save, and expertise grants are choices; the
   * armor, tool, and language grants are fixed lists. An expertise pick is
   * limited to skills the character is proficient in when the feat is taken. */
  | {
      kind: 'proficiency';
      skills?: ProficiencyChoice;
      saves?: ProficiencyChoice;
      expertise?: ProficiencyChoice;
      armor?: ArmorProficiency[];
      tools?: string[];
      languages?: string[];
    }
  /** A standing bonus or penalty on the taker's d20 rolls, in the same shape
   * a condition chip carries. */
  | { kind: 'rider'; rider: RollRider };

/**
 * Proficiency lists, one per kind, as a feat or class-feature record stores
 * them. A record keeps the lists it asked for as `requested` and the lists
 * the merge added as `granted`. Undo rebuilds the proficiencies from every
 * record that stays, so a grant two records share survives either undo.
 */
export interface FeatGrants {
  skills?: string[];
  saves?: string[];
  expertise?: string[];
  armor?: ArmorProficiency[];
  tools?: string[];
  languages?: string[];
}

/**
 * A feat resolved into concrete outcomes, ready to apply: the catalog entry
 * plus the taker's picks. `LevelUp.takeFeat` applies the increases and the
 * grants and records what actually changed, so the choice survives any later
 * edit to the library entry.
 */
export interface FeatStamp {
  name: string;
  featId?: string;
  /** The picked ability increases, usually one key at +1. */
  increases?: Record<string, number>;
  /** The picked proficiency grants, before the already-known ones drop out. */
  granted?: FeatGrants;
  /** The standing roll rider the feat carries, copied as picked. */
  rider?: RollRider;
}

/** A feat template in the library. The take-feat flow resolves its choices
 * and stamps the outcome onto the character, so a later edit to the library
 * entry does not reach a character that already took it. */
export interface Feat {
  id: string;
  name: string;
  description: string;
  /** Display text only. The GM enforces it. */
  prerequisite?: string;
  /** True for a feat a character may take more than once. */
  repeatable?: boolean;
  effects: FeatEffect[];
}
