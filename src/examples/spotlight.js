/**
 * SPOTLIGHT — search every chapter of every example page and jump to it.
 *
 * MIRRORS web-commandpalette (wcp) without depending on it: the shell markup
 * and class names, the row / section / footer markup, the keyboard map, and
 * open / close (focus return, body scroll lock, phone fullscreen sheet). Every
 * block marked `mirrors …` keeps the wcp structure line for line, in devkit
 * naming — scripts/spotlight-mirror.json records the wcp commit it is aligned
 * to and `npm run check:spotlight-mirror` lists what changed there since. A bug
 * fixed in one gets ported to the other.
 *
 * Spotlight-only: a single fixed list (no modes, wizards, providers, usage),
 * rows are links (Ctrl/⌘+Enter or a modified click opens a new tab), the
 * header "Search" trigger button, and the chapter data: the Vite plugin's
 * site-wide index (vite/chapter-index.js, imported on first use) with the
 * current page's chapters read live from the DOM.
 *
 * Ctrl/⌘+K toggles. Off with package.json#kmwc.examples.isSpotlightEnabled =
 * false. Styles: css/spotlight.css.
 */
import { ensureSectionAnchors, getChapterCode } from './sections.js';
import { searchChapters, renderHighlightedText, mapToEscapedHtml } from './chapter-search.js';
import { scrollToChapterHash } from './chapter-links.js';
import { getPageConfig } from './page-config.js';
import {
  CHAPTER_CODE_PATTERN,
  SPOTLIGHT_CLASSES,
  SPOTLIGHT_FULLSCREEN_MEDIA,
  SPOTLIGHT_ITEM_ID_PREFIX,
  SPOTLIGHT_OPEN_KEY,
  SPOTLIGHT_PAGE_STEP,
  SPOTLIGHT_RESULTS_ID,
} from './constants.js';

const LABELS = {
  dialogLabel: 'Search chapters',
  placeholder: 'Search chapters — code (TH07) or title',
  close: 'Close',
  navigate: 'Navigate',
  jump: 'Jump',
  newTab: 'New tab',
  noResults: 'No chapter matches “{query}”',
  noChapters: 'No chapters indexed',
  resultsCount: '{count} chapters',
  thisPage: '{page} · this page',
};

const SEARCH_ICON_HTML =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line>' +
  '</svg>';
const CLOSE_ICON_HTML =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>';

const getItemId = (index) => `${SPOTLIGHT_ITEM_ID_PREFIX}${index}`;
const fillLabel = (template, values) => template.replace(/\{(\w+)\}/g, (placeholder, name) => (name in values ? String(values[name]) : placeholder));

// ── shared helpers (mirrors) ─────────────────────────────────────────────────

// mirrors web-commandpalette src/render.ts isMac()
export const checkIsMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Keycap text for a Ctrl/⌘ + letter shortcut: `Ctrl K` / `⌘K`. */
// mirrors web-commandpalette src/render.ts chordKeycap()
export const getChordKeycap = (letter) => (!letter ? '' : checkIsMac() ? `⌘${letter.toUpperCase()}` : `Ctrl ${letter.toUpperCase()}`);

/** Is the (shadow-piercing) event origin a text-entry field? */
// mirrors web-commandpalette src/keyboard.ts isTypingTarget()
export function checkIsTypingTarget(event) {
  const target = event.composedPath?.()[0] ?? event.target;
  if (!target || !(target instanceof Element)) return false;
  const tagName = target.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target.isContentEditable;
}

/** The new active index after a move. Arrows wrap, the rest clamp. */
// mirrors web-commandpalette src/palette.ts PaletteEngine.move()
export function getMovedIndex(activeIndex, length, direction) {
  if (!length) return activeIndex;
  const fromIndex = activeIndex < 0 ? 0 : activeIndex;
  switch (direction) {
    case 'down': return activeIndex >= length - 1 ? 0 : activeIndex + 1;
    case 'up': return activeIndex <= 0 ? length - 1 : activeIndex - 1;
    case 'pageDown': return Math.min(length - 1, fromIndex + SPOTLIGHT_PAGE_STEP);
    case 'pageUp': return Math.max(0, fromIndex - SPOTLIGHT_PAGE_STEP);
    case 'home': return 0;
    case 'end': return length - 1;
  }
  return activeIndex;
}

