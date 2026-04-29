/**
 * @file frontend/src/components/trainings/ParticipantForm.jsx
 * @description HR enrollment form — search-driven employee picker, status dropdown, and capacity validation before enrolling
 * @author Dev B
 *
 * This is the HR / Admin "enroll someone else" flow. End-users use the
 * "Enroll me" button on TrainingDetail; this form handles the case where
 * HR is bulk-enrolling employees on behalf of someone.
 */

import { useState, useEffect, useMemo } from 'react';
import * as employeeApi from '../../api/employeeApi';

/** Status options must match TrainingParticipants.statusi ENUM. */
const STATUS_OPTIONS = [
  { value: 'enrolled',  label: 'Enrolled' },
  { value: 'completed', label: 'Completed' },
  { value: 'dropped',   label: 'Dropped' },
  { value: 'no-show',   label: 'No-show' },
];

/**
 * ParticipantForm — search and select an employee to enroll in a training.
 *
 * Features:
 *   - Type-to-filter employee picker (name / employee number / department)
 *   - Excludes employees already on the training's roster
 *   - Surfaces capacity at the top so HR can't enroll past capacity
 *   - Status dropdown for HR to set initial state (rare — usually 'enrolled')
 *
 * @param {Object} props
 * @param {Object} props.training - The training row (titulli, kapaciteti, participant_count)
 * @param {Array}  [props.existingParticipants=[]] - Roster, used to filter the picker
 * @param {Function} props.onSubmit - Called with { employee_id, statusi }
 * @param {Function} props.onCancel
 * @param {boolean} [props.submitting=false]
 * @returns {JSX.Element}
 */
