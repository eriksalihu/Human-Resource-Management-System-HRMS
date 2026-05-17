/**
 * @file frontend/src/components/employees/EmployeeForm.jsx
 * @description Employee create/edit form. Create mode is a guided
 *   4-step wizard (User Account → Position & Department → Contract
 *   Details → Review); edit mode stays a single compact form.
 * @author Dev B
 *
 * v2 (commit 255) converts CREATE into a stepper:
 *   Step 1 — User Account     (which user becomes an employee)
 *   Step 2 — Position & Dept  (cascading department → position)
 *   Step 3 — Contract Details (hire date, contract type, manager)
 *   Step 4 — Review & Submit  (read-only recap before commit)
 *
 * Why edit mode stays single-form: editing is a quick targeted change
 * (usually status or manager), and forcing an editor through 4 steps to
 * flip one field is hostile. The roadmap scopes the wizard to create.
 *
 * The step logic is intentionally self-contained here. Commit 256
 * introduces a reusable <FormWizard> for future multi-step forms; this
 * component predates it and keeps its own lightweight stepper so the
 * two land independently.
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

/** Wizard step metadata (create mode). */
const STEPS = [
  { id: 1, label: 'User Account' },
  { id: 2, label: 'Position & Department' },
  { id: 3, label: 'Contract Details' },
  { id: 4, label: 'Review & Submit' },
];

/**
 * Step indicator — numbered circles + labels + connecting bar.
 *
 * @param {Object} props
 * @param {number} props.current - Active step id (1-based)
 * @returns {JSX.Element}
 */
const StepIndicator = ({ current }) => (
  <ol className="flex items-center w-full mb-6" aria-label="Progress">
    {STEPS.map((s, idx) => {
      const done = s.id < current;
      const active = s.id === current;
      return (
        <li
          key={s.id}
          className={`flex items-center ${
            idx < STEPS.length - 1 ? 'flex-1' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              aria-current={active ? 'step' : undefined}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                done
                  ? 'bg-indigo-600 text-white'
                  : active
                    ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {done ? (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                s.id
              )}
            </span>
            <span
              className={`hidden sm:block text-xs font-medium ${
                active ? 'text-indigo-700' : 'text-gray-500'
              }`}
            >
              {s.label}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <span
              aria-hidden="true"
              className={`mx-2 h-0.5 flex-1 rounded ${
                done ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            />
          )}
        </li>
      );
    })}
  </ol>
);

