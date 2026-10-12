/**
 * Logic class: framework-agnostic state + rendering for {{PACKAGE_NAME}}.
 * Knows nothing about custom elements — it renders into the container it is
 * given and reports back through the `on*` events in its config. The Element
 * layer (web-component.ts) owns attribute parsing and DOM events.
 */
import type { {{CONFIG_TYPE}} } from './types.js';

const CSS_CLASSES = {
  root: '{{PREFIX}}__root',
  rootActive: '{{PREFIX}}__root--active',
  label: '{{PREFIX}}__label',
} as const;

export class {{LOGIC_CLASS}} {
  #container: HTMLElement;
  #config: {{CONFIG_TYPE}};
  #rootElement: HTMLButtonElement | null = null;
  #labelElement: HTMLSpanElement | null = null;

  constructor(container: HTMLElement, config: {{CONFIG_TYPE}}) {
    this.#container = container;
    this.#config = { ...config };
    this.render();
  }

  /** Build the markup once. */
  render(): void {
    this.#container.innerHTML = `<button type="button" class="${CSS_CLASSES.root}" part="root"><span class="${CSS_CLASSES.label}" part="label"></span></button>`;
    this.#rootElement = this.#container.querySelector(`.${CSS_CLASSES.root}`);
    this.#labelElement = this.#container.querySelector(`.${CSS_CLASSES.label}`);
    this.#rootElement?.addEventListener('click', this.handleRootClick);
    this.update(this.#config);
  }

  /** Patch the rendered DOM to a (partial) new config. */
  update(partialConfig: Partial<{{CONFIG_TYPE}}>): void {
    this.#config = { ...this.#config, ...partialConfig };
    if (this.#labelElement) this.#labelElement.textContent = this.#config.label;
    this.#rootElement?.classList.toggle(CSS_CLASSES.rootActive, this.#config.isActive);
    this.#rootElement?.setAttribute('aria-pressed', String(this.#config.isActive));
  }

  toggle(): void {
    this.update({ isActive: !this.#config.isActive });
    this.#config.onChange?.({ isActive: this.#config.isActive });
  }

  destroy(): void {
    this.#rootElement?.removeEventListener('click', this.handleRootClick);
    this.#container.innerHTML = '';
  }

  private handleRootClick = (): void => this.toggle();
}
