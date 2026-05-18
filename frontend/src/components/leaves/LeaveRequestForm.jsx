/**
 * @file frontend/src/components/leaves/LeaveRequestForm.jsx
 * @description Leave request form with type dropdown, date range pickers, reason textarea, business-days preview, and client-side overlap warning
 * @author Dev B
 */

import { useState, useEffect, useMemo } from 'react';
import * as leaveRequestApi from '../../api/leaveRequestApi';
import * as employeeApi from '../../api/employeeApi';
import axiosInstance from '../../api/axiosInstance';
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
/**
 * Local-timezone "today" as YYYY-MM-DD. Using `toISOString()` (UTC)
 * shifted the date picker's `min` by a day for users at a UTC offset,
 * so a same-day leave request could be wrongly blocked / allowed.
 * Build from local date parts instead.
 */
const todayIso = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

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
   * Leave balance for the request's subject (self or HR-picked).
   * Shape mirrors the server payload from `/leave-requests/balance/*`:
   *   { employee_id, year, contract_type, balance: [{ lloji, allowance,
   *     days_used, remaining, used_pct, request_count }, …] }
   */
  const [balanceData, setBalanceData] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

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

  /**
   * Fetch the subject employee's leave balance:
   *   - Self-service (no employee_id): hit /balance/me
   *   - HR filing for someone else: hit /balance/:employeeId (commit 217)
   *   - Edit mode: use the initialData.employee_id since it's locked
   *
   * Refetches whenever the resolved subject changes. Silent on failure —
   * the panel just hides and the form stays usable.
   */
  useEffect(() => {
    const subjectId = isEdit
      ? initialData?.employee_id
      : form.employee_id || null;

    let cancelled = false;
    const load = async () => {
      setBalanceLoading(true);
      try {
        const url = subjectId
          ? `/leave-requests/balance/${subjectId}`
          : '/leave-requests/balance/me';
        const { data } = await axiosInstance.get(url);
        if (!cancelled) setBalanceData(data?.data || null);
      } catch {
        // HR picking someone else may 403 if the route guard rejects;
        // self-service path may 404 on a user with no employee record.
        // Either way we just hide the panel.
        if (!cancelled) setBalanceData(null);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isEdit, initialData?.employee_id, form.employee_id]);

  /**
   * Selected type's balance row. Null when balance hasn't loaded yet or
   * the server's response didn't include the chosen type (shouldn't
   * happen — the controller always returns all 6 types).
   */
  const selectedBalance = useMemo(() => {
    if (!balanceData?.balance) return null;
    return balanceData.balance.find((r) => r.lloji === form.lloji) || null;
  }, [balanceData, form.lloji]);

  /**
   * Does the requested business-day count exceed the subject's remaining
   * balance for the chosen type? `allowance === null` (uncapped types
   * like sick / maternity) always passes; pending dates (no business
   * days computed yet) also pass.
   */
  const balanceWarning = useMemo(() => {
    if (!selectedBalance) return null;
    if (selectedBalance.remaining == null) return null; // uncapped
    if (!form.data_fillimit || !form.data_perfundimit) return null;

    // Compute requested business days INLINE so this re-runs on date change.
    const requested = businessDays(form.data_fillimit, form.data_perfundimit);
    if (requested <= 0) return null;
    if (requested <= selectedBalance.remaining) return null;

    return {
      requested,
      remaining: selectedBalance.remaining,
      shortfall: requested - selectedBalance.remaining,
    };
  }, [selectedBalance, form.data_fillimit, form.data_perfundimit]);

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

      {/* Leave balance panel (commit 220) */}
      {balanceData?.balance && (
        <div className="rounded-md bg-gray-50 border border-gray-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              Your {balanceData.year} leave balance
              {balanceData.contract_type && (
                <span className="ml-1 text-gray-400 normal-case font-normal">
                  ({balanceData.contract_type})
                </span>
              )}
            </p>
            {balanceLoading && (
              <span className="text-[10px] text-gray-400">refreshing…</span>
            )}
          </div>

          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {balanceData.balance.map((row) => {
              const isSelected = row.lloji === form.lloji;
              const uncapped = row.allowance == null;
              return (
                <li
                  key={row.lloji}
                  className={`rounded px-2 py-1.5 ring-1 ring-inset transition-colors ${
                    isSelected
                      ? 'bg-indigo-50 ring-indigo-300'
                      : 'bg-white ring-gray-200'
                  }`}
                >
                  <p
                    className={`capitalize font-medium ${
                      isSelected ? 'text-indigo-800' : 'text-gray-700'
                    }`}
                  >
                    {row.lloji}
                  </p>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    {uncapped ? (
                      <span>
                        <span className="font-semibold">{row.days_used}</span> used
                        <span className="text-gray-400"> · no cap</span>
                      </span>
                    ) : (
                      <span>
                        <span className="font-semibold">{row.remaining}</span>{' '}
                        / {row.allowance} left
                      </span>
                    )}
                  </p>
                  {!uncapped && row.allowance > 0 && (
                    <div className="mt-1 h-1 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-1 rounded-full ${
                          row.used_pct >= 100
                            ? 'bg-rose-500'
                            : row.used_pct >= 80
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        }`}
                        style={{
                          width: `${Math.min(100, row.used_pct || 0)}%`,
                        }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Balance-exceeded warning */}
      {balanceWarning && (
        <div
          role="alert"
          className="rounded-md bg-rose-50 border border-rose-200 p-3 text-sm text-rose-900"
        >
          <p className="font-semibold">Balance warning</p>
          <p className="mt-1">
            You're requesting{' '}
            <span className="font-semibold">{balanceWarning.requested}</span>{' '}
            business days but only{' '}
            <span className="font-semibold">{balanceWarning.remaining}</span>{' '}
            day{balanceWarning.remaining === 1 ? '' : 's'} remain in your{' '}
            <span className="capitalize font-medium">{form.lloji}</span>{' '}
            balance for {balanceData?.year}. Shortfall:{' '}
            <span className="font-semibold">{balanceWarning.shortfall}</span>{' '}
            day{balanceWarning.shortfall === 1 ? '' : 's'}.
          </p>
        </div>
      )}

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

      {/* Actions — stacked w/ Submit on top on mobile, row on sm+. */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2 border-t border-gray-100">
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
