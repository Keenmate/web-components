/**
 * Stacked tables: on a phone a `.reference-table` (or any `.table-stack`) turns
 * every row into a card (css/tables.css). The header row is hidden then, so each
 * cell shows its column name from `data-label` — copied here from the <thead>,
 * so pages don't write it. A label the page set itself wins.
 *
 * `display: block` drops the table semantics in some browsers (Safari), so the
 * table, its rows and cells get explicit ARIA roles too.
 *
 * Each table is watched: rows a page script adds or replaces later (a live
 * readout, `innerHTML` / `replaceChildren`) are labelled as they arrive.
 */
import { STACKED_TABLE_ROLES, STACKED_TABLE_SELECTOR } from './constants.js';

const observedTables = new WeakSet();

export function attachStackedTables(root = document) {
  for (const table of root.querySelectorAll(STACKED_TABLE_SELECTOR)) {
    labelStackedTable(table);
    if (observedTables.has(table)) continue;
    observedTables.add(table);
    // childList only: the attributes set here never re-trigger it.
    new MutationObserver(() => labelStackedTable(table)).observe(table, { childList: true, subtree: true });
  }
}

function labelStackedTable(table) {
  const labels = getColumnLabels(table);
  for (const row of table.rows) {
    for (const [columnIndex, cell] of getCellsByColumn(row)) {
      if (cell.tagName === 'TD' && !cell.hasAttribute('data-label') && labels[columnIndex]) {
        cell.setAttribute('data-label', labels[columnIndex]);
      }
    }
  }
  ensureTableRoles(table);
}

/** Column index → header text, from the last <thead> row (the one naming the columns). */
function getColumnLabels(table) {
  const headerRow = table.tHead?.rows[table.tHead.rows.length - 1];
  const labels = [];
  if (!headerRow) return labels;
  for (const [columnIndex, cell] of getCellsByColumn(headerRow)) {
    labels[columnIndex] = cell.textContent.trim().replace(/\s+/g, ' ');
  }
  return labels;
}

/** [columnIndex, cell] pairs; a colspan cell takes its first column. Rowspans aren't tracked. */
function* getCellsByColumn(row) {
  let columnIndex = 0;
  for (const cell of row.cells) {
    yield [columnIndex, cell];
    columnIndex += cell.colSpan || 1;
  }
}

function ensureTableRoles(table) {
  const setRole = (element, role) => {
    if (!element.hasAttribute('role')) element.setAttribute('role', role);
  };
  setRole(table, STACKED_TABLE_ROLES.table);
  for (const section of [table.tHead, ...table.tBodies, table.tFoot]) {
    if (section) setRole(section, STACKED_TABLE_ROLES.rowGroup);
  }
  for (const row of table.rows) {
    setRole(row, STACKED_TABLE_ROLES.row);
    for (const cell of row.cells) {
      const isColumnHeader = cell.tagName === 'TH' && cell.parentElement.parentElement === table.tHead;
      setRole(cell, isColumnHeader ? STACKED_TABLE_ROLES.columnHeader
        : cell.tagName === 'TH' ? STACKED_TABLE_ROLES.rowHeader : STACKED_TABLE_ROLES.cell);
    }
  }
}
