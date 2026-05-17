/**
 * @file frontend/src/components/common/FormWizard.jsx
 * @description Reusable multi-step form wizard — numbered step
 *   indicators, progress bar, Back/Next/Submit navigation with
 *   per-step validation, and a final submit action.
 * @author Dev B
 *
 * This generalizes the bespoke stepper baked into EmployeeForm
 * (commit 255) so other multi-step flows (employee onboarding wizard,
 * payroll run setup, etc.) don't each re-implement step state +
 * indicator + nav.
 *
 * Contract:
 *   - `steps` is an array of `{ key, label, render, validate? }`.
 *   - `render(ctx)` returns the step's fields. `ctx` carries
 *     `{ goNext, goBack, isFirst, isLast, currentStep }` so a step can
 *     drive navigation from inside its own UI if it wants.
 *   - `validate()` (optional, per step) returns `true` to allow
 *     advancing, or `false` to block. Async validators are awaited, so
 *     a step can do a server check before letting the user proceed.
 *   - `onComplete()` fires when the user submits on the final step
 *     (after that step's validator passes).
 *
 * The wizard is intentionally state-light: it owns only the current
 * step index. Form values live in the caller (lifted state) so the
 * wizard stays presentation + flow control, not a data store.
 */

import { useState, useCallback } from 'react';

/**
 * Numbered step rail with a connecting progress bar. Completed steps
 * collapse to a checkmark; the active step is ringed.
 *
 * @param {Object} props
 * @param {Array<{key:string,label:string}>} props.steps
 * @param {number} props.current - Active index (0-based)
 * @returns {JSX.Element}
 */
const StepRail = ({ steps, current }) => (
  <ol className="flex items-center w-full mb-6" aria-label="Progress">
    {steps.map((s, idx) => {
      const done = idx < current;
      const active = idx === current;
      return (
        <li
          key={s.key}
          className={`flex items-center ${
            idx < steps.length - 1 ? 'flex-1' : ''
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
                idx + 1
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
          {idx < steps.length - 1 && (
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
 * FormWizard — orchestrates step flow + navigation chrome.
 *
 * @param {Object} props
 * @param {Array<{
 *   key: string,
 *   label: string,
 *   render: (ctx: Object) => React.ReactNode,
 *   validate?: () => boolean | Promise<boolean>
 * }>} props.steps
 * @param {() => void | Promise<void>} props.onComplete - Final submit
 * @param {() => void} [props.onCancel] - Back on the first step
 * @param {boolean} [props.submitting=false] - Disables nav + shows
 *   pending state on the submit button
 * @param {string} [props.submitLabel='Submit']
 * @param {string} [props.className]
 * @returns {JSX.Element}
 */
const FormWizard = ({
  steps,
  onComplete,
  onCancel,
  submitting = false,
  submitLabel = 'Submit',
  className = '',
}) => {
  const [current, setCurrent] = useState(0);
  const [validating, setValidating] = useState(false);

  const isFirst = current === 0;
  const isLast = current === steps.length - 1;
  const step = steps[current];

  /** Run the active step's validator (sync or async). */
  const runValidate = useCallback(async () => {
    if (typeof step?.validate !== 'function') return true;
    setValidating(true);
    try {
      return await step.validate();
    } finally {
      setValidating(false);
    }
  }, [step]);

  const goBack = useCallback(() => {
    if (isFirst) {
      onCancel?.();
      return;
    }
    setCurrent((c) => Math.max(0, c - 1));
  }, [isFirst, onCancel]);

  const goNext = useCallback(async () => {
    const ok = await runValidate();
    if (!ok) return;
    if (isLast) {
      await onComplete?.();
      return;
    }
    setCurrent((c) => Math.min(steps.length - 1, c + 1));
  }, [runValidate, isLast, onComplete, steps.length]);

  // Passed into each step's render so it can self-drive navigation.
  const ctx = {
    goNext,
    goBack,
    isFirst,
    isLast,
    currentStep: current,
    totalSteps: steps.length,
  };

  const navBusy = submitting || validating;

  return (
    <div className={`space-y-2 ${className}`}>
      <StepRail steps={steps} current={current} />

      <div className="min-h-[180px]">{step?.render(ctx)}</div>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={goBack}
          disabled={navBusy || (isFirst && !onCancel)}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
        >
          {isFirst ? 'Cancel' : 'Back'}
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden sm:block text-xs text-gray-400">
            Step {current + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={navBusy}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLast ? (
              submitLabel
            ) : (
              <>
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
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FormWizard;
