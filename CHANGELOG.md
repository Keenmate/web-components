# Changelog

## [1.0.0-rc07] - 2026-11-03

Found migrating web-treeview — each item is something doctor missed or got wrong there.

### Added

- **`kmwc check-pages`** — loads every example page in Chromium at 1440 / 390 / 320px and
  reports page and console errors, failed requests, custom elements that never get defined and a
  page wider than the viewport (with the widest elements named). treeview's iOS-Files mockup
  (`width: 420px`) and theme gallery (`minmax(500px, 1fr)`) pushed a phone sideways and only a
  browser could tell. Starts the repo's dev server, or `--url` for one already running (the built
  site on the preview port); `--widths`. It looks inside shadow roots and at text (a long word
  sticking out of a box that fits), and skips what can't widen the page (code blocks and other
  scrolling boxes, hidden or fixed layers such as a closed chapter-nav panel). `kmwc sync` adds a
  `check:pages` script and a `make check-pages` target.
- **Doctor: accepted deviations** — a rulebook failure whose id heads a section of
  `VALIDATION-NOTES.md` (`## C-CST-4 / C-CST-10 — …`) is an architectural decision recorded per the
  rulebook and counts as a pass (`--verbose` lists them). treeview's documented C-CST-4 / C-CSS-1 /
  C-NC-6 showed as errors.
- **Doctor: library outputs** — every `./dist/…` target in package.json (`main`, `module`, `types`,
  `style`, `exports`) must be a file the library build emits, and before the switch the old
  `lib.name` must equal `kmwc.library.globalName`. The preset's defaults would have renamed
  treeview's UMD global (`WebTreeView` → `WebTreeview`) and its CSS (`web-treeview.css` →
  `style.css`) without a word.
- **Doctor: ports** — a script that pins its own `--port`, a config / Makefile / doc port outside the
  repo's registry block, and a sibling checkout listening inside it are reported. treeview ran on
  21111 (docs too), and web-daterangepicker hardcoded treeview's 12300; the check also finds
  web-multiselect and web-dropzone on 12200 and web-component-framework-test on 12300.
- **Doctor: analytics** — a Plausible site id another repo also uses is an error (treeview's
  snippet borrowed web-multiselect's, so its traffic was counted as multiselect's).
- **Doctor: page CSS the kit covers** — page `<style>` / `examples-local.css` rules on kit-owned
  selectors (`.kbd`, `kbd`, `mark`, `.pill` …) and one-declaration inline styles a kit class covers
  (`width` on a field → `.w-*`, `margin-left: auto` → `.push-end`, `margin-top: 1rem` → `.mt-1`)
  are warnings.

### Changed

- **check-vars: input variables** — in the default mode a component variable is present when it is
  declared **or** read. A knob that is read but never declared is an input, unset by design:
  treeview forwards `--wtv-context-menu-*` to core's private `--_km-menu-*` so a page-wide
  `--km-menu-*` still applies, and declaring them would break that chain — check-vars called all 26
  dead. A read-with-fallback that isn't in the manifest is now reported as undocumented.
  `cssVariables.sources` also takes a package path (`@keenmate/web-components-core/dist/menu/styles.js`)
  for the `--base-*` reads of a core module the component renders.

### Fixed

- **The text "&lt;head&gt;" / "&lt;/body&gt;" on a page no longer receives the injected snippets** —
  the plugin put the theme / page-config / analytics block after the first `<head…>` match,
  which also matched `<header>` (a page without `<head>`), and the kit's module script before
  the first `</body>`, which can be text inside a page's inline script (the kit then landed
  in that script and broke it). Now: the first real `<head>` tag outside HTML comments, and
  the last `</body>`. Same failure as web-multiselect's live action-buttons page, where its
  own Dockerfile's `sed '/<head>/r …'` put the Plausible snippet (an HTML comment) into the
  page's module script, so no picker got its options.
