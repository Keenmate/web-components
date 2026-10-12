/**
 * Side layer: the public types of @keenmate/web-playground. No imports from the other
 * layers — this file could be lifted into its own package tomorrow.
 */

/** Configuration of the framework-agnostic logic class (WebPlayground). */
export interface PlaygroundConfig {
  /** Text shown inside the component. */
  label: string;
  /** Whether the component is in its active (pressed) state. */
  isActive: boolean;
  /** Event: the active state changed. Fire-and-forget — the return value is ignored. */
  onChange?: (detail: PlaygroundEventDetail) => void;
}

/** `detail` payload of the `change` CustomEvent. */
export interface PlaygroundEventDetail {
  isActive: boolean;
}

/** Event map for the element (`static events`): event name → detail type. */
export interface PlaygroundEvents {
  change: PlaygroundEventDetail;
  [eventName: string]: unknown;
}
