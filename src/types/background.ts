/** A character background's mechanical spine: the fixed skill and tool
 * proficiencies it grants, how many bonus languages it teaches, and its
 * signature feature. The feature is a display scaffold — a name, not yet
 * mechanically interpreted (same posture as ClassDef.featuresByLevel and
 * RaceDef.traits). Characters store a background id and resolve the
 * definition at call time. */
export interface BackgroundDef {
  id: string;
  name: string;
  /** Skill proficiencies granted (ids from data/skills.js). */
  skills: string[];
  /** Tool proficiencies granted; choice-typed kits keep their generic name
   * (e.g. "gaming set", "musical instrument"). */
  tools: string[];
  /** Number of bonus languages of the player's choice. */
  languageCount: number;
  /** The background's signature feature name. */
  feature: string;
}