/**
 * EmployeeForm — controlled form for creating and updating employees.
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

  /** Wizard step (create mode only). Edit mode ignores this. */
  const [step, setStep] = useState(1);

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
   * Validate the fields belonging to a given wizard step. Edit mode
   * passes `step = null` to validate everything at once.
   *
   * @param {number|null} which - Step id, or null for "validate all"
   * @returns {boolean} true when the validated scope is error-free
   */
  const validateScope = (which) => {
    const e = {};

    const checkUser = () => {
      if (!isEdit && !formData.user_id) {
        e.user_id = 'User account is required';
      }
    };
    const checkPositionDept = () => {
      if (!formData.department_id) {
        e.department_id = 'Department is required';
      }
      if (!formData.position_id) {
        e.position_id = 'Position is required';
      }
    };
    const checkContract = () => {
      if (!formData.data_punesimit) {
        e.data_punesimit = 'Hire date is required';
      } else if (Number.isNaN(new Date(formData.data_punesimit).getTime())) {
        e.data_punesimit = 'Invalid date';
      }
      if (!formData.lloji_kontrates) {
        e.lloji_kontrates = 'Contract type is required';
      }
      if (
        formData.menaxheri_id &&
        isEdit &&
        Number(formData.menaxheri_id) === Number(initialData?.id)
      ) {
        e.menaxheri_id = 'An employee cannot be their own manager';
      }
    };

    if (which === 1) checkUser();
    else if (which === 2) checkPositionDept();
    else if (which === 3) checkContract();
    else {
      // null / 4 → validate everything (final submit / edit submit)
      checkUser();
      checkPositionDept();
      checkContract();
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /**
   * Controlled input handler.
   */
  const handleChange = (ev) => {
    const { name, value } = ev.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  /** Advance to the next step if the current one validates. */
  const goNext = () => {
    if (validateScope(step)) {
      setStep((s) => Math.min(STEPS.length, s + 1));
    }
  };

  /** Step back (no validation — going back never loses focus on errors). */
  const goBack = () => {
    setErrors({});
    setStep((s) => Math.max(1, s - 1));
  };

  /**
   * Build the API payload from the current form state.
   */
  const buildPayload = () => {
    const payload = {
      department_id: Number(formData.department_id),
      position_id: Number(formData.position_id),
      data_punesimit: formData.data_punesimit,
      lloji_kontrates: formData.lloji_kontrates,
      menaxheri_id: formData.menaxheri_id
        ? Number(formData.menaxheri_id)
        : null,
    };
    if (!isEdit) payload.user_id = Number(formData.user_id);
    if (isEdit) payload.statusi = formData.statusi;
    return payload;
  };

  /**
   * Submit handler — validate the full form, then hand a clean payload
   * to the parent.
   */
  const handleSubmit = (ev) => {
    ev.preventDefault();
    if (!validateScope(null)) return;
    onSubmit(buildPayload());
  };

  const inputClass = (field) =>
    `w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
      errors[field] ? 'border-red-300 bg-red-50' : 'border-gray-300'
    }`;

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

  /* ── Field group renderers (shared between wizard + edit) ────────── */

  const UserAccountFields = (
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
      <p className="mt-2 text-xs text-gray-500">
        Pick the user account this employee record will be linked to.
      </p>
    </div>
  );

  const PositionDeptFields = (
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
  );

  const ContractFields = (
    <>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
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
    </>
  );

  /** Read-only recap for the final wizard step. */
  const ReviewPanel = () => {
    const userLabel =
      users.find((u) => Number(u.id) === Number(formData.user_id)) || null;
    const deptLabel =
      departments.find(
        (d) => Number(d.id) === Number(formData.department_id)
      )?.emertimi || '—';
    const posLabel =
      positionOptions.find(
        (p) => Number(p.id) === Number(formData.position_id)
      )?.label || '—';
    const mgrLabel = formData.menaxheri_id
      ? renderManagerOption(
          managers.find(
            (m) => Number(m.id) === Number(formData.menaxheri_id)
          ) || {}
        )
      : 'No manager assigned';
    const contractLabel =
      CONTRACT_OPTIONS.find((c) => c.value === formData.lloji_kontrates)
        ?.label || formData.lloji_kontrates;

    const Row = ({ label, value }) => (
      <div className="flex justify-between gap-4 py-1.5 text-sm border-b border-gray-100 last:border-0">
        <dt className="text-gray-500">{label}</dt>
        <dd className="text-gray-900 font-medium text-right">{value}</dd>
      </div>
    );

    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
          Review the details before creating
        </p>
        <dl>
          <Row
            label="User account"
            value={userLabel ? renderUserOption(userLabel) : '—'}
          />
          <Row label="Department" value={deptLabel} />
          <Row label="Position" value={posLabel} />
          <Row label="Hire date" value={formData.data_punesimit || '—'} />
          <Row label="Contract" value={contractLabel} />
          <Row label="Direct manager" value={mgrLabel} />
        </dl>
      </div>
    );
  };

  /* ── Edit mode: single compact form (unchanged UX) ───────────────── */
  if (isEdit) {
    return (
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {PositionDeptFields}
        {ContractFields}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
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
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting && <LoadingSpinner size="sm" color="white" />}
            Update Employee
          </button>
        </div>
      </form>
    );
  }

  /* ── Create mode: 4-step wizard ──────────────────────────────────── */
  const isLastStep = step === STEPS.length;

  return (
    <form onSubmit={handleSubmit} className="space-y-2" noValidate>
      <StepIndicator current={step} />

      <div className="min-h-[180px]">
        {step === 1 && UserAccountFields}
        {step === 2 && PositionDeptFields}
        {step === 3 && ContractFields}
        {step === 4 && <ReviewPanel />}
      </div>

      {/* Wizard nav — Back / Next / Create. flex-col-reverse keeps the
          primary action on top on mobile. */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={step === 1 ? onCancel : goBack}
          disabled={submitting || (step === 1 && !onCancel)}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden sm:block text-xs text-gray-400">
            Step {step} of {STEPS.length}
          </span>
          {isLastStep ? (
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting && <LoadingSpinner size="sm" color="white" />}
              Create Employee
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
            >
              Next
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </form>
  );
};

export default EmployeeForm;
