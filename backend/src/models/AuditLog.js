/**
 * @file backend/src/models/AuditLog.js
 * @description AuditLog model with filterable queries for compliance reporting
 * @author Dev A
 */

const db = require('../config/db');

/** Whitelist of sortable columns to prevent SQL injection */
const ALLOWED_SORT_COLUMNS = ['id', 'user_id', 'action', 'entity', 'created_at'];

/**
 * Create an audit log entry.
 *
 * @param {Object} data
 * @param {number|null} data.user_id - User performing the action
 * @param {string} data.action - Action label (e.g., "CREATE /api/users")
 * @param {string} data.entity - Entity name (e.g., "Users")
 * @param {number|null} [data.entity_id] - Affected entity ID
 * @param {Object|null} [data.old_values] - Pre-mutation values
 * @param {Object|null} [data.new_values] - Post-mutation values
 * @param {string|null} [data.ip_address] - Client IP
 * @returns {Promise<number>} Inserted row ID
 */
const create = async (data) => {
  const [result] = await db.query(
    `INSERT INTO AuditLogs (user_id, action, entity, entity_id, old_values, new_values, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.user_id ?? null,
      data.action,
      data.entity,
      data.entity_id ?? null,
      data.old_values ? JSON.stringify(data.old_values) : null,
      data.new_values ? JSON.stringify(data.new_values) : null,
      data.ip_address ?? null,
    ]
  );
  return result.insertId;
};

/**
 * Find audit log entries with optional filters and pagination.
 *
 * @param {Object} [filters]
 * @param {number} [filters.user_id] - Filter by user
 * @param {string} [filters.entity] - Filter by entity name
 * @param {number} [filters.entity_id] - Filter by entity ID
 * @param {string} [filters.action] - Filter by action substring
 * @param {string} [filters.from_date] - Start date (ISO string)
 * @param {string} [filters.to_date] - End date (ISO string)
 * @param {number} [filters.page=1]
 * @param {number} [filters.limit=20]
 * @param {string} [filters.sortBy='created_at']
 * @param {string} [filters.sortOrder='DESC']
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
const findAll = async (filters = {}) => {
  const {
    user_id,
    entity,
    entity_id,
    action,
    from_date,
    to_date,
    page = 1,
    limit = 20,
    sortBy = 'created_at',
    sortOrder = 'DESC',
  } = filters;

  // Build WHERE conditions
  const conditions = [];
  const params = [];

  if (user_id) {
    conditions.push('user_id = ?');
    params.push(user_id);
  }
  if (entity) {
    conditions.push('entity = ?');
    params.push(entity);
  }
  if (entity_id) {
    conditions.push('entity_id = ?');
    params.push(entity_id);
  }
  if (action) {
    conditions.push('action LIKE ?');
    params.push(`%${action}%`);
  }
  if (from_date) {
    conditions.push('created_at >= ?');
    params.push(from_date);
  }
  if (to_date) {
    conditions.push('created_at <= ?');
    params.push(to_date);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Validate sort column to prevent SQL injection
  const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'created_at';
  const safeSortOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // Count total
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total FROM AuditLogs ${whereClause}`,
    params
  );
  const total = countRows[0].total;

  // Pagination math
  const currentPage = Math.max(1, parseInt(page, 10));
  const perPage = Math.max(1, Math.min(100, parseInt(limit, 10)));
  const offset = (currentPage - 1) * perPage;
  const totalPages = Math.ceil(total / perPage);

  // Fetch page
  const [rows] = await db.query(
    `SELECT * FROM AuditLogs ${whereClause}
     ORDER BY ${safeSortBy} ${safeSortOrder}
     LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );

  return {
    data: rows,
    pagination: {
      currentPage,
      perPage,
      total,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    },
  };
};

/**
 * Find all audit log entries for a specific entity (e.g., one user, one employee).
 *
 * @param {string} entity - Entity name
 * @param {number} entityId - Entity ID
 * @returns {Promise<Object[]>} Audit log rows in chronological order
 */
const findByEntity = async (entity, entityId) => {
  const [rows] = await db.query(
    `SELECT * FROM AuditLogs
     WHERE entity = ? AND entity_id = ?
     ORDER BY created_at DESC`,
    [entity, entityId]
  );
  return rows;
};

module.exports = { create, findAll, findByEntity };
