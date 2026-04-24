/**
 * @file frontend/src/components/leaves/LeaveRequestForm.jsx
 * @description Leave request form with type dropdown, date range pickers, reason textarea, business-days preview, and client-side overlap warning
 * @author Dev B
 */

import { useState, useEffect, useMemo } from 'react';
import * as leaveRequestApi from '../../api/leaveRequestApi';
import * as employeeApi from '../../api/employeeApi';
import useAuth from '../../hooks/useAuth';

/** Leave type options (values must match LeaveRequests.lloji enum). */
const TYPE_OPTIONS = [
  { value: 'annual', label: 'Annual' },
  { value: 'sick', label: 'Sick' },
  { value: 'personal', label: 'Personal' },
  { value: 'maternity', label: 'Maternity' },
  { value: 'paternity', label: 'Paternity' },
  { value: 'unpaid', label: 'Unpaid' },
];

/** Roles that may file a leave request on behalf of another employee. */
const PRIVILEGED_ROLES = ['Admin', 'HR Manager'];

/** Today as YYYY-MM-DD for `min` attributes on date inputs. */
const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Calendar-days between two YYYY-MM-DD strings, inclusive. Returns 0 if
 * either date is missing or the range is inverted.
 */
const calendarDays = (start, end) => {
  if (!start || !end) return 0;
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const diff = (b - a) / (1000 * 60 * 60 * 24);
  return diff < 0 ? 0 : Math.floor(diff) + 1;
};

/**
 * Business-days (Mon–Fri) between two YYYY-MM-DD strings, inclusive.
 */
