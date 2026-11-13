/**
 * Chapter search for the spotlight. MIRRORS web-commandpalette — see
 * scripts/spotlight-mirror.json for the files and the commit it is aligned to;
 * `npm run check:spotlight-mirror` lists what changed there since. A block
 * marked `mirrors …` keeps the wcp structure line for line (devkit naming): fix
 * a bug in one, port it to the other.
 *
 * Matching is wcp's: lower-cased substring of the whole query against any
 * field — here the section code and the heading text. On top (spotlight only):
 * a query that is a section code finds it without the zero padding (`th7` →
 * TH07), and the order is exact code, then codes starting with the query, then
 * the rest — each in index order. Pure, so it is unit-tested.
 */
import { mapToCodeKey } from './sections.js';

const RANK_EXACT_CODE = 0;
const RANK_CODE_PREFIX = 1;
const RANK_TEXT = 2;

// mirrors web-commandpalette src/filter.ts `norm`
const mapToNormalizedText = (value) => (value == null ? '' : String(value)).toLowerCase();

// mirrors web-commandpalette src/icons.ts escapeHtml()
export function mapToEscapedHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Substring match of `needle` against any of `fields`. Empty needle matches all. */
// mirrors web-commandpalette src/filter.ts matchesAny()
export function checkMatchesAny(fields, needle) {
  const query = mapToNormalizedText(needle).trim();
  if (!query) return true;
  return fields.some((field) => mapToNormalizedText(field).includes(query));
}

/** The fields a chapter is searched by (wcp: commandFields()). */
export function getChapterFields(chapter) {
  return [chapter.code, chapter.title];
}

/**
 * @param {Array<{ code: string | null, title: string }>} chapters
 * @param {string} query
 * @returns the matching chapters, best first (all of them for an empty query)
 */
export function searchChapters(chapters, query) {
  const needle = mapToNormalizedText(query).trim();
  if (!needle) return chapters.slice();
  const queryCodeKey = mapToCodeKey(needle);

  const rankedChapters = [];
  chapters.forEach((chapter, chapterIndex) => {
    const code = mapToNormalizedText(chapter.code);
    const isExactCode = code !== '' && mapToCodeKey(code) === queryCodeKey;
    if (!isExactCode && !checkMatchesAny(getChapterFields(chapter), needle)) return;
    const rank = isExactCode ? RANK_EXACT_CODE : code.startsWith(needle) ? RANK_CODE_PREFIX : RANK_TEXT;
    rankedChapters.push({ chapter, rank, chapterIndex });
  });

  return rankedChapters
    .sort((first, second) => first.rank - second.rank || first.chapterIndex - second.chapterIndex)
    .map((rankedChapter) => rankedChapter.chapter);
}

/** Escape `text`, wrapping case-insensitive occurrences of `needle` in `<mark>`. */
// mirrors web-commandpalette src/render.ts highlight()
export function renderHighlightedText(text, needle) {
  const query = needle.trim();
  if (!query) return mapToEscapedHtml(text);
  // Matched in the original text: toLowerCase() may change its length ('İ' → 'i̇'), shifting every index.
  const queryPattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  let html = '';
  let index = 0;
  for (const match of text.matchAll(queryPattern)) {
    html += mapToEscapedHtml(text.slice(index, match.index)) + '<mark>' + mapToEscapedHtml(match[0]) + '</mark>';
    index = match.index + match[0].length;
  }
  return html + mapToEscapedHtml(text.slice(index));
}
