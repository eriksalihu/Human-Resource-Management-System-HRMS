/**
 * @file frontend/src/components/documents/DocumentUpload.jsx
 * @description Document upload form with drag-and-drop zone, MIME-type validation, upload progress bar, employee/type selection, and optional expiry date
 * @author Dev B
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as documentApi from '../../api/documentApi';
import * as employeeApi from '../../api/employeeApi';
import { useToast } from '../common/Toast';
import useAuth from '../../hooks/useAuth';

/** Roles that may upload documents on behalf of any employee. */
const HR_ROLES = ['Admin', 'HR Manager'];

/** Document type options must match Documents.lloji ENUM. */
const TYPE_OPTIONS = [
  { value: 'contract',    label: 'Contract' },
  { value: 'id-card',     label: 'ID card' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'resume',      label: 'Resume' },
  { value: 'other',       label: 'Other' },
];

/**
 * MIME types accepted client-side. Kept in lock-step with the backend's
 * hardened whitelist (commit 261 — security): pdf / doc / docx / jpg /
 * png only. Validating here too means we reject early with a friendly
 * message instead of round-tripping for a 400.
 */
const ACCEPTED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);

/**
 * Extension fallback for browsers / OSes that don't surface a MIME type
 * for the dropped file. Mirrors the backend's extension whitelist.
 */
const ACCEPTED_EXT = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.jpg',
  '.jpeg',
  '.png',
]);

/** Human label for the allowed set — single source for help text + errors. */
const ALLOWED_LABEL = 'PDF, DOC(X), JPG, PNG';

/** Max file size — 5 MB, matching the hardened multer limit on the backend. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Largest filename base we let the user rename to (matches server slug cap). */
const MAX_RENAME_LEN = 40;

/** ISO YYYY-MM-DD for today (server-local). */
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Format a byte count as KB / MB. */
const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

/**
 * Validate a single File against accepted MIME types / extensions / size.
 * Returns null when valid, or a human-readable error string.
 */
const validateFile = (file) => {
  if (!file) return 'No file provided';

  if (file.size > MAX_FILE_BYTES) {
    return `File is too large (${formatBytes(file.size)} — max 5 MB)`;
  }

  // Require BOTH a known extension AND (when present) a matching MIME —
  // mirrors the backend's defense against Content-Type spoofing.
  const lower = file.name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot > -1 ? lower.slice(dot) : '';

  if (!ACCEPTED_EXT.has(ext)) {
    return `Unsupported file type. Allowed: ${ALLOWED_LABEL}.`;
  }
  if (file.type && !ACCEPTED_MIME.has(file.type)) {
    return `File content (${file.type}) doesn't match its ${ext} extension.`;
  }
  return null;
};

/**
 * DocumentUpload — drag-and-drop file upload form.
 *
 * Layout:
 *   1. Drop zone (or click to pick)
 *   2. Selected file preview with remove button
 *   3. Employee picker (HR/Admin only — defaults to self otherwise)
 *   4. Document type dropdown + display name + optional expiry date
 *   5. Upload progress bar (shown during upload)
 *
 * @param {Object} props
 * @param {number} [props.defaultEmployeeId] - Pre-select an employee
 * @param {Function} [props.onUploaded] - Called with the created document
 * @param {Function} [props.onCancel]
 * @returns {JSX.Element}
 */
