/**
 * @file frontend/src/pages/DocumentsPage.jsx
 * @description Documents page orchestrating list, upload modal, viewer modal, edit modal, and HR-only expiring-documents warning panel
 * @author Dev B
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as documentApi from '../api/documentApi';
import DocumentList from '../components/documents/DocumentList';
import DocumentUpload from '../components/documents/DocumentUpload';
import DocumentViewer from '../components/documents/DocumentViewer';
import Modal from '../components/common/Modal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useToast } from '../components/common/Toast';
import useAuth from '../hooks/useAuth';

/** Roles that may upload / edit / delete documents and see the expiry panel. */
const HR_ROLES = ['Admin', 'HR Manager'];

/** Roles that can view all-employee document lists. */
const MANAGER_ROLES = ['Admin', 'HR Manager', 'Department Manager'];

/** Lookahead window (days) for the expiring-documents warning panel. */
const EXPIRY_WINDOW_DAYS = 30;

/** Tailwind classes per document type for the type pill on the warning list. */
const TYPE_BADGE_CLASS = {
  contract: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  'id-card': 'bg-sky-50 text-sky-700 ring-sky-600/20',
  certificate: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  resume: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  other: 'bg-gray-50 text-gray-700 ring-gray-600/20',
};

/** Format a date as DD/MM/YYYY. */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/** Days remaining (positive) or overdue (negative) for a YYYY-MM-DD date. */
const daysUntil = (yyyyMmDd) => {
  if (!yyyyMmDd) return null;
  const target = new Date(yyyyMmDd);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
};

/**
 * DocumentsPage — full document module orchestrator.
 *
 *   - HR-only "Expiring soon" warning panel at the top
 *   - Filterable list (DocumentList)
 *   - Upload modal (drag-and-drop)
 *   - Viewer modal (inline preview)
 *   - Edit modal for metadata-only updates
 *
 * @returns {JSX.Element}
 */
