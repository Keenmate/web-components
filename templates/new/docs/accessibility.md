# Accessibility — `<{{TAG}}>`

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

A visible `:focus-visible` outline uses `--{{PREFIX}}-accent-color`.

## Contrast

Default colours meet WCAG AA in both light and dark schemes. When overriding
`--{{PREFIX}}-accent-color`, keep `--{{PREFIX}}-text-color-on-accent` legible
on it (4.5:1).
