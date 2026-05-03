/**
 * @file frontend/src/components/users/UserList.jsx
 * @description User management listing — search by name/email, role + active filters, role badges, last-activity column, and admin action buttons
 * @author Dev B
 *
 * Implementation note: the backend `GET /api/users` endpoint returns rows
 * without role data. We do a per-row `GET /api/users/:id` follow-up in
 * parallel to populate role badges; results are cached by user id so page
 * re-renders don't re-fire the requests.
 *
 * Same direct-axios pattern used elsewhere when a dedicated frontend api
 * file isn't yet on the roadmap — keeps the component self-contained and
 * easy to swap to a `userApi.js` wrapper in a later cleanup commit.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axiosInstance from '../../api/axiosInstance';
import DataTable from '../common/DataTable';
import Pagination from '../common/Pagination';
import FilterDropdown from '../common/FilterDropdown';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../common/Toast';

/** Active-status filter options. */
const ACTIVE_OPTIONS = [
  { value: 'true',  label: 'Active' },
  { value: 'false', label: 'Inactive' },
];

/** Tailwind classes per role for the role badges. Falls back to neutral. */
const ROLE_BADGE_CLASS = {
  Admin:                'bg-purple-50 text-purple-700 ring-purple-600/20',
  'HR Manager':         'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  'Department Manager': 'bg-sky-50 text-sky-700 ring-sky-600/20',
  Employee:             'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
};
const DEFAULT_ROLE_BADGE = 'bg-gray-50 text-gray-700 ring-gray-200';

