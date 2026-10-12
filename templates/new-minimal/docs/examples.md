# Examples — `<{{TAG}}>`

Live examples: run `make dev` and open http://localhost:{{DEV_PORT}}.

## Common patterns

### A themed instance

Combines a `--base-*` override (all components) with a `--{{PREFIX}}-*` one
(this instance only), forced dark.

```html
<style>
  :root { --base-border-color: #10b981; }
</style>
<{{TAG}} data-theme="dark" style="--{{PREFIX}}-root-border-radius: 999px">Dark</{{TAG}}>
```
