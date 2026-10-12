/**
 * Side layer: the public types of {{PACKAGE_NAME}}. No imports from the other
 * layers — this file could be lifted into its own package tomorrow.
 */

/** Configuration of the framework-agnostic logic class ({{LOGIC_CLASS}}). */
export interface {{CONFIG_TYPE}} {
  /** Text shown inside the component. */
  label: string;
  /** Whether the component is in its active (pressed) state. */
  isActive: boolean;
  /** Event: the active state changed. Fire-and-forget — the return value is ignored. */
  onChange?: (detail: {{EVENT_DETAIL_TYPE}}) => void;
}

/** `detail` payload of the `change` CustomEvent. */
export interface {{EVENT_DETAIL_TYPE}} {
  isActive: boolean;
}

/** Event map for the element (`static events`): event name → detail type. */
export interface {{EVENTS_TYPE}} {
  change: {{EVENT_DETAIL_TYPE}};
  [eventName: string]: unknown;
}