const businessDays = (start, end) => {
  if (!start || !end) return 0;
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  let count = 0;
  const cursor = new Date(a);
  while (cursor <= b) {
    const day = cursor.getDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
};

/**
 * Does [startA, endA] intersect [startB, endB] (inclusive, YYYY-MM-DD strings)?
 */
const rangesOverlap = (startA, endA, startB, endB) => {
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && startB <= endA;
};

/**
 * LeaveRequestForm — create / edit a leave request with live day-count
 * preview and client-side overlap warning against the employee's existing
 * pending / approved requests.
 *
 * @param {Object} props
 * @param {Object} [props.initialData] - If provided, form runs in edit mode
 * @param {Function} props.onSubmit - Receives the payload
 * @param {Function} props.onCancel
 * @param {boolean}  [props.submitting=false]
 * @returns {JSX.Element}
 */
const LeaveRequestForm = ({
  initialData = null,
  onSubmit,
  onCancel,
  submitting = false,
}) => {
  const { user } = useAuth() || {};
  const isEdit = Boolean(initialData?.id);
  const canActForOthers =
    (user?.roles || []).some((r) => PRIVILEGED_ROLES.includes(r));

  const [form, setForm] = useState({
    employee_id: initialData?.employee_id || '',
    lloji: initialData?.lloji || 'annual',
    data_fillimit: initialData?.data_fillimit
      ? String(initialData.data_fillimit).slice(0, 10)
      : '',
    data_perfundimit: initialData?.data_perfundimit
      ? String(initialData.data_perfundimit).slice(0, 10)
      : '',
    arsyeja: initialData?.arsyeja || '',
  });

  const [errors, setErrors] = useState({});
  const [employees, setEmployees] = useState([]);
  const [existingRequests, setExistingRequests] = useState([]);

  /**
   * Load employees for the HR/Admin employee-picker (only if privileged and
   * not in edit mode — in edit mode the employee is fixed).
   */
  useEffect(() => {
    if (!canActForOthers || isEdit) return;
    let cancelled = false;
    const load = async () => {
      try {
        const result = await employeeApi.getAll({
          limit: 200,
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
  }, [canActForOthers, isEdit]);

  /**
   * Load the caller's existing requests for overlap detection. We only care
   * about the *subject* employee — in the self-service case that's `/me`;
   * the HR-on-behalf-of case would need per-employee lookup which the
   * backend validates on submit anyway.
   */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const mine = await leaveRequestApi.getMyRequests();
        if (!cancelled) setExistingRequests(mine?.requests || []);
      } catch {
        if (!cancelled) setExistingRequests([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Controlled input change handler. */
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

  /** Day-count preview — both calendar and business days. */
  const { calendar, business } = useMemo(
    () => ({
      calendar: calendarDays(form.data_fillimit, form.data_perfundimit),
      business: businessDays(form.data_fillimit, form.data_perfundimit),
    }),
    [form.data_fillimit, form.data_perfundimit]
  );

  /**
   * Client-side overlap preview. Ignores the row currently being edited and
   * any cancelled/rejected rows. The authoritative check still happens on
   * the server, but this catches obvious mistakes before they submit.
   */
  const conflict = useMemo(() => {
    if (!form.data_fillimit || !form.data_perfundimit) return null;
    const ignored = new Set(['cancelled', 'rejected']);
    for (const row of existingRequests) {
      if (ignored.has(row.statusi)) continue;
      if (isEdit && row.id === initialData.id) continue;
      const rowStart = String(row.data_fillimit).slice(0, 10);
      const rowEnd = String(row.data_perfundimit).slice(0, 10);
      if (
        rangesOverlap(
          form.data_fillimit,
          form.data_perfundimit,
          rowStart,
          rowEnd
        )
      ) {
        return { ...row, rowStart, rowEnd };
      }
    }
    return null;
  }, [
    existingRequests,
    form.data_fillimit,
    form.data_perfundimit,
    isEdit,
    initialData?.id,
  ]);

  /**
   * Validate the form mirroring server invariants so the user gets
   * immediate feedback for obvious mistakes.
   */
  const validate = () => {
    const next = {};

    if (canActForOthers && !isEdit && !form.employee_id) {
      next.employee_id = 'Employee is required';
    }

    if (!form.lloji) next.lloji = 'Leave type is required';
    if (!TYPE_OPTIONS.map((o) => o.value).includes(form.lloji)) {
      next.lloji = 'Invalid leave type';
    }

    if (!form.data_fillimit) next.data_fillimit = 'Start date is required';
    if (!form.data_perfundimit) next.data_perfundimit = 'End date is required';

    if (form.data_fillimit && form.data_perfundimit) {
      if (form.data_perfundimit < form.data_fillimit) {
        next.data_perfundimit = 'End date cannot be before start date';
      }
    }

    return next;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = {
      lloji: form.lloji,
      data_fillimit: form.data_fillimit,
      data_perfundimit: form.data_perfundimit,
      arsyeja: form.arsyeja?.trim() || undefined,
    };

    // HR/Admin creating on behalf of another employee
    if (canActForOthers && !isEdit && form.employee_id) {
      payload.employee_id = Number(form.employee_id);
    }

    onSubmit?.(payload);
  };

  const minEnd = form.data_fillimit || todayIso();

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Employee picker (HR/Admin, create only) */}
      {canActForOthers && !isEdit && (
        <div>
          <label
            htmlFor="employee_id"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Employee <span className="text-red-500">*</span>
          </label>
          <select
            id="employee_id"
            value={form.employee_id}
            onChange={handleChange('employee_id')}
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.employee_id
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          >
            <option value="">Select an employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.first_name} {e.last_name}
                {e.numri_punonjesit ? ` (${e.numri_punonjesit})` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Leave blank to file the request for yourself.
          </p>
          {errors.employee_id && (
            <p className="mt-1 text-xs text-red-600">{errors.employee_id}</p>
          )}
        </div>
      )}

      {/* Leave type */}
      <div>
        <label
          htmlFor="lloji"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Leave type <span className="text-red-500">*</span>
        </label>
        <select
          id="lloji"
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

      {/* Date range */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="data_fillimit"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Start date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            id="data_fillimit"
            value={form.data_fillimit}
            onChange={handleChange('data_fillimit')}
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.data_fillimit
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          />
          {errors.data_fillimit && (
            <p className="mt-1 text-xs text-red-600">{errors.data_fillimit}</p>
          )}
        </div>
        <div>
          <label
            htmlFor="data_perfundimit"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            End date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            id="data_perfundimit"
            value={form.data_perfundimit}
            onChange={handleChange('data_perfundimit')}
            min={minEnd}
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.data_perfundimit
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          />
          {errors.data_perfundimit && (
            <p className="mt-1 text-xs text-red-600">
              {errors.data_perfundimit}
            </p>
          )}
        </div>
      </div>

      {/* Day-count preview */}
      {calendar > 0 && (
        <div className="rounded-md bg-indigo-50 border border-indigo-100 p-3 text-sm text-indigo-900">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>
              <span className="font-semibold">{calendar}</span> calendar day
              {calendar === 1 ? '' : 's'}
            </span>
            <span>
              <span className="font-semibold">{business}</span> business day
              {business === 1 ? '' : 's'} (Mon–Fri)
            </span>
          </div>
        </div>
      )}

      {/* Overlap warning */}
      {conflict && (
        <div
          role="alert"
          className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900"
        >
          <p className="font-semibold">Overlap warning</p>
          <p className="mt-1">
            These dates conflict with request #{conflict.id} (
            {conflict.rowStart} – {conflict.rowEnd}, status:{' '}
            <span className="capitalize">{conflict.statusi}</span>). The
            server will reject duplicate ranges — please adjust or cancel the
            existing request first.
          </p>
        </div>
      )}

      {/* Reason */}
      <div>
        <label
          htmlFor="arsyeja"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Reason
        </label>
        <textarea
          id="arsyeja"
          rows={3}
          value={form.arsyeja}
          onChange={handleChange('arsyeja')}
          placeholder="Optional — add context for the approver"
          className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {submitting
            ? isEdit
              ? 'Saving…'
              : 'Submitting…'
            : isEdit
              ? 'Save changes'
              : 'Submit request'}
        </button>
      </div>
    </form>
  );
};

export default LeaveRequestForm;
