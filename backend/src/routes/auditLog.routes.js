/**
 * @file backend/src/routes/auditLog.routes.js
 * @description Admin-only audit log routes — paginated/filtered listing and per-entity history
 * @author Dev A
 *
 * NOTE: A dedicated `auditLog.controller.js` is planned for a later milestone.
 * Until it lands, the route handlers call `models/AuditLog` directly — the
 * model already encapsulates pagination, sortable-column whitelisting, and
 * filter handling, so the inline handlers stay thin and easy to swap out
 * once the controller arrives.
 */

const express = require('express');
const AuditLog = require('../models/AuditLog');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const {
  extractValidationErrors,
  idParamChain,
  paginationChain,
} = require('../middleware/validate');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

// Every audit log route requires authentication AND admin privileges
router.use(authenticate);
router.use(authorize(['Admin']));

/**
 * @route   GET /api/audit-logs
 * @desc    Paginated, filterable listing of audit log entries
 * @access  Private (Admin only)
 * @query   user_id, entity, entity_id, action, from_date, to_date,
 *          page, limit, sortBy, sortOrder
 */
router.get(
  '/',
  paginationChain(),
  extractValidationErrors,
  async (req, res, next) => {
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
        user_id: user_id ? parseInt(user_id, 10) : undefined,
        entity,
        entity_id: entity_id ? parseInt(entity_id, 10) : undefined,
        action,
        from_date,
        to_date,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
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
  }
);

/**
 * @route   GET /api/audit-logs/entity/:entity/:entityId
 * @desc    Full audit history for one entity (e.g. "Users", 42)
 * @access  Private (Admin only)
 *
 * NOTE: Registered before /:id so "entity" isn't parsed as a numeric id.
 */
router.get(
  '/entity/:entity/:entityId',
  idParamChain('entityId'),
  extractValidationErrors,
  async (req, res, next) => {
    try {
      const { entity } = req.params;
      const entityId = parseInt(req.params.entityId, 10);
      if (!entity || Number.isNaN(entityId)) {
        throw new AppError('Invalid entity or entityId', 400);
      }

      const rows = await AuditLog.findByEntity(entity, entityId);
      res.json({
        success: true,
        data: { entity, entity_id: entityId, count: rows.length, logs: rows },
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
