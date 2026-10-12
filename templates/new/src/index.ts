// Light-DOM stylesheet (dist/style.css) — carries the :not(:defined) FOUC rule
// from base.css. The shadow root gets the same CSS via ?inline in web-component.ts.
import './css/main.css';

import { registerComponent } from '@keenmate/web-components-core';
import { {{ELEMENT_CLASS}} } from './web-component.js';
import { logging } from './logger.js';

export { {{ELEMENT_CLASS}} };
export { {{LOGIC_CLASS}} } from './{{FEATURE}}.js';
export type { {{CONFIG_TYPE}}, {{EVENT_DETAIL_TYPE}} } from './types.js';
export { logging };

registerComponent('{{TAG}}', {{ELEMENT_CLASS}} as unknown as CustomElementConstructor, {
  config: { name: __PACKAGE_NAME__, version: __VERSION__, author: __AUTHOR__ },
  logging,
});
