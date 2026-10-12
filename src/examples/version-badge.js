/**
 * Fill version badges from the injected page config. Any `[data-kmwc-version]`
 * element (and the legacy `#version-badge`) gets `v1.2.3` in dev and
 * `v1.2.3 (built 2026-10-12T19:49Z)` in a built examples site.
 */
import { getPageConfig } from './page-config.js';
import { VERSION_BADGE_SELECTOR } from './constants.js';

export function getVersionLabel(pageConfig = getPageConfig()) {
  if (!pageConfig.version) return '';
  return pageConfig.buildTimestamp ? `v${pageConfig.version} (built ${pageConfig.buildTimestamp})` : `v${pageConfig.version}`;
}

export function renderVersionBadges(root = document) {
  const pageConfig = getPageConfig();
  const versionLabel = getVersionLabel(pageConfig);
  if (!versionLabel) return;
  for (const badge of root.querySelectorAll(VERSION_BADGE_SELECTOR)) {
    if (badge.textContent.trim()) continue; // page put its own text — leave it
    badge.textContent = versionLabel;
    if (pageConfig.buildTimestamp) badge.title = `Built ${pageConfig.buildTimestamp}`;
  }
}
