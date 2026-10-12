// Light-DOM stylesheet (dist/style.css) — carries the :not(:defined) FOUC rule
// from base.css. The shadow root gets the same CSS via ?inline in web-component.ts.
import './css/main.css';

import { registerComponent } from '@keenmate/web-components-core';
import { PlaygroundElement } from './web-component.js';
import { logging } from './logger.js';

export { PlaygroundElement };
export { WebPlayground } from './playground.js';
export type { PlaygroundConfig, PlaygroundEventDetail } from './types.js';
export { logging };

registerComponent('web-playground', PlaygroundElement as unknown as CustomElementConstructor, {
  config: { name: __PACKAGE_NAME__, version: __VERSION__, author: __AUTHOR__ },
  logging,
});
