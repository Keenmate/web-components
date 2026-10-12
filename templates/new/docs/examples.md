# Examples — `<{{TAG}}>`

Live examples: run `make dev` and open http://localhost:{{DEV_PORT}}.

## Common patterns

### React to the active state

Shows the event API and the `active` attribute reflecting the state.

```html
<{{TAG}} id="toggle" label="Notifications"></{{TAG}}>
<script type="module">
  import '{{PACKAGE_NAME}}';
  const toggle = document.getElementById('toggle');
  toggle.addEventListener('change', (event) => {
    console.log('notifications', event.detail.isActive ? 'on' : 'off');
    // the element also reflects the state: toggle.hasAttribute('active')
  });
</script>
```

### A themed instance

Combines a `--base-*` override (all components) with a `--{{PREFIX}}-*` one
(this instance only), forced dark.

```html
<style>
  :root { --base-accent-color: #10b981; }
</style>
<{{TAG}} label="Dark" data-theme="dark" style="--{{PREFIX}}-root-border-radius: 999px"></{{TAG}}>
```
