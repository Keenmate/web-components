# Usage — `<web-playground>`

## Attributes / properties

Every input works as an HTML attribute **and** a JS property (core input
table, `ATTRIBUTE_TABLE` in `src/web-component.ts`).

| Attribute | Property | Type | Default | Description |
|---|---|---|---|---|
| `label` | `label` | `string` | `"Hello from web-playground"` | Text shown inside the component. |
| `active` | `isActive` | `boolean` (`bool-default-false`: present = true, `"false"` = false) | `false` | Whether the component is in its active (pressed) state. |

## Events

| Event | `detail` (`PlaygroundEventDetail`) | Property twin | When |
|---|---|---|---|
| `change` | `{ isActive: boolean }` | `onChange` | The active state was toggled by the user. Bubbles, composed, not cancelable. |

```js
const el = document.querySelector('web-playground');
el.addEventListener('change', (event) => console.log(event.detail.isActive));
el.onChange = (event) => console.log(event.detail.isActive); // same event, property form
```

## Slots / children

None.

## Methods

None beyond the core `BlissElement` API (`setAttributes()`, `batch()`, `whenSettled()`).

## Lifecycle notes

The element builds its shadow DOM on first connect; attribute and property
changes are batched into one update per microtask (`await el.whenSettled()`
before reading rendered state in tests).

## Editor integration

The package ships a Custom Elements Manifest plus VS Code custom data. Add to
`.vscode/settings.json` for attribute autocomplete in HTML:

```json
{
  "html.customData": ["./node_modules/@keenmate/web-playground/vscode.html-custom-data.json"],
  "css.customData": ["./node_modules/@keenmate/web-playground/vscode.css-custom-data.json"]
}
```

JetBrains IDEs pick up `web-types.json` automatically.
