/**
 * @file frontend/src/components/documents/DocumentList.jsx
 * @description Document listing with employee / type filters, expiry status indicators, file-type icons, and download/edit/delete actions
 * @author Dev B
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as documentApi from '../../api/documentApi';
import * as employeeApi from '../../api/employeeApi';
import DataTable from '../common/DataTable';
import Pagination from '../common/Pagination';
import FilterDropdown from '../common/FilterDropdown';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../common/Toast';

/** Type filter options must match Documents.lloji ENUM. */
const TYPE_OPTIONS = [
  { value: 'contract',    label: 'Contract' },
  { value: 'id-card',     label: 'ID card' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'resume',      label: 'Resume' },
  { value: 'other',       label: 'Other' },
];

/** Tailwind classes per document type for the type badge. */
const TYPE_BADGE_CLASS = {
  contract: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  'id-card': 'bg-sky-50 text-sky-700 ring-sky-600/20',
  certificate: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  resume: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  other: 'bg-gray-50 text-gray-700 ring-gray-600/20',
};

/** Days-until-expiry windows that map to the four expiry tones. */
const EXPIRING_SOON_DAYS = 30;

/** Format a YYYY-MM-DD or ISO date as DD/MM/YYYY. */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/** Compute days remaining until a date — null when missing/invalid. */
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
 * Pick a small file icon (emoji) from the file_path extension. Avoids
 * pulling in an icon dependency for what's essentially a glyph mapping.
 */
const fileTypeIcon = (filePath) => {
  if (!filePath) return '📄';
  const ext = String(filePath).split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) return '📕';
  if (['doc', 'docx'].includes(ext)) return '📘';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📗';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
  if (['txt', 'md'].includes(ext)) return '📝';
  return '📄';
};

/**
 * Render a colored expiry pill for a row.
 * - No date → "—" muted
 * - Past   → red "Expired DD/MM/YYYY"
 * - <= 30  → amber "Expires in N days"
 * - else   → emerald "Expires DD/MM/YYYY"
 */
const ExpiryBadge = ({ value }) => {
  if (!value) return <span className="text-xs text-gray-400">—</span>;

  const remaining = daysUntil(value);
  const formatted = formatDate(value);

  if (remaining == null) {
    return <span className="text-xs text-gray-500">{formatted}</span>;
  }

  if (remaining < 0) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20">
        Expired {formatted}
      </span>
    );
  }
  if (remaining <= EXPIRING_SOON_DAYS) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20">
        Expires in {remaining} day{remaining === 1 ? '' : 's'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
      {formatted}
    </span>
  );
};

/**
 * DocumentList — paginated documents with employee / type / search filters,
 * download streaming, and expiry-aware row tinting. Action callbacks are
 * caller-driven so the same component serves both HR (CRUD) and employee
 * (read + download) views.
 *
 * @param {Object} props
 * @param {Function} [props.onUpload] - Open upload modal
 * @param {Function} [props.onEdit]
 * @param {Function} [props.onView]
 * @param {Function} [props.onDelete] - Custom delete handler (defaults to API)
 * @param {Object}   [props.defaultFilters]
 * @param {boolean}  [props.showUploadButton=true]
 * @param {boolean}  [props.selfOnly=false] - When true, fetches only the
 *   authenticated user's own documents via `/me` instead of the full
 *   listing endpoint (which requires manager/admin roles).
 * @returns {JSX.Element}
 */
