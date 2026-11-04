# Keenmate Web Components

The index of Keenmate's web components **and** the shared tooling that keeps
them in the same shape: `@keenmate/web-components-devkit`.

- **[Catalogue](#catalogue)**: every component, library, showcase and test
  harness, with CSS prefixes, dev ports and links. It's
  generated from [`components.json`](components.json).
- **[Devkit](#the-devkit)**: one Vite preset, one examples kit, one Playwright
  preset and the `kmwc` CLI, instead of a diverged copy of each in every repo.

> **The rules** — component structure, naming, CSS, theming, README, Custom
> Elements Manifest, publishing — live in the BlissFramework rulebook
> (`BlissFramework/guidelines/web-components/`, plus the JS coding guidelines
> in `BlissFramework/web/docs/coding-guidelines-javascript/`). The devkit
> **generates** what the rulebook asks for (`kmwc new`) and **checks** it
> (`kmwc doctor` runs the rulebook's `*.checks.sh` suites). Runtime code shared
> between components (BlissElement, the input table, converters, logging,
> positioning) lives in [`@keenmate/web-components-core`](../web-components-core).
> Nothing here ships inside a component's bundle.

## What's New in v1.0.0-rc07

- **CLI — `kmwc check-pages` finds what only a browser can see** — Migrating web-treeview turned up pages that pushed a phone sideways: an iOS-Files mockup 420px wide and a theme gallery built on `minmax(500px, 1fr)`. No static check could have caught that. `kmwc check-pages` loads every example page in Chromium at 1440, 390 and 320px. It reports page and console errors, failed requests, custom elements that never get defined, and pages wider than the viewport, naming the widest elements. It looks inside shadow roots and at long words that overflow their box. It ignores layers that can't widen a page: scrolling code blocks, hidden or fixed layers, a closed chapter-nav panel. It starts the repo's dev server, or `--url` points it at one already running (for example the built site on the preview port), and `--widths` changes the widths. `kmwc sync` adds a `check:pages` script and a `make check-pages` target.
- **Doctor — catches what the treeview and daterangepicker migrations got wrong** — Doctor now checks that every `./dist/…` target in package.json is a file the library build actually emits, and that the old UMD name matches `kmwc.library.globalName`. Without that, the preset's defaults would quietly have renamed treeview's global (`WebTreeView` → `WebTreeview`) and its CSS (`web-treeview.css` → `style.css`). Doctor also reports scripts that pin their own `--port`, config, Makefile and doc ports outside the repo's registry block, and sibling repos that listen inside it. This found web-daterangepicker on treeview's 12300 and web-multiselect / web-dropzone on daterangepicker's 12200. A Plausible site id that another repo also uses is an error, because treeview's traffic was being counted as web-multiselect's. Page CSS that duplicates kit classes (`.kbd`, `mark`, inline field widths, `margin-left: auto`) is a warning.
- **Doctor — `VALIDATION-NOTES.md` records accepted deviations** — The rulebook lets a component record an architectural decision instead of following a rule. Doctor still reported those as errors (treeview's C-CST-4, C-CSS-1 and C-NC-6). A rulebook check id used as a `##` heading in `VALIDATION-NOTES.md` (`## C-CST-4 / C-CST-10 — …`) now counts as a pass, and `--verbose` lists them. A mention in plain prose doesn't count.
- **check-vars — input variables are not dead** — Some component variables are public knobs that are read with a fallback and never declared. Treeview forwards `--wtv-context-menu-*` to core's private `--_km-menu-*` so a page-wide `--km-menu-*` still applies, and declaring them would break that chain. check-vars called all 26 of them dead. In the default mode a variable now counts as present when it is declared or read, and a read-with-fallback missing from the manifest is reported as undocumented. `cssVariables.sources` also takes a package path (`@keenmate/web-components-core/dist/menu/styles.js`) for the `--base-*` reads of a core module the component renders.
- **Example pages — fit a 320px phone, and injected scripts land in the right place** — A chapter heading that names an API outside `<code>` now breaks instead of widening the page. On a phone the index title is 2rem. Below 400px, body, card and demo padding shrink, so a 250px inline calendar fits inside a card. `mark` no longer splits a word. The Vite plugin now puts its head block after the real `<head>` tag (not `<header>` or the text "<head>"). It puts the kit script before the last `</body>`, so it can no longer land inside a page's inline script and break it. That's the failure web-multiselect's sed-based Dockerfile caused on its live action-buttons page.

## What's New in v1.0.0-rc06

- **Example pages — `<kbd>`, `<mark>`, field widths and `.push-end`** — Every component documents a keyboard map and most highlight search matches. Pages either left `<kbd>` in the browser's look (core's Interaction page had 18 bare keys) or styled `<mark>` themselves. A `<kbd>` now looks like the spotlight's key hints and a `<mark>` like its match highlight. Native fields are about 20 characters wide, so pages set inline widths; core had 14. A number field is now 7rem by default. `.w-xs` / `.w-sm` / `.w-md` / `.w-lg` (4 / 6 / 9 / 12rem) size a short field, and a `.form-group` still stretches it to the row. `.push-end` moves an item to the end of a `.controls` row. See the playground's WG08 and FC12.
- **Example pages — phone and contrast fixes** — Inline `<code>` now breaks anywhere. Before, a long identifier such as `resolvePresentation(mode, env, map)` in a heading made a page 350px wide on a 320px screen; code inside a `<pre>` keeps its lines. Muted log text on the light `.log-panel` (`--muted` lines, the seq / time / source cells, the empty placeholder) measured 2.83:1 in the light theme. It now uses `--kmwc-text-color-2`, and a spec checks every tone on both panels in both themes against WCAG AA's 4.5:1. Timeline rows wrap, so on a phone or with a long source name the detail drops under the cells instead of showing one letter per line. `.css-readout` gets a top margin after the demo it measures.
- **CLI — `kmwc <command> --help` no longer runs the command** — Only a top-level `--help` was handled, and unknown flags were silently ignored, so `kmwc sync --help` did a full sync and overwrote core's hand-written Makefile. Every command now lists the flags it accepts. `--help` / `-h` after any command prints that command's usage and exits 0, and an unknown option is an error (exit 2). A boolean flag no longer takes the next word as its value.
- **Libraries — `library: false`, `cssVariables: false`, and a doctor that knows the kind** — A repo like web-components-core builds its package with `tsc`. A plain `vite build` (the devkit's library mode) would empty its `dist/`, so `"kmwc": { "library": false }` now makes it refuse to run, while `vite build --mode examples` still builds the site. `"cssVariables": false` turns off the variables-manifest check, so sync stops re-adding `check:vars`. Doctor reads the registry kind (or `kmwc.kind`): a `library` runs only naming-conventions, readme-structure, publish-command and example-pages. On core that drops 12 errors and 4 "suite could not run" warnings that didn't apply to a library.

## Catalogue

<!-- kmwc:catalogue:start — generated by `npm run readme`, do not edit inside -->
### Components

| Component | Package | Prefix | Dev port | Links | Devkit | About |
|---|---|---|---:|---|:---:|---|
| **web-multiselect** | `@keenmate/web-multiselect` | `ms` | 12100 | [repo](https://github.com/keenmate/web-multiselect) · [examples](https://examples.web-multiselect.keenmate.dev) · [docs](https://web-multiselect.keenmate.dev) · `web-multiselect-showcase` · `web-multiselect-docs` | — | Lightweight multiselect web component with typeahead search, rich content support, and excellent keyboard… |
| **web-daterangepicker** | `@keenmate/web-daterangepicker` | `drp` | 12200 | [repo](https://github.com/keenmate/web-daterangepicker) · [docs](https://web-daterangepicker.keenmate.dev) · `web-daterangepicker-showcase` | ✅ | Lightweight date picker web component with excellent keyboard navigation and range selection |
| **web-treeview** | `@keenmate/web-treeview` | `wtv` | 12300 | [repo](https://github.com/keenmate/web-treeview) · `web-treeview-showcase` | ✅ | Lightweight treeview web component with hierarchical data display, search, expand/collapse, drag-drop, and… |
| **web-commandpalette** | `@keenmate/web-commandpalette` | `cp` | 12400 | [repo](https://github.com/keenmate/web-commandpalette) · [examples](https://examples.web-commandpalette.keenmate.dev) | ✅ | Framework-agnostic command-palette web component — modes, multi-step commands, scoped + global search,… |
| **web-dropzone** | `@keenmate/web-dropzone` | `dz` | 12500 | [repo](https://github.com/keenmate/web-dropzone) | — | Lightweight file dropzone web component with drag-drop, previews, validation, and multiple display modes. |
| **web-grid** | `@keenmate/web-grid` | `wg` | 12600 | [repo](https://github.com/keenmate/web-grid) · [docs](https://web-grid.keenmate.com) · [showcase](https://web-grid.keenmate.com) | — | Framework-agnostic data grid web component with sorting, filtering, inline editing, and keyboard navigation |
| **web-editor** | `@keenmate/web-editor` | `km` | 12700 | [examples](https://examples.web-editor.keenmate.dev) | ✅ | Keenmate Web Editor — a framework-agnostic WYSIWYG / Markdown editor built on ProseMirror. |
| **web-switch** | `@keenmate/web-switch` | — | 12800 | [repo](https://github.com/keenmate/web-switch) | — | Framework-agnostic web component wrapper for @keenmate/svelte-switch. Works with React, Vue, Angular, or… |
| **web-timepicker** | — | — | 12900 | — | — | Vanilla-JS prototypes (spiral / slider time pickers); no package yet. |
| **web-wysiwyg** | — | — | 13000 | — | — | ProseMirror exploration; superseded by web-editor. |

### Shared libraries

| Library | Package | Dev port | About |
|---|---|---:|---|
| **web-components-core** | `@keenmate/web-components-core` | 15000 | Runtime foundation: BlissElement, reactive input table, converters, logging, positioning, CEM preset. |
| **web-components** | `@keenmate/web-components-devkit` | 15100 | This repo — dev/demo/build tooling (Vite preset, examples kit, kmwc CLI). |
| **pure-css** | `@keenmate/pure-css` | 15200 | CSS framework mirroring the base-css-variables token contract (demo site + e2e on the dev port). |
| **base-css-variables** | `@keenmate/base-css-variables` | 15300 | The shared --base-* token contract (base-variables.css) + base-contract-check; examples site + e2e on the dev port. |

### Showcases, docs & test harnesses

| Repo | Kind | For | Dev port | About |
|---|---|---|---:|---|
| web-multiselect-showcase | showcase | web-multiselect | 16000 |  |
| web-daterangepicker-showcase | showcase | web-daterangepicker | 16100 |  |
| web-treeview-showcase | showcase | web-treeview | 16200 |  |
| web-grid-showcase | showcase | web-grid | 16300 | [https://web-grid.keenmate.com](https://web-grid.keenmate.com) |
| web-multiselect-docs | docs | web-multiselect | 16400 | Content-only docs (keendocs). |
| web-component-framework-test | test | — | 17000 | Smoke + contrast tests inside CSS host frameworks (plain / Bootstrap / …). |
| web-multiselect-test | test | web-multiselect | 17100 | npm-install vs direct-file consumption checks before publishing. |
| web-multiselect-positioning-demo | test | web-multiselect | 17200 | Single-page positioning repro. |
| web-playground | test | web-components | 17300 | Devkit e2e test bed — a component scaffolded with `kmwc new`, linked to this repo. |

**Ports** — a block of 100 per repo: dev server = **Dev port**, preview = +1, examples image = +10. Each kind numbers its blocks by 100 inside its own range (component 12100–14900 · library 15000–15900 · showcase & docs 16000–16900 · test 17000–17900), so any number of repos run side by side without collisions and a new component lands next to the others. `kmwc doctor` checks a repo against its block; `kmwc new` takes the next free one.
<!-- kmwc:catalogue:end -->

To add or change a row, edit [`components.json`](components.json) and run
`npm run readme`. Descriptions and the Devkit ✅ are read from the
sibling checkouts next to this repo. `npm run readme:check` fails when the
table is stale. Prefixes mirror the reserved-prefix table in the rulebook's
`base-variables.md`, which stays the authority.

---

## The devkit

### Why

Before the devkit, every component repo carried its own copy of
`examples-shared.css` (six copies, six different versions),
`examples-chapter-nav.js` (three versions), `examples-copy-link.js`,
`examples-controls-store.js`, `plausible-snippet.html`,
`check-variable-manifest.mjs`, a `vite.config.ts`, a `Dockerfile`, an
`nginx.conf` and a `Makefile`. A fix made in one repo never reached the others.
web-treeview forked the whole 980-line stylesheet just to change purple to
green. Two components shared a dev port and three shared an image port.

The devkit owns all of that. A component states what's specific to it **once**,
in `package.json#kmwc`, and gets the rest.

### What a component gets

| Piece | Import / command | Replaces |
|---|---|---|
| Vite preset | `@keenmate/web-components-devkit/vite` → `defineComponentConfig()` | per-repo `vite.config.ts`, `vite.examples.config.ts` |
| Examples kit (auto-injected) | shared styles, chapter nav, copy-link buttons, theme switch, version badge, analytics | `examples-shared.css`, `examples-chapter-nav.js`, `examples-copy-link.js`, `plausible-snippet.html`, Dockerfile `sed` |
| Fragment pages | `<meta name="kmwc:title">` pages + `<kmwc-include>` partials + `<kmwc-demo>` (live markup = snippet) | the head / header / container boilerplate copied into every page, hand-copied `.code-block` snippets |
| Examples helpers | `@keenmate/web-components-devkit/examples` → `attachControlsPersistence`, `renderExamplesIndex`, `mountExamplesKit` | `examples-controls-store.js`, 150 lines of inline index-page CSS |
| Playwright preset | `@keenmate/web-components-devkit/playwright` → `definePlaywrightConfig()` | per-repo `playwright.config.ts` |
| Generated files | `kmwc sync` | hand-edited `Dockerfile`, `nginx.conf`, `Makefile`, `.dockerignore` |
| Standard check | `kmwc doctor` (devkit checks + the rulebook's `*.checks.sh`) | — |
| Manifest check | `kmwc check-vars` | 3 diverged `check-variable-manifest.mjs` |
| Release gate | `kmwc check-release` (used by `make publish` / `publish-rc`) | — |
| Scaffolder | `kmwc new web-<name> --prefix <p>` | copy-pasting the last repo |

### Install

```
npm i -D @keenmate/web-components-devkit vite@^7
```

To develop against a local checkout of this repo, keep the semver range in
`package.json` (Docker builds install from the registry) and link it:

```
cd ../web-components && npm link
cd ../web-<component> && npm link @keenmate/web-components-devkit
```

Peer dependencies (`vite`, `@playwright/test`) are always resolved from the
**component's** `node_modules`, so a linked devkit doesn't load a second copy.

### `package.json#kmwc`

Every field is optional. Defaults are derived from the package.

```jsonc
"kmwc": {
  "title": "Web MultiSelect",                    // examples index header
  "tagline": "Feature-rich multiselect …",       // default: package.json description
  "tag": "web-multiselect",
  "prefix": "ms",                                // reserved CSS prefix (rulebook base-variables.md)
  "kind": "component",                           // default: the components.json entry's kind
  "library": {                                   // false: no library build (see below)
    "entry": "src/index.ts",                     // default
    "globalName": "MultiSelect",                 // UMD global
    "fileName": "multiselect",                   // → dist/multiselect.js + .umd.js
    "cssFileName": "style",                      // default; keeps dist/style.css on Vite 7
    "shouldEmitTypes": true,                     // rolled-up .d.ts (typesPluginConfig to tune)
    "shouldEmitSourcemap": false,
    "external": []
  },
  "ports": { "dev": 12100, "image": 12110 },     // the repo's components.json port block (+10 = image)
  "theme": { "accentColor": "#667eea", "accentEndColor": "#764ba2" },
  "examples": {
    "canonicalOrigin": "https://examples.web-multiselect.keenmate.dev",
    "staticPaths": ["examples-data", "docs"],    // copied verbatim into the built site
    "excludedPages": [],                         // root *.html that aren't example pages
    "outDir": "dist-examples"
  },
  "analytics": { "plausibleSiteId": "pa-5vUESDVyztHMyzN5gs5A4" },
  "image": {
    "name": "registry.km8.es/web-multiselect-examples:prod",
    "runner": "podman",
    "packageJsonPaths": ["package.json"]         // monorepos: list workspace package.jsons too
  },
  "cssVariables": {                              // false: no variables manifest, no check:vars
    "sources": ["src/css"],                      // dirs (stylesheets) or explicit files (any type); a package
                                                 // path (e.g. a core module's CSS) resolves from node_modules
    "internalVariables": ["ms-input-current-width"], // runtime internals, not theming knobs
    "checkMode": "declared"                      // declared OR read (an input knob may be read, never set);
                                                 // "consumed": var() reads only
  },
  "rulebook": {
    "path": "../BlissFramework/guidelines/web-components", // relative to the component; default: the nearest
                                                 // BlissFramework checkout above it. env KMWC_RULEBOOK_PATH wins
    "skippedChecks": []                          // e.g. ["responsive-overlay"]
  },
  "sync": { "skippedFiles": [] }                 // e.g. ["Makefile"] to opt a file out
}
```

**A library** (registry `kind: "library"`, e.g. web-components-core) builds its
package itself (`tsc`) or ships none. `"library": false` (or `{ "shouldBuild":
false, "entry": … }` to keep the pages' entry script) makes plain `vite build`
refuse to run — it is the devkit's library mode and would empty `dist/` — while
`vite build --mode examples` still builds the site, and `kmwc sync` no longer
proposes a `build: vite build` script. `"cssVariables": false` turns off the
manifest check (no `check:vars` script, `kmwc check-vars` skips), for variables
the checker can't see, such as names built by string interpolation. Doctor runs
only the rulebook suites that apply to a library (see below).

### Vite preset

```ts
// vite.config.ts
import { defineComponentConfig } from '@keenmate/web-components-devkit/vite';
export default defineComponentConfig();

// with repo-specific bits
export default defineComponentConfig({
  plugins: [shadowCssPlugin()],
  overrides: { optimizeDeps: { entries: ['index.html', 'examples-*.html'] } },
  getOverridesCallback: (env, config) => ({ /* env-dependent bits */ }),
});
```

| Command | Result |
|---|---|
| `vite` | dev server on `kmwc.ports.dev` (strict, never hops ports) |
| `vite build` | library: `dist/<fileName>.js`, `.umd.js`, `style.css`, rolled-up `.d.ts` |
| `vite build --mode examples` | static examples site → `dist-examples/` (every root `*.html` is a page) |
| `vite preview --mode examples` | serves the built site on the preview port (`ports.dev + 1`) |

The preset defines `__VERSION__`, `__PACKAGE_NAME__`, `__AUTHOR__`,
`__LICENSE__`, `__REPOSITORY__` and `__HOMEPAGE__`. For a hand-assembled config
(monorepos, showcases), use the plugin on its own: `createExamplesPlugin()`.

### Examples kit

The plugin injects the kit into every **root-level** `*.html` page. Pages under
`test/` (Playwright fixtures) are left alone, and any page can opt out with
`<html data-kmwc="off">`.

#### Fragment pages — no copied boilerplate

A page without `<html>` is a **fragment**: it carries only its own content,
and the plugin wraps it in the devkit layout (head, entry script, header with
back link / title / subtitle, container). The whole file:

```html
<meta name="kmwc:title" content="Tree of Options">
<meta name="kmwc:subtitle" content="Hierarchical options via a materialized path-member…">
<link rel="stylesheet" href="examples-local.css">   <!-- moved into <head> -->

<kmwc-include src="partials/no-collapse-note.html" title="No collapse"></kmwc-include>

<div class="card">                                   <!-- each h2 = a chapter -->
    <h2>TR01 · Basic tree</h2>
    <kmwc-demo>
        <web-multiselect id="tree" path-member="path"></web-multiselect>
        <script type="module" data-kmwc-show>
            document.getElementById('tree').options = [{ value: 'fruit', label: 'Fruit', path: '1' }];
        </script>
    </kmwc-demo>
</div>

<script type="module">
    import { attachControlsPersistence } from '@keenmate/web-components-devkit/examples';
    attachControlsPersistence('tree');
</script>
```

| Construct | Does |
|---|---|
| `<meta name="kmwc:title">` (required), `kmwc:subtitle`, `kmwc:body-class` | header + `<title>`, body classes |
| `<meta name="kmwc:layout" content="bare">` | head only, no header/container (the index page) |
| `<meta name="kmwc:entry" content="none">` | skip the component entry script (default `/<kmwc.library.entry>`, loaded in `<head>` so the element is defined before page scripts run) |
| `<link>` / `<style>` anywhere in a fragment | moved into `<head>` |
| `<kmwc-include src="partials/x.html" some-param="v">inner</kmwc-include>` | the partial with `{{someParam}}` and `{{content}}` filled in; nests; cycles are an error; unknown `{{…}}` stay as written |
| `<kmwc-demo>markup</kmwc-demo>` | the markup live **and** as a code block of exactly that markup (copy button included) — a snippet can't drift from its demo. `<script data-kmwc-show>` inside runs and is shown too. Attributes: `preview-class`, `markup-hidden`, `code-hidden` |

Tags inside HTML comments are never expanded. Partials live in the repo's
`partials/` folder (a change reloads the dev server page); shared demo data
belongs in `examples-data/*.js` modules imported by pages. Full documents
(`<html>…`) pass through untouched, so pages migrate one at a time — `kmwc
doctor` lists the ones still repeating the head/header boilerplate.

- **Styles** live in `@layer kmwc`, so any unlayered rule beats them
  regardless of order (and the layered reset can never clobber a component).
  Tokens (`--kmwc-*`) read through the rulebook's `--base-*` taxonomy with
  `light-dark()` fallbacks, so a theme-designer theme restyles the demo page
  together with the component; colour literals live only in `tokens.css`.
  Re-theme a site with `kmwc.theme.accentColor`. The page vocabulary is
  unchanged from the old shared CSS — `.card`, `.example-section`, `.controls`,
  `.demo-area`, `.demo-card`, `.code-block`, `.note(.warning|.info|.success|.error)`,
  `.grid`/`.card-grid`, `.reference-table` (+ `.table-*` modifiers), `.log-panel`, `.pill`,
  `.status-dot`, `.control-group`, buttons (`.btn-secondary`, `.btn-outline`,
  `.btn-danger`), `<kbd>` keys and `<mark>` search matches (the spotlight's look),
  `.push-end` (to the end of a flex row) — while everything the kit **generates** is prefixed BEM
  (`kmwc-chapter-nav__item--active`, `kmwc-copy-link--copied`, …).
- **Form controls** look the same on every page without a class: text fields,
  selects and list boxes (`multiple` / `size`), textareas, checkboxes, radios,
  switches (`<input type="checkbox" role="switch">`), ranges, colour and file
  inputs, fieldsets — modelled on pure-admin's forms and read through the
  `--base-input-*` / `--base-checkbox-*` / `--base-icon-check` contract. Inputs,
  selects and buttons share `--kmwc-control-height`, so a row of them lines up
  in any container, not only `.controls`. The rules are zero-specificity
  (`:where()`); `kmwc-native` on an element or an ancestor keeps the browser's
  own controls (a light-DOM component that draws its own inputs). A number field
  is 7rem wide; `.w-xs` / `.w-sm` / `.w-md` / `.w-lg` (4 / 6 / 9 / 12rem) size a
  short field without an inline style. The
  playground's `examples-forms.html` shows them all.
- **Tables:** any `<table>` gets a header fill, row lines and a hover tint;
  `.reference-table` is the full-width, fully bordered API table. Modifiers
  combine — `.table-full`, `.table-bordered`, `.table-striped`, `.table-compact`
  (tighter cells; the controls in it shrink via `--kmwc-control-height`) — plus
  `tr.is-highlight` and a `.num` cell (right-aligned, tabular figures). On a phone
  a wide table scrolls inside its card. See the playground's `examples-tables.html`.
- **Widgets:** `.log-panel` (light, following the theme; `--dark` for a console
  stream; the legacy `.event-log` / `.event-entry` markup renders the same). Lines keep their indentation; a
  `.log-line` takes one tone — `--ok`, `--info`, `--warn`, `--err`, `--muted`,
  the same five as `.pill` / `.status-dot` — and `--action` marks a "you clicked
  X" line. Timeline cells (`.log-line__seq`, `__time`, `__source`, `__name`)
  turn a line into aligned columns. A `<pre class="log-panel">` is a text-fed
  log; `data-empty` shows while a panel is empty. Also `.mono`, `.check-list`
  (options one per line), `td.is-highlight`, `.display-sliders` and
  `.css-readout`. The playground's `examples-widgets.html` shows them all.
- **Theme switch** (top right) cycles light → dark → auto and sets
  `data-theme` on `<html>` — the same signal components react to via
  `:host-context([data-theme])`, so every example page is a dark-mode smoke
  test. The saved choice is applied before first paint.
- **Chapter nav and copy-link** share one section/slug algorithm, so the
  jump-list hashes and copied links always match. Floating UI is bundled (no
  CDN). At the bottom of a short page, the last chapter gets highlighted.
- **Spotlight (Ctrl/⌘+K)** searches every chapter of every example page: a
  chapter matches when its section code or heading text contains the query
  (`th7` finds `TH07`; uncoded `Summary` / reference sections are found by
  title), results are grouped by page with the current page first, ↑↓ / PgUp
  / PgDn / Home / End pick, Enter jumps, Ctrl/⌘+Enter opens a new tab. The
  Vite plugin builds the index from every page's `<h2>`s (includes resolved)
  as `virtual:kmwc-chapters`; the current page's chapters are read live, so
  script-rendered sections count too. Off with
  `kmwc.examples.isSpotlightEnabled: false` (a component that owns Ctrl+K
  itself; a page handler calling `preventDefault()` also keeps the key). It
  **mirrors** [web-commandpalette](https://github.com/keenmate/web-commandpalette)
  — markup, matching, keyboard map, open/close, CSS — without depending on it;
  see *Developing the devkit*.
- **Short chapter links**: `examples-theming.html#th07` (or `#th7`, or the
  slug of an uncoded heading, `#summary`) scrolls to that chapter on arrival
  — the codes from the rulebook's `example-pages.md` work as URLs.
- **Version badge**: any `[data-kmwc-version]` (or legacy `#version-badge`)
  shows `v1.2.3`, or `v1.2.3 (built …)` in a built site.
- **Landing page**: `renderExamplesIndex({ pages })` renders the header, cards,
  footer and cross-page nav from the registry plus `kmwc` config.
- **Late content**: the kit mounts one task after DOM-ready. Pages that render
  sections after a fetch call `mountExamplesKit()`.
- **Analytics**: the Plausible snippet goes into **built** pages only, and only
  when `kmwc.analytics.plausibleSiteId` is set.

### Playwright preset

```ts
import { definePlaywrightConfig, devices } from '@keenmate/web-components-devkit/playwright';
export default definePlaywrightConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: ['**/mobile.spec.ts'] },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: ['**/mobile.spec.ts'] },
  ],
});
```

baseURL and the `npm run dev` web server come from `kmwc.ports.dev`.

### CLI

```
kmwc sync [--check]           regenerate Dockerfile, nginx.conf, Makefile, .dockerignore, the
                              CLAUDE.md devkit block, .gitignore entries, missing standard scripts
kmwc doctor [--json]          devkit checks + package contents + the rulebook's *.checks.sh suites
                              (exit 1 on errors). --verbose lists passes, --no-rulebook skips the
                              suites, --no-pack skips the package-contents check
kmwc check-vars [--strict]    component-variables.manifest.json ⇔ CSS
kmwc check-pages [--url u]    every example page in Chromium at 1440 / 390 / 320px: page and console
                              errors, failed requests, never-defined elements, a page wider than the
                              viewport. Starts the dev server unless --url (e.g. the built site);
                              --widths 1440,390,320
kmwc check-release --tag t    latest ⇔ release version, rc ⇔ -rcN, version not yet on npm
kmwc new web-<name>           scaffold a component (--prefix, --title, --tag, --dir, --port, --minimal, --register)
                              --adopt: scaffold an ALREADY registered component (its port/prefix) to migrate into
kmwc readme [--check]         regenerate this README's catalogue (devkit repo only)
kmwc <command> --help         that command's usage — never runs the command
```

An unknown option is an error (exit 2), never ignored — a typo can't run a
command with its defaults.

Generated files start with a `GENERATED by kmwc sync` header. Repo-specific
make targets go in `Makefile.local`, which the generated Makefile includes at
the end. Per-developer overrides (`DOCKER_RUNNER`, `IMAGE_PORT`) go in
`.makefile.env`. `make publish` / `make publish-rc` run `kmwc check-release`
and the e2e suite before building and publishing.

**`kmwc doctor` and the rulebook.** Doctor runs every suite in the rulebook
(component-structure, naming-conventions, css-structure, theme-container,
base-variables, color-scheme, readme-structure, custom-elements-manifest,
responsive-overlay, publish-command, example-pages) with `bash`, passing `kmwc.prefix`, and
reports each `FAIL` as an error pointing at the matching `.checks.md` entry.
A `library` runs only naming-conventions, readme-structure, publish-command
and example-pages; the others check what a custom element ships (its CSS,
manifest, overlay).
When the rulebook isn't checked out (or there's no bash) the suites are
skipped with a warning — the rulebook stays the single source of truth; the
devkit never copies its rules. A failure whose check id heads a section of
`VALIDATION-NOTES.md` (`## C-CSS-1 — Lean strategy`, `## C-CST-4 / C-CST-10 — …`)
is an accepted deviation — an architectural decision recorded per the rulebook —
and counts as a pass (`--verbose` lists them).

**What else doctor checks.** Beyond the presets, legacy files, fragment pages and
generated files:

- **Library outputs** — every `./dist/…` target in package.json (`main`,
  `module`, `types`, `style`, `exports`) is a file the library build emits. Before
  the switch to the preset it also compares the old `lib.name` with
  `kmwc.library.globalName` — a renamed UMD global or CSS file breaks consumers
  silently.
- **Ports** — no script pins a `--port` of its own, the repo's configs, Makefile
  and docs stay inside its registry block, and no sibling checkout (a registry
  entry at `../<id>`) listens on a port inside it.
- **Analytics** — no other repo uses the same Plausible site id.
- **Page CSS** — a page `<style>` or `examples-local.css` rule on a kit-owned
  selector (`.kbd`, `kbd`, `mark`, `.pill`, `.card` …) and single-declaration
  inline styles a kit class covers (`width` on a field → `.w-*`,
  `margin-left: auto` → `.push-end`, `margin-top: 1rem` → `.mt-1`) are warnings.

`kmwc check-pages` is the browser half: it loads every example page and reports
what doctor can't see in the source — a script error, a 404, a fixed width that
pushes a phone sideways.

**Package contents.** Doctor runs `npm pack --dry-run` and fails on anything
dev-only that would reach a consumer's `node_modules`: `CLAUDE.md` at any
depth and `.claude/` (AI-assistant guidance, which a directory entry such as
`src/css` in `files` sweeps in), `test/` / `e2e/` / `*.spec.*` / `*.test.*`,
example pages and `partials/`, build/test output, and local make config. Keep
`"!**/CLAUDE.md"` and `"!**/.claude"` at the end of `files`; the scaffold adds them.

### Scaffolding a component

```
npx kmwc new web-colorpicker --prefix cpk --title "Web Color Picker" --register
```

`kmwc new` runs the rulebook intake: the npm name must be free and the CSS
prefix must be 2–4 lowercase letters not reserved in `base-variables.md` or
`components.json` (it's derived only when unambiguous — hyphenated words, or a
short single word — otherwise pass `--prefix`). The result passes every
rulebook suite on its first commit:

- `src/web-component.ts` (`ColorpickerElement`, Element layer, `ATTRIBUTE_TABLE`,
  `change` event with `onChange` twin) · `src/colorpicker.ts` (`WebColorpicker`,
  logic class) · `src/types.ts` · `src/logger.ts` · `src/index.ts`
- `src/css/` — the canonical eight files, `@layer variables, component, overrides`,
  `--cpk-*` ⇢ `--base-*` ⇢ `light-dark()` chains, Strategy-B dark mode, FOUC rule
- Custom Elements Manifest config + package.json `customElements` / `web-types`,
  `component-variables.manifest.json` (exported as `/manifest`)
- README in the canonical shape, `docs/{usage,theming,examples,accessibility}.md`,
  CHANGELOG (`## [0.1.0] - <date>`), LICENSE, `.claude/commands/publish.md`
- a `files` allowlist (dist, docs, manifests, editor-integration JSON) ending in
  `!**/CLAUDE.md` and `!**/.claude`, so AI-assistant guidance never ships
- examples (index, basic, theming), fixtures + smoke and dark-mode e2e specs,
  and the `kmwc sync` files

By default the component is a small working sample (a toggle with `label` /
`active` inputs and a `change` event) to rename or replace. Add `--minimal`
for an empty skeleton instead: the same files and structure, but an empty
`ATTRIBUTE_TABLE`, no events, a root that renders its slotted content, and
stub feature CSS — it passes the same rulebook suites.

Reserve the new prefix in the rulebook's `base-variables.md` afterwards — the
command prints the reminder.

### Migrating a component

`kmwc doctor` lists everything that's left, so run it after each step.

**Repo in a different shape** (a one-package monorepo, a non-standard layout)?
Don't teach the devkit the old shape: back the repo up, run `kmwc new web-<name>
--adopt --dir <scratch>` (same files, with the registered port and prefix, no
registry edits), and move the component's own code into that layout with
`git mv`. web-editor was flattened this way.

1. `npm i -D @keenmate/web-components-devkit vite@^7` (plus `@playwright/test`
   if the repo has e2e tests).
2. Add `package.json#kmwc`. Take the port block (`ports.dev` = block,
   `ports.image` = block + 10) and prefix from
   [`components.json`](components.json), the Plausible id from the old
   `plausible-snippet.html` (`analytics.plausibleSiteId`), the image name and
   runner from the old Makefile, the canonical origin from the old
   `examples-copy-link.js`, and internals from the old
   `check-variable-manifest.mjs` (`cssVariables.internalVariables`).
3. Run `npx kmwc doctor` **before** replacing `vite.config.ts`: it compares the
   old `lib.name` with `kmwc.library.globalName` and package.json's `dist/`
   targets with the preset's outputs — set `library.globalName` / `fileName` /
   `cssFileName` to the published names so nothing gets renamed. Then replace
   `vite.config.ts` (and any `vite.examples.config.ts`) with
   `defineComponentConfig()`. Move genuinely specific bits to `plugins` and
   `overrides`. Do the same for `playwright.config.ts`.
4. Pages: delete the `<link href="examples-shared.css">` and the
   `examples-chapter-nav.js` / `examples-copy-link.js` script tags. Change
   `import { persistControls } from './examples-controls-store.js'` to
   `import { attachControlsPersistence } from '@keenmate/web-components-devkit/examples'`
   (same storage keys — saved demo state survives). Move component-only CSS into
   `examples-local.css`.
5. Swap `index.html` for `renderExamplesIndex({ pages })`, keeping the page
   registry. The inline `<style>` and header markup go away.
6. Delete the legacy files: `examples-chapter-nav.js`, `examples-copy-link.js`,
   `examples-controls-store.js`, `examples-shared.css`,
   `plausible-snippet.html`, `scripts/check-variable-manifest.mjs`.
7. Set `"check:vars": "kmwc check-vars"` and run it.
8. `npx kmwc sync`, then review the diff. Repo-specific Makefile targets move
   to `Makefile.local`.
9. Check it runs: `npm run dev`, `npm run build` (compare `dist/` with the old
   build), `npm run build:examples`, `npm run preview:examples`, the e2e tests,
   `npx kmwc check-pages` (and `--url` on the preview port for the built site),
   and finally `npx kmwc doctor` (devkit + rulebook — rulebook failures are real
   findings to fix, or architectural decisions to record in `VALIDATION-NOTES.md`).

### Developing the devkit

```
npm install
npm test                 # unit tests (config, registry, templates, sync, checks, intake, plugin, kit)
npm run test:e2e         # playground: the kit + scaffold in a real browser, dev server AND built site
npm run readme           # regenerate the catalogue
npm run check:spotlight-mirror   # what changed in web-commandpalette since the spotlight was aligned
make dev                 # the playground's dev server
```

**The spotlight mirrors web-commandpalette.** `src/examples/spotlight.js`,
`chapter-search.js` and `css/spotlight.css` keep wcp's structure block for
block (devkit naming), each marked `mirrors <file> <function>`;
[`scripts/spotlight-mirror.json`](scripts/spotlight-mirror.json) lists every
pair and the wcp / core commit they're aligned to. A bug fixed in one gets
ported to the other: run `npm run check:spotlight-mirror` (add `-- --diff`
for the patches), port what applies, bump `alignedCommit`.

[`playground/`](playground) is a real component scaffolded with `kmwc new` and
linked to this checkout. It's the reference for "what a component looks like",
the e2e target for every kit feature, and `npx kmwc doctor` inside it must
report every rulebook suite green. When you change the kit or a template, add
a spec there.

Releases are prepared with the `/publish` Claude command
(`.claude/commands/publish.md`, the rulebook's canonical `/publish` with devkit
steps: unit + e2e + playground doctor + catalogue check, entry-point smoke
test, `npm pack` review). It never publishes or pushes. That's yours.