const DocumentsPage = () => {
  const { user } = useAuth() || {};
  const isHR = (user?.roles || []).some((r) => HR_ROLES.includes(r));
  const isManager = (user?.roles || []).some((r) => MANAGER_ROLES.includes(r));

  // Modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  // Force-refresh key so the list reloads after every mutation
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshList = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Expiring panel state
  const [expiring, setExpiring] = useState([]);
  const [loadingExpiring, setLoadingExpiring] = useState(false);
  const [expiringDismissed, setExpiringDismissed] = useState(false);

  const { addToast } = useToast();

  /**
   * Load the HR-only expiring-soon panel. Re-fetches whenever the list
   * refresh key changes so a delete/upload from the list reflects in the
   * panel as well.
   */
  useEffect(() => {
    if (!isHR) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoadingExpiring(true);
      try {
        const result = await documentApi.getExpiringDocuments({
          days: EXPIRY_WINDOW_DAYS,
        });
        if (!cancelled) {
          setExpiring(result?.documents || []);
        }
      } catch (err) {
        if (!cancelled) {
          // Soft failure — panel hides itself if loading fails.
          console.error(
            '[DocumentsPage] Failed to load expiring documents:',
            err.message
          );
          setExpiring([]);
        }
      } finally {
        if (!cancelled) setLoadingExpiring(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isHR, refreshKey]);

  /** Open the upload modal. */
  const handleOpenUpload = () => setUploadOpen(true);

  /** Close the upload modal. */
  const handleCloseUpload = () => setUploadOpen(false);

  /** Upload completed — refresh and close. */
  const handleUploaded = () => {
    setUploadOpen(false);
    refreshList();
  };

  /** Open the viewer for a document row. */
  const handleView = (row) => setViewerDoc(row);

  /** Close the viewer. */
  const handleCloseViewer = () => setViewerDoc(null);

  /** Open the edit modal for a document row (HR/Admin only). */
  const handleEdit = (row) => setEditTarget({ ...row });

  /** Save metadata edits. */
  const handleSaveEdit = async (event) => {
    event.preventDefault();
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await documentApi.update(editTarget.id, {
        emertimi: editTarget.emertimi,
        lloji: editTarget.lloji,
        data_skadimit: editTarget.data_skadimit || null,
      });
      addToast('Document updated', 'success');
      setEditTarget(null);
      refreshList();
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to update document';
      addToast(msg, 'error');
    } finally {
      setEditSaving(false);
    }
  };

  /** Top-of-panel sort: most overdue first, then soonest. */
  const sortedExpiring = useMemo(
    () =>
      [...expiring].sort((a, b) => {
        const ad = a.data_skadimit
          ? new Date(a.data_skadimit).getTime()
          : Infinity;
        const bd = b.data_skadimit
          ? new Date(b.data_skadimit).getTime()
          : Infinity;
        return ad - bd;
      }),
    [expiring]
  );

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 truncate">Documents</h1>
          <p className="text-sm text-gray-500">
            {isHR
              ? 'Upload, preview, and manage employee documents'
              : 'Browse documents shared with you'}
          </p>
        </div>
      </div>

      {/* Expiring-soon warning panel (HR / Admin only) */}
      {isHR && !expiringDismissed && sortedExpiring.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 flex-1">
              <svg
                className="h-5 w-5 text-amber-600 shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-amber-900">
                  {sortedExpiring.length} document
                  {sortedExpiring.length === 1 ? '' : 's'} expiring within{' '}
                  {EXPIRY_WINDOW_DAYS} days
                </h2>
                <p className="text-xs text-amber-800 mt-0.5">
                  Reach out to the owners and refresh these before they go
                  out of compliance.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExpiringDismissed(true)}
              className="text-xs font-medium text-amber-800 hover:text-amber-900"
            >
              Dismiss
            </button>
          </div>

          <ul className="mt-3 divide-y divide-amber-200/60 rounded-md bg-white">
            {sortedExpiring.slice(0, 6).map((d) => {
              const remaining = daysUntil(d.data_skadimit);
              const overdue = remaining != null && remaining < 0;
              return (
                <li
                  key={d.id}
                  className="px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 cursor-pointer hover:bg-white"
                  onClick={() => handleView(d)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ring-1 ring-inset ${
                        TYPE_BADGE_CLASS[d.lloji] || TYPE_BADGE_CLASS.other
                      }`}
                    >
                      {d.lloji}
                    </span>
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {d.emertimi}
                    </span>
                    <span className="text-xs text-gray-500 truncate">
                      · {d.employee_name || '—'}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      overdue ? 'text-red-700' : 'text-amber-800'
                    }`}
                  >
                    {overdue
                      ? `Expired ${formatDate(d.data_skadimit)} (${Math.abs(
                          remaining
                        )} day${Math.abs(remaining) === 1 ? '' : 's'} ago)`
                      : `Expires ${formatDate(d.data_skadimit)} (in ${remaining} day${remaining === 1 ? '' : 's'})`}
                  </span>
                </li>
              );
            })}
          </ul>

          {sortedExpiring.length > 6 && (
            <p className="mt-2 text-xs text-amber-800">
              +{sortedExpiring.length - 6} more in the list below.
            </p>
          )}
        </div>
      )}

      {isHR && loadingExpiring && expiring.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <LoadingSpinner /> Checking for expiring documents…
        </div>
      )}

      {/* Document list */}
      <DocumentList
        key={refreshKey}
        selfOnly={!isManager}
        onUpload={isHR ? handleOpenUpload : undefined}
        onEdit={isHR ? handleEdit : undefined}
        onView={handleView}
        showUploadButton={isHR}
      />

      {/* Upload modal */}
      <Modal
        isOpen={uploadOpen}
        onClose={handleCloseUpload}
        title="Upload document"
        size="lg"
      >
        <DocumentUpload
          onUploaded={handleUploaded}
          onCancel={handleCloseUpload}
        />
      </Modal>

      {/* Viewer modal */}
      <DocumentViewer
        isOpen={!!viewerDoc}
        onClose={handleCloseViewer}
        document={viewerDoc}
      />

      {/* Edit metadata modal */}
      <Modal
        isOpen={!!editTarget}
        onClose={() => !editSaving && setEditTarget(null)}
        title="Edit document"
        size="md"
      >
        {editTarget && (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <label
                htmlFor="edit-emertimi"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Display name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="edit-emertimi"
                value={editTarget.emertimi || ''}
                onChange={(e) =>
                  setEditTarget((prev) => ({ ...prev, emertimi: e.target.value }))
                }
                maxLength={200}
                required
                className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label
                htmlFor="edit-lloji"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Type
              </label>
              <select
                id="edit-lloji"
                value={editTarget.lloji || 'other'}
                onChange={(e) =>
                  setEditTarget((prev) => ({ ...prev, lloji: e.target.value }))
                }
                className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                {Object.keys(TYPE_BADGE_CLASS).map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="edit-expiry"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Expiry date{' '}
                <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <input
                type="date"
                id="edit-expiry"
                value={
                  editTarget.data_skadimit
                    ? String(editTarget.data_skadimit).slice(0, 10)
                    : ''
                }
                onChange={(e) =>
                  setEditTarget((prev) => ({
                    ...prev,
                    data_skadimit: e.target.value,
                  }))
                }
                className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Leave blank to remove the expiry date entirely.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => !editSaving && setEditTarget(null)}
                disabled={editSaving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default DocumentsPage;
