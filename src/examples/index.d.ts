export interface KmwcPageConfig {
  id: string;
  title: string;
  tagline: string;
  version: string;
  packageName: string;
  buildTimestamp: string | null;
  mode: 'dev' | 'build';
  canonicalOrigin: string;
  storagePrefix: string;
  isSpotlightEnabled: boolean;
  repository: string;
  homepage: string;
  /** The @keenmate/web-components-devkit version that built the page (shown in the page footers). */
  devkitVersion: string;
  devkitHomepage: string;
}

/** One card on the examples index (plain data model). */
export interface ExamplePage {
  href: string;
  title: string;
  description?: string;
  icon?: string;
  badge?: string;
}

export interface ExamplesIndexConfig {
  pages: ExamplePage[];
  title?: string;
  tagline?: string;
  links?: Array<{ label: string; href: string }>;
  /** Where the page is rendered; defaults to <body>. */
  containerEl?: Element;
}

export interface ChapterNavConfig {
  /** Cross-page jump list (the index passes its registry). */
  items?: Array<{ label: string; href: string }>;
  /** "Back to Examples" target; '' hides it. */
  indexHref?: string;
}

/** One entry of the spotlight's chapter index (virtual:kmwc-chapters). */
export interface Chapter {
  /** Section code (`TH07`), null for an uncoded heading (`Summary`). */
  code: string | null;
  /** Heading text without the code. */
  title: string;
  /** Heading text as shown (`TH07 · Title`). */
  label: string;
  pageHref: string;
  pageTitle: string;
  /** `examples-theming.html#th07` — by code, else by the heading slug. */
  href: string;
}

export interface Section {
  heading: HTMLElement;
  section: HTMLElement;
  id: string;
  label: string;
}

export type Theme = 'light' | 'dark' | 'auto';

/** One event-log line: the event `name`, its `detail` (text, or anything JSON-able — pretty-printed). */
export interface LogLineSpec {
  name: string;
  detail?: unknown;
  /** The contract's role names (D-NC-23); no variant = the panel's default colour. */
  variant?: 'info' | 'success' | 'warning' | 'danger';
  /** Defaults to the current local time. */
  time?: string;
}

export function attachControlsPersistence(pageId: string, root?: ParentNode): { clear(): void };
export function getControlsStorageKey(pageId: string, storagePrefix?: string): string;

export function renderExamplesIndex(indexConfig: ExamplesIndexConfig): HTMLElement;

/** Re-mount copy-links + chapter nav + version badges + theme switch after rendering sections late. */
export function mountExamplesKit(): void;
export function mountChapterNav(navConfig?: ChapterNavConfig): { unmount(): void } | null;

/** Ctrl/Cmd+K chapter search across every example page (mirrors web-commandpalette); null when `isSpotlightEnabled` is false. */
export function mountSpotlight(): { open(): void; close(): void; toggle(): void; unmount(): void } | null;
/** Resolve the URL hash (`#th07`, an anchor id or a heading slug) now and on every hash change. */
export function attachChapterLinks(): void;
export function scrollToChapterHash(hash?: string): boolean;
/** Chapters whose code or title contains the query; exact code (`th7` = TH07) first, then code prefix, then the rest. */
export function searchChapters<T extends Pick<Chapter, 'code' | 'title'>>(chapters: T[], query: string): T[];
/** Substring match of `needle` against any field (web-commandpalette matchesAny). */
export function checkMatchesAny(fields: readonly unknown[], needle: string): boolean;
/** Escaped `text` with the occurrences of `needle` in <mark> (web-commandpalette highlight). */
export function renderHighlightedText(text: string, needle: string): string;
/** Escape `& < > " '` for HTML text and attribute values — use it whenever a page builds markup from data. */
export function mapToEscapedHtml(value: unknown): string;

export function attachCopyLinks(): void;
export function copyText(text: string): Promise<boolean>;
export function getSectionUrl(sectionId: string, canonicalOrigin?: string): string;

