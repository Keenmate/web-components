/**
 * Page-level config. The Vite plugin injects `window.__KMWC__` into every
 * example page's <head> (id, title, version, build timestamp, canonical
 * origin, …). Reading it through here gives sane defaults when a page is
 * opened outside the plugin (e.g. a fixture page or a plain static copy).
 */
export function getPageConfig() {
  const injectedConfig = (typeof window !== 'undefined' && window.__KMWC__) || {};
  return {
    id: injectedConfig.id || 'component',
    title: injectedConfig.title || document.title || '',
    tagline: injectedConfig.tagline || '',
    version: injectedConfig.version || '',
    packageName: injectedConfig.packageName || '',
    buildTimestamp: injectedConfig.buildTimestamp || null,
    mode: injectedConfig.mode || 'dev',
    canonicalOrigin: injectedConfig.canonicalOrigin || '',
    storagePrefix: injectedConfig.storagePrefix || injectedConfig.id || 'component',
    repository: injectedConfig.repository || '',
    homepage: injectedConfig.homepage || '',
  };
}

/** Run `handler` once the DOM is parsed (immediately if it already is). */
export function attachDomReadyHandler(handler) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handler, { once: true });
  else handler();
}
