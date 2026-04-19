/**
 * @file frontend/src/components/employees/EmployeeForm.jsx
 * @description Employee create/edit form with cascading department → position dropdowns, user select, and manager select
 * @author Dev B
 */

import { useState, useEffect, useMemo } from 'react';
import axiosInstance from '../../api/axiosInstance';
import * as departmentApi from '../../api/departmentApi';
import * as positionApi from '../../api/positionApi';
import * as employeeApi from '../../api/employeeApi';
import LoadingSpinner from '../common/LoadingSpinner';

/** Contract-type options (values must match the lloji_kontrates ENUM). */
const CONTRACT_OPTIONS = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
];

/** Status options (values must match the statusi ENUM). */
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'terminated', label: 'Terminated' },
];

/**
 * EmployeeForm — controlled form for creating and updating employees.
 *
 * Fields:
 *  - user_id (select, only shown in create mode)
 *  - department_id (select) → drives the position_id dropdown (cascading)
 *  - position_id (select) — filtered to the chosen department
 *  - data_punesimit (date)
 *  - lloji_kontrates (select)
 *  - statusi (select, edit mode only)
 *  - menaxheri_id (select) — filtered to the chosen department
 *
 * @param {Object} props
 * @param {Object} [props.initialData] - Existing employee for edit mode
 * @param {Function} props.onSubmit
 * @param {Function} [props.onCancel]
 * @param {boolean} [props.submitting=false]
 * @returns {JSX.Element}
 */
