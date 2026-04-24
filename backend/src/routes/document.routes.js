/**
 * @file backend/src/routes/document.routes.js
 * @description Document routes with multer file-upload middleware, download streaming, and expiring-alert listing
 * @author Dev A
 */

const express = require('express');
const documentController = require('../controllers/document.controller');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const {
  extractValidationErrors,
  idParamChain,
  paginationChain,
} = require('../middleware/validate');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

// All document routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/documents/me
 * @desc    Authenticated employee's own documents
 * @access  Private (any authenticated user with a linked employee record)
 *
 * NOTE: Registered before /:id so "me" isn't parsed as an ID.
 */
router.get('/me', documentController.getMyDocuments);

/**
 * @route   GET /api/documents/expiring
 * @desc    List documents expiring within the given window (?days=30)
 * @access  Private (Admin, HR Manager)
 *
 * NOTE: Registered before /:id so "expiring" isn't parsed as an ID.
 */
router.get(
  '/expiring',
  authorize(['Admin', 'HR Manager']),
  documentController.getExpiringDocuments
);

/**
 * @route   GET /api/documents/employee/:employeeId
 * @desc    Documents for a specific employee (owner or HR/Admin)
 * @access  Private (any authenticated user — self-service or privileged)
 */
router.get(
  '/employee/:employeeId',
  idParamChain('employeeId'),
  extractValidationErrors,
  documentController.getByEmployee
);

/**
 * @route   GET /api/documents
 * @desc    List documents with filters
 * @access  Private (Admin, HR Manager, Department Manager)
 */
router.get(
  '/',
  authorize(['Admin', 'HR Manager', 'Department Manager']),
  paginationChain(),
  extractValidationErrors,
  documentController.getAll
);

/**
 * @route   GET /api/documents/:id
 * @desc    Get single document metadata
 * @access  Private (owner or Admin/HR)
 */
router.get(
  '/:id',
  idParamChain('id'),
  extractValidationErrors,
  documentController.getById
);

/**
 * @route   GET /api/documents/:id/download
 * @desc    Stream the stored file to the caller
 * @access  Private (owner or Admin/HR)
 */
router.get(
  '/:id/download',
  idParamChain('id'),
  extractValidationErrors,
  documentController.download
);

/**
 * @route   POST /api/documents
 * @desc    Upload a new document (multipart/form-data, field "file")
 * @access  Private (Admin, HR Manager)
 *
 * multer runs BEFORE the controller and populates req.file. auditLog()
 * runs AFTER so a successful upload is recorded, but validation errors
 * (bad mime, oversize) short-circuit via the errorHandler.
 */
router.post(
  '/',
  authorize(['Admin', 'HR Manager']),
  documentController.upload.single('file'),
  auditLog(),
  documentController.create
);

/**
 * @route   PUT /api/documents/:id
 * @desc    Update document metadata (lloji, emertimi, data_skadimit)
 * @access  Private (Admin, HR Manager)
 */
router.put(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  documentController.update
);

/**
 * @route   DELETE /api/documents/:id
 * @desc    Remove document record + file on disk
 * @access  Private (Admin, HR Manager)
 */
router.delete(
  '/:id',
  authorize(['Admin', 'HR Manager']),
  idParamChain('id'),
  extractValidationErrors,
  auditLog(),
  documentController.remove
);

module.exports = router;