const KEY_DIRECTIONS = { ArrowDown: 'down', ArrowUp: 'up', PageDown: 'pageDown', PageUp: 'pageUp', Home: 'home', End: 'end' };

// mirrors web-components-core menu/open-menu.ts deepActiveElement()
function getDeepActiveElement() {
  let activeElement = document.activeElement;
  while (activeElement?.shadowRoot?.activeElement) activeElement = activeElement.shadowRoot.activeElement;
  return activeElement;
}

let scrollLockCount = 0;
let stashedOverflow = null;
/** Lock <body> scrolling; returns the release (idempotent). */
// mirrors web-components-core overlay/scroll-lock.ts lockBodyScroll()
function lockBodyScroll() {
  if (scrollLockCount === 0) {
    stashedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount++;
  let isReleased = false;
  return () => {
    if (isReleased) return;
    isReleased = true;
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0 && stashedOverflow !== null) {
      document.body.style.overflow = stashedOverflow;
      stashedOverflow = null;
    }
  };
}

// ── markup (mirrors) ─────────────────────────────────────────────────────────

/** The dialog shell. */
// mirrors web-commandpalette src/render.ts createShell() (no tokens / context pill / confirmation)
function createShell() {
  const classes = SPOTLIGHT_CLASSES;
  const root = document.createElement('div');
  root.className = classes.root;
  root.innerHTML = `
    <div class="${classes.backdrop}"></div>
    <div class="${classes.container}" role="dialog" aria-modal="true" aria-label="${LABELS.dialogLabel}">
      <div class="${classes.fullscreenBar}">
        <span class="${classes.fullscreenTitle}">${LABELS.dialogLabel}</span>
        <button type="button" class="${classes.close}" aria-label="${LABELS.close}">${CLOSE_ICON_HTML}</button>
      </div>
      <div class="${classes.search}">
        <div class="${classes.inputWrapper}">
          <input type="text" class="${classes.input}" autocomplete="off" spellcheck="false" placeholder="${LABELS.placeholder}"
            aria-label="${LABELS.dialogLabel}" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="${SPOTLIGHT_RESULTS_ID}">
        </div>
      </div>
      <div class="${classes.results}" id="${SPOTLIGHT_RESULTS_ID}" role="listbox"></div>
      <div class="${classes.footer}"></div>
      <div class="${classes.live}" aria-live="polite" aria-atomic="true"></div>
    </div>`;
  const query = (selector) => root.querySelector(`.${selector}`);
  return {
    root,
    backdrop: query(classes.backdrop),
    container: query(classes.container),
    closeButton: query(classes.close),
    input: query(classes.input),
    results: query(classes.results),
    footer: query(classes.footer),
    live: query(classes.live),
  };
}

// mirrors web-commandpalette src/render.ts itemHtml() (a link; the code takes the icon slot)
function renderItemHtml(chapter, index, isActive, needle) {
  const classes = SPOTLIGHT_CLASSES;
  return (
    `<a class="${classes.item}${isActive ? ` ${classes.itemActive}` : ''}"` +
    ` id="${getItemId(index)}" data-index="${index}" role="option" aria-selected="${isActive}" href="${mapToEscapedHtml(chapter.href)}">` +
    (chapter.code ? `<span class="${classes.itemCode}">${renderHighlightedText(chapter.code, needle)}</span>` : '') +
    `<span class="${classes.itemContent}">` +
    `<span class="${classes.itemTitle}">${renderHighlightedText(chapter.title, needle)}</span>` +
    `</span>` +
    `</a>`
  );
}

