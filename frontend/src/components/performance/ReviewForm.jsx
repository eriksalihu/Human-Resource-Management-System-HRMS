/**
 * @file frontend/src/components/performance/ReviewForm.jsx
 * @description Performance review form with employee selector, interactive star rating, period dropdown, review-date picker, and strengths/weaknesses/objectives textareas
 * @author Dev B
 */

import { useState, useEffect, useMemo } from 'react';
import * as employeeApi from '../../api/employeeApi';
import useAuth from '../../hooks/useAuth';

/** Roles allowed to explicitly set the reviewer (`vleresues_id`). */
const PRIVILEGED_ROLES = ['Admin', 'HR Manager'];

/** ISO YYYY-MM-DD for today (server-local). */
const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Build period options — current quarter and the seven previous quarters,
 * plus current/previous calendar year. Same convention as ReviewList so
 * filters and submissions agree.
 */
const buildPeriodOptions = () => {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const periods = [];

  for (let i = 0; i < 8; i += 1) {
    let q = quarter - i;
    let y = year;
    while (q <= 0) {
      q += 4;
      y -= 1;
    }
    const label = `${y}-Q${q}`;
    periods.push({ value: label, label });
  }

  periods.push({ value: String(year), label: `${year} (annual)` });
  periods.push({ value: String(year - 1), label: `${year - 1} (annual)` });

  return periods;
};

/**
 * Interactive 5-star input with half-star resolution. Click left half for
 * `i - 0.5`, right half for `i`. Keyboard arrows step by 0.5.
 *
 * @param {{ value: number, onChange: Function, disabled?: boolean }} props
 */
const StarInput = ({ value = 0, onChange, disabled = false }) => {
  const [hover, setHover] = useState(0);
  const display = hover || value;

  const handleClick = (i, isHalf) => {
    if (disabled) return;
    onChange(isHalf ? i - 0.5 : i);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    let next = value;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + 0.5;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = value - 0.5;
    else return;
    e.preventDefault();
    onChange(Math.max(0, Math.min(5, next)));
  };

  return (
    <div
      className="inline-flex items-center gap-2"
      onMouseLeave={() => setHover(0)}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value}
      aria-label="Rating"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
    >
      <div className="flex">
        {[1, 2, 3, 4, 5].map((i) => {
          let fill = 'none';
          if (display >= i) fill = 'full';
          else if (display >= i - 0.5) fill = 'half';

          return (
            <span
              key={i}
              className="relative inline-block w-7 h-7 text-yellow-500 cursor-pointer select-none"
            >
              {/* Outline */}
              <svg
                className="absolute inset-0 w-7 h-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.32.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.32-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                />
              </svg>
              {/* Fill */}
              {fill !== 'none' && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: fill === 'half' ? '50%' : '100%' }}
                >
                  <svg
                    className="w-7 h-7"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.32.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.32-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                </span>
              )}
              {/* Hover targets — left half = i - 0.5, right half = i */}
              <button
                type="button"
                aria-label={`${i - 0.5} stars`}
                onMouseEnter={() => setHover(i - 0.5)}
                onClick={() => handleClick(i, true)}
                disabled={disabled}
                className="absolute inset-y-0 left-0 w-1/2 bg-transparent border-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <button
                type="button"
                aria-label={`${i} stars`}
                onMouseEnter={() => setHover(i)}
                onClick={() => handleClick(i, false)}
                disabled={disabled}
                className="absolute inset-y-0 right-0 w-1/2 bg-transparent border-0 cursor-pointer disabled:cursor-not-allowed"
              />
            </span>
          );
        })}
      </div>
      <span className="text-sm font-medium text-gray-700 min-w-[2.5rem]">
        {Number(display).toFixed(1)}
      </span>
    </div>
  );
};

/**
 * ReviewForm — create / edit a performance review.
 *
 * In edit mode `employee_id` is locked (changing the subject would orphan
 * the row from its previous context). HR / Admin may also re-assign the
 * reviewer in edit mode; the API enforces that authorization.
 *
 * @param {Object} props
 * @param {Object} [props.initialData] - If provided, runs in edit mode
 * @param {Function} props.onSubmit - Receives the payload
 * @param {Function} props.onCancel
 * @param {boolean} [props.submitting=false]
 * @returns {JSX.Element}
 */
