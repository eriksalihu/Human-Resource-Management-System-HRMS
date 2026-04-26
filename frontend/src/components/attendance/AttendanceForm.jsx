/**
 * @file frontend/src/components/attendance/AttendanceForm.jsx
 * @description Manual attendance form with employee picker, date, check-in/out time, status, notes, and live hours-worked preview
 * @author Dev B
 */

import { useState, useEffect, useMemo } from 'react';
import * as employeeApi from '../../api/employeeApi';

/** Status options must match the Attendances.statusi ENUM. */
const STATUS_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'half-day', label: 'Half day' },
  { value: 'remote', label: 'Remote' },
];

/** ISO YYYY-MM-DD for today (server-local). */
const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Compute hours worked between two HH:MM[:SS] strings on the same date.
 * Returns null if either is missing, malformed, or the range is inverted.
 *
 * @param {string} checkIn - HH:MM[:SS]
 * @param {string} checkOut - HH:MM[:SS]
 * @returns {{ hours: number, minutes: number, totalMinutes: number } | null}
 */
const computeHoursWorked = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return null;

  const parse = (str) => {
    const [h, m, s = '0'] = String(str).split(':');
    const hh = Number(h);
    const mm = Number(m);
    const ss = Number(s);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss)) {
      return null;
    }
    return hh * 60 + mm + Math.floor(ss / 60);
  };

  const start = parse(checkIn);
  const end = parse(checkOut);
  if (start == null || end == null || end <= start) return null;

  const totalMinutes = end - start;
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    totalMinutes,
  };
};

/** Strip an HH:MM:SS-ish time string to HH:MM for `<input type="time">`. */
const trimTime = (value) => {
  if (!value) return '';
  const str = String(value);
  return str.length >= 5 ? str.slice(0, 5) : str;
};

/**
 * AttendanceForm — manual create / edit of an attendance record.
 *
 * In edit mode the employee + date are locked (changing them would violate
 * the unique_attendance constraint and the parent already knows the row).
 * In create mode HR / Admin pick an active employee and a date.
 *
 * @param {Object} props
 * @param {Object} [props.initialData] - If provided, runs in edit mode
 * @param {Function} props.onSubmit - Receives the payload
 * @param {Function} props.onCancel
 * @param {boolean} [props.submitting=false]
 * @returns {JSX.Element}
 */
