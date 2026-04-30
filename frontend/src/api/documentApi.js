/**
 * @file frontend/src/api/documentApi.js
 * @description Document API service — multipart file upload, blob download, listing, expiry alerts, and metadata CRUD
 * @author Dev B
 *
 * The upload endpoint expects multipart/form-data with the file under the
 * field name `file`, plus the metadata fields as plain form parts. The
 * download endpoint streams the stored file with a `Content-Disposition`
 * header — we expose it both as a Blob (for in-app preview) and as a
 * browser-driven download via a temporary anchor.
 */

import axiosInstance from './axiosInstance';

/**
 * Strip empty / null / undefined values from a params object so the backend
 * never sees `?lloji=` or similar noise from cleared filter inputs.
 *
 * @param {Object} params
 * @returns {Object}
 */
const cleanParams = (params = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  );

/* ──────────────────────────────────────────────────────────────────── */
/* Listing                                                               */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Fetch a paginated list of documents with filters (HR / Admin / Manager).
 *
 * @param {Object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=10]
 * @param {number} [params.employee_id]
 * @param {string} [params.lloji] - contract|id-card|certificate|resume|other
 * @param {string} [params.search] - LIKE over emertimi
 * @param {string} [params.sortBy]
 * @param {string} [params.sortOrder]
 * @returns {Promise<{ data: Object[], pagination: Object }>}
 */
export const getAll = async (params = {}) => {
  const { data } = await axiosInstance.get('/documents', {
    params: cleanParams(params),
  });
  return { data: data.data, pagination: data.pagination };
};

/**
 * Fetch a single document's metadata by ID.
 *
 * @param {number} id
 * @returns {Promise<Object>}
 */
export const getById = async (id) => {
  const { data } = await axiosInstance.get(`/documents/${id}`);
  return data.data.document || data.data;
};

/**
 * Fetch the authenticated employee's own documents.
 *
 * @returns {Promise<{ employee_id: number, documents: Object[] }>}
 */
export const getMyDocuments = async () => {
  const { data } = await axiosInstance.get('/documents/me');
  return data.data;
};

/**
 * Fetch documents for a specific employee. Owners can access their own;
 * HR / Admin can access any.
 *
 * @param {number} employeeId
 * @param {Object} [params]
 * @param {string} [params.lloji]
 * @returns {Promise<Object[]>}
 */
export const getByEmployee = async (employeeId, params = {}) => {
  const { data } = await axiosInstance.get(
    `/documents/employee/${employeeId}`,
    { params: cleanParams(params) }
  );
  return data.data.documents || data.data;
};

/**
 * Fetch documents whose expiration date falls within `days` days (or has
 * already passed). HR / Admin only.
 *
 * @param {Object} [params]
 * @param {number} [params.days=30]
 * @returns {Promise<{ days: number, count: number, documents: Object[] }>}
 */
export const getExpiringDocuments = async (params = {}) => {
  const { data } = await axiosInstance.get('/documents/expiring', {
    params: cleanParams(params),
  });
  return data.data;
};

/* ──────────────────────────────────────────────────────────────────── */
/* Upload + download                                                     */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Upload a new document. The file is sent as multipart/form-data with the
 * field name `file`; metadata travels as plain form parts.
 *
 * @param {Object} payload
 * @param {File}   payload.file - File object from an `<input type="file">`
 * @param {number} payload.employee_id
 * @param {string} payload.lloji - One of contract|id-card|certificate|resume|other
 * @param {string} payload.emertimi - Display name
 * @param {string} [payload.data_skadimit] - Optional expiry YYYY-MM-DD
 * @param {Function} [payload.onUploadProgress] - Progress callback receiving
 *                                                 a number between 0 and 1
 * @returns {Promise<Object>} Created document
 */
export const upload = async ({
  file,
  employee_id,
  lloji,
  emertimi,
  data_skadimit,
  onUploadProgress,
}) => {
  if (!file) {
    throw new Error('upload(): `file` is required');
  }

  const form = new FormData();
  form.append('file', file);
  form.append('employee_id', String(employee_id));
  form.append('lloji', lloji);
  form.append('emertimi', emertimi);
  if (data_skadimit) {
    form.append('data_skadimit', data_skadimit);
  }

  const { data } = await axiosInstance.post('/documents', form, {
    headers: {
      // Let axios pick the boundary automatically by leaving Content-Type
      // unset on the FormData side — but explicitly enable multipart in
      // case a wrapper interceptor sets a default JSON header.
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (event) => {
      if (typeof onUploadProgress !== 'function' || !event.total) return;
      onUploadProgress(event.loaded / event.total);
    },
  });

  return data.data.document || data.data;
};

/**
 * Download a document as a Blob. Useful when you want to preview the file
 * inline (e.g. into an `<iframe>` via URL.createObjectURL) without
 * triggering a browser save dialog.
 *
 * @param {number} id
 * @returns {Promise<{ blob: Blob, filename: string|null, contentType: string }>}
 */
export const downloadAsBlob = async (id) => {
  const response = await axiosInstance.get(`/documents/${id}/download`, {
    responseType: 'blob',
  });

  // Extract filename from Content-Disposition when present.
  let filename = null;
  const cd = response.headers['content-disposition'] || '';
  const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
  if (match && match[1]) {
    filename = decodeURIComponent(match[1]);
  }

  return {
    blob: response.data,
    filename,
    contentType: response.headers['content-type'] || 'application/octet-stream',
  };
};

/**
 * Trigger a browser download of the document. Returns the resolved
 * filename so callers can announce completion.
 *
 * Uses the Blob path under the hood so we get the auth headers, then
 * synthesizes an `<a download>` click to launch the save dialog.
 *
 * @param {number} id
 * @param {string} [suggestedName] - Override the server's filename
 * @returns {Promise<string>} The filename used for the download
 */
export const download = async (id, suggestedName) => {
  const { blob, filename } = await downloadAsBlob(id);
  const finalName = suggestedName || filename || `document-${id}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return finalName;
};

/* ──────────────────────────────────────────────────────────────────── */
/* Metadata CRUD                                                         */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Update document metadata (lloji, emertimi, data_skadimit). The file
 * itself is immutable — re-uploading is a separate POST so history stays
 * append-only.
 *
 * @param {number} id
 * @param {Object} payload
 * @param {string} [payload.lloji]
 * @param {string} [payload.emertimi]
 * @param {string} [payload.data_skadimit]
 * @returns {Promise<Object>} Updated document
 */
export const update = async (id, payload) => {
  const { data } = await axiosInstance.put(`/documents/${id}`, payload);
  return data.data.document || data.data;
};

/**
 * Hard-delete a document (HR / Admin only). The backing file on disk is
 * removed by the server.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export const remove = async (id) => {
  await axiosInstance.delete(`/documents/${id}`);
};

export default {
  // Listing
  getAll,
  getById,
  getMyDocuments,
  getByEmployee,
  getExpiringDocuments,
  // Upload + download
  upload,
  download,
  downloadAsBlob,
  // Metadata CRUD
  update,
  remove,
};
