/**
 * @file frontend/src/utils/formatters.js
 * @description Shared formatting utilities — currency, dates, relative time, phone numbers, text helpers
 * @author Dev A
 *
 * These helpers were inlined across many components during early
 * development. Centralising them keeps display semantics consistent
 * (e.g. €1,234.56 vs €1234,56 vs €1,234) and gives us one place to
 * adjust locale rules later.
 *
 * Every function is defensive: invalid / null / undefined inputs return a
 * sensible placeholder instead of throwing, so callers can pass server
 * data straight in without optional-chaining-and-default plumbing.
 */

/* ──────────────────────────────────────────────────────────────────── */
/* Currency                                                              */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Format a numeric amount as a currency string. Defaults to EUR with
 * comma thousands separators and two decimal places (matches the salary
 * pages elsewhere in the app).
 *
 * @param {number|string|null|undefined} value
 * @param {Object} [options]
 * @param {string} [options.currency='EUR'] - ISO-4217 code (EUR, USD, …)
 * @param {string} [options.locale='en-US']
 * @param {number} [options.minimumFractionDigits=2]
 * @param {number} [options.maximumFractionDigits=2]
 * @param {boolean} [options.compact=false] - 1234 → €1.2k, 1234567 → €1.23M
 * @returns {string}
 */
export const formatCurrency = (value, options = {}) => {
  const {
    currency = 'EUR',
    locale = 'en-US',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    compact = false,
  } = options;

  if (value == null || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';

  if (compact) {
    if (Math.abs(num) >= 1_000_000) {
      return `${currencySymbol(currency, locale)}${(num / 1_000_000).toFixed(2)}M`;
    }
    if (Math.abs(num) >= 1_000) {
      return `${currencySymbol(currency, locale)}${(num / 1_000).toFixed(1)}k`;
    }
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(num);
  } catch {
    // Fallback when the locale rejects the currency code.
    return `${currencySymbol(currency)}${num.toFixed(maximumFractionDigits)}`;
  }
};

/** Resolve a currency symbol for compact mode. Internal helper. */
const currencySymbol = (currency, locale = 'en-US') => {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === 'currency');
    return sym ? sym.value : '€';
  } catch {
    return '€';
  }
};

/* ──────────────────────────────────────────────────────────────────── */
/* Dates                                                                 */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Best-effort Date parser — accepts a Date, ISO string, or timestamp number.
 * Returns null when the input can't be coerced to a valid Date.
 *
 * @param {Date|string|number|null|undefined} value
 * @returns {Date|null}
 */
const parseDate = (value) => {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Format a date as DD/MM/YYYY (default, en-GB convention used elsewhere in
 * the app). Override `format` to switch.
 *
 * @param {Date|string|number|null|undefined} value
 * @param {Object} [options]
 * @param {string} [options.locale='en-GB']
 * @param {'short'|'medium'|'long'} [options.format='short'] - 'short' → DD/MM/YYYY,
 *   'medium' → 23 Apr 2026, 'long' → 23 April 2026
 * @returns {string}
 */
export const formatDate = (value, options = {}) => {
  const { locale = 'en-GB', format = 'short' } = options;
  const d = parseDate(value);
  if (!d) return '—';

  if (format === 'short') {
    return d.toLocaleDateString(locale);
  }
  if (format === 'medium') {
    return d.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

/**
 * Format a datetime as DD/MM/YYYY HH:MM. Override `withSeconds` for HH:MM:SS.
 *
 * @param {Date|string|number|null|undefined} value
 * @param {Object} [options]
 * @param {string} [options.locale='en-GB']
 * @param {boolean} [options.withSeconds=false]
 * @returns {string}
 */
export const formatDateTime = (value, options = {}) => {
  const { locale = 'en-GB', withSeconds = false } = options;
  const d = parseDate(value);
  if (!d) return '—';

  const fmt = d
    .toLocaleString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {}),
    })
    .replace(',', '');
  return fmt;
};

