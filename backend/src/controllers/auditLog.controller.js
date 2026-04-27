/**
 * @file backend/src/controllers/auditLog.controller.js
 * @description AuditLog controller — admin-only filterable listing, per-entity history, and CSV export
 * @author Dev A
 *
 * Authorization is enforced at the route layer (`authorize(['Admin'])`),
 * so the controller assumes a privileged caller. Every endpoint is
 * read-only — audit logs are immutable for compliance reasons.
 */

const AuditLog = require('../models/AuditLog');
const { AppError } = require('../middleware/errorHandler');

/** Parse a query-string integer, returning undefined for missing values. */
const intOrUndefined = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
};

/** Stringify a JSON-ish field for CSV output without breaking on objects. */
const jsonOrEmpty = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

/** Quote a CSV cell when it contains delimiters. */
const csvCell = (value) => {
  if (value == null) return '';
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/**
 * GET /api/audit-logs
 *
 * Paginated, filterable listing. All filters are optional and combine with
 * AND semantics inside the model.
 *
 * @query {number} [user_id]
 * @query {string} [entity]    - exact match (e.g. "Users")
 * @query {number} [entity_id]
 * @query {string} [action]    - LIKE %action%
 * @query {string} [from_date] - ISO datetime / date
 * @query {string} [to_date]   - ISO datetime / date
 * @query {number} [page=1]
 * @query {number} [limit=20]
 * @query {string} [sortBy='created_at']
 * @query {string} [sortOrder='DESC']
 */
const getAll = async (req, res, next) => {
  try {
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
    } = req.query;

    const result = await AuditLog.findAll({
      user_id: intOrUndefined(user_id),
      entity: entity || undefined,
      entity_id: intOrUndefined(entity_id),
      action: action || undefined,
      from_date: from_date || undefined,
      to_date: to_date || undefined,
      page: intOrUndefined(page) || 1,
      limit: intOrUndefined(limit) || 20,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/audit-logs/entity/:entity/:entityId
 *
 * Full chronological history for a specific entity (e.g. one Employee row).
 * Useful for "show me everything that happened to user #42" investigations.
 */
const getByEntity = async (req, res, next) => {
  try {
    const { entity } = req.params;
    const entityId = parseInt(req.params.entityId, 10);

    if (!entity || Number.isNaN(entityId)) {
      throw new AppError('Invalid entity or entityId', 400);
    }

    const rows = await AuditLog.findByEntity(entity, entityId);
    res.json({
      success: true,
      data: {
        entity,
        entity_id: entityId,
        count: rows.length,
        logs: rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/audit-logs/export
 *
 * CSV export of audit logs. Accepts the same filters as `getAll` but does
 * not paginate — the model is called once with a generous limit so the
 * export captures every row matching the filter window. For huge windows
 * the caller should narrow `from_date` / `to_date` first.
 *
 * @query Filters identical to getAll (page/limit ignored)
 * @query {number} [max=10000] - Hard cap on rows exported (defaults to 10k)
 */
const exportLogs = async (req, res, next) => {
  try {
    const {
      user_id,
      entity,
      entity_id,
      action,
      from_date,
      to_date,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      max,
    } = req.query;

    const cap = Math.min(Math.max(intOrUndefined(max) || 10000, 1), 50000);

    // We call the model once with an over-sized `limit` and collect all
    // rows in a single page. That keeps the SQL simple and avoids a
    // streaming pipeline we don't need at this scale.
    const result = await AuditLog.findAll({
      user_id: intOrUndefined(user_id),
      entity: entity || undefined,
      entity_id: intOrUndefined(entity_id),
      action: action || undefined,
      from_date: from_date || undefined,
      to_date: to_date || undefined,
      page: 1,
      limit: cap,
      sortBy,
      sortOrder,
    });

    const header = [
      'id',
      'created_at',
      'user_id',
      'action',
      'entity',
      'entity_id',
      'ip_address',
      'old_values',
      'new_values',
    ];

    const rows = result.data.map((r) => [
      r.id,
      r.created_at,
      r.user_id ?? '',
      r.action,
      r.entity,
      r.entity_id ?? '',
      r.ip_address ?? '',
      jsonOrEmpty(r.old_values),
      jsonOrEmpty(r.new_values),
    ]);

    const csv = [header, ...rows]
      .map((cols) => cols.map(csvCell).join(','))
      .join('\n');

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit_logs_${stamp}.csv"`
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  getByEntity,
  exportLogs,
};
