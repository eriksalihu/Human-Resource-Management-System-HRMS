/**
 * @file backend/src/middleware/auditLog.js
 * @description Audit logging middleware for tracking data mutations
 * @author Dev A
 */

const db = require('../config/db');

/**
 * Extract the client IP address from the request.
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
const getClientIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  req.ip ||
  req.connection?.remoteAddress ||
  null;

/**
 * Derive a human-readable action string from the HTTP method and route.
 *
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {string} path - Original URL path
 * @returns {string} Action label (e.g., "CREATE /api/users")
 */
const deriveAction = (method, path) => {
  const actionMap = {
    POST: 'CREATE',
    PUT: 'UPDATE',
    PATCH: 'UPDATE',
    DELETE: 'DELETE',
  };
  const action = actionMap[method.toUpperCase()] || method.toUpperCase();
  return `${action} ${path}`;
};

/**
 * Extract the entity type from the request URL.
 * For example: /api/users/5 → "Users", /api/departments → "Departments"
 *
 * @param {string} path - Original URL path
 * @returns {string} Entity name capitalised
 */
const extractEntity = (path) => {
  const segments = path.replace(/^\/api\//, '').split('/');
  const entity = segments[0] || 'unknown';
  return entity.charAt(0).toUpperCase() + entity.slice(1);
};

/**
 * Extract the entity ID from URL params (first numeric param).
 *
 * @param {Object} params - Express route params
 * @returns {number|null}
 */
const extractEntityId = (params) => {
  if (!params) return null;
  const id = params.id || Object.values(params).find((v) => /^\d+$/.test(v));
  return id ? parseInt(id, 10) : null;
};

/**
 * Save an audit log entry to the AuditLogs table.
 *
 * @param {Object} entry
 * @param {number|null} entry.user_id
 * @param {string} entry.action
 * @param {string} entry.entity
 * @param {number|null} entry.entity_id
 * @param {Object|null} entry.old_values
 * @param {Object|null} entry.new_values
 * @param {string|null} entry.ip_address
 * @returns {Promise<void>}
 */
const saveAuditLog = async (entry) => {
  try {
    await db.query(
      `INSERT INTO AuditLogs (user_id, action, entity, entity_id, old_values, new_values, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.user_id,
        entry.action,
        entry.entity,
        entry.entity_id,
        entry.old_values ? JSON.stringify(entry.old_values) : null,
        entry.new_values ? JSON.stringify(entry.new_values) : null,
        entry.ip_address,
      ]
    );
  } catch (err) {
    // Audit log failures should not break the request pipeline
    console.error('[AuditLog] Failed to save audit entry:', err.message);
  }
};

/**
 * Audit logging middleware factory.
 * Captures data mutations (POST, PUT, PATCH, DELETE) and writes an entry to the
 * AuditLogs table after the response is sent.
 *
 * For UPDATE and DELETE operations, the middleware can receive old values through
 * `res.locals.auditOldValues` set by the controller before the mutation.
 *
 * @returns {import('express').RequestHandler}
 */
const auditLog = () => {
  return (req, res, next) => {
    // Only log mutation methods
    const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!mutationMethods.includes(req.method.toUpperCase())) {
      return next();
    }

    // Hook into response finish to capture the final state
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      // Fire-and-forget the audit log write
      const entry = {
        user_id: req.user?.id || null,
        action: deriveAction(req.method, req.originalUrl),
        entity: extractEntity(req.originalUrl),
        entity_id: extractEntityId(req.params),
        old_values: res.locals?.auditOldValues || null,
        new_values: req.body || null,
        ip_address: getClientIp(req),
      };

      // Only log if the response indicates success (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        saveAuditLog(entry);
      }

      return originalJson(body);
    };

    next();
  };
};

module.exports = { auditLog, saveAuditLog };
