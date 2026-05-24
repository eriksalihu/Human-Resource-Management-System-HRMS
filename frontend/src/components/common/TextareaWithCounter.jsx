/**
 * @file frontend/src/components/common/TextareaWithCounter.jsx
 * @description Drop-in textarea with a live character-count indicator
 *   and warning-colour states as the input approaches its limit.
 * @author Dev B
 *
 * Why a wrapper component: the same counter pattern was duplicated
 * (or, more often, omitted entirely) across every form's notes /
 * description textarea. With this in one place every form gains the
 * counter by swapping `<textarea>` → `<TextareaWithCounter>`, and the
 * `maxLength` is enforced at the input level so users can't even paste
 * past the limit. Matches the backend's per-field caps (commit 284).
 *
 * Visual states (driven by remaining = max − value.length):
 *   - default → gray-500 (no risk)
 *   - approaching limit (< 10% remaining) → amber
 *   - at or over the limit → rose
 */

import { forwardRef } from 'react';

/** Below this fraction of remaining headroom we switch to a warning. */
const WARNING_THRESHOLD = 0.1;

/**
 * @param {Object} props
 * @param {string} props.value - Controlled textarea value
 * @param {number} props.maxLength - Hard limit; native `maxLength` is set
 *   too so users can't paste past it.
 * @param {string} [props.counterClassName] - Extra classes on the counter
 * @param {boolean} [props.hideCounter=false] - Hide the indicator (the
 *   underlying textarea still enforces maxLength)
 * @param {...*} rest - Forwarded to the underlying `<textarea>` (rows,
 *   onChange, className, placeholder, id, disabled, …)
 */
const TextareaWithCounter = forwardRef(function TextareaWithCounter(
  {
    value = '',
    maxLength,
    counterClassName = '',
    hideCounter = false,
    ...rest
  },
  ref
) {
  // Coerce to string defensively — controlled callers occasionally pass
  // `null` from an unfilled DB column.
  const text = value == null ? '' : String(value);
  const used = text.length;
  const remaining = Math.max(0, maxLength - used);

  let tone = 'text-gray-500';
  if (used >= maxLength) {
    tone = 'text-rose-600 font-medium';
  } else if (remaining <= Math.ceil(maxLength * WARNING_THRESHOLD)) {
    tone = 'text-amber-600';
  }

  return (
    <div>
      <textarea
        ref={ref}
        value={text}
        maxLength={maxLength}
        // The wrapper exposes everything else (onChange, className,
        // rows, placeholder, id, disabled, aria-*) untouched.
        {...rest}
      />
      {!hideCounter && (
        <div
          className={`mt-1 flex justify-end text-xs tabular-nums ${tone} ${counterClassName}`}
          aria-live="polite"
        >
          <span>
            {used} / {maxLength}
          </span>
        </div>
      )}
    </div>
  );
});

export default TextareaWithCounter;
