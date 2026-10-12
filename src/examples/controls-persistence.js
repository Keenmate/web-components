/**
 * Persist the control switches of a controls-driven example page to
 * localStorage so the demo configuration survives a reload.
 *
 * Call ONCE, at the end of the page's own wiring (after the components have
 * their data and the change-listeners are attached):
 *
 *     import { attachControlsPersistence } from '@keenmate/web-components-devkit/examples';
 *     // ... build components, wire control listeners ...
 *     attachControlsPersistence('basic');   // a stable per-page key
 *
 * It scans every <input>/<select> inside `.controls`, restores the saved
 * values, then dispatches `change` (+ `input` for value controls) on each so
 * the page's OWN listeners re-apply the configuration — no page-specific
 * persistence code. Storage ids are namespaced by `kmwc.examples.storagePrefix`
 * (default: the component id), so components on one origin never collide.
 */
import { getPageConfig } from './page-config.js';

const CONTROLS_SELECTOR = '.controls input, .controls select';

const getControlStateId = (control) =>
  control.type === 'checkbox' ? `chk:${control.id}` : control.type === 'radio' ? `radio:${control.name}` : `val:${control.id}`;

export function getControlsStorageKey(pageId, storagePrefix = getPageConfig().storagePrefix) {
  return `${storagePrefix}:examples:controls:${pageId}`;
}

function getSavedControlsState(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '{}') || {};
  } catch {
    return {};
  }
}

function saveControlsState(storageKey, controls) {
  const controlsState = {};
  for (const control of controls) {
    if (control.type === 'radio') {
      if (control.checked) controlsState[getControlStateId(control)] = control.value;
    } else if (control.type === 'checkbox') {
      controlsState[getControlStateId(control)] = control.checked;
    } else {
      controlsState[getControlStateId(control)] = control.value;
    }
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify(controlsState));
  } catch {
    /* storage unavailable (private mode / quota) — degrade to no persistence */
  }
}

/**
 * Restore + persist all `.controls` inputs/selects under `root` for page `pageId`.
 * @param {string} pageId stable per-page key (e.g. "basic")
 * @param {ParentNode} [root] defaults to document
 * @returns {{ clear(): void }} `clear()` forgets the saved state for this page
 */
export function attachControlsPersistence(pageId, root = document) {
  const storageKey = getControlsStorageKey(pageId);
  const controls = [...root.querySelectorAll(CONTROLS_SELECTOR)];
  const persistence = { clear: () => localStorage.removeItem(storageKey) };
  if (controls.length === 0) return persistence;

  // 1) Restore saved values onto the controls.
  const savedState = getSavedControlsState(storageKey);
  for (const control of controls) {
    const stateId = getControlStateId(control);
    if (!(stateId in savedState)) continue;
    if (control.type === 'radio') control.checked = control.value === savedState[stateId];
    else if (control.type === 'checkbox') control.checked = !!savedState[stateId];
    else control.value = savedState[stateId];
  }

  // 2) Re-apply through the page's own handlers. For radios fire only the
  //    checked one per group; value controls also get `input`, since some
  //    pages listen on that rather than `change`.
  const firedRadioGroups = new Set();
  for (const control of controls) {
    if (control.type === 'radio') {
      if (!control.checked || firedRadioGroups.has(control.name)) continue;
      firedRadioGroups.add(control.name);
    }
    control.dispatchEvent(new Event('change', { bubbles: true }));
    if (control.type !== 'radio' && control.type !== 'checkbox') control.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // 3) Save on every subsequent change.
  const handleControlChange = (event) => {
    if (event.target?.closest?.('.controls')) saveControlsState(storageKey, controls);
  };
  root.addEventListener('change', handleControlChange);
  root.addEventListener('input', handleControlChange);
  return persistence;
}
