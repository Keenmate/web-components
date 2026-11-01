import { mountChapterNav } from './chapter-nav.js';
import { attachChapterLinks } from './chapter-links.js';
import { mountSpotlight } from './spotlight.js';
import { attachCopyLinks } from './copy-link.js';
import { renderVersionBadges } from './version-badge.js';
import { mountThemeSwitch } from './theme-switch.js';
import { attachDemoCopyButtons } from './demo-code.js';
import { INDEX_PAGE_CLASSES } from './constants.js';

/**
 * (Re)mount the page-level helpers on the current DOM (copy-links, chapter
 * nav, short chapter links, spotlight, version badges, demo copy buttons,
 * theme switch). Runs automatically once per page; call it again after
 * rendering sections asynchronously. Idempotent: copy-link / demo copy buttons
 * skip elements that already have one, the nav, spotlight and theme switch are
 * remounted.
 */
export function mountExamplesKit() {
  // Copy-links before the nav: the nav strips the buttons back out when
  // reading labels, and this order avoids a relayout after the nav is built.
  if (!document.body.classList.contains(INDEX_PAGE_CLASSES.body)) attachCopyLinks();
  mountChapterNav();
  // After the anchors exist: an arriving #th07 can only resolve now.
  attachChapterLinks();
  mountSpotlight();
  renderVersionBadges();
  attachDemoCopyButtons();
  mountThemeSwitch();
}