/** A heading + rows. */
// mirrors web-commandpalette src/render.ts sectionHtml()
function renderSectionHtml(heading, rowsHtml) {
  const classes = SPOTLIGHT_CLASSES;
  return (
    `<div class="${classes.homeSection}" role="group"${heading ? ` aria-label="${mapToEscapedHtml(heading)}"` : ''}>` +
    (heading ? `<div class="${classes.homeHeading}"><span aria-hidden="true">${mapToEscapedHtml(heading)}</span></div>` : '') +
    `${rowsHtml}</div>`
  );
}

/** Rows, with a heading section per run of the same page. */
// mirrors web-commandpalette src/render.ts rowsHtml()
function renderRowsHtml(chapters, activeIndex, needle, getGroupHeading) {
  let html = '';
  let group;
  let rowsHtml = '';
  const flush = () => {
    html += group ? renderSectionHtml(getGroupHeading(group), rowsHtml) : rowsHtml;
    rowsHtml = '';
  };
  chapters.forEach((chapter, index) => {
    if (chapter.pageHref !== group) {
      flush();
      group = chapter.pageHref;
    }
    rowsHtml += renderItemHtml(chapter, index, index === activeIndex, needle);
  });
  flush();
  return html;
}

// mirrors web-commandpalette src/render.ts footerHtml() hint()
function renderFooterHtml() {
  const classes = SPOTLIGHT_CLASSES;
  const renderHint = (key, text) =>
    `<div class="${classes.hint}"><span class="${classes.key}">${mapToEscapedHtml(key)}</span><span>${mapToEscapedHtml(text)}</span></div>`;
  return [
    renderHint('↑↓', LABELS.navigate),
    renderHint('↵', LABELS.jump),
    renderHint(checkIsMac() ? '⌘↵' : 'Ctrl ↵', LABELS.newTab),
    renderHint('Esc', LABELS.close),
  ].join('');
}

// ── chapter data (spotlight only) ────────────────────────────────────────────

let chapterIndexPromise = null;
/** The site-wide index from the Vite plugin; empty when served without it. */
function loadChapterIndex() {
  // A literal id: Vite resolves it to the plugin's virtual module (vite/index.js).
  chapterIndexPromise ??= import('virtual:kmwc-chapters').then(
    (chapterIndexModule) => chapterIndexModule.default || [],
    () => []
  );
  return chapterIndexPromise;
}

function getCurrentPageHref() {
  return decodeURIComponent(location.pathname.split('/').pop() || 'index.html');
}

const checkIsCurrentPage = (pageHref, currentPageHref) => pageHref === currentPageHref || pageHref.replace(/\.html$/, '') === currentPageHref;

/** The current page's chapters, read from the DOM (same shape as the index entries). */
function getLivePageChapters(currentPageHref) {
  const pageTitle = document.querySelector('h1')?.textContent.trim() || document.title;
  return ensureSectionAnchors().map((section) => {
    const code = getChapterCode(section.label);
    return {
      code,
      title: code ? section.label.replace(CHAPTER_CODE_PATTERN, '') : section.label,
      label: section.label,
      pageHref: currentPageHref,
      pageTitle,
      href: `${currentPageHref}#${code ? code.toLowerCase() : section.id}`,
    };
  });
}

/** This page first (live), then every other page from the index. */
function mapToSearchedChapters(indexedChapters) {
  const currentPageHref = getCurrentPageHref();
  const otherPageChapters = indexedChapters.filter((chapter) => !checkIsCurrentPage(chapter.pageHref, currentPageHref));
  return [...getLivePageChapters(currentPageHref), ...otherPageChapters];
}

// ── the spotlight ────────────────────────────────────────────────────────────

let mountedSpotlight = null;

/**
 * Mount (or remount) the spotlight. Returns null when the site turned it off.
 * @returns {{ open(): void, close(): void, toggle(): void, unmount(): void } | null}
 */