- **Headings break instead of widening a phone** — a chapter heading naming an API outside
  `<code>` (drp's `EV05 · getMonthDataCallback & beforeMonthChangeCallback`) and the examples index
  title ("Web DateRangePicker" at 2.5rem) had no break opportunity at 320px. `h1`–`h4` get
  `overflow-wrap: anywhere`; the index title is 2rem on a phone.
- **A 250px widget fits a 320px phone** — body + card padding left 240px, so an inline calendar
  widened the page. Below 400px the body pads 0.75rem, cards and example sections 1rem, demo cards
  and demo areas 0.75rem (264px inside a card).
- **`mark` no longer splits a word** — the 2px side padding cut a match inside a word apart
  (core's Search page: "Town send"); `padding: 0`, and a match that wraps keeps its look on both
  lines (`box-decoration-break: clone`).

## [1.0.0-rc06] - 2026-11-01 [PUBLISHED]

### Added

- **`<kbd>` and `<mark>`** — every component documents a keyboard map and most highlight
  search matches, and pages either left them in the browser's look (core's Interaction page:
  18 bare `<kbd>`s) or styled them locally (core's Search page). A `<kbd>` now looks like the
  spotlight's key hints and a `<mark>` like its match highlight. Widgets page WG08.
- **Field widths** — a native field is ~20 characters wide, so pages set inline widths (core:
  14). A number field is now 7rem (six digits and the spin buttons; a `.form-group` still
  stretches it), and `.w-xs` / `.w-sm` / `.w-md` / `.w-lg` (4 / 6 / 9 / 12rem) size a short
  field. `.push-end` moves an item to the end of a `.controls` row. Form controls page FC12.
- **`kmwc.library: false`** — for a repo that builds its package itself (core: `tsc`) or ships
  none. Plain `vite build`, the devkit's library mode, refuses to run instead of emptying
  `dist/`; `vite build --mode examples` still builds the site, and sync no longer proposes a
  `build: vite build` script. `{ "shouldBuild": false, "entry": … }` keeps the pages' entry.
- **`kmwc.cssVariables: false`** (or `checkMode: "off"`) — sync stopped re-adding `check:vars`
  only when there was no manifest; now it can be switched off (core builds its variable names
  by interpolation, which the checker can't see). `kmwc check-vars` then skips.
- **Doctor knows libraries** — a repo whose registry entry (or `kmwc.kind`) is `library` runs
  only the rulebook suites that apply to it: naming-conventions, readme-structure,
  publish-command, example-pages. The CSS, Custom Elements Manifest, overlay and
  component-structure suites check what a custom element ships; on core they gave 12 errors
  and 4 "suite could not run" warnings. No prefix warning for a library.

### Fixed

- **`kmwc <command> --help` ran the command** — only a top-level `--help` was handled and
  unknown flags were ignored, so `kmwc sync --help` did a full sync (it overwrote core's
  Makefile). `--help` / `-h` after any command now prints that command's usage and exits 0,
  and an unknown option is an error (exit 2). Every command declares its flags; a boolean
  flag no longer swallows the next word as its value.
- **Inline `<code>` widened a phone page** — a long identifier has no break opportunity, so
  `resolvePresentation(mode, env, map)` in a heading made core's page 350px wide at 320px.
  Inline code now breaks anywhere; code in a `<pre>` keeps its lines.
- **Muted log text failed contrast on the light panel** — `--muted` lines, the seq / time /
  source cells and the empty placeholder used `--kmwc-text-color-3`: 2.83:1 on the light
  `.log-panel` in the light theme (WCAG AA wants 4.5:1). They now use `--kmwc-text-color-2`.
  A spec checks every tone on both panels in both themes.
- **`.css-readout` sat on the demo above it** — it had no top margin (core carried 8 inline
  margins); it now has 0.75rem.

- **Timeline log lines on a phone** — the cells (`.log-line__seq`, `__time`, `__source`,
  `__name`) never shrink and the row never wrapped, so on a narrow panel, or with a long
  source name, the detail got the few pixels left over: one letter per line. The row now
  wraps, and the detail wants ~14rem beside the cells; with less room it drops under them at
  full width. Wide panels are unchanged. A cell is capped at the panel width.

## [1.0.0-rc05] - 2026-11-01 [PUBLISHED]

### Changed

- **`.event-log` is now the same panel as `.log-panel--dark`** — the legacy console differed
  in small ways (grey base text, 0.8rem, 200px cap, no columns), so old and new logs looked
  slightly different. It now renders exactly as `.log-panel--dark` (light base text,
  0.85rem, `--log-max-height`, default 220px), and an `.event-entry` holding `.event-time`
  / `.event-name` is a timeline row: aligned time column, the detail wrapping in its own
  column, tones via `.log-line--*`. Other `.event-log` markup (lines without
  `.event-entry`, page-own classes) just gets the panel look.

### Added

- **Log lines: one tone set, timeline columns, text logs, empty placeholder** —
  web-components-core's pages each coloured their log lines (four schemes mixing severity
  with "what happened"). A `.log-line` now takes one of the pill tones — `--ok`, `--info`,
  `--warn`, `--err`, `--muted` — and `--action` marks a "you clicked X" line. On
  `.log-panel--dark` and `.event-log` the tones switch to fixed light tints
  (`--kmwc-console-ok|info|warn|err-color`), so they stay readable on the console in both
  themes. Every line in a log keeps its line breaks and indentation. The cells
  `.log-line__seq`, `__time`, `__source`, `__name` turn a line into aligned columns, with
  the detail wrapping in its own column. `<pre class="log-panel">` is a log fed by
  `textContent`; `data-empty` is shown while a panel is empty.
- **`.pill--info` / `--muted` and `.status-dot--info` / `--muted`**, so pills, dots and log
  lines share the same five tones.
- **`.mono`** (monospace text without the code chip; `textarea.mono` for a JSON editor),
  **`td.is-highlight`** (one highlighted cell) and **`.check-list`** (checkbox / radio
  options one per line, a long label wrapping beside its box).
- Playground: WG01 and WG03 show the tones, new WG05 (timeline), WG06 (text log, empty
  placeholder), WG07 (`.mono`), FC11 (check list), TB06 (highlighted cell); e2e specs.

## [1.0.0-rc04] - 2026-11-01 [PUBLISHED]

### Fixed

- **A wide `<pre>` or table in a `.grid` / `.grid-2` / `.card-grid` item no longer widens the
  page on a phone** — grid items kept `min-width: auto` (their min-content), so the single
  `1fr` column grew past the screen instead of letting the content scroll. Items now get
  `min-width: 0`. Reported from web-components-core's page migration.
- **Long `<code>` in a `.controls` button wraps** — rc03 only wrapped code inside
  `.controls` labels; it now covers any `.controls code`, and a `.controls` button is
  capped at the row width.
- **The playground's form-controls page now links `examples-local.css`** — FC08's
  `.fc-player` row was unstyled; the e2e spec now checks it.

### Added

- **Playground: a Widgets page** (`examples-widgets.html`, WG01–WG04) showing the kit's
  opt-in helpers as they are today — light and dark `.log-panel`, the legacy `.event-log`,
  `.pill` / `.status-dot` tones, `.display-sliders` with a live `.css-readout` — the base for
  the coming log-tone work. With an e2e spec.

## [1.0.0-rc03] - 2026-11-01 [PUBLISHED]

### Fixed

- **Example pages no longer widen the page on a phone** — on screens ≤ 768 px a
  `.reference-table` scrolls inside its card, a long `.controls` label (or `<code>` in it)
  wraps and a `.controls` select is capped at the row, instead of overflowing. Besides the sideways scroll, an over-wide page made mobile
  browsers grow the layout viewport (a 390 px phone reporting ~600 px), so pages that
  demo device / breakpoint detection showed the wrong class.
- **The scaffold's component CSS no longer sets `box-sizing` on the host page** — the
  `*, *::before, *::after { box-sizing: inherit }` reset in `templates/new/src/css/base.css`
  (also in the `--minimal` scaffold and the playground) reached the page through the light-DOM stylesheet, in a layer that beats
  `@layer kmwc`, so every page control rendered content-box (the spotlight input overflowed, a
  36 px input came out 38 px). It is scoped to `:host *` now; components scaffolded with an
  earlier devkit should make the same one-line change. A unit test now rejects any universal or
  bare-element selector in the scaffold CSS.

### Added

- **Form controls: one look for native inputs on every example page** — text fields, selects
  and list boxes, textareas, checkboxes (incl. indeterminate), radios, switches
  (`<input type="checkbox" role="switch">`), ranges, colour and file inputs and fieldsets are
  styled without a class, modelled on pure-admin's forms: inputs, selects and buttons share
  `--kmwc-control-height`, so a row of them lines up in any container (not only `.controls`);
  the focus border and halo, placeholder, disabled tone, the checkbox size and the
  `--base-icon-check` / `-indeterminate` tick read the `--base-*` contract. Rules are
  zero-specificity (`:where()`); `kmwc-native` on an element or an ancestor keeps the
  browser's own controls. Outline buttons are as tall as filled ones now (transparent border).
  The playground's new `examples-forms.html` shows them all.
- **Tables: every `<table>` on an example page is styled** — a header fill, row lines, hover
  tint, caption and footer, as pure-admin's `.pa-table`. `.reference-table` looks as before;
  new modifiers combine with it or a bare table: `.table-full`, `.table-bordered`,
  `.table-striped`, `.table-compact` (tighter cells, and the inputs / selects / buttons in it
  shrink with them via `--kmwc-control-height`), plus `tr.is-highlight` on any table and a
  `.num` cell (right-aligned, tabular figures). Every table, not only `.reference-table`,
  scrolls inside its card on a phone. Pages no longer need their own table CSS with fixed light
  colours (core's `.rs-table`, which breaks in dark mode). New playground page
  `examples-tables.html`.
- **Spotlight: Ctrl/⌘+K chapter search across every example page** — matches a chapter whose
  section code or heading text contains the query (`th7` finds `TH07`; uncoded `Summary` /
  reference sections by title), grouped by page with the current page first; Enter jumps,
  Ctrl/⌘+Enter opens a new tab. The Vite plugin builds the index (`virtual:kmwc-chapters`)
  from every page's `<h2>`s; `kmwc.examples.isSpotlightEnabled: false` turns it off. It mirrors
  web-commandpalette's markup, matching, keyboard map, open/close and CSS without depending on
  it — `npm run check:spotlight-mirror` lists what changed there since the last alignment.
  New page tokens `--kmwc-overlay-bg` and `--kmwc-focused-bg` / `-text-color` / `-outline`
  read the same `--base-*` hooks as wcp, so both look alike under a theme.
- **Short chapter links** — `#th07`, `#th7` or the slug of an uncoded heading scroll to that
  chapter on arrival.
- **`make dev` (and `kill-port`, `build-examples`, `preview-examples`) at the repo root** — the
  standard targets, run against the playground; `make playground` is gone.
- **`kmwc doctor` runs the rulebook's new `example-pages` suite** — every example `<h2>`
  carries a permanent section code (`TH07 · Title`), a prefix belongs to one page, no code
  is used twice. The generated CLAUDE.md block points at the rule. The convention was
  already in the scaffold and the playground but written down nowhere, so sessions
  building new pages didn't know it.

### Known issues

- **Opening the spotlight shifts the page sideways** on systems with classic scrollbars: the
  mirrored core `lockBodyScroll()` only sets `overflow: hidden`, so the scrollbar disappears
  (wcp has the same jump). pure-admin / pure-css avoid it with a `position: fixed` lock and
  width compensation; the proposal to bring that into core is in web-commandpalette's CLAUDE.md.

## [1.0.0-rc02] - 2026-10-31 [PUBLISHED]

### Added

- **`kmwc new --adopt`** for migrating a component that is already in the registry:
  the same scaffold, with the entry's port block and prefix (or `--prefix` when the
  entry has none), no npm-name check (the package may exist) and no registry edit.
  Scaffold into a scratch `--dir`, then move the component's code into it — how
  web-editor's one-package monorepo was flattened.

- **`npm run check:contract`** — `base-contract-check` (from `@keenmate/base-css-variables`,
  a devDependency) over the kit, the scaffold templates and the playground: every `--base-*`
  read or set exists in the contract, input fallbacks equal its defaults, derived ones are its
  formulas. Deliberate differences go in `contract-check.json` (the scaffolds' `inherit` font).

### Fixed

- **Kit and scaffolds read the 2.0 `--base-*` names.** `--base-accent-color*`,
  `--base-text-color-on-accent` and `--base-input-color` were removed in base-css-variables
  2.0.0, so a theme's primary never reached the example pages or a new component. Now
  `--base-primary-color` / `-hover` / `-active`, `--base-primary-bg-subtle(-hover)`,
  `--base-on-primary-text-color` and `--base-input-text-color`; the theming pages and docs set
  `--base-primary-color`. Fallbacks are the contract's: example pages default to the blue-500
  primary (was purple `#667eea`; the header gradient end now follows the accent), slate surfaces
  (dark main `#1e293b`, page `#f8f9fa` / `#0f172a`) and the contract text, border, hover, shadow
  and font values. The kit's status colours read `--base-<role>-text-color`; the danger button
  fills with `--base-danger-color` and its text is `--base-on-danger-text-color`. The secondary
  button and the index "new" badge compute their text from their own fill, so a light primary
  no longer turns them black.
- **`kmwc doctor` skipped every rulebook suite once the devkit came from npm.** The
  rulebook was looked up at a fixed path from the devkit (`<devkit>/../../BlissFramework`),
  which lands inside `node_modules` for an installed package. It is now the nearest
  `BlissFramework/guidelines/web-components` above the component (then above the
  devkit); `kmwc.rulebook.path` resolves against the component root.
- **Fragment pages: a `<style>` or `<link>` inside a `<script>` stays put.** Shadow-DOM
  styles and an SVG's own `<style>` written into a script were moved into `<head>`; they
  are strings there, not page elements.

### Migrated

- **web-editor** — flattened from a one-package npm-workspaces monorepo; registry entry
  now carries its prefix (`km`) and no longer says monorepo.
- **pure-css** (library, 15200) and **base-css-variables** (library, 15300) added to the
  registry.

### Internal

- **Root `Makefile`** for the devkit's own tasks: test, readme / contract checks, and
  `publish` / `publish-rc` gated on `kmwc check-release`.

## [1.0.0-rc01] - 2026-10-12 [PUBLISHED]

First release of `@keenmate/web-components-devkit`, plus the component catalogue.

### Added

- **Catalogue**: `components.json` registry (ids, CSS prefixes, port blocks, links);
  the README tables (components, libraries, showcases/tests — with each repo's
  dev port, no versions/status that would go stale) are generated by
  `npm run readme`. Port blocks of 100 per repo (dev = block, preview = +1,
  examples image = +10), numbered by 100 inside a range per kind with headroom —
  components 12100–14900, libraries 15000–15900, showcases/docs 16000–16900,
  tests 17000–17900 — so repos run side by side without collisions and new
  components land next to the existing ones.
- **Vite preset** `defineComponentConfig()` (Vite 7): dev server on a strict
  registry port, library build (es + umd + `style.css` + rolled-up d.ts), and
  `--mode examples` multi-page static build with relative asset URLs.
- **Examples kit**, injected into every root page: `@layer kmwc` design system
  merged from six diverged `examples-shared.css` copies, with `--kmwc-*` tokens
  read through the rulebook's `--base-*` taxonomy (`light-dark()` fallbacks) and
  a light / dark / auto theme switch that drives `data-theme` on `<html>`;
  kit-generated DOM is `kmwc-` prefixed BEM. Chapter nav (bundled Floating UI,
  shared slug logic, last-chapter highlight at page bottom), copy-link, version
  badge with build stamp, build-only Plausible. Helpers:
  `attachControlsPersistence`, `renderExamplesIndex` (its footer links the
  devkit version that built the site), `mountExamplesKit`.
- **Playwright preset** `definePlaywrightConfig()`.
- **CLI** `kmwc`: `sync` (Dockerfile, nginx.conf with immutable `/assets/`
  caching, Makefile + `Makefile.local`, .dockerignore, CLAUDE.md block, scripts),
  `doctor` (devkit checks + the BlissFramework rulebook's `*.checks.sh` suites),
  `check-vars` (declared/consumed modes; replaces three script copies),
  `check-release` (dist-tag ⇔ version, not yet on npm — gates `make publish*`),
  `new` (rulebook-shaped scaffold with intake: npm availability, reserved-prefix
  check, next free block in the component port range — a taken or misaligned
  `--port` is refused), `readme`.
- **Fragment pages**: a page without `<html>` gets the devkit layout (head, entry
  script, header, container) from `<meta name="kmwc:…">` tags; `<kmwc-include>` pulls
  shared partials (parameters, nesting, cycle detection); `<kmwc-demo>` renders live
  markup plus a code block of exactly that markup (and `<script data-kmwc-show>`), so
  snippets can't drift from demos. `kmwc doctor` lists pages still repeating the boilerplate.
- **Scaffold** (`kmwc new`): Element / Logic / types / logger layers, the
  canonical eight-file CSS set, Strategy-B dark mode, Custom Elements Manifest,
  README + `docs/`, CHANGELOG, LICENSE, `.claude/commands/publish.md`, examples,
  smoke + dark-mode e2e specs — example pages are fragments. `--minimal` gives an
  empty skeleton instead of the sample toggle. A fresh scaffold passes every rulebook suite.
- **Playground** (`playground/`): a component scaffolded with `kmwc new`, linked to
  the devkit and registered in the catalogue (port 17300) — the e2e test bed for
  the kit, the presets and the scaffold, in dev and in the built site.

- **Package-contents check** in `kmwc doctor`: `npm pack --dry-run` must not ship
  `CLAUDE.md` / `.claude/` (at any depth), tests and specs, example pages,
  partials, build/test output or local make config (`--no-pack` skips it).
  `kmwc new` ends `files` with `!**/CLAUDE.md` and `!**/.claude`.

- **`/publish` command** (`.claude/commands/publish.md`) for the devkit itself, in
  the rulebook's canonical shape (passes `publish-command.checks.sh`): gates are the
  unit tests, the playground e2e (dev + built), the playground doctor, `sync --check`
  and `readme:check`; "build" is an entry-point smoke test, since `src/` ships as-is.

### Fixed

- **Flash of unstyled page on every reload in dev** (FOUC): the kit stylesheet was
  imported from the kit's module script, which Vite dev applies only after the script
  runs. The plugin now loads it render-blocking: a `<link>` in `<head>` in dev, a CSS
  import (extracted to a `<head>` `<link>`) in builds. `auto.js` no longer imports
  it. An e2e spec loads a page with JavaScript off and checks it is styled.
- **Fragment detection** (`checkIsFragment`): a page is a full document only when it
  *starts* with `<!DOCTYPE` / `<html>` (after a BOM, whitespace or comments). A fragment
  whose script or code sample mentions `<html>` was passed through without the layout
  (found migrating web-commandpalette's playground page).

### Migrated

- **web-commandpalette** (1.0.0-rc02) — the first component on the devkit.
