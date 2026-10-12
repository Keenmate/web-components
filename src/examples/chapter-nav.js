/**
 * CHAPTER NAV — floating "on this page" jump navigator.
 *
 * A tab pinned to the right edge (~1/3 down the viewport) that expands into a
 * scroll-spied list of the page's chapters (every section <h2>, see
 * sections.js). Pages with fewer than two chapters render nothing.
 *
 * Cross-page mode: if `navConfig.items` is passed (or
 * `window.CHAPTER_NAV_ITEMS` is set — the examples index does this from its
 * page registry) the list jumps between pages instead, with no scroll-spy.
 *
 * The open panel is anchored to the tab with Floating UI (bundled by Vite);
 * if it fails to load, a viewport-clamped fixed placement takes over.
 * Styles: css/chapter-nav.css.
 */
import { ensureSectionAnchors } from './sections.js';
import { ACTIVE_CHAPTER_OFFSET_PX, CHAPTER_NAV_CLASSES, CHAPTER_NAV_PANEL_ID, DEFAULT_INDEX_HREF } from './constants.js';

let floatingUiPromise = null;
function loadFloatingUi() {
  floatingUiPromise ??= import('@floating-ui/dom').catch(() => null);
  return floatingUiPromise;
}

const TOGGLE_ICON_HTML =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<line x1="8" y1="6" x2="20" y2="6"></line>' +
  '<line x1="8" y1="12" x2="20" y2="12"></line>' +
  '<line x1="8" y1="18" x2="20" y2="18"></line>' +
  '<circle cx="4" cy="6" r="1.4"></circle>' +
  '<circle cx="4" cy="12" r="1.4"></circle>' +
  '<circle cx="4" cy="18" r="1.4"></circle>' +
  '</svg>';

/** The mounted nav — mounting again replaces it (pages that render sections late remount). */
let mountedChapterNav = null;

/**
 * Mount (or remount) the nav from the page's current sections.
 * @param {object} [navConfig]
 * @param {Array<{label: string, href: string}>} [navConfig.items] cross-page list
 * @param {string} [navConfig.indexHref] "Back to Examples" target ('' hides it)
 * @returns {{ unmount(): void } | null}
 */
