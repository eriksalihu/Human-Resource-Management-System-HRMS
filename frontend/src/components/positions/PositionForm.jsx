/**
 * @file frontend/src/components/positions/PositionForm.jsx
 * @description Position create / edit form with department dropdown and salary range validation
 * @author Dev B
 */

import { useState, useEffect } from 'react';
import * as departmentApi from '../../api/departmentApi';
import LoadingSpinner from '../common/LoadingSpinner';

/**
 * Common level suggestions shown in the level select. Free-text is also allowed
 * via a fallback input, so custom levels can be entered too.
 */
const LEVEL_SUGGESTIONS = ['Junior', 'Mid', 'Senior', 'Lead', 'Principal', 'Manager'];

/**
 * PositionForm — controlled form for creating and updating positions.
 *
 * Fields: department_id (select), emertimi (name), niveli (level),
 * pershkrimi (description), paga_min, paga_max with validation paga_min < paga_max.
 *
 * @param {Object} props
 * @param {Object} [props.initialData] - Existing position for edit mode
 * @param {Function} props.onSubmit - Callback invoked with the validated payload
 * @param {Function} [props.onCancel] - Callback for the cancel button
 * @param {boolean} [props.submitting=false] - Whether the parent is submitting
 * @returns {JSX.Element}
 */
