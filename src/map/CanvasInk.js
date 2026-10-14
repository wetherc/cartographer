/**
 * The colors the map canvas draws with. Canvas takes a color string, not a CSS
 * custom property, so the map cannot read the stylesheet's tokens. This module
 * is the canvas side of that vocabulary: one named entry per role, so a color
 * that two layers share is written once and stays in step.
 *
 * Names describe the role, not the hue, and an entry that differs from another
 * only in alpha is a separate role, for example the map border reads at a
 * lower weight than an exit band's border.
 */

export const INK = {
  /** Party dots and the Build selection outline. */
  gold: '#e0c14b',
  /** The dark rim that keeps a gold fill legible over bright terrain. */
  goldRim: '#3a2f0a',
  /** The brighter gold of lit chrome: POI outlines, chevrons, an armed band. */
  goldLit: '#ffd24a',
  /** The glow around a discovered point of interest. */
  goldGlow: 'rgba(255, 190, 60, 0.9)',

  /** Parchment text: the labels that sit on a plate or inside a band. */
  labelText: '#f2e4bd',
  /** The plate behind label text, dark enough to carry parchment over art. */
  labelPlate: 'rgba(20, 16, 10, 0.72)',
  /** Coordinate digits, quieter than a label that names something. */
  coordText: 'rgba(230, 215, 180, 0.8)',
  /** An edge exit band's body and its border. */
  bandFill: 'rgba(20, 16, 10, 0.86)',
  bandFillArmed: 'rgba(46, 36, 16, 0.94)',
  bandBorder: 'rgba(230, 215, 180, 0.85)',

  /** The map's own extent: its backdrop, its border, and an unrevealed tile. */
  mapBackdrop: '#171209',
  mapBorder: 'rgba(230, 215, 180, 0.55)',
  fog: '#48412f',
  /** An unrevealed interior tile beside explored floor: lighter than fog, darker than art. */
  fogFrontier: '#6e6448',
  /** The fog over tile art that a GM sees in Play mode: the fog colors, part see-through. */
  fogDim: 'rgba(72, 65, 47, 0.78)',
  fogDimFrontier: 'rgba(110, 100, 72, 0.7)',
  /** Stands in for tile art that has not decoded yet, so no tile is a hole. */
  missingArt: '#333',

  /** The keyboard cursor, the one blue in the chrome, so it reads as focus. */
  cursor: '#5ec8ff',

  /** Encounter diamonds and NPC circles, each a fill over its own rim. */
  encounterFill: '#9d2f21',
  encounterRim: '#2a0f0c',
  npcFill: '#3563a5',
  npcRim: '#101f36',
  /** The parchment disc that marks a tile as a way out. */
  badgeFill: '#ede2c8',
  badgeRim: '#2a2114',

  /**
   * The colors of the region overlays, one tint and one border per slot of
   * `RegionOutline.regionSlots`. Six slots cover any map of one-block regions.
   */
  regionHues: [
    { tint: 'rgba(240, 200, 80, 0.16)', border: 'rgba(250, 215, 110, 0.95)' },
    { tint: 'rgba(80, 210, 200, 0.16)', border: 'rgba(110, 230, 220, 0.95)' },
    { tint: 'rgba(240, 110, 140, 0.16)', border: 'rgba(250, 140, 165, 0.95)' },
    { tint: 'rgba(170, 130, 240, 0.16)', border: 'rgba(195, 165, 250, 0.95)' },
    { tint: 'rgba(110, 170, 250, 0.16)', border: 'rgba(145, 195, 255, 0.95)' },
    { tint: 'rgba(170, 220, 90, 0.16)', border: 'rgba(195, 235, 125, 0.95)' },
  ],
  /** The dark line between a region border and the terrain beside it. */
  regionRim: 'rgba(20, 16, 10, 0.55)',
  /** A region's name plate. */
  regionLabelPlate: 'rgba(0, 0, 0, 0.7)',
  regionLabelText: '#fff',
};