const AttendanceForm = ({
  initialData = null,
  onSubmit,
  onCancel,
  submitting = false,
}) => {
  const isEdit = Boolean(initialData?.id);

  const [form, setForm] = useState({
    employee_id: initialData?.employee_id || '',
    data: initialData?.data
      ? String(initialData.data).slice(0, 10)
      : todayIso(),
    ora_hyrjes: trimTime(initialData?.ora_hyrjes),
    ora_daljes: trimTime(initialData?.ora_daljes),
    statusi: initialData?.statusi || 'present',
    shenimet: initialData?.shenimet || '',
  });

  const [errors, setErrors] = useState({});
  const [employees, setEmployees] = useState([]);

  /**
   * Load active employees once for the picker (skipped in edit mode since
   * the picker is locked).
   */
  useEffect(() => {
    if (isEdit) return;
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
  }, [isEdit]);

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

  /** Live hours-worked preview matching the server's TIMESTAMPDIFF math. */
  const worked = useMemo(
    () => computeHoursWorked(form.ora_hyrjes, form.ora_daljes),
    [form.ora_hyrjes, form.ora_daljes]
  );

  /**
   * Validate the form mirroring server invariants. Times are optional (e.g.
   * an "absent" row legitimately has neither), but if both are provided the
   * check-out must be after the check-in.
   */
  const validate = () => {
    const next = {};

    if (!isEdit && !form.employee_id) {
      next.employee_id = 'Employee is required';
    }
    if (!form.data) {
      next.data = 'Date is required';
    }
    if (!STATUS_OPTIONS.map((o) => o.value).includes(form.statusi)) {
      next.statusi = 'Invalid status';
    }

    if (form.ora_hyrjes && form.ora_daljes) {
      const w = computeHoursWorked(form.ora_hyrjes, form.ora_daljes);
      if (!w) {
        next.ora_daljes = 'Check-out must be after check-in';
      }
    }

    // For 'absent' it's odd to have times — warn but don't block.
    return next;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = {
      data: form.data,
      statusi: form.statusi,
      shenimet: form.shenimet?.trim() || undefined,
    };

    // Times: send seconds-padded to match the DB TIME column ("HH:MM:SS").
    // Empty strings become undefined so the backend stores NULL.
    payload.ora_hyrjes = form.ora_hyrjes
      ? `${form.ora_hyrjes}:00`.slice(0, 8)
      : undefined;
    payload.ora_daljes = form.ora_daljes
      ? `${form.ora_daljes}:00`.slice(0, 8)
      : undefined;

    if (!isEdit) {
      payload.employee_id = Number(form.employee_id);
    }

    onSubmit?.(payload);
  };

  const isAbsent = form.statusi === 'absent';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Employee picker (create only) */}
      <div>
        <label
          htmlFor="employee_id"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Employee <span className="text-red-500">*</span>
        </label>
        {isEdit ? (
          <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-800">
            {initialData.first_name} {initialData.last_name}
            {initialData.numri_punonjesit ? (
              <span className="ml-2 text-xs text-gray-500 font-mono">
                {initialData.numri_punonjesit}
              </span>
            ) : null}
          </div>
        ) : (
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
        )}
        {errors.employee_id && (
          <p className="mt-1 text-xs text-red-600">{errors.employee_id}</p>
        )}
      </div>

      {/* Date */}
      <div>
        <label
          htmlFor="data"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Date <span className="text-red-500">*</span>
        </label>
        {isEdit ? (
          <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-800 font-mono">
            {form.data}
          </div>
        ) : (
          <input
            type="date"
            id="data"
            value={form.data}
            onChange={handleChange('data')}
            max={todayIso()}
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.data
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          />
        )}
        {errors.data && (
          <p className="mt-1 text-xs text-red-600">{errors.data}</p>
        )}
      </div>

      {/* Status */}
      <div>
        <label
          htmlFor="statusi"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Status <span className="text-red-500">*</span>
        </label>
        <select
          id="statusi"
          value={form.statusi}
          onChange={handleChange('statusi')}
          className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
            errors.statusi
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300'
          }`}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {errors.statusi && (
          <p className="mt-1 text-xs text-red-600">{errors.statusi}</p>
        )}
      </div>

      {/* Times */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="ora_hyrjes"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Check in
          </label>
          <input
            type="time"
            id="ora_hyrjes"
            value={form.ora_hyrjes}
            onChange={handleChange('ora_hyrjes')}
            disabled={isAbsent}
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.ora_hyrjes
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            } ${isAbsent ? 'bg-gray-50 text-gray-400' : ''}`}
          />
          {errors.ora_hyrjes && (
            <p className="mt-1 text-xs text-red-600">{errors.ora_hyrjes}</p>
          )}
        </div>
        <div>
          <label
            htmlFor="ora_daljes"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Check out
          </label>
          <input
            type="time"
            id="ora_daljes"
            value={form.ora_daljes}
            onChange={handleChange('ora_daljes')}
            disabled={isAbsent}
            min={form.ora_hyrjes || undefined}
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.ora_daljes
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            } ${isAbsent ? 'bg-gray-50 text-gray-400' : ''}`}
          />
          {errors.ora_daljes && (
            <p className="mt-1 text-xs text-red-600">{errors.ora_daljes}</p>
          )}
        </div>
      </div>

      {/* Hours-worked preview */}
      {worked && !isAbsent && (
        <div className="rounded-md bg-indigo-50 border border-indigo-100 p-3 text-sm text-indigo-900">
          <span className="font-semibold">{worked.hours}h </span>
          <span className="font-semibold">
            {String(worked.minutes).padStart(2, '0')}m
          </span>
          <span className="ml-2 text-indigo-800/80">
            ({worked.totalMinutes} minute{worked.totalMinutes === 1 ? '' : 's'})
          </span>
        </div>
      )}

      {/* Notes */}
      <div>
        <label
          htmlFor="shenimet"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Notes
        </label>
        <textarea
          id="shenimet"
          rows={3}
          value={form.shenimet}
          onChange={handleChange('shenimet')}
          placeholder="Optional — e.g. 'Doctor appointment, will make up hours Friday'"
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
              : 'Creating…'
            : isEdit
              ? 'Save changes'
              : 'Create entry'}
        </button>
      </div>
    </form>
  );
};

export default AttendanceForm;