const EmployeeForm = ({ initialData, onSubmit, onCancel, submitting = false }) => {
  const isEdit = Boolean(initialData?.id);

  const [formData, setFormData] = useState({
    user_id: initialData?.user_id ?? '',
    department_id: initialData?.department_id ?? '',
    position_id: initialData?.position_id ?? '',
    data_punesimit: initialData?.data_punesimit
      ? String(initialData.data_punesimit).slice(0, 10)
      : '',
    lloji_kontrates: initialData?.lloji_kontrates || 'full-time',
    statusi: initialData?.statusi || 'active',
    menaxheri_id: initialData?.menaxheri_id ?? '',
  });
  const [errors, setErrors] = useState({});

  // Reference data for dropdowns
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [managers, setManagers] = useState([]);

  const [loadingUsers, setLoadingUsers] = useState(!isEdit);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [loadingManagers, setLoadingManagers] = useState(false);

  /**
   * Load unassigned users (only needed in create mode — edit locks the user).
   */
  useEffect(() => {
    if (isEdit) return;
    const loadUsers = async () => {
      try {
        const { data } = await axiosInstance.get('/users', {
          params: { limit: 200 },
        });
        setUsers(data.data || []);
      } catch {
        setUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };
    loadUsers();
  }, [isEdit]);

  /**
   * Load all departments (once).
   */
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const result = await departmentApi.getAll({ limit: 100 });
        setDepartments(result.data || []);
      } catch {
        setDepartments([]);
      } finally {
        setLoadingDepartments(false);
      }
    };
    loadDepartments();
  }, []);

  /**
   * Load positions filtered by the selected department.
   * Clears position_id when the department changes (except initial edit).
   */
  useEffect(() => {
    const deptId = formData.department_id;
    if (!deptId) {
      setPositions([]);
      return;
    }
    const loadPositions = async () => {
      setLoadingPositions(true);
      try {
        const list = await positionApi.getByDepartment(deptId);
        setPositions(list || []);
        // If the current position_id doesn't belong to this department, clear it
        if (
          formData.position_id &&
          !list.some((p) => Number(p.id) === Number(formData.position_id))
        ) {
          setFormData((prev) => ({ ...prev, position_id: '' }));
        }
      } catch {
        setPositions([]);
      } finally {
        setLoadingPositions(false);
      }
    };
    loadPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.department_id]);

  /**
   * Load potential managers filtered by the selected department.
   * Excludes the current employee from the list (to prevent self-manager).
   */
  useEffect(() => {
    const deptId = formData.department_id;
    if (!deptId) {
      setManagers([]);
      return;
    }
    const loadManagers = async () => {
      setLoadingManagers(true);
      try {
        const result = await employeeApi.getAll({
          department_id: deptId,
          statusi: 'active',
          limit: 200,
        });
        const filtered = (result.data || []).filter(
          (m) => !isEdit || Number(m.id) !== Number(initialData?.id)
        );
        setManagers(filtered);
        // If the current manager is not in the new department, clear it
        if (
          formData.menaxheri_id &&
          !filtered.some((m) => Number(m.id) === Number(formData.menaxheri_id))
        ) {
          setFormData((prev) => ({ ...prev, menaxheri_id: '' }));
        }
      } catch {
        setManagers([]);
      } finally {
        setLoadingManagers(false);
      }
    };
    loadManagers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.department_id]);

  /**
   * Validate the form.
   * @returns {boolean}
   */
  const validate = () => {
    const newErrors = {};

    if (!isEdit && !formData.user_id) {
      newErrors.user_id = 'User account is required';
    }
    if (!formData.department_id) {
      newErrors.department_id = 'Department is required';
    }
    if (!formData.position_id) {
      newErrors.position_id = 'Position is required';
    }
    if (!formData.data_punesimit) {
      newErrors.data_punesimit = 'Hire date is required';
    } else {
      const d = new Date(formData.data_punesimit);
      if (Number.isNaN(d.getTime())) {
        newErrors.data_punesimit = 'Invalid date';
      }
    }
    if (!formData.lloji_kontrates) {
      newErrors.lloji_kontrates = 'Contract type is required';
    }
    if (
      formData.menaxheri_id &&
      isEdit &&
      Number(formData.menaxheri_id) === Number(initialData?.id)
    ) {
      newErrors.menaxheri_id = 'An employee cannot be their own manager';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Controlled input handler.
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
   * Submit handler — validate and hand a clean payload to the parent.
   * @param {React.FormEvent} e
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      department_id: Number(formData.department_id),
      position_id: Number(formData.position_id),
      data_punesimit: formData.data_punesimit,
      lloji_kontrates: formData.lloji_kontrates,
      menaxheri_id: formData.menaxheri_id ? Number(formData.menaxheri_id) : null,
    };

    if (!isEdit) {
      payload.user_id = Number(formData.user_id);
    }
    if (isEdit) {
      payload.statusi = formData.statusi;
    }

    onSubmit(payload);
  };

  const inputClass = (field) =>
    `w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
      errors[field] ? 'border-red-300 bg-red-50' : 'border-gray-300'
    }`;

  // Memoised display name helpers
  const renderUserOption = (u) =>
    `${u.first_name} ${u.last_name}${u.email ? ` — ${u.email}` : ''}`;

  const renderManagerOption = (m) =>
    `${m.first_name} ${m.last_name}${m.numri_punonjesit ? ` (${m.numri_punonjesit})` : ''}`;

  const positionOptions = useMemo(
    () =>
      positions.map((p) => ({
        id: p.id,
        label: `${p.emertimi}${p.niveli ? ` — ${p.niveli}` : ''}`,
      })),
    [positions]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* User account (create only) */}
      {!isEdit && (
        <div>
          <label htmlFor="user_id" className="block text-sm font-medium text-gray-700 mb-1">
            User account <span className="text-red-500">*</span>
          </label>
          <select
            id="user_id"
            name="user_id"
            value={formData.user_id}
            onChange={handleChange}
            className={inputClass('user_id')}
            disabled={submitting || loadingUsers}
          >
            <option value="">— Select a user —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {renderUserOption(u)}
              </option>
            ))}
          </select>
          {loadingUsers && <p className="mt-1 text-xs text-gray-500">Loading users…</p>}
          {errors.user_id && <p className="mt-1 text-xs text-red-600">{errors.user_id}</p>}
        </div>
      )}

      {/* Department + Position (cascading) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

        <div>
          <label htmlFor="position_id" className="block text-sm font-medium text-gray-700 mb-1">
            Position <span className="text-red-500">*</span>
          </label>
          <select
            id="position_id"
            name="position_id"
            value={formData.position_id}
            onChange={handleChange}
            className={inputClass('position_id')}
            disabled={submitting || !formData.department_id || loadingPositions}
          >
            <option value="">
              {!formData.department_id
                ? '— Select a department first —'
                : '— Select a position —'}
            </option>
            {positionOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {loadingPositions && (
            <p className="mt-1 text-xs text-gray-500">Loading positions…</p>
          )}
          {errors.position_id && (
            <p className="mt-1 text-xs text-red-600">{errors.position_id}</p>
          )}
        </div>
      </div>

      {/* Hire date + Contract type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="data_punesimit"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Hire date <span className="text-red-500">*</span>
          </label>
          <input
            id="data_punesimit"
            name="data_punesimit"
            type="date"
            value={formData.data_punesimit}
            onChange={handleChange}
            className={inputClass('data_punesimit')}
            disabled={submitting}
          />
          {errors.data_punesimit && (
            <p className="mt-1 text-xs text-red-600">{errors.data_punesimit}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="lloji_kontrates"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Contract type <span className="text-red-500">*</span>
          </label>
          <select
            id="lloji_kontrates"
            name="lloji_kontrates"
            value={formData.lloji_kontrates}
            onChange={handleChange}
            className={inputClass('lloji_kontrates')}
            disabled={submitting}
          >
            {CONTRACT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.lloji_kontrates && (
            <p className="mt-1 text-xs text-red-600">{errors.lloji_kontrates}</p>
          )}
        </div>
      </div>

      {/* Status (edit only) + Manager */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isEdit && (
          <div>
            <label htmlFor="statusi" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="statusi"
              name="statusi"
              value={formData.statusi}
              onChange={handleChange}
              className={inputClass('statusi')}
              disabled={submitting}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={isEdit ? '' : 'sm:col-span-2'}>
          <label htmlFor="menaxheri_id" className="block text-sm font-medium text-gray-700 mb-1">
            Direct manager
          </label>
          <select
            id="menaxheri_id"
            name="menaxheri_id"
            value={formData.menaxheri_id}
            onChange={handleChange}
            className={inputClass('menaxheri_id')}
            disabled={submitting || !formData.department_id || loadingManagers}
          >
            <option value="">— No manager assigned —</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {renderManagerOption(m)}
              </option>
            ))}
          </select>
          {loadingManagers && (
            <p className="mt-1 text-xs text-gray-500">Loading managers…</p>
          )}
          {errors.menaxheri_id && (
            <p className="mt-1 text-xs text-red-600">{errors.menaxheri_id}</p>
          )}
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
          {isEdit ? 'Update Employee' : 'Create Employee'}
        </button>
      </div>
    </form>
  );
};

export default EmployeeForm;
