/**
 * Side-effect entry injected into every example page by the kmwc Vite plugin
 * (as `virtual:kmwc-examples`). Mounts the page-level helpers. The shared
 * styles are NOT imported here: the plugin loads them render-blocking (a
 * <link> in <head> in dev, an extracted stylesheet in builds), because a CSS
 * import in a module script only applies after the script runs — a flash of
 * unstyled page on every reload. Using this entry without the plugin? Import
 * `@keenmate/web-components-devkit/examples/style.css` yourself.
 *
 * Mounting is deferred one task past DOM-ready on purpose: in the production
 * build Vite hoists this import INTO the page's entry module, so it evaluates
 * BEFORE the page's own inline script (the reverse of dev order). Waiting a
 * task lets a page that builds its sections / registry in script (e.g.
 * `renderExamplesIndex`) finish first — in dev and build alike. Content
 * rendered later still (after a fetch) → call `mountExamplesKit()`.
 */
import { attachDomReadyHandler } from './page-config.js';
import { mountExamplesKit } from './kit.js';

attachDomReadyHandler(() => setTimeout(mountExamplesKit, 0));