const PositionForm = ({ initialData, onSubmit, onCancel, submitting = false }) => {
  const isEdit = Boolean(initialData?.id);

  const [formData, setFormData] = useState({
    department_id: initialData?.department_id ?? '',
    emertimi: initialData?.emertimi || '',
    niveli: initialData?.niveli || '',
    pershkrimi: initialData?.pershkrimi || '',
    paga_min: initialData?.paga_min ?? '',
    paga_max: initialData?.paga_max ?? '',
  });
  const [errors, setErrors] = useState({});
  const [departments, setDepartments] = useState([]);
  const [loadingDepartments, setLoadingDepartments] = useState(true);

  // Fetch department options for the dropdown
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const result = await departmentApi.getAll({ limit: 100 });
        setDepartments(result.data || []);
      } catch {
        setDepartments([]);
      } finally {
        setLoadingDepartments(false);
      }
    };
    fetchDepartments();
  }, []);

  /**
   * Validate form fields.
   * @returns {boolean} True if valid
   */
  const validate = () => {
    const newErrors = {};

    if (!formData.department_id) {
      newErrors.department_id = 'Department is required';
    }

    if (!formData.emertimi.trim()) {
      newErrors.emertimi = 'Position name is required';
    } else if (formData.emertimi.trim().length < 2) {
      newErrors.emertimi = 'Name must be at least 2 characters';
    } else if (formData.emertimi.trim().length > 100) {
      newErrors.emertimi = 'Name must be at most 100 characters';
    }

    if (formData.pershkrimi && formData.pershkrimi.length > 500) {
      newErrors.pershkrimi = 'Description must be at most 500 characters';
    }

    const minProvided = formData.paga_min !== '' && formData.paga_min != null;
    const maxProvided = formData.paga_max !== '' && formData.paga_max != null;

    if (minProvided) {
      const min = Number(formData.paga_min);
      if (Number.isNaN(min) || min < 0) {
        newErrors.paga_min = 'Minimum salary must be a non-negative number';
      }
    }

    if (maxProvided) {
      const max = Number(formData.paga_max);
      if (Number.isNaN(max) || max < 0) {
        newErrors.paga_max = 'Maximum salary must be a non-negative number';
      }
    }

    if (minProvided && maxProvided && !newErrors.paga_min && !newErrors.paga_max) {
      const min = Number(formData.paga_min);
      const max = Number(formData.paga_max);
      if (min > max) {
        newErrors.paga_max = 'Maximum salary must be greater than or equal to minimum';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handle input changes.
   * @param {React.ChangeEvent} e
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
    // Clear cross-field salary error when either field changes
    if ((name === 'paga_min' || name === 'paga_max') && errors.paga_max) {
      setErrors((prev) => ({ ...prev, paga_max: '' }));
    }
  };

  /**
   * Handle form submit — validate, build payload, invoke parent.
   * @param {React.FormEvent} e
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      department_id: Number(formData.department_id),
      emertimi: formData.emertimi.trim(),
      niveli: formData.niveli.trim() || null,
      pershkrimi: formData.pershkrimi.trim() || null,
      paga_min: formData.paga_min !== '' ? Number(formData.paga_min) : null,
      paga_max: formData.paga_max !== '' ? Number(formData.paga_max) : null,
    };

    onSubmit(payload);
  };

  const inputClass = (field) =>
    `w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
      errors[field] ? 'border-red-300 bg-red-50' : 'border-gray-300'
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Department */}
      <div>
        <label htmlFor="department_id" className="block text-sm font-medium text-gray-700 mb-1">
          Department <span className="text-red-500">*</span>
        </label>
        <select
          id="department_id"
          name="department_id"
          value={formData.department_id}
          onChange={handleChange}
          className={inputClass('department_id')}
          disabled={submitting || loadingDepartments}
        >
          <option value="">— Select a department —</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.emertimi}
            </option>
          ))}
        </select>
        {loadingDepartments && (
          <p className="mt-1 text-xs text-gray-500">Loading departments…</p>
        )}
        {errors.department_id && (
          <p className="mt-1 text-xs text-red-600">{errors.department_id}</p>
        )}
      </div>

      {/* Position name */}
      <div>
        <label htmlFor="emertimi" className="block text-sm font-medium text-gray-700 mb-1">
          Position name <span className="text-red-500">*</span>
        </label>
        <input
          id="emertimi"
          name="emertimi"
          type="text"
          value={formData.emertimi}
          onChange={handleChange}
          className={inputClass('emertimi')}
          placeholder="e.g. Senior Software Engineer"
          disabled={submitting}
        />
        {errors.emertimi && <p className="mt-1 text-xs text-red-600">{errors.emertimi}</p>}
      </div>

      {/* Level */}
      <div>
        <label htmlFor="niveli" className="block text-sm font-medium text-gray-700 mb-1">
          Level
        </label>
        <input
          id="niveli"
          name="niveli"
          type="text"
          list="niveli-suggestions"
          value={formData.niveli}
          onChange={handleChange}
          className={inputClass('niveli')}
          placeholder="e.g. Senior"
          disabled={submitting}
        />
        <datalist id="niveli-suggestions">
          {LEVEL_SUGGESTIONS.map((lvl) => (
            <option key={lvl} value={lvl} />
          ))}
        </datalist>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="pershkrimi" className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          id="pershkrimi"
          name="pershkrimi"
          rows={3}
          value={formData.pershkrimi}
          onChange={handleChange}
          className={inputClass('pershkrimi')}
          placeholder="Brief description of responsibilities and requirements"
          disabled={submitting}
        />
        {errors.pershkrimi && <p className="mt-1 text-xs text-red-600">{errors.pershkrimi}</p>}
      </div>

      {/* Salary range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="paga_min" className="block text-sm font-medium text-gray-700 mb-1">
            Min salary (€)
          </label>
          <input
            id="paga_min"
            name="paga_min"
            type="number"
            min="0"
            step="0.01"
            value={formData.paga_min}
            onChange={handleChange}
            className={inputClass('paga_min')}
            placeholder="0.00"
            disabled={submitting}
          />
          {errors.paga_min && <p className="mt-1 text-xs text-red-600">{errors.paga_min}</p>}
        </div>

        <div>
          <label htmlFor="paga_max" className="block text-sm font-medium text-gray-700 mb-1">
            Max salary (€)
          </label>
          <input
            id="paga_max"
            name="paga_max"
            type="number"
            min="0"
            step="0.01"
            value={formData.paga_max}
            onChange={handleChange}
            className={inputClass('paga_max')}
            placeholder="0.00"
            disabled={submitting}
          />
          {errors.paga_max && <p className="mt-1 text-xs text-red-600">{errors.paga_max}</p>}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting && <LoadingSpinner size="sm" color="white" />}
          {isEdit ? 'Update Position' : 'Create Position'}
        </button>
      </div>
    </form>
  );
};

export default PositionForm;
