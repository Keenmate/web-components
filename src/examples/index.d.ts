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
  repository: string;
  homepage: string;
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

export interface Section {
  heading: HTMLElement;
  section: HTMLElement;
  id: string;
  label: string;
}

export type Theme = 'light' | 'dark' | 'auto';

export function attachControlsPersistence(pageId: string, root?: ParentNode): { clear(): void };
export function getControlsStorageKey(pageId: string, storagePrefix?: string): string;

export function renderExamplesIndex(indexConfig: ExamplesIndexConfig): HTMLElement;

/** Re-mount copy-links + chapter nav + version badges + theme switch after rendering sections late. */
export function mountExamplesKit(): void;
export function mountChapterNav(navConfig?: ChapterNavConfig): { unmount(): void } | null;

export function attachCopyLinks(): void;
export function copyText(text: string): Promise<boolean>;
export function getSectionUrl(sectionId: string, canonicalOrigin?: string): string;

export function renderVersionBadges(root?: ParentNode): void;
export function attachDemoCopyButtons(root?: ParentNode): void;
export function getVersionLabel(pageConfig?: KmwcPageConfig): string;

export function mountThemeSwitch(): { unmount(): void };
export function applyTheme(theme: Theme): void;
export function getSavedTheme(): Theme;

export function ensureSectionAnchors(root?: Document): Section[];
export function generateSlug(text: string): string;
export function getHeadingLabel(heading: Element, fallbackLabel: string): string;

export function getPageConfig(): KmwcPageConfig;
export function attachDomReadyHandler(handler: () => void): void;

export const CHAPTER_NAV_CLASSES: Record<string, string>;
export const COPY_LINK_CLASSES: Record<string, string>;
export const INDEX_PAGE_CLASSES: Record<string, string>;
export const THEME_SWITCH_CLASSES: Record<string, string>;
export const DEMO_CLASSES: Record<string, string>;
export const THEMES: Theme[];
export const DEFAULT_THEME: Theme;

declare global {
  interface Window {
    __KMWC__?: Partial<KmwcPageConfig>;
    CHAPTER_NAV_ITEMS?: Array<{ label: string; href: string }>;
  }
}
