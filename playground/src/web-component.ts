/**
 * Element layer: the `<web-playground>` custom element. Parses inputs (attribute +
 * property, through the core input table), hosts the lifecycle, owns the
 * shadow root and turns the logic class's `on*` events into DOM CustomEvents.
 * Talks to WebPlayground only — never to service classes directly.
 */
import { BlissElement, adoptStyles, toBool, toText, type InputDef } from '@keenmate/web-components-core';
import { WebPlayground } from './playground.js';
import type { PlaygroundEventDetail, PlaygroundEvents } from './types.js';
import styles from './css/main.css?inline';

/**
 * Every public input is one row: HTML attribute ⇔ config key, converter
 * (parsing + validation), and what a change triggers. Attribute names read like
 * HTML (`active`); config keys read like JavaScript (`isActive`).
 */
export const ATTRIBUTE_TABLE: readonly InputDef[] = [
  {
    configKey: 'label',
    attribute: 'label',
    converter: toText({ default: 'Hello from web-playground' }),
    on: 'update',
    description: 'Text shown inside the component.',
  },
  {
    configKey: 'isActive',
    attribute: 'active',
    converter: toBool('default-false'),
    on: 'update',
    description: 'Whether the component is in its active (pressed) state. Toggled by clicking; fires `change`.',
  },
];

export class PlaygroundElement extends BlissElement<PlaygroundEvents> {
  protected static override inputs = ATTRIBUTE_TABLE;
  protected static override events = ['change'];

  #shadow: ShadowRoot | null = null;
  /** The logic class renders here, so it never touches the adopted/fallback <style>. */
  #logicContainer: HTMLElement | null = null;
  #logic: WebPlayground | null = null;

  /** First connect + any `on: 'reinit'` change: (re)build from the full config. */
  protected override reinit(): void {
    this.#shadow ??= this.attachShadow({ mode: 'open' });
    adoptStyles(this.#shadow, styles);
    this.#logicContainer ??= this.#shadow.appendChild(document.createElement('div'));
    this.#logic?.destroy();
    this.#logic = new WebPlayground(this.#logicContainer, {
      label: String(this.config.label ?? ''),
      isActive: Boolean(this.config.isActive),
      onChange: (detail) => this.handleLogicChange(detail),
    });
    this.log.INIT?.debug('built');
  }

  /** `on: 'update'` changes: patch in place. */
  protected override update(partial: Record<string, unknown>): void {
    this.#logic?.update(partial);
  }

  /** The logic class's `onChange` event → reflect + dispatch the `change` CustomEvent. */
  private handleLogicChange(detail: PlaygroundEventDetail): void {
    this.toggleAttribute('active', detail.isActive);
    this.emit('change', detail);
  }
}

// Importing this module registers the element. index.ts additionally publishes
// the global API via registerComponent(); both defines are idempotent.
if (typeof customElements !== 'undefined' && !customElements.get('web-playground')) {
  customElements.define('web-playground', PlaygroundElement);
}
