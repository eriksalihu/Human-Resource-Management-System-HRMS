/**
 * @file frontend/src/components/departments/DepartmentForm.jsx
 * @description Department create / edit form with manager dropdown and validation
 * @author Dev B
 */

import { useState, useEffect } from 'react';
import axiosInstance from '../../api/axiosInstance';
import LoadingSpinner from '../common/LoadingSpinner';

/**
 * DepartmentForm — controlled form for creating and updating departments.
 *
 * Fields: emertimi (name), pershkrimi (description), lokacioni (location),
 * buxheti (budget), menaxheri_id (manager — selected from /api/employees).
 *
 * @param {Object} props
 * @param {Object} [props.initialData] - Existing department for edit mode
 * @param {Function} props.onSubmit - Callback invoked with the validated payload
 * @param {Function} [props.onCancel] - Callback for the cancel button
 * @param {boolean} [props.submitting=false] - Whether the parent is submitting
 * @returns {JSX.Element}
 */
const DepartmentForm = ({ initialData, onSubmit, onCancel, submitting = false }) => {
  const isEdit = Boolean(initialData?.id);

  const [formData, setFormData] = useState({
    emertimi: initialData?.emertimi || '',
    pershkrimi: initialData?.pershkrimi || '',
    lokacioni: initialData?.lokacioni || '',
    buxheti: initialData?.buxheti ?? '',
    menaxheri_id: initialData?.menaxheri_id ?? '',
  });
  const [errors, setErrors] = useState({});
  const [managers, setManagers] = useState([]);
  const [loadingManagers, setLoadingManagers] = useState(true);

  // Fetch potential managers (employees) for the dropdown
  useEffect(() => {
    const fetchManagers = async () => {
      try {
        const { data } = await axiosInstance.get('/employees', {
          params: { limit: 100 },
        });
        setManagers(data.data || []);
      } catch {
        // Silent fail — dropdown just shows empty list
        setManagers([]);
      } finally {
        setLoadingManagers(false);
      }
    };
    fetchManagers();
  }, []);

  /**
   * Validate form fields.
   * @returns {boolean} True if valid
   */
  const validate = () => {
    const newErrors = {};

    if (!formData.emertimi.trim()) {
      newErrors.emertimi = 'Department name is required';
    } else if (formData.emertimi.trim().length < 2) {
      newErrors.emertimi = 'Name must be at least 2 characters';
    } else if (formData.emertimi.trim().length > 100) {
      newErrors.emertimi = 'Name must be at most 100 characters';
    }

    if (formData.pershkrimi && formData.pershkrimi.length > 500) {
      newErrors.pershkrimi = 'Description must be at most 500 characters';
    }

    if (formData.buxheti !== '' && formData.buxheti != null) {
      const budget = Number(formData.buxheti);
      if (Number.isNaN(budget) || budget < 0) {
        newErrors.buxheti = 'Budget must be a non-negative number';
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
  };

  /**
   * Handle form submit — validate and invoke parent callback.
   * @param {React.FormEvent} e
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      emertimi: formData.emertimi.trim(),
      pershkrimi: formData.pershkrimi.trim() || null,
      lokacioni: formData.lokacioni.trim() || null,
      buxheti: formData.buxheti !== '' ? Number(formData.buxheti) : null,
      menaxheri_id: formData.menaxheri_id ? Number(formData.menaxheri_id) : null,
    };

    onSubmit(payload);
  };

  const inputClass = (field) =>
    `w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
      errors[field] ? 'border-red-300 bg-red-50' : 'border-gray-300'
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Name */}
      <div>
        <label htmlFor="emertimi" className="block text-sm font-medium text-gray-700 mb-1">
          Department name <span className="text-red-500">*</span>
        </label>
        <input
          id="emertimi"
          name="emertimi"
          type="text"
          value={formData.emertimi}
          onChange={handleChange}
          className={inputClass('emertimi')}
          placeholder="e.g. Human Resources"
          disabled={submitting}
        />
        {errors.emertimi && <p className="mt-1 text-xs text-red-600">{errors.emertimi}</p>}
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
          placeholder="Short description of the department"
          disabled={submitting}
        />
        {errors.pershkrimi && <p className="mt-1 text-xs text-red-600">{errors.pershkrimi}</p>}
      </div>

      {/* Location + Budget side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="lokacioni" className="block text-sm font-medium text-gray-700 mb-1">
            Location
          </label>
          <input
            id="lokacioni"
            name="lokacioni"
            type="text"
            value={formData.lokacioni}
            onChange={handleChange}
            className={inputClass('lokacioni')}
            placeholder="e.g. Prishtina"
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="buxheti" className="block text-sm font-medium text-gray-700 mb-1">
            Budget (€)
          </label>
          <input
            id="buxheti"
            name="buxheti"
            type="number"
            min="0"
            step="0.01"
            value={formData.buxheti}
            onChange={handleChange}
            className={inputClass('buxheti')}
            placeholder="0.00"
            disabled={submitting}
          />
          {errors.buxheti && <p className="mt-1 text-xs text-red-600">{errors.buxheti}</p>}
        </div>
      </div>

      {/* Manager dropdown */}
      <div>
        <label htmlFor="menaxheri_id" className="block text-sm font-medium text-gray-700 mb-1">
          Manager
        </label>
        <select
          id="menaxheri_id"
          name="menaxheri_id"
          value={formData.menaxheri_id}
          onChange={handleChange}
          className={inputClass('menaxheri_id')}
          disabled={submitting || loadingManagers}
        >
          <option value="">— No manager assigned —</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.first_name} {m.last_name}
              {m.numri_punonjesit ? ` (${m.numri_punonjesit})` : ''}
            </option>
          ))}
        </select>
        {loadingManagers && <p className="mt-1 text-xs text-gray-500">Loading managers…</p>}
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
          {isEdit ? 'Update Department' : 'Create Department'}
        </button>
      </div>
    </form>
  );
};

export default DepartmentForm;