export function renderVersionBadges(root?: ParentNode): void;
/** A Copy button on every demo code block and every hand-written `.code-block[data-language]` without a button of its own. */
export function attachDemoCopyButtons(root?: ParentNode): void;
/** Label every cell of a stacking table (`.reference-table`, `.table-stack`) with its column header, and add table ARIA roles. */
export function attachStackedTables(root?: ParentNode): void;
export function getVersionLabel(pageConfig?: KmwcPageConfig): string;

/** Append the footer (Keenmate | GitHub | devkit version) to an example page; none on the index. */
export function mountPageFooter(): HTMLElement | null;
/** The footer line the index and the page footer share. */
export function renderFooterLineHtml(pageConfig: KmwcPageConfig, footerConfig: { links?: Array<{ label: string; href: string }>; devkitClass: string }): string;
/** Append a `.log-line` (time, name, detail) to a `.log-panel` and keep it in view. Throws on an unknown variant. */
export function appendLogLine(panel: HTMLElement, line: LogLineSpec): HTMLElement;
export function mountThemeSwitch(): { unmount(): void };
export function applyTheme(theme: Theme): void;
export function getSavedTheme(): Theme;

export function ensureSectionAnchors(root?: Document): Section[];
export function generateSlug(text: string): string;
export function getHeadingLabel(heading: Element, fallbackLabel: string): string;
export function getChapterCode(label: string): string | null;
export function mapToCodeKey(code: string): string;
export function findSectionByHash(hash: string, sections: Section[]): Section | null;

export function getPageConfig(): KmwcPageConfig;
export function attachDomReadyHandler(handler: () => void): void;

export const CHAPTER_NAV_CLASSES: Record<string, string>;
export const SPOTLIGHT_CLASSES: Record<string, string>;
export const SPOTLIGHT_RESULTS_ID: string;
export const SPOTLIGHT_ITEM_ID_PREFIX: string;
export const SPOTLIGHT_OPEN_KEY: string;
export const SPOTLIGHT_PAGE_STEP: number;
export const SPOTLIGHT_FULLSCREEN_MEDIA: string;
/** `TH07 · Title` → group 1 is the section code. */
export const CHAPTER_CODE_PATTERN: RegExp;
export const COPY_LINK_CLASSES: Record<string, string>;
export const INDEX_PAGE_CLASSES: Record<string, string>;
export const PAGE_FOOTER_CLASSES: { root: string; devkit: string };
export const LOG_LINE_CLASSES: { root: string; time: string; name: string };
export const LOG_LINE_VARIANT_CLASSES: Record<'info' | 'success' | 'warning' | 'danger', string>;
export const THEME_SWITCH_CLASSES: Record<string, string>;
export const DEMO_CLASSES: Record<string, string>;
export const THEMES: Theme[];
export const DEFAULT_THEME: Theme;
/** id of the chapter-nav panel (the toggle's `aria-controls`). */
export const CHAPTER_NAV_PANEL_ID: string;
/** Where sections live, and what counts as one (one `<h2>` each = one chapter). */
export const SECTION_CONTAINER_SELECTOR: string;
export const SECTION_SELECTOR: string;
export const STACKED_TABLE_SELECTOR: string;
export const COPYABLE_CODE_SELECTOR: string;
export const STACKED_TABLE_ROLES: Record<string, string>;
/** Heading children left out of a chapter label (badges, the copy-link button). */
export const HEADING_CHIP_SELECTOR: string;
export const VERSION_BADGE_SELECTOR: string;
export const DEFAULT_INDEX_HREF: string;
/** `data-<THEME_ATTRIBUTE>` on `<html>`, and the localStorage key of the saved choice. */
export const THEME_ATTRIBUTE: string;
export const THEME_STORAGE_KEY: string;
export const ACTIVE_CHAPTER_OFFSET_PX: number;
export const COPY_FEEDBACK_DURATION_MS: number;

declare global {
  interface Window {
    __KMWC__?: Partial<KmwcPageConfig>;
    CHAPTER_NAV_ITEMS?: Array<{ label: string; href: string }>;
  }
}
