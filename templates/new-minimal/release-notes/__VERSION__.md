# {{TITLE}} {{VERSION}} — Release Notes

**Released:** {{TODAY}} · **Stable** (`npm install {{PACKAGE_NAME}}`)

These notes cover the **first release** of `<{{TAG}}>`: there is no earlier version to upgrade from.

{{TAGLINE}} This first version ships the element, its CSS variables and the editor metadata (Custom Elements Manifest); later releases describe what changed and how to upgrade.

The exhaustive, per-change list is in
[`CHANGELOG.md`](https://github.com/keenmate/{{ID}}/blob/prod/CHANGELOG.md) (section
{{VERSION}}); this document is the upgrade guide and the highlights.

---

## Contents

1. [Requirements](#requirements)
2. [Upgrade checklist](#upgrade-checklist)
3. [New features](#new-features)

---

## Requirements

| Package / platform | Version |
|---|---|
| `@keenmate/web-components-core` | `{{CORE_VERSION}}` (dependency, installed for you) |
| `@keenmate/base-css-variables` | optional; `2.0.0` |
| Browsers | Chrome/Edge 119+, Firefox 128+, Safari 18+ |

---

## Upgrade checklist

**Everyone**

- [ ] Nothing required: this is the first release.

---

## New features

### `<{{TAG}}>`

An empty skeleton: no inputs or events yet, a default slot, and the `--{{PREFIX}}-*`
CSS variables listed in `component-variables.manifest.json`.