const DocumentList = ({
  onUpload,
  onEdit,
  onView,
  onDelete,
  defaultFilters = {},
  showUploadButton = true,
  selfOnly = false,
}) => {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);

  const [employeeId, setEmployeeId] = useState(
    defaultFilters.employee_id || ''
  );
  const [lloji, setLloji] = useState(defaultFilters.lloji || '');
  const [search, setSearch] = useState('');

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('data_ngarkimit');
  const [sortOrder, setSortOrder] = useState('DESC');

  const [employees, setEmployees] = useState([]);

  const [downloadingId, setDownloadingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { addToast } = useToast();

  /** Load active employees once for the filter dropdown.
   *  Skipped in selfOnly mode — employee can only see their own docs. */
  useEffect(() => {
    if (selfOnly) return;
    let cancelled = false;
    const load = async () => {
      try {
        const result = await employeeApi.getAll({
          limit: 100,
          statusi: 'active',
        });
        if (!cancelled) setEmployees(result.data || []);
      } catch {
        if (!cancelled) setEmployees([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selfOnly]);

  /** Fetch documents with the current filter / sort / paging state.
   *
   *  In `selfOnly` mode the restricted `/documents` endpoint is replaced
   *  by `/documents/me`. Filters are applied client-side. */
  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      if (selfOnly) {
        const result = await documentApi.getMyDocuments();
        let data = result?.documents || [];
        // Client-side type filter
        if (lloji) data = data.filter((r) => r.lloji === lloji);
        // Client-side search
        if (search) {
          const q = search.toLowerCase();
          data = data.filter(
            (r) =>
              (r.titulli || '').toLowerCase().includes(q) ||
              (r.pershkrimi || '').toLowerCase().includes(q)
          );
        }
        setRows(data);
        setPagination({});
      } else {
        const result = await documentApi.getAll({
          page,
          limit,
          employee_id: employeeId || undefined,
          lloji: lloji || undefined,
          search: search || undefined,
          sortBy,
          sortOrder,
        });
        setRows(result.data);
        setPagination(result.pagination);
      }
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load documents',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [selfOnly, page, limit, employeeId, lloji, search, sortBy, sortOrder, addToast]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  /** Column sort toggle. */
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(column);
      setSortOrder('ASC');
    }
    setPage(1);
  };

  const bumpPage = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setEmployeeId(defaultFilters.employee_id || '');
    setLloji(defaultFilters.lloji || '');
    setSearch('');
    setPage(1);
  };

  /** Trigger a streamed download via the api helper. */
  const handleDownload = async (row) => {
    setDownloadingId(row.id);
    try {
      await documentApi.download(row.id);
      addToast(`Downloaded "${row.emertimi}"`, 'success');
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to download document';
      addToast(msg, 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  /** Confirm and execute deletion. */
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (onDelete) {
        await onDelete(deleteTarget);
      } else {
        await documentApi.remove(deleteTarget.id);
      }
      addToast('Document deleted', 'success');
      setDeleteTarget(null);
      fetchRows();
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to delete document';
      addToast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  /** Column definitions for the DataTable. */
  const columns = useMemo(
    () => [
      {
        key: 'emertimi',
        label: 'Document',
        sortable: true,
        render: (_v, row) => (
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">
              {fileTypeIcon(row.file_path)}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {row.emertimi}
              </p>
              {row.file_path && (
                <p className="text-xs text-gray-500 font-mono truncate">
                  {String(row.file_path).split('/').pop()}
                </p>
              )}
            </div>
          </div>
        ),
      },
      {
        key: 'employee',
        label: 'Employee',
        sortable: false,
        render: (_v, row) => (
          <div>
            <p className="text-sm text-gray-700">
              {row.employee_name || '—'}
            </p>
            {row.employee_number && (
              <p className="text-xs text-gray-500 font-mono">
                {row.employee_number}
              </p>
            )}
          </div>
        ),
      },
      {
        key: 'lloji',
        label: 'Type',
        sortable: true,
        render: (value) => {
          const cls = TYPE_BADGE_CLASS[value] || TYPE_BADGE_CLASS.other;
          return value ? (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${cls}`}
            >
              {value}
            </span>
          ) : (
            '—'
          );
        },
      },
      {
        key: 'data_ngarkimit',
        label: 'Uploaded',
        sortable: true,
        render: (value) => (
          <span className="text-sm text-gray-700">{formatDate(value)}</span>
        ),
      },
      {
        key: 'data_skadimit',
        label: 'Expiry',
        sortable: true,
        render: (value) => <ExpiryBadge value={value} />,
      },
      {
        key: 'actions',
        label: 'Actions',
        sortable: false,
        render: (_v, row) => (
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownload(row);
              }}
              disabled={downloadingId === row.id}
              className="text-emerald-600 hover:text-emerald-800 text-sm font-medium disabled:opacity-50"
            >
              {downloadingId === row.id ? '…' : 'Download'}
            </button>
            {onView && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onView(row);
                }}
                className="text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                View
              </button>
            )}
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(row);
                }}
                className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
              >
                Edit
              </button>
            )}
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(row);
                }}
                className="text-red-600 hover:text-red-900 text-sm font-medium"
              >
                Delete
              </button>
            )}
          </div>
        ),
      },
    ],
    [downloadingId, onView, onEdit]
  );

  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: `${e.first_name} ${e.last_name}${
      e.numri_punonjesit ? ` (${e.numri_punonjesit})` : ''
    }`,
  }));

  const hasActiveFilters = Boolean(employeeId || lloji || search);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Documents</h2>
          <p className="text-sm text-gray-500 mt-1">
            Contracts, ID cards, certificates, and other employee records
          </p>
        </div>
        {showUploadButton && onUpload && (
          <button
            onClick={() => onUpload()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12"
              />
            </svg>
            Upload document
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Search
          </label>
          <input
            type="search"
            value={search}
            onChange={(e) => bumpPage(setSearch)(e.target.value)}
            placeholder="Document name"
            className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
        {!selfOnly && (
          <FilterDropdown
            label="Employee"
            options={employeeOptions}
            value={employeeId}
            onChange={bumpPage(setEmployeeId)}
            allLabel="All employees"
          />
        )}
        <FilterDropdown
          label="Type"
          options={TYPE_OPTIONS}
          value={lloji}
          onChange={bumpPage(setLloji)}
          allLabel="Any type"
        />
      </div>

      {hasActiveFilters && (
        <div className="flex justify-end">
          <button
            onClick={handleClearFilters}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onRowClick={onView ? (row) => onView(row) : undefined}
        emptyMessage="No documents found"
      />

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          total={pagination.total}
          perPage={limit}
          onPageChange={setPage}
          onPerPageChange={(val) => {
            setLimit(val);
            setPage(1);
          }}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Document"
        message={`Delete "${
          deleteTarget?.emertimi || 'document'
        }"? The file will be removed from disk and this cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default DocumentList;
