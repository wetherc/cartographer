import { exampleParty } from './ExampleParty.js';
import { exampleBestiary, exampleCreatures } from './ExampleCast.js';
import { exampleQuests } from './ExampleStory.js';
import { exampleHandouts } from './ExampleHandouts.js';
import { createClock } from '../time/GameClock.js';

/** @typedef {import('./ExampleWorld.js').ExampleWorld} ExampleWorld */
/** @typedef {import('./ExampleWorld.js').Place} Place */

/**
 * A lookup of the story places of the example world. A name that the world
 * did not place throws, so a typo fails the build instead of leaving a
 * creature nowhere.
 * @param {ExampleWorld} world
 * @returns {(name: string) => Place}
 */
function placer(world) {
  return (name) => {
    const place = world.places[name];
    if (!place) throw new Error(`The example world has no place named ${name}.`);
    return { ...place };
  };
}

/**
 * Everything that populates the example world: the party from
 * ExampleParty.js, the creatures and the bestiary from ExampleCast.js, the
 * quests from ExampleStory.js, and the handouts from ExampleHandouts.js. It
 * takes the built maps from ExampleWorld.js, so people and bosses land on
 * the story places that ExampleRegions.js chose. Campaigns.js combines the
 * maps and the content.
 * @param {ExampleWorld} world
 * @returns {Omit<import('./Campaigns.js').Campaign, 'grid'>}
 */
export function buildExampleContent(world) {
  const at = placer(world);
  return {
    party: at('start'),
    // Nobody has traveled yet, so no child has been entered through a tile.
    entryTiles: {},
    characters: exampleParty(),
    creatures: exampleCreatures(at),
    travelog: [],
    quests: exampleQuests(at),
    clock: createClock(),
    handouts: exampleHandouts(at),
    bestiary: exampleBestiary(),
    splitParty: false,
    combat: null,
  };
}
