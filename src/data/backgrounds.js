/** @typedef {import('../types/background.js').BackgroundDef} BackgroundDef */

/**
 * The character backgrounds, covering the classic PHB set. Each entry is
 * library-kind shaped (with a stable id and name), so the catalog can later
 * merge with custom library entries. Skill grants are fixed per the printed
 * rules. Choice-typed tools keep a generic name, and bonus languages are
 * counted, not named, since the pick belongs to the player.
 * @type {BackgroundDef[]}
 */
export const DEFAULT_BACKGROUNDS = [
  {
    id: 'acolyte',
    name: 'Acolyte',
    skills: ['insight', 'religion'],
    tools: [],
    languageCount: 2,
    feature: 'Shelter of the Faithful',
  },
  {
    id: 'charlatan',
    name: 'Charlatan',
    skills: ['deception', 'sleight-of-hand'],
    tools: ['disguise kit', 'forgery kit'],
    languageCount: 0,
    feature: 'False Identity',
  },
  {
    id: 'criminal',
    name: 'Criminal',
    skills: ['deception', 'stealth'],
    tools: ['gaming set', "thieves' tools"],
    languageCount: 0,
    feature: 'Criminal Contact',
  },
  {
    id: 'entertainer',
    name: 'Entertainer',
    skills: ['acrobatics', 'performance'],
    tools: ['disguise kit', 'musical instrument'],
    languageCount: 0,
    feature: 'By Popular Demand',
  },
  {
    id: 'folk-hero',
    name: 'Folk Hero',
    skills: ['animal-handling', 'survival'],
    tools: ["artisan's tools", 'vehicles (land)'],
    languageCount: 0,
    feature: 'Rustic Hospitality',
  },
  {
    id: 'guild-artisan',
    name: 'Guild Artisan',
    skills: ['insight', 'persuasion'],
    tools: ["artisan's tools"],
    languageCount: 1,
    feature: 'Guild Membership',
  },
  {
    id: 'hermit',
    name: 'Hermit',
    skills: ['medicine', 'religion'],
    tools: ['herbalism kit'],
    languageCount: 1,
    feature: 'Discovery',
  },
  {
    id: 'noble',
    name: 'Noble',
    skills: ['history', 'persuasion'],
    tools: ['gaming set'],
    languageCount: 1,
    feature: 'Position of Privilege',
  },
  {
    id: 'outlander',
    name: 'Outlander',
    skills: ['athletics', 'survival'],
    tools: ['musical instrument'],
    languageCount: 1,
    feature: 'Wanderer',
  },
  {
    id: 'sage',
    name: 'Sage',
    skills: ['arcana', 'history'],
    tools: [],
    languageCount: 2,
    feature: 'Researcher',
  },
  {
    id: 'sailor',
    name: 'Sailor',
    skills: ['athletics', 'perception'],
    tools: ["navigator's tools", 'vehicles (water)'],
    languageCount: 0,
    feature: "Ship's Passage",
  },
  {
    id: 'soldier',
    name: 'Soldier',
    skills: ['athletics', 'intimidation'],
    tools: ['gaming set', 'vehicles (land)'],
    languageCount: 0,
    feature: 'Military Rank',
  },
  {
    id: 'urchin',
    name: 'Urchin',
    skills: ['sleight-of-hand', 'stealth'],
    tools: ['disguise kit', "thieves' tools"],
    languageCount: 0,
    feature: 'City Secrets',
  },
];
