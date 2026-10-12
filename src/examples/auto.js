/**
 * Side-effect entry injected into every example page by the kmwc Vite plugin
 * (as `virtual:kmwc-examples`). Loads the shared styles and mounts the
 * page-level helpers.
 *
 * Mounting is deferred one task past DOM-ready on purpose: in the production
 * build Vite hoists this import INTO the page's entry module, so it evaluates
 * BEFORE the page's own inline script (the reverse of dev order). Waiting a
 * task lets a page that builds its sections / registry in script (e.g.
 * `renderExamplesIndex`) finish first — in dev and build alike. Content
 * rendered later still (after a fetch) → call `mountExamplesKit()`.
 */
import './css/style.css';
import { attachDomReadyHandler } from './page-config.js';
import { mountExamplesKit } from './kit.js';

attachDomReadyHandler(() => setTimeout(mountExamplesKit, 0));
