# {{PACKAGE_NAME}}

> {{TAGLINE}}

## What is it

`{{PACKAGE_NAME}}` is a custom element (`<{{TAG}}>`) built on
[`@keenmate/web-components-core`](https://www.npmjs.com/package/@keenmate/web-components-core).
It works in any HTML page or framework that can render a custom element —
React, Vue, Svelte, Blazor, plain HTML.

It reads `--base-*` variables from the page when `@keenmate/theme-designer`
is present, falls back to sensible light/dark defaults otherwise, and supports
per-instance dark mode via `data-theme`.

## What's New in v{{VERSION}}

- **`<{{TAG}}>` — initial release** — First version, scaffolded with `kmwc new` from `@keenmate/web-components-devkit`. Ships the Element / Logic / Side-layer split, the canonical eight-file CSS set with `@layer variables, component, overrides`, light/dark defaults through `light-dark()` fallbacks, a Custom Elements Manifest for editor tooling, and a `change` event with an `onChange` property twin. See [CHANGELOG.md](./CHANGELOG.md).

## Demos & docs

- 🚀 [Live demo](https://demos.keenmate.com/{{ID}})
- 📘 [Usage / API reference](./docs/usage.md)
- 🎨 [Theming contract](./docs/theming.md)
- 📚 [Examples / cookbook](./docs/examples.md)
- ♿ [Accessibility](./docs/accessibility.md)

## Install

```bash
npm install {{PACKAGE_NAME}}
```

## Quick start

```html
<script type="module">
  import '{{PACKAGE_NAME}}';
</script>

<{{TAG}} label="Hello"></{{TAG}}>
```

Clicking toggles the `active` state and dispatches a `change` event
(`event.detail.isActive`). See [usage.md](./docs/usage.md) for the full API.

## Browser support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari) — anything with
native `customElements`, CSS `@layer` and `light-dark()` support. No polyfills
shipped.

## About

Authored and maintained by [Keenmate s.r.o.](https://keenmate.com/).
The component ships standalone with sensible light/dark defaults;
when mounted inside [Pure Admin](https://pureadmin.io/) — or any
host that publishes the `--base-*` taxonomy via
[`@keenmate/theme-designer`](https://www.npmjs.com/package/@keenmate/theme-designer) — it adopts the host's colors,
typography, and sizing automatically. There is no runtime
dependency on Pure Admin; the integration is opt-in via CSS
variables.

## Built with BlissFramework

Follows the [BlissFramework component guidelines](https://blissframework.dev/)
for structure, theming, color-scheme, and accessibility.

## License

MIT — see [LICENSE](./LICENSE).
