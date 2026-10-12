# Accessibility — `<{{TAG}}>`

## Keyboard

The component has no interactive parts yet; slotted content keeps its own
keyboard behaviour. Document every key binding here as you add controls.

## ARIA

No roles yet — the root is a plain container. Add the role / state attributes
your component's pattern needs (see the WAI-ARIA Authoring Practices).

## Focus

Not focusable. Interactive parts must get a visible `:focus-visible` outline.

## Contrast

Default colours meet WCAG AA in both light and dark schemes; keep 4.5:1 for
text when overriding `--{{PREFIX}}-text-color-1` / `--{{PREFIX}}-bg`.
