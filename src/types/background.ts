/** A character background's mechanical spine: the fixed skill and tool
 * proficiencies it grants, how many bonus languages it teaches, and its
 * signature feature. The feature is a display name only, not yet given a
 * mechanical effect (the same status as ClassDef.featuresByLevel and
 * RaceDef.traits). A character stores a background id and resolves the
 * definition at call time. */
export interface BackgroundDef {
  id: string;
  name: string;
  /** Skill proficiencies granted (ids from data/skills.js). */
  skills: string[];
  /** Tool proficiencies granted. Choice-typed kits keep their generic name,
   * for example "gaming set" or "musical instrument". */
  tools: string[];
  /** Number of bonus languages of the player's choice. */
  languageCount: number;
  /** The background's signature feature name. */
  feature: string;
}
