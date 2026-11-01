/**
 * Side layer: every class name, selector, id and storage key the examples kit
 * emits or reads. Kit-generated DOM follows the rulebook's prefix + BEM rule
 * (`kmwc__element--modifier` shape, block `kmwc-<feature>`); the page
 * vocabulary authors write (`.card`, `.controls`, …) is deliberately NOT here
 * — it's styled by the kit but owned by the pages.
 */

export const CHAPTER_NAV_CLASSES = {
  root: 'kmwc-chapter-nav',
  rootOpen: 'kmwc-chapter-nav--open',
  toggle: 'kmwc-chapter-nav__toggle',
  panel: 'kmwc-chapter-nav__panel',
  back: 'kmwc-chapter-nav__back',
  title: 'kmwc-chapter-nav__title',
  list: 'kmwc-chapter-nav__list',
  item: 'kmwc-chapter-nav__item',
  itemActive: 'kmwc-chapter-nav__item--active',
};

export const CHAPTER_NAV_PANEL_ID = 'kmwc-chapter-nav-panel';

/**
 * Spotlight: the cross-page chapter search (spotlight.js). Element names
 * mirror web-commandpalette's `pa-command-palette__*` shell (pure-admin's
 * canonical command-palette snippet) under the kit prefix; `trigger` and
 * `itemCode` are the spotlight's own.
 */
export const SPOTLIGHT_CLASSES = {
  root: 'kmwc-spotlight',
  rootActive: 'kmwc-spotlight--active',
  rootFullscreen: 'kmwc-spotlight--fullscreen',
  backdrop: 'kmwc-spotlight__backdrop',
  container: 'kmwc-spotlight__container',
  fullscreenBar: 'kmwc-spotlight__fullscreen-bar',
  fullscreenTitle: 'kmwc-spotlight__fullscreen-title',
  close: 'kmwc-spotlight__close',
  search: 'kmwc-spotlight__search',
  inputWrapper: 'kmwc-spotlight__input-wrapper',
  input: 'kmwc-spotlight__input',
  results: 'kmwc-spotlight__results',
  homeSection: 'kmwc-spotlight__home-section',
  homeHeading: 'kmwc-spotlight__home-heading',
  item: 'kmwc-spotlight__item',
  itemActive: 'kmwc-spotlight__item--active',
  itemCode: 'kmwc-spotlight__item-code',
  itemContent: 'kmwc-spotlight__item-content',
  itemTitle: 'kmwc-spotlight__item-title',
  empty: 'kmwc-spotlight__empty',
  footer: 'kmwc-spotlight__footer',
  hint: 'kmwc-spotlight__hint',
  key: 'kmwc-spotlight__key',
  live: 'kmwc-spotlight__live',
  trigger: 'kmwc-spotlight__trigger',
  triggerKey: 'kmwc-spotlight__trigger-key',
};

export const SPOTLIGHT_RESULTS_ID = 'kmwc-spotlight-results';
export const SPOTLIGHT_ITEM_ID_PREFIX = 'kmwc-spotlight-item-';
/** The Ctrl/⌘ + letter that toggles the spotlight (wcp: `openKey`, default `k`). */
export const SPOTLIGHT_OPEN_KEY = 'k';
/** PgUp / PgDn step (wcp palette.ts PAGE_STEP). */
export const SPOTLIGHT_PAGE_STEP = 8;
/** Touch phone → fullscreen sheet (wcp: core's device classification, approximated in CSS terms). */
export const SPOTLIGHT_FULLSCREEN_MEDIA = '(pointer: coarse) and (max-width: 768px)';

/**
 * A section code at the start of a heading label: `TH07 · Title` (rulebook
 * example-pages.md). Forgiving on purpose — `EV4b` counts; enforcing the
 * format is the rulebook check's job.
 */
export const CHAPTER_CODE_PATTERN = /^([A-Z]{2,3}\d+[a-z]?)\s*·\s*/;

export const COPY_LINK_CLASSES = {
  root: 'kmwc-copy-link',
  rootCopied: 'kmwc-copy-link--copied',
  rootFailed: 'kmwc-copy-link--failed',
  icon: 'kmwc-copy-link__icon',
  iconLink: 'kmwc-copy-link__icon--link',
  iconCheck: 'kmwc-copy-link__icon--check',
  label: 'kmwc-copy-link__label',
};

export const INDEX_PAGE_CLASSES = {
  body: 'kmwc-index',
  page: 'kmwc-index__page',
  header: 'kmwc-index__header',
  tagline: 'kmwc-index__tagline',
  version: 'kmwc-index__version',
  cards: 'kmwc-index__cards',
  card: 'kmwc-index__card',
  icon: 'kmwc-index__icon',
  cardTitle: 'kmwc-index__card-title',
  cardDescription: 'kmwc-index__card-description',
  badge: 'kmwc-index__badge',
  footer: 'kmwc-index__footer',
  devkit: 'kmwc-index__devkit',
};

/** <kmwc-demo> output (rendered at build time by page-composer.js) + the kit's copy button. */
export const DEMO_CLASSES = {
  root: 'kmwc-demo',
  preview: 'kmwc-demo__preview',
  code: 'kmwc-demo__code',
  copyButton: 'kmwc-demo__copy',
  copyButtonCopied: 'kmwc-demo__copy--copied',
};

export const THEME_SWITCH_CLASSES = {
  root: 'kmwc-theme-switch',
  icon: 'kmwc-theme-switch__icon',
};

/** Section containers and the chips that must not leak into a heading label. */
export const SECTION_CONTAINER_SELECTOR = '.container';
export const SECTION_SELECTOR = '.card, .example-section';
export const HEADING_CHIP_SELECTOR = `.badge, .${COPY_LINK_CLASSES.root}`;

export const VERSION_BADGE_SELECTOR = '[data-kmwc-version], #version-badge';

export const DEFAULT_INDEX_HREF = 'index.html';

/** Page theme: `data-theme` on <html> — the same signal components react to. */
export const THEME_ATTRIBUTE = 'theme';
export const THEME_STORAGE_KEY = 'kmwc:examples:theme';
export const THEMES = ['light', 'dark', 'auto'];
export const DEFAULT_THEME = 'light';

/** A chapter counts as "current" once its top is within this many px of the viewport top. */
export const ACTIVE_CHAPTER_OFFSET_PX = 120;
export const COPY_FEEDBACK_DURATION_MS = 1600;