const DocumentUpload = ({
  defaultEmployeeId = '',
  onUploaded,
  onCancel,
}) => {
  const { user } = useAuth() || {};
  const isHR = (user?.roles || []).some((r) => HR_ROLES.includes(r));

  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  /** Object URL for the image preview (null for non-images / no file). */
  const [previewUrl, setPreviewUrl] = useState(null);
  /** Editable on-disk filename base (no extension). */
  const [renameBase, setRenameBase] = useState('');

  const [form, setForm] = useState({
    employee_id: defaultEmployeeId || '',
    lloji: 'contract',
    emertimi: '',
    data_skadimit: '',
  });
  const [errors, setErrors] = useState({});

  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0); // protects against drag enter/leave on children
  const { addToast } = useToast();

  /**
   * Load active employees once for the picker. Skipped for non-HR users —
   * they upload only against their own employee row, which we resolve via
   * `useAuth` when the form opens.
   */
  useEffect(() => {
    if (!isHR) {
      // Try to resolve the caller's own employee row from the user object.
      // The auth payload may include it; if not, the form keeps `employee_id`
      // blank and the backend rejects the upload — which is the right
      // outcome for a misconfigured account.
      if (user?.employee?.id) {
        setForm((prev) => ({
          ...prev,
          employee_id: prev.employee_id || user.employee.id,
        }));
      }
      setLoadingEmployees(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingEmployees(true);
      try {
        const result = await employeeApi.getAll({
          limit: 100,
          statusi: 'active',
        });
        if (!cancelled) setEmployees(result.data || []);
      } catch {
        if (!cancelled) setEmployees([]);
      } finally {
        if (!cancelled) setLoadingEmployees(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isHR, user]);

  /** Auto-fill display name from the file name when the user hasn't typed one. */
  useEffect(() => {
    if (!file || form.emertimi.trim()) return;
    const base = file.name.replace(/\.[^/.]+$/, '');
    setForm((prev) => ({ ...prev, emertimi: base }));
    // Intentionally don't depend on form.emertimi — we only auto-fill once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  /**
   * Manage the image preview object URL. Created when an image file is
   * picked, revoked when it changes or the component unmounts (object
   * URLs leak memory until revoked).
   */
  useEffect(() => {
    if (!file || !file.type?.startsWith('image/')) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /** Seed the rename field from the picked file's base name. */
  useEffect(() => {
    if (!file) {
      setRenameBase('');
      return;
    }
    setRenameBase(file.name.replace(/\.[^/.]+$/, '').slice(0, MAX_RENAME_LEN));
  }, [file]);

  /** Generic field change handler. */
  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const { [field]: _omit, ...rest } = prev;
        return rest;
      });
    }
  };

  /**
   * Accept a File object — runs validation and updates state. Used by
   * both the file-picker `<input>` and the drop zone.
   */
  const acceptFile = useCallback((picked) => {
    if (!picked) return;
    const error = validateFile(picked);
    if (error) {
      setFile(null);
      setFileError(error);
      return;
    }
    setFile(picked);
    setFileError(null);
  }, []);

  /** Handler for the hidden file input. */
  const handleFileInput = (e) => {
    const picked = e.target.files?.[0];
    acceptFile(picked);
    // Reset input so re-picking the same file fires `change` again.
    e.target.value = '';
  };

  /**
   * Drag-and-drop handlers. We use a counter to avoid the drag-leave event
   * flickering when the cursor moves over a nested child element.
   */
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setDragActive(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragActive(false);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    acceptFile(dropped);
  };

  /** Clear the picked file. */
  const clearFile = () => {
    setFile(null);
    setFileError(null);
    setProgress(0);
  };

  /** Validate the metadata + file before submitting. */
  const validate = () => {
    const next = {};

    if (!file) {
      next.file = 'Pick or drop a file to upload';
    }
    if (!form.employee_id) {
      next.employee_id = 'Employee is required';
    }
    if (!TYPE_OPTIONS.map((o) => o.value).includes(form.lloji)) {
      next.lloji = 'Invalid document type';
    }
    if (!form.emertimi?.trim()) {
      next.emertimi = 'Display name is required';
    } else if (form.emertimi.length > 200) {
      next.emertimi = 'Display name must be at most 200 characters';
    }
    if (form.data_skadimit) {
      const d = new Date(form.data_skadimit);
      if (Number.isNaN(d.getTime())) {
        next.data_skadimit = 'Invalid expiry date';
      }
    }

    return next;
  };

  /** Submit handler — POSTs the multipart form via the api helper. */
  const handleSubmit = async (event) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setUploading(true);
    setProgress(0);
    try {
      // Apply the user's rename: rebuild the File so `originalname` on
      // the server reflects the chosen base (extension is preserved —
      // the backend whitelist keys off it). Skip the rebuild when the
      // name is unchanged so we don't needlessly clone the blob.
      const ext = file.name.slice(file.name.lastIndexOf('.'));
      const safeBase =
        renameBase
          .trim()
          .replace(/[^a-z0-9_-]+/gi, '_')
          .replace(/^\.+/, '')
          .slice(0, MAX_RENAME_LEN) || 'file';
      const originalBase = file.name.replace(/\.[^/.]+$/, '');
      const uploadFile =
        safeBase === originalBase
          ? file
          : new File([file], `${safeBase}${ext}`, { type: file.type });

      const created = await documentApi.upload({
        file: uploadFile,
        employee_id: Number(form.employee_id),
        lloji: form.lloji,
        emertimi: form.emertimi.trim(),
        data_skadimit: form.data_skadimit || undefined,
        onUploadProgress: (ratio) => setProgress(Math.round(ratio * 100)),
      });
      addToast(`Uploaded "${form.emertimi.trim()}"`, 'success');
      onUploaded?.(created);
    } catch (err) {
      const msg =
        err.response?.data?.message || err.message || 'Failed to upload document';
      addToast(msg, 'error');
    } finally {
      setUploading(false);
    }
  };

  const employeeOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: `${e.first_name} ${e.last_name}${
          e.numri_punonjesit ? ` (${e.numri_punonjesit})` : ''
        }`,
      })),
    [employees]
  );

  /** Drop zone tint depends on drag state and validation error. */
  const dropZoneClass = `flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer ${
    dragActive
      ? 'border-indigo-500 bg-indigo-50'
      : fileError
        ? 'border-red-300 bg-red-50'
        : file
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
  }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={dropZoneClass}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        aria-label="File drop zone"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          onChange={handleFileInput}
          className="hidden"
        />

        {file ? (
          <div className="flex flex-col items-center gap-1">
            {previewUrl ? (
              /* Image preview thumbnail */
              <img
                src={previewUrl}
                alt={`Preview of ${file.name}`}
                className="max-h-32 max-w-[12rem] rounded-md object-contain ring-1 ring-gray-200 bg-white"
              />
            ) : file.type === 'application/pdf' ? (
              /* PDF badge */
              <div className="flex h-16 w-16 items-center justify-center rounded-md bg-red-50 ring-1 ring-red-200">
                <span className="text-xs font-bold text-red-600">PDF</span>
              </div>
            ) : (
              /* Generic doc check icon */
              <svg
                className="h-10 w-10 text-emerald-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            )}
            <p className="mt-1 text-sm font-medium text-gray-900">
              {file.name}
            </p>
            <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
              className="mt-2 text-xs font-medium text-red-600 hover:text-red-800"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <svg
              className="h-10 w-10 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm font-medium text-gray-900">
              {dragActive ? 'Drop the file here' : 'Drag and drop a file'}
            </p>
            <p className="text-xs text-gray-500">
              or click to pick · {ALLOWED_LABEL} · max 5 MB
            </p>
          </div>
        )}
      </div>
      {(fileError || errors.file) && (
        <p className="text-xs text-red-600">{fileError || errors.file}</p>
      )}

      {/* Rename the stored file (distinct from the human-facing display
          name below — this controls the on-disk filename the server
          keeps). Only shown once a valid file is picked. */}
      {file && (
        <div>
          <label
            htmlFor="upload-rename"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            File name{' '}
            <span className="text-gray-400 text-xs">(optional rename)</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              id="upload-rename"
              value={renameBase}
              onChange={(e) => setRenameBase(e.target.value)}
              maxLength={MAX_RENAME_LEN}
              placeholder="filename"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            />
            <span className="text-sm text-gray-500 font-mono shrink-0">
              {file.name.slice(file.name.lastIndexOf('.'))}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Letters, numbers, dashes and underscores only · the extension
            is kept as-is.
          </p>
        </div>
      )}

      {/* Metadata fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="upload-employee"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Employee <span className="text-red-500">*</span>
          </label>
          {isHR ? (
            <select
              id="upload-employee"
              value={form.employee_id}
              onChange={handleChange('employee_id')}
              disabled={loadingEmployees}
              className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
                errors.employee_id
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300'
              } disabled:opacity-50`}
            >
              <option value="">
                {loadingEmployees ? 'Loading…' : 'Select an employee…'}
              </option>
              {employeeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-800">
              {user?.first_name} {user?.last_name}
            </div>
          )}
          {errors.employee_id && (
            <p className="mt-1 text-xs text-red-600">{errors.employee_id}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="upload-type"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Type <span className="text-red-500">*</span>
          </label>
          <select
            id="upload-type"
            value={form.lloji}
            onChange={handleChange('lloji')}
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.lloji
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.lloji && (
            <p className="mt-1 text-xs text-red-600">{errors.lloji}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="upload-name"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Display name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="upload-name"
            value={form.emertimi}
            onChange={handleChange('emertimi')}
            placeholder="e.g. Employment contract 2026"
            maxLength={200}
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.emertimi
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          />
          {errors.emertimi && (
            <p className="mt-1 text-xs text-red-600">{errors.emertimi}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="upload-expiry"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Expiry date <span className="text-gray-400 text-xs">(optional)</span>
          </label>
          <input
            type="date"
            id="upload-expiry"
            value={form.data_skadimit}
            onChange={handleChange('data_skadimit')}
            min={todayIso()}
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.data_skadimit
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          />
          {errors.data_skadimit && (
            <p className="mt-1 text-xs text-red-600">{errors.data_skadimit}</p>
          )}
        </div>
      </div>

      {/* Progress bar (only during upload) */}
      {uploading && (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>Uploading…</span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-2 bg-indigo-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={uploading}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={uploading || !file}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {uploading ? `Uploading ${progress}%…` : 'Upload document'}
        </button>
      </div>
    </form>
  );
};

export default DocumentUpload;
