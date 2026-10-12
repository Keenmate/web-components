# Usage — `<{{TAG}}>`

## Attributes / properties

None yet. Every input is one row in `ATTRIBUTE_TABLE` (`src/web-component.ts`)
and works as an HTML attribute **and** a JS property — document each row here
(attribute, property, type, default, description).

## Events

None yet. Declare events in `static events` and dispatch them with
`this.emit(name, detail)`; core installs the `on<Name>` property twin.
Document name, `detail` shape, when it fires and whether it's cancelable.

## Slots / children

| Slot | Content |
|---|---|
| (default) | Any light-DOM content; rendered inside `.{{PREFIX}}__root`. |

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
  "html.customData": ["./node_modules/{{PACKAGE_NAME}}/vscode.html-custom-data.json"],
  "css.customData": ["./node_modules/{{PACKAGE_NAME}}/vscode.css-custom-data.json"]
}
```

JetBrains IDEs pick up `web-types.json` automatically.
