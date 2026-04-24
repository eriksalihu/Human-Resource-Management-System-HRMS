/**
 * @file backend/src/controllers/document.controller.js
 * @description Document controller — multer-backed uploads, download streaming, type/expiration queries, and CRUD
 * @author Dev A
 */

const fs = require('fs');
const path = require('path');
const multer = require('multer');

const Document = require('../models/Document');
const Employee = require('../models/Employee');
const { AppError } = require('../middleware/errorHandler');

/** Roles allowed to upload / edit / delete documents for any employee. */
const PRIVILEGED_ROLES = ['Admin', 'HR Manager'];

/** Upload root — lives outside `src/` so it isn't served as code. */
const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads/documents');

/** Ensure the upload directory exists before multer tries to write to it. */
if (!fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

/** MIME types we accept. Keeps out executables / scripts. */
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'text/plain',
]);

/** Max file size: 10 MB. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Multer disk storage — filenames are timestamped to avoid collisions
 * while preserving the original extension for convenient downloads.
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-z0-9_-]+/gi, '_')
      .toLowerCase()
      .slice(0, 40);
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${base || 'file'}_${unique}${ext}`);
  },
});

/**
 * MIME-type gate for multer. Rejected uploads propagate as AppError(400)
 * through the error handler.
 */
const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(null, true);
  }
  cb(new AppError(`Unsupported file type: ${file.mimetype}`, 400));
};

/** Configured multer instance — imported by the routes layer. */
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_BYTES },
});

/**
 * Delete a file from disk, swallowing ENOENT so a missing file never
 * blocks a delete/update. Logs other errors for debugging.
 */
const removeFile = (relativePath) => {
  if (!relativePath) return;
  const abs = path.resolve(UPLOAD_ROOT, '..', relativePath);
  fs.unlink(abs, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('[document.removeFile]', err);
    }
  });
};

/** Is the caller privileged (Admin / HR Manager)? */
const isPrivileged = (req) =>
  (req.user?.roles || []).some((r) => PRIVILEGED_ROLES.includes(r));

/**
 * Authorize access to a document given the request context.
 * Owners may read their own documents; privileged roles may read all.
 */
const assertCanReadDocument = async (req, doc) => {
  if (!doc) {
    throw new AppError('Document not found', 404);
  }
  if (isPrivileged(req)) return;

  const employee = await Employee.findByUserId(req.user.id);
  if (!employee || employee.id !== doc.employee_id) {
    throw new AppError('Forbidden: you cannot access this document', 403);
  }
};

/**
 * GET /api/documents
 * List documents with pagination and filters (HR / Admin view).
 */
const getAll = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      employee_id,
      lloji,
      search,
      sortBy = 'data_ngarkimit',
      sortOrder = 'DESC',
    } = req.query;

    if (lloji && !Document.VALID_TYPES.includes(lloji)) {
      throw new AppError(
        `Invalid lloji. Must be one of: ${Document.VALID_TYPES.join(', ')}`,
        400
      );
    }

    const result = await Document.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      employee_id: employee_id ? parseInt(employee_id, 10) : undefined,
      lloji,
      search,
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
 * GET /api/documents/:id
 * Return a single document's metadata (not the file itself — see /download).
 */
