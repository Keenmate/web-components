/**
 * Event logs on example pages: one function writes a line in the kit's `.log-line`
 * timeline markup (time, name, detail), so every component's log looks the same
 * and follows the page theme. Pages used to build their own entries with
 * innerHTML templates — each a slightly different copy, with hard-coded colours.
 */
import { LOG_LINE_CLASSES, LOG_LINE_VARIANT_CLASSES } from './constants.js';

/** The detail as shown: text as-is, anything else pretty-printed JSON. */
function getDetailText(detail) {
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail, null, 2) ?? String(detail);
  } catch {
    return String(detail);
  }
}

/** A cell; the detail has no class — in the timeline markup it's whatever follows the cells. */
function createCell(className, text) {
  const cell = document.createElement('span');
  if (className) cell.className = className;
  cell.textContent = text;
  return cell;
}

/**
 * Append one line to a `.log-panel` and keep the newest line in view.
 * @param {HTMLElement} panel
 * @param {{ name: string, detail?: unknown, variant?: 'info' | 'success' | 'warning' | 'danger', time?: string }} line
 * @returns {HTMLElement} the line
 */
export function appendLogLine(panel, { name, detail, variant, time = new Date().toLocaleTimeString() }) {
  if (variant !== undefined && !LOG_LINE_VARIANT_CLASSES[variant]) {
    throw new Error(`appendLogLine: unknown variant "${variant}" (expected ${Object.keys(LOG_LINE_VARIANT_CLASSES).join(' | ')})`);
  }
  const line = document.createElement('div');
  line.className = variant ? `${LOG_LINE_CLASSES.root} ${LOG_LINE_VARIANT_CLASSES[variant]}` : LOG_LINE_CLASSES.root;
  line.append(createCell(LOG_LINE_CLASSES.time, time), createCell(LOG_LINE_CLASSES.name, name));
  if (detail !== undefined) line.append(createCell(null, getDetailText(detail)));
  panel.append(line);
  panel.scrollTop = panel.scrollHeight;
  return line;
}
