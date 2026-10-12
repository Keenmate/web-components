# Accessibility — `<web-playground>`

## Keyboard

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move focus to / from the toggle button. |
| `Enter` / `Space` | Toggle the active state (native `<button>` behaviour). |

## ARIA

The toggle is a native `<button>` with `aria-pressed` reflecting the active
state, so screen readers announce it as a toggle button. The label text is the
accessible name.

## Focus

A visible `:focus-visible` outline uses `--pg-accent-color`.

## Contrast

Default colours meet WCAG AA in both light and dark schemes. When overriding
`--pg-accent-color`, keep `--pg-text-color-on-accent` legible
on it (4.5:1).
