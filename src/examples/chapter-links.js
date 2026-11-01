/**
 * CHAPTER LINKS — make every chapter reachable by a short link.
 *
 * Anchor ids are assigned by the kit after the page loads (sections.js), so the
 * browser can't scroll to them on arrival by itself. This resolves the hash
 * once the anchors exist, and on every hash change, accepting:
 *
 *   #bu02-declarative-markup   the anchor id (chapter nav, copy-link)
 *   #bu02  /  #bu2             the section code — the link the codes exist for
 *   #summary                   the slug of an uncoded heading
 *
 * A hash that names some other element on the page is left to the browser.
 */
import { ensureSectionAnchors, findSectionByHash } from './sections.js';

let isHashChangeAttached = false;

/**
 * Scroll to the chapter `hash` points at.
 * @returns {boolean} whether a chapter was found
 */
export function scrollToChapterHash(hash = location.hash) {
  const section = findSectionByHash(hash, ensureSectionAnchors());
  if (!section) return false;
  section.section.scrollIntoView({ block: 'start' });
  return true;
}

/** Resolve the current hash now, and every later hash change. Idempotent. */
export function attachChapterLinks() {
  if (location.hash) scrollToChapterHash();
  if (isHashChangeAttached) return;
  isHashChangeAttached = true;
  window.addEventListener('hashchange', () => scrollToChapterHash());
}
