/**
 * @file frontend/src/components/departments/DepartmentDetail.jsx
 * @description Department detail view with manager info, positions list, and actions
 * @author Dev B
 */

import { useState, useEffect } from 'react';
import * as departmentApi from '../../api/departmentApi';
import LoadingSpinner from '../common/LoadingSpinner';

/**
 * Formatted helpers.
 */
const formatCurrency = (value) =>
  value != null
    ? `€${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : '—';

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/**
 * A simple label / value display field.
 */
const Field = ({ label, value }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</dt>
    <dd className="mt-1 text-sm text-gray-900">{value || '—'}</dd>
  </div>
);

/**
 * DepartmentDetail — read-only detail view for a single department.
 *
 * Fetches the department (with positions and employee count) and renders all
 * fields alongside manager info and a list of positions. Action buttons call
 * back to the parent for edit / delete.
 *
 * @param {Object} props
 * @param {number} props.departmentId
 * @param {Function} [props.onEdit] - Edit click handler
 * @param {Function} [props.onDelete] - Delete click handler
 * @param {Function} [props.onClose] - Close/back handler
 * @returns {JSX.Element}
 */
const DepartmentDetail = ({ departmentId, onEdit, onDelete, onClose }) => {
  const [department, setDepartment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await departmentApi.getById(departmentId);
        setDepartment(result);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load department');
      } finally {
        setLoading(false);
      }
    };
    if (departmentId) fetchDetail();
  }, [departmentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!department) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{department.emertimi}</h2>
          {department.lokacioni && (
            <p className="text-sm text-gray-500 mt-1">
              <span className="inline-flex items-center gap-1">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {department.lokacioni}
              </span>
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {onEdit && (
            <button
              onClick={() => onEdit(department)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(department)}
              className="px-4 py-2 border border-red-300 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      {department.pershkrimi && (
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-700 leading-relaxed">{department.pershkrimi}</p>
        </div>
      )}

      {/* Info grid */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white border border-gray-200 rounded-lg p-5">
        <Field label="Budget" value={formatCurrency(department.buxheti)} />
        <Field label="Employee count" value={department.employee_count ?? 0} />
        <Field
          label="Manager"
          value={
            department.menaxheri_emri ? (
              <span>
                {department.menaxheri_emri}
                {department.menaxheri_email && (
                  <span className="block text-xs text-gray-500">{department.menaxheri_email}</span>
                )}
              </span>
            ) : (
              '—'
            )
          }
        />
        <Field label="Created" value={formatDate(department.created_at)} />
        <Field label="Last updated" value={formatDate(department.updated_at)} />
      </dl>

      {/* Positions list */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Positions ({department.positions?.length || 0})
        </h3>
        {department.positions && department.positions.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
            {department.positions.map((pos) => (
              <div key={pos.id} className="p-4 flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{pos.emertimi}</p>
                  {pos.pershkrimi && (
                    <p className="text-xs text-gray-500 mt-1">{pos.pershkrimi}</p>
                  )}
                </div>
                <div className="text-right">
                  {pos.paga_baze != null && (
                    <p className="text-sm text-gray-900">{formatCurrency(pos.paga_baze)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">No positions defined for this department.</p>
        )}
      </div>
    </div>
  );
};

export default DepartmentDetail;