export function mountSpotlight() {
  mountedSpotlight?.unmount();
  mountedSpotlight = null;
  if (!getPageConfig().isSpotlightEnabled) return null;

  const classes = SPOTLIGHT_CLASSES;
  const shell = createShell();
  const { root, backdrop, container, closeButton, input, results, footer, live } = shell;
  footer.innerHTML = renderFooterHtml();

  const shortcutKeycap = getChordKeycap(SPOTLIGHT_OPEN_KEY);
  const triggerButton = document.createElement('button');
  triggerButton.type = 'button';
  triggerButton.className = classes.trigger;
  triggerButton.setAttribute('aria-label', `${LABELS.dialogLabel} (${shortcutKeycap})`);
  triggerButton.title = `${LABELS.dialogLabel} (${shortcutKeycap})`;
  triggerButton.innerHTML = `${SEARCH_ICON_HTML}<kbd class="${classes.triggerKey}">${shortcutKeycap}</kbd>`;

  document.body.append(triggerButton, root);
  const fullscreenQuery = window.matchMedia?.(SPOTLIGHT_FULLSCREEN_MEDIA);

  // ── state ────────────────────────────────────────────────────────────────
  let isOpen = false;
  let searchedChapters = [];
  let shownChapters = [];
  let activeIndex = -1;
  let returnFocusElement = null;
  let releaseScroll = null;

  // ── render ───────────────────────────────────────────────────────────────
  function renderResults() {
    const needle = input.value;
    const currentPageHref = getCurrentPageHref();
    shownChapters = searchChapters(searchedChapters, needle);
    activeIndex = shownChapters.length ? 0 : -1;
    const getGroupHeading = (pageHref) => {
      const pageTitle = shownChapters.find((chapter) => chapter.pageHref === pageHref)?.pageTitle ?? pageHref;
      return checkIsCurrentPage(pageHref, currentPageHref) ? fillLabel(LABELS.thisPage, { page: pageTitle }) : pageTitle;
    };
    if (shownChapters.length) results.innerHTML = renderRowsHtml(shownChapters, activeIndex, needle, getGroupHeading);
    else {
      const emptyText = searchedChapters.length ? fillLabel(LABELS.noResults, { query: needle.trim() }) : LABELS.noChapters;
      results.innerHTML = `<div class="${classes.empty}">${mapToEscapedHtml(emptyText)}</div>`;
    }
    live.textContent = fillLabel(LABELS.resultsCount, { count: shownChapters.length });
    syncActiveItem();
  }

  // mirrors web-commandpalette src/render.ts Renderer #paintActive() + #syncActiveDescendant() + #scrollActive()
  function syncActiveItem() {
    const previousItem = results.querySelector(`.${classes.itemActive}`);
    const nextItem = activeIndex >= 0 ? results.querySelector(`#${getItemId(activeIndex)}`) : null;
    if (previousItem !== nextItem) {
      if (previousItem) {
        previousItem.classList.remove(classes.itemActive);
        previousItem.setAttribute('aria-selected', 'false');
      }
      if (nextItem) {
        nextItem.classList.add(classes.itemActive);
        nextItem.setAttribute('aria-selected', 'true');
      }
    }
    if (activeIndex >= 0) input.setAttribute('aria-activedescendant', getItemId(activeIndex));
    else input.removeAttribute('aria-activedescendant');
    nextItem?.scrollIntoView?.({ block: 'nearest' });
  }

  function setActive(index) {
    if (index < 0 || index >= shownChapters.length || index === activeIndex) return;
    activeIndex = index;
    syncActiveItem();
  }

  // ── commit (spotlight only: rows are links) ──────────────────────────────
  function openChapter(chapter, isNewTab) {
    if (!chapter) return;
    if (isNewTab) {
      window.open(chapter.href, '_blank', 'noopener');
      return;
    }
    close();
    if (!checkIsCurrentPage(chapter.pageHref, getCurrentPageHref())) {
      location.href = chapter.href;
      return;
    }
    const hash = chapter.href.slice(chapter.href.indexOf('#'));
    // Same hash again fires no hashchange — scroll ourselves.
    if (location.hash === hash) scrollToChapterHash(hash);
    else location.hash = hash;
  }

  // ── open / close ─────────────────────────────────────────────────────────
  // mirrors web-commandpalette src/web-component.ts open()
  function open() {
    if (isOpen) return;
    isOpen = true;
    returnFocusElement = getDeepActiveElement();
    input.value = '';
    root.classList.toggle(classes.rootFullscreen, !!fullscreenQuery?.matches);
    root.classList.add(classes.rootActive);
    releaseScroll = lockBodyScroll();
    loadChapterIndex().then((indexedChapters) => {
      searchedChapters = mapToSearchedChapters(indexedChapters);
      if (isOpen) renderResults();
    });
    input.focus();
  }

  // mirrors web-commandpalette src/web-component.ts close()
  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove(classes.rootActive);
    releaseScroll?.();
    releaseScroll = null;
    const backElement = returnFocusElement;
    returnFocusElement = null;
    // Blur first: when focus came from <body> (not focusable), it would otherwise stay in the hidden input.
    input.blur();
    if (backElement?.isConnected && typeof backElement.focus === 'function') backElement.focus();
  }

  // mirrors web-commandpalette src/web-component.ts toggle()
  function toggle() {
    if (isOpen) close();
    else open();
  }

  // ── events ───────────────────────────────────────────────────────────────
  triggerButton.addEventListener('click', open);
  input.addEventListener('input', renderResults);

  // mirrors web-commandpalette src/keyboard.ts handleInputKeydown() (no wizard / paging / favorites keys)
  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    const direction = KEY_DIRECTIONS[event.key];
    if (direction) {
      event.preventDefault();
      setActive(getMovedIndex(activeIndex, shownChapters.length, direction));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      openChapter(shownChapters[activeIndex], event.ctrlKey || event.metaKey);
    } else if (event.key === 'Tab') {
      event.preventDefault(); // wcp: Tab selects one wizard step — a jump list has none; keep focus here
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  results.addEventListener('pointermove', (event) => {
    const itemElement = event.target.closest?.('[data-index]');
    if (itemElement) setActive(Number(itemElement.dataset.index));
  });

  results.addEventListener('click', (event) => {
    const itemElement = event.target.closest?.('[data-index]');
    // Modified clicks (new tab / window) are the browser's.
    if (!itemElement || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openChapter(shownChapters[Number(itemElement.dataset.index)], false);
  });

  backdrop.addEventListener('click', close);
  closeButton.addEventListener('click', close);

  // Focus trap: from anywhere else in the dialog (the fullscreen close button) Tab returns to the input.
  // mirrors web-commandpalette src/web-component.ts container keydown (no feedback line)
  container.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && event.target !== input) {
      event.preventDefault();
      input.focus();
    } else if (event.key === 'Escape' && event.target !== input) {
      event.preventDefault();
      close();
    }
  });

  // mirrors web-commandpalette src/keyboard.ts GlobalKeys.handle() (Ctrl/⌘+openKey only — no `g <letter>` sequences)
  const handleDocumentKeydown = (event) => {
    if (event.defaultPrevented) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === SPOTLIGHT_OPEN_KEY) {
      event.preventDefault();
      toggle();
    }
  };
  document.addEventListener('keydown', handleDocumentKeydown);

  // Warm the index once the page is idle, so the first open is instant.
  (window.requestIdleCallback || setTimeout)(() => loadChapterIndex());

  mountedSpotlight = {
    open,
    close,
    toggle,
    unmount() {
      document.removeEventListener('keydown', handleDocumentKeydown);
      close();
      triggerButton.remove();
      root.remove();
    },
  };
  return mountedSpotlight;
}