const getById = async (req, res, next) => {
  try {
    const doc = await Document.findById(parseInt(req.params.id, 10));
    await assertCanReadDocument(req, doc);
    res.json({ success: true, data: { document: doc } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/documents/employee/:employeeId
 * All documents belonging to a specific employee.
 * The employee themself can always access their own set; others need HR role.
 */
const getByEmployee = async (req, res, next) => {
  try {
    const employeeId = parseInt(req.params.employeeId, 10);
    const { lloji } = req.query;

    if (lloji && !Document.VALID_TYPES.includes(lloji)) {
      throw new AppError(
        `Invalid lloji. Must be one of: ${Document.VALID_TYPES.join(', ')}`,
        400
      );
    }

    if (!isPrivileged(req)) {
      const self = await Employee.findByUserId(req.user.id);
      if (!self || self.id !== employeeId) {
        throw new AppError(
          "Forbidden: you can only access your own documents",
          403
        );
      }
    }

    const rows = await Document.findByEmployee(employeeId, { lloji });
    res.json({ success: true, data: { documents: rows } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/documents/me
 * Shortcut returning the authenticated employee's own documents.
 */
const getMyDocuments = async (req, res, next) => {
  try {
    const employee = await Employee.findByUserId(req.user.id);
    if (!employee) {
      throw new AppError('No employee record linked to this user', 404);
    }
    const rows = await Document.findByEmployee(employee.id);
    res.json({
      success: true,
      data: { employee_id: employee.id, documents: rows },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/documents/expiring?days=30
 * List documents expiring within the given lookahead window.
 */
const getExpiringDocuments = async (req, res, next) => {
  try {
    const days = req.query.days != null ? parseInt(req.query.days, 10) : 30;
    if (Number.isNaN(days) || days < 0) {
      throw new AppError('days must be a non-negative integer', 400);
    }
    const rows = await Document.findExpiring(days);
    res.json({
      success: true,
      data: { days, count: rows.length, documents: rows },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/documents
 * Upload a new document. Requires multipart/form-data with field `file`.
 * Body: employee_id, lloji, emertimi, data_skadimit?
 */
const create = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('No file uploaded (field name must be "file")', 400);
    }

    const { employee_id, lloji, emertimi, data_skadimit } = req.body;

    // Roll back the uploaded file on any validation failure
    const bailOut = (msg, code = 400) => {
      removeFile(path.relative(path.resolve(UPLOAD_ROOT, '..'), req.file.path));
      throw new AppError(msg, code);
    };

    if (!employee_id || !lloji || !emertimi) {
      bailOut('employee_id, lloji and emertimi are required', 400);
    }

    if (!Document.VALID_TYPES.includes(lloji)) {
      bailOut(
        `Invalid lloji. Must be one of: ${Document.VALID_TYPES.join(', ')}`,
        400
      );
    }

    const employee = await Employee.findById(parseInt(employee_id, 10));
    if (!employee) {
      bailOut('Specified employee does not exist', 404);
    }

    // Relative path stored in DB so the app can be rehomed without breakage.
    const relativePath = path
      .relative(path.resolve(UPLOAD_ROOT, '..'), req.file.path)
      .replace(/\\/g, '/');

    const id = await Document.create({
      employee_id: parseInt(employee_id, 10),
      lloji,
      emertimi,
      file_path: relativePath,
      data_skadimit: data_skadimit || null,
    });

    const doc = await Document.findById(id);
    res.status(201).json({ success: true, data: { document: doc } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/documents/:id/download
 * Stream the stored file with its original-like filename.
 */
const download = async (req, res, next) => {
  try {
    const doc = await Document.findById(parseInt(req.params.id, 10));
    await assertCanReadDocument(req, doc);

    const absPath = path.resolve(UPLOAD_ROOT, '..', doc.file_path);
    if (!fs.existsSync(absPath)) {
      throw new AppError('File is missing on disk', 410);
    }

    const ext = path.extname(absPath);
    const downloadName = `${doc.emertimi || 'document'}${ext}`.replace(
      /[^a-zA-Z0-9._-]+/g,
      '_'
    );
    res.download(absPath, downloadName);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/documents/:id
 * Update metadata only (lloji, emertimi, data_skadimit).
 * A re-upload would be a POST of a new document — we keep history append-only.
 */
const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await Document.findById(id);
    if (!existing) {
      throw new AppError('Document not found', 404);
    }

    const { lloji, emertimi, data_skadimit } = req.body;
    const patch = {};

    if (lloji !== undefined) {
      if (!Document.VALID_TYPES.includes(lloji)) {
        throw new AppError(
          `Invalid lloji. Must be one of: ${Document.VALID_TYPES.join(', ')}`,
          400
        );
      }
      patch.lloji = lloji;
    }
    if (emertimi !== undefined) patch.emertimi = emertimi;
    if (data_skadimit !== undefined) patch.data_skadimit = data_skadimit || null;

    if (Object.keys(patch).length === 0) {
      throw new AppError('No updatable fields provided', 400);
    }

    await Document.update(id, patch);
    const fresh = await Document.findById(id);
    res.json({ success: true, data: { document: fresh } });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/documents/:id
 * Remove the document row and its backing file.
 */
const remove = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await Document.findById(id);
    if (!existing) {
      throw new AppError('Document not found', 404);
    }

    await Document.remove(id);
    removeFile(existing.file_path);

    res.json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  upload, // multer middleware for routes
  getAll,
  getById,
  getByEmployee,
  getMyDocuments,
  getExpiringDocuments,
  create,
  download,
  update,
  remove,
};
