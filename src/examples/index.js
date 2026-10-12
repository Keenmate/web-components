/**
 * `@keenmate/web-components-devkit/examples` — named exports for example pages.
 * The page-level helpers (styles, chapter nav, copy-links, version badge,
 * theme switch) are mounted automatically by the Vite plugin; import from here
 * only for the opt-in bits (controls persistence, index page) or to drive a
 * helper manually.
 */
export { attachControlsPersistence, getControlsStorageKey } from './controls-persistence.js';
export { renderExamplesIndex } from './index-page.js';
export { mountExamplesKit } from './kit.js';
export { mountChapterNav } from './chapter-nav.js';
export { attachCopyLinks, copyText, getSectionUrl } from './copy-link.js';
export { renderVersionBadges, getVersionLabel } from './version-badge.js';
export { attachDemoCopyButtons } from './demo-code.js';
export { mountThemeSwitch, applyTheme, getSavedTheme } from './theme-switch.js';
export { ensureSectionAnchors, generateSlug, getHeadingLabel } from './sections.js';
export { getPageConfig, attachDomReadyHandler } from './page-config.js';
export * from './constants.js';
