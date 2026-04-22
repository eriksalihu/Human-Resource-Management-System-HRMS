/**
 * @file frontend/src/components/salaries/SalaryForm.jsx
 * @description Salary form with employee / period selection, monetary inputs, and live net-pay calculation preview
 * @author Dev B
 */

import { useState, useEffect, useMemo } from 'react';
import * as employeeApi from '../../api/employeeApi';

/** Status options (must match the Salaries.statusi ENUM). */
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'processed', label: 'Processed' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

/**
 * Build a dropdown of selectable years: current year ± 5.
 */
const buildYearOptions = () => {
  const now = new Date().getFullYear();
  const years = [];
  for (let y = now + 1; y >= now - 5; y -= 1) {
    years.push({ value: y, label: String(y) });
  }
  return years;
};

/**
 * Format a monetary value as a EUR currency string with two decimals.
 */
const formatCurrency = (value) =>
  value != null && !Number.isNaN(Number(value))
    ? `€${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : '—';

/**
 * Mirror of the backend calculateNetSalary formula
 * (pension 5%, health 3.5%, tax 10% on post-insurance taxable income).
 *
 * Treats `bonuse` as part of gross income and `zbritje` as an additional
 * discretionary deduction applied after tax (matching the server's
 * computeNetPay helper in salary.controller.js).
 *
 * @param {number|string} paga_baze
 * @param {number|string} [bonuse=0]
 * @param {number|string} [zbritje=0]
 * @returns {{
 *   gross: number,
 *   pension: number,
 *   health: number,
 *   tax: number,
 *   discretionary: number,
 *   net: number
 * }}
 */
const previewNetPay = (paga_baze, bonuse = 0, zbritje = 0) => {
  const base = parseFloat(paga_baze) || 0;
  const bonus = parseFloat(bonuse) || 0;
  const discretionary = parseFloat(zbritje) || 0;
  const gross = base + bonus;

  const pension = +(gross * 0.05).toFixed(2);
  const health = +(gross * 0.035).toFixed(2);
  const taxable = gross - pension - health;
  const tax = +(taxable * 0.1).toFixed(2);

  const statutoryNet = +(gross - pension - health - tax).toFixed(2);
  const net = +(statutoryNet - discretionary).toFixed(2);

  return { gross, pension, health, tax, discretionary, net };
};

/**
 * SalaryForm — create / edit a salary record with a live net-pay preview.
 *
 * @param {Object} props
 * @param {Object} [props.initialData] - Existing salary for edit mode
 * @param {Function} props.onSubmit - Called with the cleaned payload
 * @param {Function} props.onCancel
 * @param {boolean} [props.submitting]
 * @returns {JSX.Element}
 */
const SalaryForm = ({ initialData, onSubmit, onCancel, submitting = false }) => {
  const isEdit = Boolean(initialData?.id);
  const now = new Date();

  const [formData, setFormData] = useState({
    employee_id: initialData?.employee_id ?? '',
    paga_baze: initialData?.paga_baze ?? '',
    bonuse: initialData?.bonuse ?? '',
    zbritje: initialData?.zbritje ?? '',
    muaji: initialData?.muaji ?? now.getMonth() + 1,
    viti: initialData?.viti ?? now.getFullYear(),
    data_pageses: initialData?.data_pageses?.slice(0, 10) ?? '',
    statusi: initialData?.statusi ?? 'pending',
  });

  const [errors, setErrors] = useState({});
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);

  const yearOptions = useMemo(buildYearOptions, []);

  /** Load the employee dropdown once on mount. */
  useEffect(() => {
    let cancelled = false;
    const fetchEmployees = async () => {
      setLoadingEmployees(true);
      try {
        const result = await employeeApi.getAll({ limit: 200, statusi: 'active' });
        if (cancelled) return;
        setEmployees(result.data || []);
      } catch {
        if (!cancelled) setEmployees([]);
      } finally {
        if (!cancelled) setLoadingEmployees(false);
      }
    };
    fetchEmployees();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Live net-pay preview for the currently entered values. */
  const preview = useMemo(
    () => previewNetPay(formData.paga_baze, formData.bonuse, formData.zbritje),
    [formData.paga_baze, formData.bonuse, formData.zbritje]
  );

  /**
   * Update a single form field.
   */
  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  /**
   * Client-side validation. Mirrors the server's invariants so we catch
   * errors before a round-trip.
   */
  const validate = () => {
    const e = {};

    if (!formData.employee_id) e.employee_id = 'Employee is required';

    const base = parseFloat(formData.paga_baze);
    if (!formData.paga_baze && formData.paga_baze !== 0) {
      e.paga_baze = 'Base pay is required';
    } else if (Number.isNaN(base) || base < 0) {
      e.paga_baze = 'Base pay must be a non-negative number';
    }

    if (formData.bonuse !== '' && (Number.isNaN(parseFloat(formData.bonuse)) || parseFloat(formData.bonuse) < 0)) {
      e.bonuse = 'Bonuses must be a non-negative number';
    }
    if (formData.zbritje !== '' && (Number.isNaN(parseFloat(formData.zbritje)) || parseFloat(formData.zbritje) < 0)) {
      e.zbritje = 'Deductions must be a non-negative number';
    }

    const m = parseInt(formData.muaji, 10);
    if (!m || m < 1 || m > 12) e.muaji = 'Select a valid month';
    if (!formData.viti) e.viti = 'Select a year';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /**
   * Submit — build the payload with numeric fields coerced.
   */
  const handleSubmit = (ev) => {
    ev.preventDefault();
    if (!validate()) return;

    const payload = {
      employee_id: parseInt(formData.employee_id, 10),
      paga_baze: parseFloat(formData.paga_baze),
      bonuse: formData.bonuse === '' ? 0 : parseFloat(formData.bonuse),
      zbritje: formData.zbritje === '' ? 0 : parseFloat(formData.zbritje),
      muaji: parseInt(formData.muaji, 10),
      viti: parseInt(formData.viti, 10),
      data_pageses: formData.data_pageses || undefined,
      statusi: formData.statusi,
    };

    onSubmit(payload);
  };

  /** Shared Tailwind classes for inputs. */
  const inputCls = (hasError) =>
    `mt-1 block w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
      hasError
        ? 'border-red-300 bg-red-50'
        : 'border-gray-300 bg-white'
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Employee */}
      <div>
        <label
          htmlFor="employee_id"
          className="block text-sm font-medium text-gray-700"
        >
          Employee *
        </label>
        <select
          id="employee_id"
          value={formData.employee_id}
          onChange={(e) => handleChange('employee_id', e.target.value)}
          className={inputCls(errors.employee_id)}
          disabled={isEdit || loadingEmployees}
        >
          <option value="">
            {loadingEmployees ? 'Loading employees…' : 'Select employee'}
          </option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.first_name} {emp.last_name}
              {emp.numri_punonjesit ? ` (${emp.numri_punonjesit})` : ''}
            </option>
          ))}
        </select>
        {isEdit && (
          <p className="mt-1 text-xs text-gray-500">
            Employee cannot be changed after creation.
          </p>
        )}
        {errors.employee_id && (
          <p className="mt-1 text-xs text-red-600">{errors.employee_id}</p>
        )}
      </div>

      {/* Period: month + year */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="muaji" className="block text-sm font-medium text-gray-700">
            Month *
          </label>
          <select
            id="muaji"
            value={formData.muaji}
            onChange={(e) => handleChange('muaji', parseInt(e.target.value, 10))}
            className={inputCls(errors.muaji)}
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {errors.muaji && <p className="mt-1 text-xs text-red-600">{errors.muaji}</p>}
        </div>

        <div>
          <label htmlFor="viti" className="block text-sm font-medium text-gray-700">
            Year *
          </label>
          <select
            id="viti"
            value={formData.viti}
            onChange={(e) => handleChange('viti', parseInt(e.target.value, 10))}
            className={inputCls(errors.viti)}
          >
            {yearOptions.map((y) => (
              <option key={y.value} value={y.value}>
                {y.label}
              </option>
            ))}
          </select>
          {errors.viti && <p className="mt-1 text-xs text-red-600">{errors.viti}</p>}
        </div>
      </div>

      {/* Monetary inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="paga_baze" className="block text-sm font-medium text-gray-700">
            Base pay (€) *
          </label>
          <input
            type="number"
            id="paga_baze"
            step="0.01"
            min="0"
            value={formData.paga_baze}
            onChange={(e) => handleChange('paga_baze', e.target.value)}
            className={inputCls(errors.paga_baze)}
            placeholder="0.00"
          />
          {errors.paga_baze && <p className="mt-1 text-xs text-red-600">{errors.paga_baze}</p>}
        </div>

        <div>
          <label htmlFor="bonuse" className="block text-sm font-medium text-gray-700">
            Bonuses (€)
          </label>
          <input
            type="number"
            id="bonuse"
            step="0.01"
            min="0"
            value={formData.bonuse}
            onChange={(e) => handleChange('bonuse', e.target.value)}
            className={inputCls(errors.bonuse)}
            placeholder="0.00"
          />
          {errors.bonuse && <p className="mt-1 text-xs text-red-600">{errors.bonuse}</p>}
        </div>

        <div>
          <label htmlFor="zbritje" className="block text-sm font-medium text-gray-700">
            Deductions (€)
          </label>
          <input
            type="number"
            id="zbritje"
            step="0.01"
            min="0"
            value={formData.zbritje}
            onChange={(e) => handleChange('zbritje', e.target.value)}
            className={inputCls(errors.zbritje)}
            placeholder="0.00"
          />
          {errors.zbritje && <p className="mt-1 text-xs text-red-600">{errors.zbritje}</p>}
          <p className="mt-1 text-xs text-gray-500">
            Extra on top of statutory deductions (pension, health, tax).
          </p>
        </div>
      </div>

      {/* Live net-pay preview */}
      <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-4">
        <h4 className="text-sm font-semibold text-indigo-900 mb-2">
          Estimated net pay
        </h4>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 text-sm">
          <div className="flex justify-between sm:block">
            <dt className="text-xs uppercase tracking-wider text-indigo-700/80">Gross</dt>
            <dd className="font-medium text-indigo-900">{formatCurrency(preview.gross)}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-xs uppercase tracking-wider text-indigo-700/80">Pension (5%)</dt>
            <dd className="text-indigo-900">− {formatCurrency(preview.pension)}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-xs uppercase tracking-wider text-indigo-700/80">Health (3.5%)</dt>
            <dd className="text-indigo-900">− {formatCurrency(preview.health)}</dd>
          </div>
          <div className="flex justify-between sm:block">
            <dt className="text-xs uppercase tracking-wider text-indigo-700/80">Tax (10%)</dt>
            <dd className="text-indigo-900">− {formatCurrency(preview.tax)}</dd>
          </div>
          {preview.discretionary > 0 && (
            <div className="flex justify-between sm:block">
              <dt className="text-xs uppercase tracking-wider text-indigo-700/80">Other deductions</dt>
              <dd className="text-indigo-900">− {formatCurrency(preview.discretionary)}</dd>
            </div>
          )}
          <div className="col-span-2 sm:col-span-3 pt-2 mt-1 border-t border-indigo-200 flex items-baseline justify-between">
            <dt className="text-sm font-semibold text-indigo-900">Net pay</dt>
            <dd className="text-lg font-bold text-indigo-900">{formatCurrency(preview.net)}</dd>
          </div>
        </dl>
        <p className="text-[11px] text-indigo-700/70 mt-2 leading-snug">
          Preview only — the server recalculates net pay on submit.
        </p>
      </div>

      {/* Payment date + status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="data_pageses" className="block text-sm font-medium text-gray-700">
            Payment date
          </label>
          <input
            type="date"
            id="data_pageses"
            value={formData.data_pageses}
            onChange={(e) => handleChange('data_pageses', e.target.value)}
            className={inputCls(false)}
          />
        </div>

        <div>
          <label htmlFor="statusi" className="block text-sm font-medium text-gray-700">
            Status
          </label>
          <select
            id="statusi"
            value={formData.statusi}
            onChange={(e) => handleChange('statusi', e.target.value)}
            className={inputCls(false)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          disabled={submitting}
        >
          {submitting
            ? 'Saving…'
            : isEdit
            ? 'Update Salary'
            : 'Create Salary'}
        </button>
      </div>
    </form>
  );
};

export default SalaryForm;
