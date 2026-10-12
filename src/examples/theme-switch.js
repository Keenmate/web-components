/**
 * THEME SWITCH — a small fixed button cycling the page theme light → dark →
 * auto (follow the OS). It sets `data-theme` on <html>: the kit's tokens flip
 * via `color-scheme`, and components react through their own
 * `:host-context([data-theme="dark"])` selectors and inherited `color-scheme`
 * (rulebook color-scheme.md signals #3/#4) — so every example page doubles as
 * a dark-mode smoke test of the component.
 *
 * The plugin also injects a tiny inline script into <head> that applies the
 * saved theme before first paint (see `renderThemeBootstrapScript`), so a
 * reload doesn't flash light. Styles: css/theme-switch.css.
 */
import { DEFAULT_THEME, THEME_ATTRIBUTE, THEME_STORAGE_KEY, THEMES, THEME_SWITCH_CLASSES } from './constants.js';

const THEME_ICONS = { light: '☀', dark: '☾', auto: '◐' };
const THEME_LABELS = { light: 'Light theme', dark: 'Dark theme', auto: 'Follow system theme' };

export function getSavedTheme() {
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(savedTheme) ? savedTheme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme) {
  document.documentElement.dataset[THEME_ATTRIBUTE] = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — theme still applies for this page view */
  }
}

/** Inline <head> script source that applies the saved theme before first paint. */
export function renderThemeBootstrapScript() {
  return `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});document.documentElement.dataset.${THEME_ATTRIBUTE}=${JSON.stringify(THEMES)}.indexOf(t)>-1?t:${JSON.stringify(DEFAULT_THEME)}}catch(e){document.documentElement.dataset.${THEME_ATTRIBUTE}=${JSON.stringify(DEFAULT_THEME)}}`;
}

let mountedThemeSwitch = null;

/** @returns {{ unmount(): void }} */
export function mountThemeSwitch() {
  mountedThemeSwitch?.unmount();
  if (!document.documentElement.dataset[THEME_ATTRIBUTE]) applyTheme(getSavedTheme());

  const button = document.createElement('button');
  button.type = 'button';
  button.className = THEME_SWITCH_CLASSES.root;
  const iconElement = document.createElement('span');
  iconElement.className = THEME_SWITCH_CLASSES.icon;
  iconElement.setAttribute('aria-hidden', 'true');
  button.appendChild(iconElement);

  const renderButton = () => {
    const theme = document.documentElement.dataset[THEME_ATTRIBUTE];
    iconElement.textContent = THEME_ICONS[theme] || THEME_ICONS[DEFAULT_THEME];
    button.title = `${THEME_LABELS[theme]} (click to switch)`;
    button.setAttribute('aria-label', button.title);
  };
  button.addEventListener('click', () => {
    const currentTheme = document.documentElement.dataset[THEME_ATTRIBUTE];
    applyTheme(THEMES[(THEMES.indexOf(currentTheme) + 1) % THEMES.length]);
    renderButton();
  });
  renderButton();
  document.body.appendChild(button);

  mountedThemeSwitch = { unmount: () => button.remove() };
  return mountedThemeSwitch;
}
