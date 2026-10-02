/**
 * The gallery's entry point. It mounts the theme switch, then renders every
 * section into the page and links the side navigation to them.
 *
 * The sections import the real modules from `src/ui/`. Nothing here is a
 * copy of a widget, so a builder that changes its markup shows the change here on
 * the next reload.
 */

import { mustGetElement } from '../../src/ui/dom.js';
import { mountThemeToggle } from '../../src/ui/ThemeToggle.js';
import { mountTooltips } from '../../src/ui/Tooltip.js';
import { buildNav, buildSection, mountGalleryToasts } from './runtime.js';
import { buttonsSection } from './sections/buttons.js';
import { fieldsSection } from './sections/fields.js';
import { overlaysSection } from './sections/overlays.js';
import { structureSection } from './sections/structure.js';
import { tokensSection } from './sections/tokens.js';

/** @type {import('./runtime.js').Section[]} */
const SECTIONS = [buttonsSection, fieldsSection, structureSection, overlaysSection, tokensSection];

mountThemeToggle(mustGetElement('gx-theme'));
mountGalleryToasts();
// The gallery shows the app's real tooltip, so every builder that carries a
// title here behaves as it does in the app.
mountTooltips(document.body);

const nav = mustGetElement('gx-nav');
const main = mustGetElement('gx-main');
nav.append(...buildNav(SECTIONS));
main.append(...SECTIONS.map(buildSection));
