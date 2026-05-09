/**
 * @file frontend/src/components/common/PasswordStrengthMeter.jsx
 * @description Visual password strength meter — color-coded segmented bar, plain-language label, and per-rule checklist (length / uppercase / lowercase / digit / special)
 * @author Dev B
 *
 * Backed by `passwordStrengthScore` from `utils/validators.js` so the
 * scoring matches every other place we evaluate passwords (UserForm,
 * ProfileSettings, RegisterForm). Five rules → 0..5 score → 6 visual
 * tones (empty plus 5 strength buckets).
 *
 * The component is presentational. The parent owns the password value;
 * we render a meter for whatever string they pass in. No state, no
 * side-effects — re-mounts cleanly across forms.
 */

import { useMemo } from 'react';
import { passwordStrengthScore } from '../../utils/validators';

/** Per-score visual tones. Index = score (0..5). */
const STRENGTH_TONES = [
  { label: 'Empty',  bar: 'bg-gray-200',     text: 'text-gray-500'    },
  { label: 'Weak',   bar: 'bg-rose-500',     text: 'text-rose-700'    },
  { label: 'Weak',   bar: 'bg-rose-500',     text: 'text-rose-700'    },
  { label: 'Fair',   bar: 'bg-amber-500',    text: 'text-amber-700'   },
  { label: 'Good',   bar: 'bg-emerald-500',  text: 'text-emerald-700' },
  { label: 'Strong', bar: 'bg-emerald-600',  text: 'text-emerald-800' },
];

/** Per-rule label + predicate. The order maps to the scoring order. */
const RULES = [
  {
    key: 'length',
    label: 'At least 8 characters',
    test: (pw) => typeof pw === 'string' && pw.length >= 8,
  },
  {
    key: 'uppercase',
    label: 'An uppercase letter',
    test: (pw) => /[A-Z]/.test(pw || ''),
  },
  {
    key: 'lowercase',
    label: 'A lowercase letter',
    test: (pw) => /[a-z]/.test(pw || ''),
  },
  {
    key: 'digit',
    label: 'A number',
    test: (pw) => /[0-9]/.test(pw || ''),
  },
  {
    key: 'special',
    label: 'A special character (e.g. !@#$%)',
    test: (pw) => /[^A-Za-z0-9]/.test(pw || ''),
  },
];

/**
 * PasswordStrengthMeter — segmented bar + score label + per-rule checklist.
 *
 * @param {Object} props
 * @param {string} props.password - The current password value
 * @param {boolean} [props.showChecklist=true] - Render the per-rule list
 * @param {boolean} [props.showLabel=true] - Render the strength-label text
 * @param {string} [props.id] - Used for `aria-describedby` on the input
 *   that drives this meter (so screen readers announce the score)
 * @param {string} [props.className] - Wrapper class additions
 * @returns {JSX.Element}
 */
const PasswordStrengthMeter = ({
  password = '',
  showChecklist = true,
  showLabel = true,
  id,
  className = '',
}) => {
  const score = passwordStrengthScore(password);
  const tone = STRENGTH_TONES[score] || STRENGTH_TONES[0];

  /**
   * Per-rule status. Memoized so a re-render with the same password
   * doesn't re-evaluate every regex.
   */
  const ruleStatus = useMemo(
    () =>
      RULES.map((rule) => ({
        key: rule.key,
        label: rule.label,
        passed: rule.test(password),
      })),
    [password]
  );

  /** Width of the visual bar (0..100). Scaled out of 5 segments. */
  const widthPct = (score / 5) * 100;

  /** Number of "filled" segments — used by the segmented variant. */
  const filledSegments = score;

  return (
    <div
      id={id}
      className={`space-y-1.5 ${className}`}
      aria-live="polite"
      aria-atomic="true"
    >
      {/* Segmented bar — five distinct chunks so the user can see exactly
          how many rules are passing without parsing a single coloured fill. */}
      <div className="flex items-center gap-2">
        <div
          className="flex flex-1 gap-1"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={5}
          aria-valuenow={score}
          aria-label="Password strength"
        >
          {[1, 2, 3, 4, 5].map((segment) => (
            <div
              key={segment}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-150 ${
                segment <= filledSegments ? tone.bar : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        {showLabel && (
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide w-12 text-right tabular-nums ${tone.text} dark:opacity-90`}
            aria-hidden="true"
          >
            {password ? tone.label : '—'}
          </span>
        )}
      </div>

      {/* Continuous-fill bar variant (mirrors the segmented one for visual
          richness on browsers that don't render thin gaps cleanly). */}
      <div className="h-1 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div
          className={`h-1 rounded-full transition-all duration-200 ${tone.bar}`}
          style={{ width: `${password ? widthPct : 0}%` }}
        />
      </div>

      {/* Per-rule checklist — green check / muted dash */}
      {showChecklist && (
        <ul className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
          {ruleStatus.map((rule) => (
            <li
              key={rule.key}
              className={`flex items-center gap-1.5 ${
                rule.passed
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {rule.passed ? (
                <svg
                  className="h-3 w-3 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
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
                <svg
                  className="h-3 w-3 shrink-0 opacity-60"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12h14"
                  />
                </svg>
              )}
              <span>{rule.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PasswordStrengthMeter;
