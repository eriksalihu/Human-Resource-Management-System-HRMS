/**
 * @file backend/src/utils/helpers.js
 * @description Shared utility functions for pagination, search, formatting, and calculations
 * @author Dev A
 */

/**
 * Build SQL LIMIT / OFFSET clause and calculate pagination metadata.
 *
 * @param {Object} opts
 * @param {number} [opts.page=1] - Current page (1-based)
 * @param {number} [opts.limit=10] - Rows per page
 * @param {number} opts.total - Total row count (from COUNT query)
 * @returns {{ limit: number, offset: number, pagination: Object }}
 */
const buildPaginationQuery = ({ page = 1, limit = 10, total }) => {
  // Edge case: a non-numeric `page`/`limit` made `parseInt` return NaN,
  // and `Math.max(1, NaN)` is NaN — which then poisoned offset and
  // serialized as `null` in JSON. Coerce with a numeric fallback FIRST.
  const safePage = Number.parseInt(page, 10);
  const safeLimit = Number.parseInt(limit, 10);
  const requestedPage = Math.max(
    1,
    Number.isFinite(safePage) ? safePage : 1
  );
  const perPage = Math.max(
    1,
    Math.min(100, Number.isFinite(safeLimit) ? safeLimit : 10)
  );

  // Edge case: empty result set / failed COUNT → `total` undefined or
  // NaN made totalPages NaN. Clamp to a non-negative integer.
  const safeTotal = Math.max(0, Number.parseInt(total, 10) || 0);
  const totalPages = Math.ceil(safeTotal / perPage); // 0 when no rows

  // Edge case: a filter shrank the result set so the requested page no
  // longer exists (e.g. you were on page 5, filtered down to 1 page).
  // Clamp to the last real page instead of returning an empty array
  // for data that does exist.
  const currentPage =
    totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;
  const offset = (currentPage - 1) * perPage;

  return {
    limit: perPage,
    offset,
    pagination: {
      currentPage,
      perPage,
      total: safeTotal,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    },
  };
};

/**
 * Build a SQL WHERE clause fragment for a LIKE search across multiple columns.
 *
 * @param {string} searchTerm - User-supplied search string
 * @param {string[]} columns - Column names to search (e.g., ['first_name', 'last_name', 'email'])
 * @returns {{ whereClause: string, params: string[] }} SQL fragment and bound params
 *
 * @example
 *   const { whereClause, params } = buildSearchCondition('john', ['first_name', 'email']);
 *   // whereClause → '(first_name LIKE ? OR email LIKE ?)'
 *   // params     → ['%john%', '%john%']
 */
const buildSearchCondition = (searchTerm, columns) => {
  if (!searchTerm || !columns.length) {
    return { whereClause: '', params: [] };
  }

  const term = `%${searchTerm.trim()}%`;
  const conditions = columns.map((col) => `${col} LIKE ?`);
  const params = columns.map(() => term);

  return {
    whereClause: `(${conditions.join(' OR ')})`,
    params,
  };
};

/**
 * Format a Date (or date string) as YYYY-MM-DD.
 *
 * @param {Date|string} date
 * @returns {string} Formatted date string
 */
const formatDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Generate a unique employee number with a prefix and zero-padded sequence.
 *
 * @param {number} sequenceNumber - Numeric part (e.g., current MAX + 1)
 * @param {string} [prefix='EMP'] - Company prefix
 * @returns {string} Employee number (e.g., 'EMP-00042')
 */
const generateEmployeeNumber = (sequenceNumber, prefix = 'EMP') => {
  const padded = String(sequenceNumber).padStart(5, '0');
  return `${prefix}-${padded}`;
};

/**
 * Calculate net salary after standard deductions.
 * Deductions: pension (5%), health insurance (3.5%), tax (10% on taxable income).
 *
 * @param {number} grossSalary - Gross monthly salary
 * @returns {{ grossSalary: number, pension: number, healthInsurance: number, tax: number, netSalary: number }}
 */
const calculateNetSalary = (grossSalary) => {
  const gross = parseFloat(grossSalary) || 0;

  const pension = +(gross * 0.05).toFixed(2);
  const healthInsurance = +(gross * 0.035).toFixed(2);
  const taxableIncome = gross - pension - healthInsurance;
  const tax = +(taxableIncome * 0.1).toFixed(2);
  const netSalary = +(gross - pension - healthInsurance - tax).toFixed(2);

  return {
    grossSalary: gross,
    pension,
    healthInsurance,
    tax,
    netSalary,
  };
};

module.exports = {
  buildPaginationQuery,
  buildSearchCondition,
  formatDate,
  generateEmployeeNumber,
  calculateNetSalary,
};
