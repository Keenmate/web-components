import { mountChapterNav } from './chapter-nav.js';
import { attachCopyLinks } from './copy-link.js';
import { renderVersionBadges } from './version-badge.js';
import { mountThemeSwitch } from './theme-switch.js';
import { attachDemoCopyButtons } from './demo-code.js';
import { INDEX_PAGE_CLASSES } from './constants.js';

/**
 * (Re)mount the page-level helpers on the current DOM. Runs automatically once
 * per page; call it again after rendering sections asynchronously. Idempotent:
 * copy-link / demo copy buttons skip elements that already have one, the nav
 * and the theme switch are remounted.
 */
export function mountExamplesKit() {
  // Copy-links before the nav: the nav strips the buttons back out when
  // reading labels, and this order avoids a relayout after the nav is built.
  if (!document.body.classList.contains(INDEX_PAGE_CLASSES.body)) attachCopyLinks();
  mountChapterNav();
  renderVersionBadges();
  attachDemoCopyButtons();
  mountThemeSwitch();
}