/** Format an ISO-like date as DD/MM/YYYY. */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/** Lightweight relative-time formatter ("3 days ago"). */
const formatRelative = (timestamp) => {
  if (!timestamp) return '—';
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return '—';
  const diffMin = Math.round((Date.now() - t) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(timestamp);
};

/**
 * UserList — paginated admin user listing with role + active filters and
 * search by name / email. Action callbacks are caller-driven so the same
 * component can power the Admin "Users" page (with full CRUD) and a
 * read-only employee directory.
 *
 * @param {Object} props
 * @param {Function} [props.onAdd]
 * @param {Function} [props.onEdit]
 * @param {Function} [props.onView]
 * @param {Function} [props.onDelete] - Custom delete handler (defaults to API)
 * @param {Object}   [props.defaultFilters]
 * @param {boolean}  [props.showAddButton=true]
 * @returns {JSX.Element}
 */
const UserList = ({
  onAdd,
  onEdit,
  onView,
  onDelete,
  defaultFilters = {},
  showAddButton = true,
}) => {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingRoles, setLoadingRoles] = useState(false);

  const [search, setSearch] = useState(defaultFilters.search || '');
  const [activeFilter, setActiveFilter] = useState(
    defaultFilters.is_active != null ? String(defaultFilters.is_active) : ''
  );
  const [roleFilter, setRoleFilter] = useState(defaultFilters.role || '');

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  /** Cache of role lists by user id so re-renders don't re-fetch. */
  const rolesByUserIdRef = useRef(new Map());
  const [rolesByUserIdVersion, setRolesByUserIdVersion] = useState(0);

  /** Set of distinct roles seen across all loaded users — drives the filter. */
  const [knownRoles, setKnownRoles] = useState([]);

  const { addToast } = useToast();

  /** Fetch the user page from the server. Search is server-side via ?search=. */
  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axiosInstance.get('/users', {
        params: {
          page,
          limit,
          search: search || undefined,
          sortBy,
          sortOrder,
        },
      });
      setRows(data.data || []);
      setPagination(data.pagination || {});
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load users',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, sortBy, sortOrder, addToast]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  /**
   * After each page load, populate the role cache for any users we don't
   * already know about. Fires N parallel `GET /users/:id` requests; tiny
   * page sizes mean this is cheap, and `Promise.allSettled` means any
   * failed lookup just leaves that row's role badge as a "—" fallback.
   */
  useEffect(() => {
    const cache = rolesByUserIdRef.current;
    const missing = rows.filter((u) => !cache.has(u.id));
    if (missing.length === 0) return;

    let cancelled = false;
    setLoadingRoles(true);

    (async () => {
      const results = await Promise.allSettled(
        missing.map((u) =>
          axiosInstance.get(`/users/${u.id}`).then((r) => ({
            id: u.id,
            roles: r.data?.data?.user?.roles || [],
          }))
        )
      );

      if (cancelled) return;

      for (const r of results) {
        if (r.status === 'fulfilled') {
          cache.set(r.value.id, r.value.roles);
        }
      }
      setRolesByUserIdVersion((v) => v + 1);
      setLoadingRoles(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [rows]);

  /** Refresh the distinct-roles set whenever the cache grows. */
  useEffect(() => {
    const all = new Set();
    for (const roles of rolesByUserIdRef.current.values()) {
      for (const r of roles) all.add(r);
    }
    setKnownRoles([...all].sort());
  }, [rolesByUserIdVersion]);

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

  /** Reset to page 1 on any filter change. */
  const bumpPage = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch(defaultFilters.search || '');
    setActiveFilter(
      defaultFilters.is_active != null ? String(defaultFilters.is_active) : ''
    );
    setRoleFilter(defaultFilters.role || '');
    setPage(1);
  };

  /** Confirm and execute deletion (soft-delete on the server). */
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (onDelete) {
        await onDelete(deleteTarget);
      } else {
        await axiosInstance.delete(`/users/${deleteTarget.id}`);
      }
      addToast(
        `Deactivated ${deleteTarget.first_name} ${deleteTarget.last_name}`,
        'success'
      );
      setDeleteTarget(null);
      // Drop their cached roles since the row is now stale.
      rolesByUserIdRef.current.delete(deleteTarget.id);
      fetchRows();
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to deactivate user';
      addToast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Apply the active + role filters client-side. Server only supports
   * search + sort, so the rest is filtered after the fetch.
   */
  const filteredRows = useMemo(() => {
    return rows.filter((u) => {
      if (activeFilter !== '') {
        const wantActive = activeFilter === 'true';
        if (Boolean(u.is_active) !== wantActive) return false;
      }
      if (roleFilter) {
        const userRoles = rolesByUserIdRef.current.get(u.id) || [];
        if (!userRoles.includes(roleFilter)) return false;
      }
      return true;
    });
    // Re-evaluate when the role cache changes via the version counter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activeFilter, roleFilter, rolesByUserIdVersion]);

  /** Column definitions. */
  const columns = useMemo(
    () => [
      {
        key: 'user',
        label: 'Name',
        sortable: false,
        render: (_v, row) => (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold shrink-0 overflow-hidden">
              {row.profile_image ? (
                <img
                  src={row.profile_image}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <>
                  {(row.first_name?.[0] || '')}
                  {(row.last_name?.[0] || '')}
                </>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {row.first_name} {row.last_name}
              </p>
              <p className="text-xs text-gray-500 truncate">{row.email}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'roles',
        label: 'Roles',
        sortable: false,
        render: (_v, row) => {
          const roles = rolesByUserIdRef.current.get(row.id);
          if (!roles) {
            return (
              <span className="text-xs text-gray-400">
                {loadingRoles ? '…' : '—'}
              </span>
            );
          }
          if (roles.length === 0) {
            return <span className="text-xs text-gray-400">No roles</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {roles.map((r) => (
                <span
                  key={r}
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                    ROLE_BADGE_CLASS[r] || DEFAULT_ROLE_BADGE
                  }`}
                >
                  {r}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        key: 'phone',
        label: 'Phone',
        sortable: false,
        render: (value) =>
          value ? (
            <span className="text-sm text-gray-700 font-mono">{value}</span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          ),
      },
      {
        key: 'is_active',
        label: 'Status',
        sortable: true,
        render: (value) =>
          value ? (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">
              <span className="mr-1 h-1.5 w-1.5 rounded-full bg-gray-400 inline-block" />
              Inactive
            </span>
          ),
      },
      {
        key: 'last_activity',
        label: 'Last activity',
        sortable: false,
        render: (_v, row) => {
          // The Users table has no last_login column yet — surface
          // updated_at as a best-effort proxy ("their account was touched
          // ~N hours ago"). Future commit can swap to a real last_login
          // column without changing the column header.
          const ts = row.updated_at || row.created_at;
          return (
            <span className="text-sm text-gray-600" title={formatDate(ts)}>
              {formatRelative(ts)}
            </span>
          );
        },
      },
      {
        key: 'actions',
        label: 'Actions',
        sortable: false,
        render: (_v, row) => (
          <div className="flex items-center gap-3">
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
            {row.is_active && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(row);
                }}
                className="text-red-600 hover:text-red-900 text-sm font-medium"
              >
                Deactivate
              </button>
            )}
          </div>
        ),
      },
    ],
    [loadingRoles, onView, onEdit]
  );

  const roleOptions = useMemo(
    () => knownRoles.map((r) => ({ value: r, label: r })),
    [knownRoles]
  );

  const hasActiveFilters = Boolean(search || activeFilter || roleFilter);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Users</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage system accounts, role assignments, and access status
          </p>
        </div>
        {showAddButton && onAdd && (
          <button
            onClick={() => onAdd()}
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            New user
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
            placeholder="Name or email"
            className="block w-full rounded-md border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
        <FilterDropdown
          label="Status"
          options={ACTIVE_OPTIONS}
          value={activeFilter}
          onChange={bumpPage(setActiveFilter)}
          allLabel="Any status"
        />
        <FilterDropdown
          label="Role"
          options={roleOptions}
          value={roleFilter}
          onChange={bumpPage(setRoleFilter)}
          allLabel={
            knownRoles.length === 0 ? 'Loading roles…' : 'Any role'
          }
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
        data={filteredRows}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onRowClick={onView ? (row) => onView(row) : undefined}
        emptyMessage={
          rows.length > 0 && filteredRows.length === 0
            ? 'No users match the current filters'
            : 'No users found'
        }
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

      {/* Deactivate confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Deactivate user"
        message={`Deactivate ${deleteTarget?.first_name} ${
          deleteTarget?.last_name
        }? They'll lose access immediately. This is reversible by re-activating from the user's edit form.`}
        confirmLabel="Deactivate"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default UserList;
