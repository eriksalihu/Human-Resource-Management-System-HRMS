/**
 * @file frontend/src/utils/csv.js
 * @description Tiny CSV serializer + browser-download helper. Used by the
 *   "Export CSV" buttons across list components (EmployeeList, SalaryList,
 *   AttendanceList, LeaveRequestList) and any future export touchpoint.
 * @author Dev B
 *
 * Why hand-rolled instead of papaparse / json2csv:
 *   - We only need the encoder side (no parsing), and the encoder rules
 *     are short — quote when the cell contains delimiter/newline/quote,
 *     double-up internal quotes, line-end with \r\n (Excel-friendly)
 *   - Zero new dependencies for the bundle
 *   - The whole module is ~30 lines, so reading it is the same
 *     cognitive cost as reading the third-party docs
 *
 * Browsers handle CSV downloads via Blob → object URL → synthesised
 * `<a download>` click. Same pattern the document-download helper uses.
 */

/**
 * Escape a single CSV cell. Wraps in double quotes when the value
 * contains a delimiter, double quote, or newline; doubles internal
 * quotes per RFC 4180. Null / undefined become an empty cell.
 *
 * @param {*} value
 * @returns {string}
 */
export const csvCell = (value) => {
  if (value == null) return '';
  const str = String(value);
  // Match commas, quotes, CR, or LF — quoting if any of those appear.
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Serialize rows into a single CSV string.
 *
 * @param {string[]} headers - Column header labels (rendered as the first row)
 * @param {Array<Array<*>>} rows - 2-D array of cell values, one row per record
 * @returns {string}
 */
export const buildCsv = (headers, rows) => {
  const lines = [];
  lines.push(headers.map(csvCell).join(','));
  for (const row of rows) {
    lines.push(row.map(csvCell).join(','));
  }
  // Excel handles \n but Windows-line-endings (\r\n) are the
  // RFC-mandated default and avoid surprises in third-party tools.
  return lines.join('\r\n');
};

/**
 * Trigger a browser download of CSV content. The Blob path bypasses any
 * Vite / SPA routing quirks (we never hit the network) and works on
 * every modern browser.
 *
 * @param {string} filename - Default download name (browser may append .csv)
 * @param {string[]} headers - Column header labels
 * @param {Array<Array<*>>} rows - 2-D cell-value array
 */
export const downloadCsv = (filename, headers, rows) => {
  const csv = buildCsv(headers, rows);
  // Excel needs a UTF-8 BOM to interpret accented characters correctly
  // ("Drilon Krasniqi" should not render as "Drilon KrasniÃ§i"). The
  // BOM is invisible in real CSV consumers (LibreOffice, Numbers, etc.).
  const BOM = '﻿';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename.toLowerCase().endsWith('.csv')
    ? filename
    : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Build a filename stamp like `employees_2026-05-13.csv`. Centralised so
 * every export uses the same date-format convention.
 *
 * @param {string} prefix - Logical name (e.g. "employees", "salaries")
 * @returns {string}
 */
export const stampedFilename = (prefix) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${prefix}_${y}-${m}-${d}.csv`;
};

export default {
  csvCell,
  buildCsv,
  downloadCsv,
  stampedFilename,
};
