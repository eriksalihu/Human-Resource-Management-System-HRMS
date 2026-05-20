/**
 * @file frontend/src/components/trainings/TrainingForm.jsx
 * @description Training form with title, description, trainer, dates, location, capacity inputs and end > start validation
 * @author Dev B
 */

import { useState, useMemo } from 'react';
import TextareaWithCounter from '../common/TextareaWithCounter';

/** Status options must match Trainings.statusi ENUM. */
const STATUS_OPTIONS = [
  { value: 'upcoming',  label: 'Upcoming' },
  { value: 'ongoing',   label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** ISO YYYY-MM-DD for today (server-local). */
/**
 * Local-timezone "today" as YYYY-MM-DD. `toISOString()` is UTC, which
 * shifted the default training start/end dates by a day for users at a
 * UTC offset; build from local date parts instead.
 */
const todayIso = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

/**
 * Calculate the duration in days (inclusive) between two YYYY-MM-DD dates.
 * Returns 0 when either is missing or the range is inverted.
 */
const durationDays = (start, end) => {
  if (!start || !end) return 0;
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  return Math.floor((b - a) / (1000 * 60 * 60 * 24)) + 1;
};

/**
 * TrainingForm — create / edit a training. Validates that end date is on
 * or after start, capacity is a positive integer, and required fields
 * are present before allowing submission.
 *
 * @param {Object} props
 * @param {Object} [props.initialData] - If provided, runs in edit mode
 * @param {Function} props.onSubmit - Receives the payload
 * @param {Function} props.onCancel
 * @param {boolean} [props.submitting=false]
 * @returns {JSX.Element}
 */
const TrainingForm = ({
  initialData = null,
  onSubmit,
  onCancel,
  submitting = false,
}) => {
  const isEdit = Boolean(initialData?.id);

  const [form, setForm] = useState({
    titulli: initialData?.titulli || '',
    pershkrimi: initialData?.pershkrimi || '',
    trajner: initialData?.trajner || '',
    data_fillimit: initialData?.data_fillimit
      ? String(initialData.data_fillimit).slice(0, 10)
      : todayIso(),
    data_perfundimit: initialData?.data_perfundimit
      ? String(initialData.data_perfundimit).slice(0, 10)
      : todayIso(),
    lokacioni: initialData?.lokacioni || '',
    kapaciteti: initialData?.kapaciteti != null
      ? String(initialData.kapaciteti)
      : '20',
    statusi: initialData?.statusi || 'upcoming',
  });

  const [errors, setErrors] = useState({});

  /** Live duration preview shown next to the date inputs. */
  const duration = useMemo(
    () => durationDays(form.data_fillimit, form.data_perfundimit),
    [form.data_fillimit, form.data_perfundimit]
  );

  /** Currently-enrolled count, used as a floor on capacity in edit mode. */
  const currentEnrolled = Number(initialData?.participant_count || 0);

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

  /**
   * Validate the form mirroring server invariants. Capacity must be at
   * least the current enrolled count when editing — the server enforces
   * this too, but we want immediate feedback.
   */
  const validate = () => {
    const next = {};

    if (!form.titulli?.trim()) {
      next.titulli = 'Title is required';
    } else if (form.titulli.length > 200) {
      next.titulli = 'Title must be at most 200 characters';
    }

    if (!form.data_fillimit) {
      next.data_fillimit = 'Start date is required';
    }
    if (!form.data_perfundimit) {
      next.data_perfundimit = 'End date is required';
    }
    if (
      form.data_fillimit &&
      form.data_perfundimit &&
      form.data_perfundimit < form.data_fillimit
    ) {
      next.data_perfundimit = 'End date cannot be before start date';
    }

    const cap = Number(form.kapaciteti);
    if (!Number.isFinite(cap) || cap < 1) {
      next.kapaciteti = 'Capacity must be a positive integer';
    } else if (!Number.isInteger(cap)) {
      next.kapaciteti = 'Capacity must be a whole number';
    } else if (isEdit && cap < currentEnrolled) {
      next.kapaciteti = `Capacity cannot be below current enrolled count (${currentEnrolled})`;
    }

    if (!STATUS_OPTIONS.map((o) => o.value).includes(form.statusi)) {
      next.statusi = 'Invalid status';
    }

    return next;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = {
      titulli: form.titulli.trim(),
      pershkrimi: form.pershkrimi?.trim() || undefined,
      trajner: form.trajner?.trim() || undefined,
      data_fillimit: form.data_fillimit,
      data_perfundimit: form.data_perfundimit,
      lokacioni: form.lokacioni?.trim() || undefined,
      kapaciteti: Number(form.kapaciteti),
      statusi: form.statusi,
    };

    onSubmit?.(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <div>
        <label
          htmlFor="titulli"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="titulli"
          value={form.titulli}
          onChange={handleChange('titulli')}
          placeholder="e.g. Advanced React Patterns"
          maxLength={200}
          className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
            errors.titulli
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300'
          }`}
        />
        {errors.titulli && (
          <p className="mt-1 text-xs text-red-600">{errors.titulli}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="pershkrimi"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Description
        </label>
        <TextareaWithCounter
          id="pershkrimi"
          rows={4}
          value={form.pershkrimi}
          onChange={handleChange('pershkrimi')}
          maxLength={5000}
          placeholder="What participants will learn, prerequisites, expected outcomes…"
          className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
        />
      </div>

      {/* Trainer + Location */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="trajner"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Trainer
          </label>
          <input
            type="text"
            id="trajner"
            value={form.trajner}
            onChange={handleChange('trajner')}
            placeholder="Internal lead or external partner"
            className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="lokacioni"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Location
          </label>
          <input
            type="text"
            id="lokacioni"
            value={form.lokacioni}
            onChange={handleChange('lokacioni')}
            placeholder="e.g. Conference room A, or Remote"
            className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          />
        </div>
      </div>

      {/* Dates */}
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
            min={form.data_fillimit || undefined}
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

      {/* Duration preview */}
      {duration > 0 && (
        <div className="rounded-md bg-indigo-50 border border-indigo-100 p-3 text-sm text-indigo-900">
          Duration: <span className="font-semibold">{duration}</span> day
          {duration === 1 ? '' : 's'}
        </div>
      )}

      {/* Capacity + Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="kapaciteti"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Capacity <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            id="kapaciteti"
            value={form.kapaciteti}
            onChange={handleChange('kapaciteti')}
            min={isEdit ? Math.max(1, currentEnrolled) : 1}
            step="1"
            className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
              errors.kapaciteti
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300'
            }`}
          />
          {isEdit && currentEnrolled > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              Currently enrolled: {currentEnrolled}
            </p>
          )}
          {errors.kapaciteti && (
            <p className="mt-1 text-xs text-red-600">{errors.kapaciteti}</p>
          )}
        </div>
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
              : 'Creating…'
            : isEdit
              ? 'Save changes'
              : 'Create training'}
        </button>
      </div>
    </form>
  );
};

export default TrainingForm;
