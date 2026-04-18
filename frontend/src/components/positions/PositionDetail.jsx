/**
 * @file frontend/src/components/positions/PositionDetail.jsx
 * @description Position detail view with department link, salary range, level, and description
 * @author Dev B
 */

import { useState, useEffect } from 'react';
import * as positionApi from '../../api/positionApi';
import LoadingSpinner from '../common/LoadingSpinner';

/**
 * Format a monetary value as a EUR currency string with two decimals.
 * @param {number|string|null|undefined} value
 * @returns {string}
 */
const formatCurrency = (value) =>
  value != null
    ? `€${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : '—';

/**
 * Format a date string (YYYY-MM-DD or ISO) as DD/MM/YYYY or "—" on bad input.
 * @param {string|null|undefined} value
 * @returns {string}
 */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/**
 * Render a formatted salary range string from min / max.
 * @param {number|null} min
 * @param {number|null} max
 * @returns {string}
 */
const formatSalaryRange = (min, max) => {
  if (min != null && max != null) return `${formatCurrency(min)} – ${formatCurrency(max)}`;
  if (min != null) return `from ${formatCurrency(min)}`;
  if (max != null) return `up to ${formatCurrency(max)}`;
  return '—';
};

/**
 * A simple label / value display field.
 * @param {Object} props
 * @param {string} props.label
 * @param {React.ReactNode} props.value
 */
const Field = ({ label, value }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</dt>
    <dd className="mt-1 text-sm text-gray-900">{value || '—'}</dd>
  </div>
);

/**
 * PositionDetail — read-only detail view for a single position.
 *
 * Fetches the position (with department info) and renders all fields and
 * action buttons. Edit / Delete / Close are wired back to the parent.
 *
 * @param {Object} props
 * @param {number} props.positionId
 * @param {Function} [props.onEdit]
 * @param {Function} [props.onDelete]
 * @param {Function} [props.onClose]
 * @param {Function} [props.onDepartmentClick] - Optional navigation to the department view
 * @returns {JSX.Element}
 */
const PositionDetail = ({
  positionId,
  onEdit,
  onDelete,
  onClose,
  onDepartmentClick,
}) => {
  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await positionApi.getById(positionId);
        setPosition(result);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load position');
      } finally {
        setLoading(false);
      }
    };
    if (positionId) fetchDetail();
  }, [positionId]);

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

  if (!position) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-gray-900">{position.emertimi}</h2>
            {position.niveli && (
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                {position.niveli}
              </span>
            )}
          </div>
          {position.department_emertimi && (
            <p className="text-sm text-gray-500 mt-1">
              <span className="text-gray-400">Department:</span>{' '}
              {onDepartmentClick ? (
                <button
                  type="button"
                  onClick={() => onDepartmentClick(position.department_id)}
                  className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                >
                  {position.department_emertimi}
                </button>
              ) : (
                <span className="font-medium text-gray-700">{position.department_emertimi}</span>
              )}
              {position.department_lokacioni && (
                <span className="text-gray-400"> · {position.department_lokacioni}</span>
              )}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {onEdit && (
            <button
              onClick={() => onEdit(position)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(position)}
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
      {position.pershkrimi && (
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {position.pershkrimi}
          </p>
        </div>
      )}

      {/* Info grid */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white border border-gray-200 rounded-lg p-5">
        <Field
          label="Salary range"
          value={formatSalaryRange(position.paga_min, position.paga_max)}
        />
        <Field label="Level" value={position.niveli} />
        <Field label="Department" value={position.department_emertimi} />
        <Field label="Location" value={position.department_lokacioni} />
        <Field label="Created" value={formatDate(position.created_at)} />
        <Field label="Last updated" value={formatDate(position.updated_at)} />
      </dl>
    </div>
  );
};

export default PositionDetail;