const ReviewForm = ({
  initialData = null,
  onSubmit,
  onCancel,
  submitting = false,
}) => {
  const { user } = useAuth() || {};
  const isEdit = Boolean(initialData?.id);
  const canSetReviewer =
    (user?.roles || []).some((r) => PRIVILEGED_ROLES.includes(r));

  const [form, setForm] = useState({
    employee_id: initialData?.employee_id || '',
    vleresues_id: initialData?.vleresues_id || '',
    periudha: initialData?.periudha || '',
    nota: initialData?.nota != null ? Number(initialData.nota) : 0,
    pikat_forta: initialData?.pikat_forta || '',
    pikat_dobta: initialData?.pikat_dobta || '',
    objektivat: initialData?.objektivat || '',
    data_vleresimit: initialData?.data_vleresimit
      ? String(initialData.data_vleresimit).slice(0, 10)
      : todayIso(),
  });

  const [errors, setErrors] = useState({});
  const [employees, setEmployees] = useState([]);

  const periodOptions = useMemo(buildPeriodOptions, []);

  /**
   * Load active employees for the picker. We always need them in create
   * mode; in edit mode we only need them when the caller is allowed to
   * re-assign the reviewer.
   */
  useEffect(() => {
    if (isEdit && !canSetReviewer) return;
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
  }, [isEdit, canSetReviewer]);

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

  /** Star rating handler. */
  const handleRatingChange = (value) => {
    setForm((prev) => ({ ...prev, nota: value }));
    if (errors.nota) {
      setErrors((prev) => {
        const { nota: _omit, ...rest } = prev;
        return rest;
      });
    }
  };

  /**
   * Validate the form mirroring server invariants so the user gets
   * immediate feedback before round-tripping to the backend.
   */
  const validate = () => {
    const next = {};

    if (!isEdit && !form.employee_id) {
      next.employee_id = 'Employee is required';
    }
    if (!form.periudha) {
      next.periudha = 'Period is required';
    }
    if (!form.data_vleresimit) {
      next.data_vleresimit = 'Review date is required';
    }

    const rating = Number(form.nota);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      next.nota = 'Rating must be between 1.0 and 5.0';
    }

    // No self-reviews — server enforces too, but caught here for UX.
    if (
      canSetReviewer &&
      form.vleresues_id &&
      form.employee_id &&
      Number(form.vleresues_id) === Number(form.employee_id)
    ) {
      next.vleresues_id = 'Reviewer cannot be the same as the subject';
    }

    return next;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = {
      periudha: form.periudha,
      nota: Number(form.nota),
      data_vleresimit: form.data_vleresimit,
      pikat_forta: form.pikat_forta?.trim() || undefined,
      pikat_dobta: form.pikat_dobta?.trim() || undefined,
      objektivat: form.objektivat?.trim() || undefined,
    };

    if (!isEdit) {
      payload.employee_id = Number(form.employee_id);
    }

    // Reviewer override — HR / Admin only. Empty string means "leave default".
    if (canSetReviewer && form.vleresues_id) {
      payload.vleresues_id = Number(form.vleresues_id);
    }

    onSubmit?.(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Employee subject (locked in edit mode) */}
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

      {/* Reviewer override (HR / Admin only) */}
      {canSetReviewer && (
        <div>
          <label
            htmlFor="vleresues_id"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Reviewer
          </label>
          <select
            id="vleresues_id"
            value={form.vleresues_id}
            onChange={handleChange('vleresues_id')}
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.vleresues_id
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          >
            <option value="">Default (you)</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.first_name} {e.last_name}
                {e.numri_punonjesit ? ` (${e.numri_punonjesit})` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Leave blank to attribute the review to yourself.
          </p>
          {errors.vleresues_id && (
            <p className="mt-1 text-xs text-red-600">{errors.vleresues_id}</p>
          )}
        </div>
      )}

      {/* Period + review date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="periudha"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Period <span className="text-red-500">*</span>
          </label>
          <select
            id="periudha"
            value={form.periudha}
            onChange={handleChange('periudha')}
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.periudha
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          >
            <option value="">Select period…</option>
            {periodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.periudha && (
            <p className="mt-1 text-xs text-red-600">{errors.periudha}</p>
          )}
        </div>
        <div>
          <label
            htmlFor="data_vleresimit"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Review date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            id="data_vleresimit"
            value={form.data_vleresimit}
            onChange={handleChange('data_vleresimit')}
            max={todayIso()}
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.data_vleresimit
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          />
          {errors.data_vleresimit && (
            <p className="mt-1 text-xs text-red-600">
              {errors.data_vleresimit}
            </p>
          )}
        </div>
      </div>

      {/* Rating */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Rating <span className="text-red-500">*</span>
        </label>
        <StarInput
          value={Number(form.nota) || 0}
          onChange={handleRatingChange}
        />
        {errors.nota && (
          <p className="mt-1 text-xs text-red-600">{errors.nota}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Click a star (or keyboard arrows) to set a rating from 1.0 to 5.0
          in 0.5 increments.
        </p>
      </div>

      {/* Strengths */}
      <div>
        <label
          htmlFor="pikat_forta"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Strengths
        </label>
        <textarea
          id="pikat_forta"
          rows={3}
          value={form.pikat_forta}
          onChange={handleChange('pikat_forta')}
          placeholder="What did this employee do exceptionally well?"
          className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
        />
      </div>

      {/* Weaknesses / development areas */}
      <div>
        <label
          htmlFor="pikat_dobta"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Areas for development
        </label>
        <textarea
          id="pikat_dobta"
          rows={3}
          value={form.pikat_dobta}
          onChange={handleChange('pikat_dobta')}
          placeholder="Where is there room for growth?"
          className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
        />
      </div>

      {/* Objectives for next period */}
      <div>
        <label
          htmlFor="objektivat"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Objectives for next period
        </label>
        <textarea
          id="objektivat"
          rows={3}
          value={form.objektivat}
          onChange={handleChange('objektivat')}
          placeholder="Concrete, measurable goals for the next review cycle"
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
              : 'Submit review'}
        </button>
      </div>
    </form>
  );
};

export default ReviewForm;