export function mountChapterNav(navConfig = {}) {
  mountedChapterNav?.unmount();
  mountedChapterNav = null;

  const crossPageItems = navConfig.items || (Array.isArray(window.CHAPTER_NAV_ITEMS) ? window.CHAPTER_NAV_ITEMS : null);
  const isCrossPage = !!crossPageItems;
  const indexHref = navConfig.indexHref ?? DEFAULT_INDEX_HREF;

  const chapters = isCrossPage
    ? crossPageItems
        .filter((item) => item && item.href)
        .map((item, itemIndex) => ({ id: null, section: null, label: item.label || `Item ${itemIndex + 1}`, href: item.href }))
    : ensureSectionAnchors().map((section) => ({ ...section, href: `#${section.id}` }));
  if (chapters.length < 2) return null;

  // Warm the import so the panel can anchor on first open.
  loadFloatingUi();

  // ── build ────────────────────────────────────────────────────────────────
  const rootElement = document.createElement('div');
  rootElement.className = CHAPTER_NAV_CLASSES.root;

  const panelElement = document.createElement('nav');
  panelElement.className = CHAPTER_NAV_CLASSES.panel;
  panelElement.id = CHAPTER_NAV_PANEL_ID;
  panelElement.setAttribute('aria-label', isCrossPage ? 'Examples' : 'On this page');

  if (!isCrossPage && indexHref) {
    const backLink = document.createElement('a');
    backLink.className = CHAPTER_NAV_CLASSES.back;
    backLink.href = indexHref;
    backLink.textContent = '← Back to Examples';
    panelElement.appendChild(backLink);
  }

  const titleElement = document.createElement('div');
  titleElement.className = CHAPTER_NAV_CLASSES.title;
  titleElement.textContent = isCrossPage ? 'Examples' : 'On this page';
  panelElement.appendChild(titleElement);

  const listElement = document.createElement('ul');
  listElement.className = CHAPTER_NAV_CLASSES.list;
  const itemElementsById = Object.create(null);
  for (const chapter of chapters) {
    const listItem = document.createElement('li');
    const itemLink = document.createElement('a');
    itemLink.className = CHAPTER_NAV_CLASSES.item;
    itemLink.href = chapter.href;
    itemLink.textContent = chapter.label;
    itemLink.addEventListener('click', () => {
      if (chapter.id) activateChapter(chapter.id);
      closePanel();
    });
    listItem.appendChild(itemLink);
    listElement.appendChild(listItem);
    if (chapter.id) itemElementsById[chapter.id] = itemLink;
  }
  panelElement.appendChild(listElement);

  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = CHAPTER_NAV_CLASSES.toggle;
  toggleButton.setAttribute('aria-expanded', 'false');
  toggleButton.setAttribute('aria-controls', CHAPTER_NAV_PANEL_ID);
  toggleButton.setAttribute('aria-label', isCrossPage ? 'Jump to an example page' : 'Jump to a section on this page');
  toggleButton.innerHTML = TOGGLE_ICON_HTML;

  rootElement.append(toggleButton, panelElement);
  document.body.appendChild(rootElement);

  // Keep the wheel inside the panel even when it can't scroll further (or
  // doesn't overflow at all) — `overscroll-behavior` only covers the former.
  const handlePanelWheel = (event) => {
    const isAtTop = panelElement.scrollTop <= 0;
    const isAtBottom = panelElement.scrollTop + panelElement.clientHeight >= panelElement.scrollHeight - 1;
    if ((event.deltaY < 0 && isAtTop) || (event.deltaY > 0 && isAtBottom)) event.preventDefault();
    event.stopPropagation();
  };
  panelElement.addEventListener('wheel', handlePanelWheel, { passive: false });

  // ── positioning ──────────────────────────────────────────────────────────
  let stopAutoUpdateHandler = null;
  let positioningRequestId = 0;

  function positionPanel() {
    const requestId = ++positioningRequestId;
    loadFloatingUi().then((floatingUi) => {
      if (requestId !== positioningRequestId || !isPanelOpen) return; // closed before the import resolved
      if (!floatingUi) return positionPanelFallback();
      stopAutoUpdateHandler = floatingUi.autoUpdate(toggleButton, panelElement, () => {
        floatingUi
          .computePosition(toggleButton, panelElement, {
            placement: 'left-start',
            strategy: 'fixed',
            middleware: [
              floatingUi.offset(8),
              floatingUi.flip({ fallbackPlacements: ['right-start', 'bottom-end', 'top-end'] }),
              floatingUi.shift({ padding: 8 }),
            ],
          })
          .then((position) => {
            panelElement.style.left = `${position.x}px`;
            panelElement.style.top = `${position.y}px`;
          });
      });
    });
  }

  function positionPanelFallback() {
    const toggleRect = toggleButton.getBoundingClientRect();
    panelElement.style.left = 'auto';
    panelElement.style.right = `${window.innerWidth - toggleRect.left + 8}px`;
    panelElement.style.top = `${Math.max(8, Math.min(toggleRect.top, window.innerHeight - panelElement.offsetHeight - 8))}px`;
  }

  function stopPanelPositioning() {
    positioningRequestId++;
    if (stopAutoUpdateHandler) {
      stopAutoUpdateHandler();
      stopAutoUpdateHandler = null;
    }
  }

  // ── open / close ─────────────────────────────────────────────────────────
  let isPanelOpen = false;
  function openPanel() {
    isPanelOpen = true;
    rootElement.classList.add(CHAPTER_NAV_CLASSES.rootOpen);
    toggleButton.setAttribute('aria-expanded', 'true');
    positionPanel();
  }
  function closePanel() {
    isPanelOpen = false;
    rootElement.classList.remove(CHAPTER_NAV_CLASSES.rootOpen);
    toggleButton.setAttribute('aria-expanded', 'false');
    stopPanelPositioning();
  }
  toggleButton.addEventListener('click', () => (isPanelOpen ? closePanel() : openPanel()));

  const handleDocumentKeydown = (event) => {
    if (event.key === 'Escape' && isPanelOpen) {
      closePanel();
      toggleButton.focus();
    }
  };
  const handleDocumentClick = (event) => {
    if (isPanelOpen && !rootElement.contains(event.target)) closePanel();
  };
  document.addEventListener('keydown', handleDocumentKeydown);
  document.addEventListener('click', handleDocumentClick);

  // ── scroll-spy (in-page chapters only) ───────────────────────────────────
  let activeChapterId = null;
  function activateChapter(chapterId) {
    if (chapterId === activeChapterId) return;
    itemElementsById[activeChapterId]?.classList.remove(CHAPTER_NAV_CLASSES.itemActive);
    activeChapterId = chapterId;
    const itemLink = itemElementsById[chapterId];
    if (itemLink) {
      itemLink.classList.add(CHAPTER_NAV_CLASSES.itemActive);
      itemLink.scrollIntoView?.({ block: 'nearest' });
    }
  }
  function reconcileActiveChapter() {
    // At the bottom of the page the last chapters may never reach the top
    // threshold (short page / short trailing sections) — the last one wins.
    const isAtPageBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (isAtPageBottom && window.scrollY > 0) return activateChapter(chapters[chapters.length - 1].id);
    let currentChapterId = chapters[0].id;
    for (const chapter of chapters) {
      if (chapter.section.getBoundingClientRect().top <= ACTIVE_CHAPTER_OFFSET_PX) currentChapterId = chapter.id;
      else break;
    }
    activateChapter(currentChapterId);
  }
  let isFrameScheduled = false;
  const handleScroll = () => {
    if (isFrameScheduled) return;
    isFrameScheduled = true;
    requestAnimationFrame(() => {
      reconcileActiveChapter();
      isFrameScheduled = false;
    });
  };
  if (!isCrossPage) {
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    reconcileActiveChapter();
  }

  mountedChapterNav = {
    unmount() {
      stopPanelPositioning();
      document.removeEventListener('keydown', handleDocumentKeydown);
      document.removeEventListener('click', handleDocumentClick);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      rootElement.remove();
    },
  };
  return mountedChapterNav;
}
