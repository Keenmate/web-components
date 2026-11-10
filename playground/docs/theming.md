# Theming — `<web-playground>`

## Container contract

The theme container is `:host` — the `<web-playground>` element itself. It paints
its own surface (`--pg-bg`), so it is visible standalone. It follows the page's theme:
`@keenmate/web-components-core` reads the signal once per page (`data-theme`,
`data-bs-theme`, `.dark` / `.light` on `<html>` or `<body>`, or the element named by
the `theme-source` attribute) and mirrors it onto the element as
`data-context-theme`. `data-theme="dark|light"` on the element itself overrides it
for that instance.

## Variable contract

Two layers, never three: `--base-*` is the cross-component hook (set by
`@keenmate/theme-designer` or by you on `:root`), `--pg-*` is the
component-local override. The full list, with categories, is in
[`component-variables.manifest.json`](../component-variables.manifest.json)
(exported as `@keenmate/web-playground/manifest`).

All sizes multiply through `--pg-rem` (default `10px`; set `1rem` to
follow the page font size).

```css
/* every Keenmate component on the page */
:root { --base-primary-color: #10b981; }

/* this component only */
web-playground { --pg-accent-color: #8b5cf6; }
```

## Color-scheme strategy

Strategy B (color-scheme.md): every colour falls back through
`light-dark(<light>, <dark>)`, and the component sets `color-scheme` on the
host only when there is a signal (`data-context-theme` from the page, or `data-theme`
on the element).
Without a signal it inherits the page's `color-scheme` — declare
`color-scheme: light dark` on your page to follow the OS.

## Cascade-layer contract

```css
@layer variables, component, overrides;
```

Any unlayered rule of yours beats every rule of the component; any `--base-*`
on `:root` beats the `variables` layer. If your page ships a universal reset
(`* { margin: 0; padding: 0 }`), wrap it in a layer — an unlayered reset beats
the component's layered defaults.

## BEM hooks

| Part | Class | `::part()` |
|---|---|---|
| The toggle button | `.pg__root` (`.pg__root--active` when active) | `::part(root)` |
| The label | `.pg__label` | `::part(label)` |
