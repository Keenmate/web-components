/**
 * Section discovery shared by the chapter nav and the copy-link buttons — ONE
 * slug algorithm, so the "on this page" jump list and the copied deep links
 * always agree on every hash.
 *
 * Sections = every <h2> inside `.container` (falling back to <body>). The
 * anchor id lives on the section wrapper (`.card` / `.example-section`),
 * reusing an existing section/h2 id before slugging the heading text.
 * Idempotent: a second call returns the same ids.
 */
import { CHAPTER_CODE_PATTERN, HEADING_CHIP_SELECTOR, SECTION_CONTAINER_SELECTOR, SECTION_SELECTOR } from './constants.js';

export function generateSlug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getHeadingLabel(heading, fallbackLabel) {
  const headingClone = heading.cloneNode(true);
  headingClone.querySelectorAll(HEADING_CHIP_SELECTOR).forEach((chip) => chip.remove());
  return (headingClone.textContent || '').replace(/\s+/g, ' ').trim() || fallbackLabel;
}

/**
 * Make sure every section has an anchor id, and return the sections in order.
 * @param {Document} [root]
 * @returns {Array<{ heading: HTMLElement, section: HTMLElement, id: string, label: string }>}
 */
export function ensureSectionAnchors(root = document) {
  const container = root.querySelector(SECTION_CONTAINER_SELECTOR) || root.body || root;
  const headings = [...container.querySelectorAll('h2')];
  const usedIds = new Set();

  return headings.map((heading, headingIndex) => {
    const section = heading.closest(SECTION_SELECTOR) || heading.parentElement || heading;
    const label = getHeadingLabel(heading, `Section ${headingIndex + 1}`);

    let id = section.id || heading.id;
    if (!id) {
      id = generateSlug(label) || `section-${headingIndex + 1}`;
      if (usedIds.has(id)) {
        let suffix = 2;
        while (usedIds.has(`${id}-${suffix}`)) suffix++;
        id = `${id}-${suffix}`;
      }
      section.id = id;
    }
    usedIds.add(id);
    return { heading, section, id, label };
  });
}

/** `TH07 · Title` → 'TH07'; an uncoded label (`Summary`) → null. */
export function getChapterCode(label) {
  return String(label).match(CHAPTER_CODE_PATTERN)?.[1] ?? null;
}

/** Comparison key for a code: case and leading zeros don't matter (`TH07`, `th7` → 'th7'). */
export function mapToCodeKey(code) {
  return String(code).toLowerCase().replace(/^([a-z]+)0+(?=\d)/, '$1');
}

/**
 * The section a URL hash points at: its anchor id, else its section code
 * (`#th07`, `#th7` — the short link the codes exist for), else the slug of its
 * heading text (an uncoded chapter whose section carries its own id).
 * @param {string} hash `#…` or the bare fragment
 * @param {ReturnType<typeof ensureSectionAnchors>} sections
 */
export function findSectionByHash(hash, sections) {
  let fragment = String(hash).replace(/^#/, '');
  try {
    fragment = decodeURIComponent(fragment);
  } catch {
    // a malformed escape — match it as written
  }
  if (!fragment) return null;
  const fragmentKey = mapToCodeKey(fragment);
  return (
    sections.find((section) => section.id === fragment) ??
    sections.find((section) => {
      const code = getChapterCode(section.label);
      return code !== null && mapToCodeKey(code) === fragmentKey;
    }) ??
    sections.find((section) => generateSlug(section.label) === fragment.toLowerCase()) ??
    null
  );
}
