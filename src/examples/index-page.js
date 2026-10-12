/**
 * The examples landing page, rendered from a page registry. A component's
 * index.html shrinks to:
 *
 *     <body>
 *       <script type="module">
 *         import { renderExamplesIndex } from '@keenmate/web-components-devkit/examples';
 *         renderExamplesIndex({
 *           pages: [
 *             { href: 'examples-basic.html', icon: '🧩', title: 'Basic Usage', description: '…' },
 *           ],
 *         });
 *       </script>
 *     </body>
 *
 * Title, tagline, version and the GitHub link come from package.json#kmwc via
 * the injected page config. The registry also feeds the cross-page chapter nav.
 */
import { getPageConfig } from './page-config.js';
import { getVersionLabel } from './version-badge.js';
import { INDEX_PAGE_CLASSES } from './constants.js';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const mapToEscapedHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);

/**
 * @param {import('./index.js').ExamplesIndexConfig} indexConfig
 * @returns {HTMLElement} the rendered page wrapper
 */
export function renderExamplesIndex(indexConfig) {
  const pageConfig = getPageConfig();
  const pages = indexConfig.pages || [];
  const title = indexConfig.title ?? pageConfig.title;
  const tagline = indexConfig.tagline ?? pageConfig.tagline;
  const footerLinks = [
    ...(pageConfig.repository ? [{ label: 'GitHub', href: pageConfig.repository }] : []),
    ...(indexConfig.links || []),
  ];
  const classes = INDEX_PAGE_CLASSES;

  document.body.classList.add(classes.body);
  if (!document.title) document.title = `${title} — Examples`;

  const containerEl = indexConfig.containerEl || document.body;
  const pageElement = document.createElement('div');
  pageElement.className = classes.page;
  pageElement.innerHTML = `
    <header class="${classes.header}">
      <h1>${mapToEscapedHtml(title)}</h1>
      ${tagline ? `<p class="${classes.tagline}">${mapToEscapedHtml(tagline)}</p>` : ''}
      <span class="${classes.version}" data-kmwc-version>${mapToEscapedHtml(getVersionLabel(pageConfig))}</span>
    </header>
    <div class="${classes.cards}">
      ${pages
        .map(
          (page) => `
        <a href="${mapToEscapedHtml(page.href)}" class="${classes.card}">
          ${page.icon ? `<div class="${classes.icon}">${mapToEscapedHtml(page.icon)}</div>` : ''}
          <h2 class="${classes.cardTitle}">${mapToEscapedHtml(page.title)}${page.badge ? ` <span class="${classes.badge}">${mapToEscapedHtml(page.badge)}</span>` : ''}</h2>
          ${page.description ? `<p class="${classes.cardDescription}">${mapToEscapedHtml(page.description)}</p>` : ''}
        </a>`
        )
        .join('')}
    </div>
    <footer class="${classes.footer}">
      <p>Created by <a href="https://github.com/keenmate" target="_blank" rel="noopener">Keenmate s.r.o.</a>${footerLinks
        .map((link) => ` | <a href="${mapToEscapedHtml(link.href)}" target="_blank" rel="noopener">${mapToEscapedHtml(link.label)}</a>`)
        .join('')}${
        pageConfig.devkitVersion
          ? ` | <a class="${classes.devkit}" href="${mapToEscapedHtml(pageConfig.devkitHomepage)}" target="_blank" rel="noopener">web-components-devkit v${mapToEscapedHtml(pageConfig.devkitVersion)}</a>`
          : ''
      }</p>
    </footer>`;
  containerEl.prepend(pageElement);

  window.CHAPTER_NAV_ITEMS = pages.map((page) => ({ label: page.title, href: page.href }));
  return pageElement;
}
