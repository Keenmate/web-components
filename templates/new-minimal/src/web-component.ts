/**
 * Element layer: the `<{{TAG}}>` custom element. Parses inputs (attribute +
 * property, through the core input table), hosts the lifecycle and owns the
 * shadow root. Talks to {{LOGIC_CLASS}} only — never to service classes directly.
 */
import { BlissElement, adoptStyles, type InputDef } from '@keenmate/web-components-core';
import { {{LOGIC_CLASS}} } from './{{FEATURE}}.js';
import styles from './css/main.css?inline';

/**
 * Every public input is one row: HTML attribute ⇔ config key, converter
 * (parsing + validation), and what a change triggers, e.g.
 *
 *   { configKey: 'isOpen', attribute: 'open', converter: toBool('default-false'), on: 'update', description: '…' },
 *
 * Attribute names read like HTML; config keys read like JavaScript.
 */
export const ATTRIBUTE_TABLE: readonly InputDef[] = [];

export class {{ELEMENT_CLASS}} extends BlissElement {
  protected static override inputs = ATTRIBUTE_TABLE;

  #shadow: ShadowRoot | null = null;
  /** The logic class renders here, so it never touches the adopted/fallback <style>. */
  #logicContainer: HTMLElement | null = null;
  #logic: {{LOGIC_CLASS}} | null = null;

  /** First connect + any `on: 'reinit'` change: (re)build from the full config. */
  protected override reinit(): void {
    this.#shadow ??= this.attachShadow({ mode: 'open' });
    adoptStyles(this.#shadow, styles);
    this.#logicContainer ??= this.#shadow.appendChild(document.createElement('div'));
    this.#logic?.destroy();
    this.#logic = new {{LOGIC_CLASS}}(this.#logicContainer, {});
    this.log.INIT?.debug('built');
  }

  /** `on: 'update'` changes: patch in place. */
  protected override update(partial: Record<string, unknown>): void {
    this.#logic?.update(partial);
  }
}

// Importing this module registers the element. index.ts additionally publishes
// the global API via registerComponent(); both defines are idempotent.
if (typeof customElements !== 'undefined' && !customElements.get('{{TAG}}')) {
  customElements.define('{{TAG}}', {{ELEMENT_CLASS}});
}
