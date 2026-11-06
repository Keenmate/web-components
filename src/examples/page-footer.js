/**
 * The footer every example page ends with — Keenmate, the repo, and the devkit
 * that built the page. The index page renders the same line in its own footer
 * (index-page.js); the other pages get it from the kit (mountPageFooter).
 */
import { getPageConfig } from './page-config.js';
import { INDEX_PAGE_CLASSES, PAGE_FOOTER_CLASSES } from './constants.js';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const mapToEscapedHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);

/**
 * The footer line: "Created by Keenmate s.r.o. | GitHub | …links | web-components-devkit vX".
 * @param {import('./index.js').KmwcPageConfig} pageConfig
 * @param {{ links?: Array<{ label: string, href: string }>, devkitClass: string }} footerConfig
 */
export function renderFooterLineHtml(pageConfig, { links = [], devkitClass }) {
  const footerLinks = [...(pageConfig.repository ? [{ label: 'GitHub', href: pageConfig.repository }] : []), ...links];
  const linksHtml = footerLinks
    .map((link) => ` | <a href="${mapToEscapedHtml(link.href)}" target="_blank" rel="noopener">${mapToEscapedHtml(link.label)}</a>`)
    .join('');
  const devkitHtml = pageConfig.devkitVersion
    ? ` | <a class="${devkitClass}" href="${mapToEscapedHtml(pageConfig.devkitHomepage)}" target="_blank" rel="noopener">web-components-devkit v${mapToEscapedHtml(pageConfig.devkitVersion)}</a>`
    : '';
  return `<p>Created by <a href="https://github.com/keenmate" target="_blank" rel="noopener">Keenmate s.r.o.</a>${linksHtml}${devkitHtml}</p>`;
}

/**
 * Append the footer to an example page — inside the layout's `.container`
 * when there is one, else at the end of <body>. Remounting replaces it; the
 * index page keeps its own footer and gets none.
 * @returns {HTMLElement | null}
 */
export function mountPageFooter() {
  document.querySelector(`.${PAGE_FOOTER_CLASSES.root}`)?.remove();
  if (document.body.classList.contains(INDEX_PAGE_CLASSES.body)) return null;

  const footerElement = document.createElement('footer');
  footerElement.className = PAGE_FOOTER_CLASSES.root;
  footerElement.innerHTML = renderFooterLineHtml(getPageConfig(), { devkitClass: PAGE_FOOTER_CLASSES.devkit });
  const containerElement = document.querySelector('body > .container');
  (containerElement || document.body).append(footerElement);
  return footerElement;
}
