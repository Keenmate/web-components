/**
 * The site-wide chapter index behind the spotlight: every <h2> of every
 * example page, read at build time (and on demand in dev) from the COMPOSED
 * page — includes resolved, so a heading from a partial counts too.
 *
 * Served as the virtual module `virtual:kmwc-chapters` (see index.js), which
 * the spotlight imports lazily on first open.
 *
 * Each entry links by section code when the heading has one (`#th07` — the
 * kit resolves it on arrival, see chapter-links.js), else by the slug of its
 * heading text, the same slug the chapter nav assigns. Pure string work, like
 * page-composer.js.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { composePage } from './page-composer.js';
import { generateSlug, getChapterCode } from '../examples/sections.js';
import { CHAPTER_CODE_PATTERN } from '../examples/constants.js';

/** Pages that are not part of the chapter index (the landing page has cards, not chapters). */
export const UNINDEXED_PAGE_NAMES = ['index'];

const COMMENT_SCRIPT_OR_STYLE_PATTERN = /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi;
const HEADING_PATTERN = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
const PAGE_HEADING_PATTERN = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i;
const DOCUMENT_TITLE_PATTERN = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
// The chips sections.js strips from a label (HEADING_CHIP_SELECTOR: `.badge`).
const BADGE_PATTERN = /<span\b[^>]*\bclass="[^"]*\bbadge\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi;
const TAG_PATTERN = /<[^>]+>/g;

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–', hellip: '…', rarr: '→', larr: '←' };

export function mapToDecodedText(html) {
  return html.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    if (name[0] === '#') {
      const codePoint = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
  });
}

/** Heading HTML → the label the kit shows (badges dropped, tags stripped, entities decoded). */
export function getHeadingText(headingHtml) {
  const text = mapToDecodedText(headingHtml.replace(BADGE_PATTERN, '').replace(TAG_PATTERN, ''));
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Chapters of one composed page.
 * @param {string} html the composed page
 * @param {{ pageHref: string }} pageInfo
 */
export function getPageChapters(html, { pageHref }) {
  const visibleHtml = html.replace(COMMENT_SCRIPT_OR_STYLE_PATTERN, '');
  // The <h1> (the layout's page title); <title> carries the site name after " — ".
  const headingTitleMatch = visibleHtml.match(PAGE_HEADING_PATTERN);
  const documentTitleMatch = visibleHtml.match(DOCUMENT_TITLE_PATTERN);
  const pageTitle =
    (headingTitleMatch && getHeadingText(headingTitleMatch[1])) ||
    (documentTitleMatch && getHeadingText(documentTitleMatch[1]).split(' — ')[0]) ||
    pageHref;

  const usedAnchors = new Set();
  const chapters = [];
  for (const headingMatch of visibleHtml.matchAll(HEADING_PATTERN)) {
    const label = getHeadingText(headingMatch[1]);
    if (!label) continue;
    const code = getChapterCode(label);
    let anchor = code ? code.toLowerCase() : generateSlug(label) || `section-${chapters.length + 1}`;
    if (usedAnchors.has(anchor)) {
      let suffix = 2;
      while (usedAnchors.has(`${anchor}-${suffix}`)) suffix++;
      anchor = `${anchor}-${suffix}`;
    }
    usedAnchors.add(anchor);
    chapters.push({
      code,
      title: code ? label.replace(CHAPTER_CODE_PATTERN, '') : label,
      label,
      pageHref,
      pageTitle,
      href: `${pageHref}#${anchor}`,
    });
  }
  return chapters;
}

/**
 * Chapters of every example page, in page order (alphabetical, as Vite builds them).
 * @param {import('../config.d.ts').KmwcConfig} config
 * @param {Record<string, string>} pages page name → absolute path (getExamplePages)
 */
export function generateChapterIndex(config, pages, readFile = (path) => readFileSync(path, 'utf8')) {
  return Object.entries(pages)
    .filter(([pageName]) => !UNINDEXED_PAGE_NAMES.includes(pageName))
    .sort(([firstName], [secondName]) => firstName.localeCompare(secondName))
    .flatMap(([, pagePath]) => {
      const pageHref = basename(pagePath);
      try {
        const composedHtml = composePage(readFile(pagePath), { config, pagePath: `/${pageHref}` });
        return getPageChapters(composedHtml, { pageHref });
      } catch {
        return []; // a broken page reports its own error when served — never break the index
      }
    });
}
