/**
 * @file frontend/src/components/departments/DepartmentList.jsx
 * @description Department listing page with search, pagination, and CRUD actions
 * @author Dev B
 */

import { useState, useEffect, useCallback } from 'react';
import * as departmentApi from '../../api/departmentApi';
import DataTable from '../common/DataTable';
import Pagination from '../common/Pagination';
import SearchBar from '../common/SearchBar';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../common/Toast';

/**
 * Table column definitions for the department data table.
 */
const columns = [
  { key: 'emertimi', label: 'Name', sortable: true },
  { key: 'lokacioni', label: 'Location', sortable: true },
  {
    key: 'buxheti',
    label: 'Budget',
    sortable: true,
    render: (value) =>
      value != null
        ? `€${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        : '—',
  },
  { key: 'menaxheri_emri', label: 'Manager', sortable: false },
];

/**
 * DepartmentList — full-page department listing with search, sort, pagination,
 * and inline add / edit / delete actions.
 *
 * @param {Object} props
 * @param {Function} [props.onAdd] - Callback to open the create form
 * @param {Function} [props.onEdit] - Callback to open the edit form with a department
 * @returns {JSX.Element}
 */
const DepartmentList = ({ onAdd, onEdit }) => {
  const [departments, setDepartments] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('emertimi');
  const [sortOrder, setSortOrder] = useState('ASC');

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { addToast } = useToast();

  /**
   * Fetch departments from the API.
   */
  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await departmentApi.getAll({
        page,
        limit,
        search,
        sortBy,
        sortOrder,
      });
      setDepartments(result.data);
      setPagination(result.pagination);
    } catch (err) {
      addToast('Failed to load departments', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, sortBy, sortOrder, addToast]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  /**
   * Handle column sort click.
   */
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(column);
      setSortOrder('ASC');
    }
    setPage(1);
  };

  /**
   * Handle search — reset to first page.
   */
  const handleSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  /**
   * Confirm and execute department deletion.
   */
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await departmentApi.remove(deleteTarget.id);
      addToast(`Department "${deleteTarget.emertimi}" deleted`, 'success');
      setDeleteTarget(null);
      fetchDepartments();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete department';
      addToast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Render action buttons for each row.
   */
  const renderActions = (department) => (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onEdit?.(department)}
        className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
      >
        Edit
      </button>
      <button
        onClick={() => setDeleteTarget(department)}
        className="text-red-600 hover:text-red-900 text-sm font-medium"
      >
        Delete
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage organisational departments
          </p>
        </div>
        <button
          onClick={() => onAdd?.()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Department
        </button>
      </div>

      {/* Search */}
      <SearchBar
        onSearch={handleSearch}
        placeholder="Search departments…"
        className="max-w-sm"
      />

      {/* Data table */}
      <DataTable
        columns={columns}
        data={departments}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        renderActions={renderActions}
        emptyMessage="No departments found"
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
        title="Delete Department"
        message={`Are you sure you want to delete "${deleteTarget?.emertimi}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default DepartmentList;