const ParticipantForm = ({
  training,
  existingParticipants = [],
  onSubmit,
  onCancel,
  submitting = false,
}) => {
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [statusi, setStatusi] = useState('enrolled');
  const [errors, setErrors] = useState({});

  /** Pre-compute the set of already-enrolled employee IDs. */
  const enrolledIds = useMemo(
    () =>
      new Set(
        (existingParticipants || []).map((p) => Number(p.employee_id))
      ),
    [existingParticipants]
  );

  /** Capacity context — drives the "is full?" badge and submit gate. */
  const taken = Number(training?.participant_count) || 0;
  const total = Number(training?.kapaciteti) || 0;
  const isFull = total > 0 && taken >= total;
  const remainingSeats = total > 0 ? Math.max(0, total - taken) : Infinity;

  /** Load active employees once for the picker. */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingEmployees(true);
      try {
        const result = await employeeApi.getAll({
          limit: 200,
          statusi: 'active',
        });
        if (!cancelled) setEmployees(result.data || []);
      } catch {
        if (!cancelled) setEmployees([]);
      } finally {
        if (!cancelled) setLoadingEmployees(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Filter employees by search query, excluding anyone already enrolled.
   * Match is case-insensitive over first/last name, employee number, and
   * department name.
   */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (enrolledIds.has(Number(e.id))) return false;
      if (!q) return true;
      const haystack = [
        e.first_name,
        e.last_name,
        e.numri_punonjesit,
        e.department_emertimi,
        e.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [employees, search, enrolledIds]);

  /** Whichever employee is currently selected (full row, not just id). */
  const selectedEmployee = useMemo(
    () => employees.find((e) => Number(e.id) === Number(selectedId)) || null,
    [employees, selectedId]
  );

  /** Validate before submit. */
  const validate = () => {
    const next = {};

    if (!selectedId) {
      next.selectedId = 'Pick an employee to enroll';
    }
    if (!STATUS_OPTIONS.map((o) => o.value).includes(statusi)) {
      next.statusi = 'Invalid status';
    }
    if (statusi === 'enrolled' && isFull) {
      next.capacity = 'Training is full — cannot add another enrolled participant';
    }

    return next;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSubmit?.({
      employee_id: Number(selectedId),
      statusi,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Capacity banner */}
      <div
        className={`rounded-md p-3 text-sm ring-1 ring-inset ${
          isFull
            ? 'bg-red-50 ring-red-200 text-red-900'
            : remainingSeats <= 3
              ? 'bg-amber-50 ring-amber-200 text-amber-900'
              : 'bg-emerald-50 ring-emerald-200 text-emerald-900'
        }`}
      >
        <p className="font-medium">{training?.titulli || 'Training'}</p>
        <p className="mt-0.5">
          {total > 0 ? (
            <>
              {taken} / {total} enrolled —{' '}
              <span className="font-semibold">
                {isFull
                  ? 'capacity reached'
                  : `${remainingSeats} seat${remainingSeats === 1 ? '' : 's'} remaining`}
              </span>
            </>
          ) : (
            <>{taken} enrolled (no capacity limit set)</>
          )}
        </p>
      </div>

      {/* Search */}
      <div>
        <label
          htmlFor="participant-search"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Search employees
        </label>
        <input
          type="search"
          id="participant-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, employee number, or department"
          className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          {loadingEmployees
            ? 'Loading employees…'
            : `${filtered.length} match${filtered.length === 1 ? '' : 'es'}${
                enrolledIds.size > 0
                  ? ` · ${enrolledIds.size} already enrolled (hidden)`
                  : ''
              }`}
        </p>
      </div>

      {/* Picker (radio list) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Employee <span className="text-red-500">*</span>
        </label>
        {loadingEmployees ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">
            {search
              ? 'No matches — try a different search term'
              : 'No active employees available to enroll'}
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label="Pick employee to enroll"
            className={`max-h-64 overflow-y-auto rounded-md border ${
              errors.selectedId ? 'border-red-300' : 'border-gray-200'
            } divide-y divide-gray-100 bg-white`}
          >
            {filtered.map((e) => {
              const isSelected = String(selectedId) === String(e.id);
              return (
                <label
                  key={e.id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                    isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="participant_employee"
                    value={e.id}
                    checked={isSelected}
                    onChange={() => {
                      setSelectedId(String(e.id));
                      if (errors.selectedId) {
                        setErrors((prev) => {
                          const { selectedId: _o, ...rest } = prev;
                          return rest;
                        });
                      }
                    }}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {e.first_name} {e.last_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {e.numri_punonjesit ? `${e.numri_punonjesit} · ` : ''}
                      {e.department_emertimi || '—'}
                      {e.position_emertimi ? ` · ${e.position_emertimi}` : ''}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
        {errors.selectedId && (
          <p className="mt-1 text-xs text-red-600">{errors.selectedId}</p>
        )}
      </div>

      {/* Status */}
      <div>
        <label
          htmlFor="statusi"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Initial status <span className="text-red-500">*</span>
        </label>
        <select
          id="statusi"
          value={statusi}
          onChange={(e) => setStatusi(e.target.value)}
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
        <p className="mt-1 text-xs text-gray-500">
          Most enrollments use "Enrolled". Use the others to back-fill historical
          records or correct mistakes.
        </p>
        {errors.statusi && (
          <p className="mt-1 text-xs text-red-600">{errors.statusi}</p>
        )}
      </div>

      {/* Capacity error (separate from status / picker) */}
      {errors.capacity && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-900">
          {errors.capacity}
        </div>
      )}

      {/* Selection preview */}
      {selectedEmployee && (
        <div className="rounded-md bg-indigo-50 border border-indigo-100 p-3 text-sm text-indigo-900">
          <p className="font-medium">
            About to enroll: {selectedEmployee.first_name}{' '}
            {selectedEmployee.last_name}
          </p>
          <p className="text-xs text-indigo-800/80 mt-0.5">
            {selectedEmployee.numri_punonjesit
              ? `${selectedEmployee.numri_punonjesit} · `
              : ''}
            {selectedEmployee.department_emertimi || '—'}
          </p>
        </div>
      )}

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
          disabled={
            submitting ||
            !selectedId ||
            (statusi === 'enrolled' && isFull)
          }
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {submitting ? 'Enrolling…' : 'Enroll participant'}
        </button>
      </div>
    </form>
  );
};

export default ParticipantForm;
