/**
 * Logic class: framework-agnostic state + rendering for {{PACKAGE_NAME}}.
 * Knows nothing about custom elements — it renders into the container it is
 * given. The Element layer (web-component.ts) owns attribute parsing and DOM
 * events.
 */
import type { {{CONFIG_TYPE}} } from './types.js';

const CSS_CLASSES = {
  root: '{{PREFIX}}__root',
} as const;

export class {{LOGIC_CLASS}} {
  #container: HTMLElement;
  #config: {{CONFIG_TYPE}};

  constructor(container: HTMLElement, config: {{CONFIG_TYPE}}) {
    this.#container = container;
    this.#config = { ...config };
    this.render();
  }

  /** Build the markup once. Light-DOM children show through the slot. */
  render(): void {
    this.#container.innerHTML = `<div class="${CSS_CLASSES.root}" part="root"><slot></slot></div>`;
    this.update(this.#config);
  }

  /** Patch the rendered DOM to a (partial) new config. */
  update(partialConfig: Partial<{{CONFIG_TYPE}}>): void {
    this.#config = { ...this.#config, ...partialConfig };
  }

  destroy(): void {
    this.#container.innerHTML = '';
  }
}
