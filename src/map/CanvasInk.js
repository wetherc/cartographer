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
  /** Party dots, the Build selection outline, and the region marquee. */
  gold: '#e0c14b',
  /** The dark rim that keeps a gold fill legible over bright terrain. */
  goldRim: '#3a2f0a',
  /** The brighter gold of lit chrome: POI outlines, chevrons, an armed band. */
  goldLit: '#ffd24a',
  /** The glow around a discovered point of interest. */
  goldGlow: 'rgba(255, 190, 60, 0.9)',
  /** The region tool's drag block, tinted so the block reads while dragging. */
  marqueeFill: 'rgba(224, 193, 75, 0.18)',

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

  /** A region group's overlay: a white tint, its border, and its name plate. */
  regionTint: 'rgba(255, 255, 255, 0.12)',
  regionBorder: 'rgba(255, 255, 255, 0.85)',
  regionLabelPlate: 'rgba(0, 0, 0, 0.7)',
  regionLabelText: '#fff',
};