/**
 * Format an ISO time-of-day (`HH:MM:SS` or `HH:MM`) as `HH:MM`.
 * Returns "—" for missing / malformed inputs.
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
export const formatTime = (value) => {
  if (!value) return '—';
  const str = String(value);
  if (str.length < 5) return str;
  return str.slice(0, 5);
};

/**
 * Compute a relative-time label like "5 min ago", "3h ago", "2d ago".
 * Falls back to a short date when the difference exceeds 30 days.
 *
 * @param {Date|string|number|null|undefined} value
 * @param {Object} [options]
 * @param {string} [options.locale='en-GB'] - Used for the date fallback
 * @param {Date} [options.now=new Date()] - Override "now" (handy for tests)
 * @returns {string}
 */
export const formatRelativeTime = (value, options = {}) => {
  const { locale = 'en-GB', now = new Date() } = options;
  const d = parseDate(value);
  if (!d) return '—';

  const diffMs = now.getTime() - d.getTime();
  const future = diffMs < 0;
  const diffSec = Math.round(Math.abs(diffMs) / 1000);

  const phrase = (n, unit) =>
    future
      ? `in ${n} ${unit}${n === 1 ? '' : 's'}`
      : `${n} ${unit}${n === 1 ? '' : 's'} ago`;

  if (diffSec < 30) return future ? 'in a moment' : 'just now';
  if (diffSec < 60) return phrase(diffSec, 'sec');

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return phrase(diffMin, 'min');

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return phrase(diffHr, 'hour');

  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return phrase(diffDay, 'day');

  return d.toLocaleDateString(locale);
};

/* ──────────────────────────────────────────────────────────────────── */
/* Phone numbers                                                         */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Lightweight phone-number formatter. Doesn't try to be a full E.164
 * library — keeps existing leading "+" if present and groups remaining
 * digits in 3-character chunks for readability.
 *
 * Examples:
 *   "+38344123456"  → "+383 44 123 456"
 *   "044123456"     → "044 123 456"
 *   "tel:abc"       → "—"
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
export const formatPhoneNumber = (value) => {
  if (value == null || value === '') return '—';
  const str = String(value).trim();
  if (!str) return '—';

  // Drop everything that isn't a digit or leading "+".
  const hasPlus = str.startsWith('+');
  const digits = str.replace(/\D+/g, '');
  if (!digits) return '—';

  // Country-code-aware split for the common Albania/Kosovo pattern
  // "+383 44 123 456": keep first 3 digits as country code if "+" was
  // present, then chunk the rest by 2-3-3.
  if (hasPlus && digits.length >= 9) {
    const cc = digits.slice(0, 3);
    const op = digits.slice(3, 5);
    const tail = digits.slice(5);
    const grouped = tail.replace(/(\d{3})(?=\d)/g, '$1 ');
    return `+${cc} ${op} ${grouped}`.trim();
  }

  // Default: chunk by 3 from the right.
  const grouped = digits.replace(/(\d{1,3})(?=(\d{3})+$)/g, '$1 ');
  return hasPlus ? `+${grouped}` : grouped;
};

/* ──────────────────────────────────────────────────────────────────── */
/* Text                                                                  */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Capitalize the first letter of a string. Leaves the rest of the string
 * untouched (so "iPhone" stays "iPhone", not "IPhone").
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
export const capitalizeFirst = (value) => {
  if (value == null) return '';
  const str = String(value);
  if (str.length === 0) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Truncate a string to `length` characters, appending an ellipsis when
 * truncation actually happens. Honors word boundaries when `wholeWord` is
 * true so we don't cut mid-word.
 *
 * @param {string|null|undefined} value
 * @param {number} [length=50]
 * @param {Object} [options]
 * @param {string} [options.suffix='…']
 * @param {boolean} [options.wholeWord=false]
 * @returns {string}
 */
export const truncateText = (value, length = 50, options = {}) => {
  const { suffix = '…', wholeWord = false } = options;
  if (value == null) return '';
  const str = String(value);
  if (str.length <= length) return str;

  let cut = str.slice(0, length);
  if (wholeWord) {
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 0) cut = cut.slice(0, lastSpace);
  }
  return `${cut.trimEnd()}${suffix}`;
};

/**
 * Default export bundles every formatter for callers who prefer
 * `import fmt from '../utils/formatters'` over named imports.
 */
export default {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatTime,
  formatRelativeTime,
  formatPhoneNumber,
  capitalizeFirst,
  truncateText,
};
