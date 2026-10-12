# Examples — `<web-playground>`

Live examples: run `make dev` and open http://localhost:13900.

## Common patterns

### React to the active state

Shows the event API and the `active` attribute reflecting the state.

```html
<web-playground id="toggle" label="Notifications"></web-playground>
<script type="module">
  import '@keenmate/web-playground';
  const toggle = document.getElementById('toggle');
  toggle.addEventListener('change', (event) => {
    console.log('notifications', event.detail.isActive ? 'on' : 'off');
    // the element also reflects the state: toggle.hasAttribute('active')
  });
</script>
```

### A themed instance

Combines a `--base-*` override (all components) with a `--pg-*` one
(this instance only), forced dark.

```html
<style>
  :root { --base-accent-color: #10b981; }
</style>
<web-playground label="Dark" data-theme="dark" style="--pg-root-border-radius: 999px"></web-playground>
```
