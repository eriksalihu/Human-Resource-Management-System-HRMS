/**
 * @file frontend/src/utils/security.jsx
 * @description Client-side XSS guards — HTML escape, link sanitization, and `<SafeText/>` for rendering user-controlled multi-line content with paragraph + URL handling
 * @author Dev B
 *
 * React already escapes JSX text by default — `<p>{userInput}</p>` is
 * always safe. The remaining hazards are:
 *
 *   1. `dangerouslySetInnerHTML` consumers (none today, but future
 *      rich-text features will need a real sanitizer)
 *   2. URLs accepted from user input that flow into `href` /
 *      `src` attributes — `javascript:`-prefixed URLs are an XSS vector
 *      that React does NOT escape automatically
 *   3. Multi-line freeform content (notes, reasons, descriptions)
 *      where rendering must preserve newlines without enabling HTML
 *
 * This module covers (1) and (2) without pulling in DOMPurify; the
 * server's `sanitize.js` middleware (Day 37 commit 198) handles
 * inbound payloads. For (3), see the `<SafeText/>` helper below.
 */

/**
 * HTML entity map — same set used by the backend's sanitize middleware
 * so server- and client-escaped strings render identically.
 */
const HTML_ENTITY_MAP = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
});

const HTML_ENTITY_RE = /[&<>"'`=/]/g;

/**
 * Escape HTML-significant characters in a string. Returns an empty
 * string for `null` / `undefined` so callers don't have to defend.
 *
 * @param {*} value
 * @returns {string}
 */
export const escapeHtml = (value) => {
  if (value == null) return '';
  return String(value).replace(HTML_ENTITY_RE, (ch) => HTML_ENTITY_MAP[ch]);
};

/**
 * Schemes considered safe for href / src targets. Anything not in this
 * set (including bare relative paths starting with `/`) is allowed —
 * the function explicitly blocks the dangerous ones rather than
 * whitelisting, since blocking is the riskier-by-default direction.
 */
const SAFE_URL_SCHEMES = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
  'sms:',
  // intentionally NOT included: javascript:, data:, vbscript:, file:
]);

/**
 * Sanitize a URL before assigning to `href` / `src` attributes. Returns
 * a safe placeholder (`#`) when the URL uses a dangerous scheme, so
 * <a href={sanitizeUrl(suspect)}> can never execute injected JS.
 *
 * Relative URLs (`/users/42`) and protocol-relative URLs (`//cdn.example`)
 * are passed through. Anchors (`#whatever`) are also passed through.
 *
 * @param {string} url
 * @returns {string} A safe URL or "#" placeholder
 */
export const sanitizeUrl = (url) => {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';

  // Relative paths and anchors are safe.
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('?') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../')
  ) {
    return trimmed;
  }

  // Try to parse against a base so URL(...) works for protocol-relative
  // strings ("//cdn.example.com/x"). Pick a fixed http base so a missing
  // scheme doesn't cause new URL() to throw.
  let parsed;
  try {
    parsed = new URL(
      trimmed,
      typeof window !== 'undefined' ? window.location.origin : 'http://x.invalid'
    );
  } catch {
    // Malformed input — render nothing rather than guess.
    return '#';
  }

  if (!SAFE_URL_SCHEMES.has(parsed.protocol)) {
    return '#';
  }
  return trimmed;
};

/**
 * Render attributes safely. Currently a passthrough that escapes attribute
 * values; left here as a clear hook for future enrichment (e.g. allowlist
 * a specific set of attributes per tag).
 */
export const escapeAttribute = (value) => escapeHtml(value);

/**
 * Convert text into safe-to-render JSX with auto-linkified URLs. Splits
 * the input on whitespace, escapes everything via React's default text
 * rendering, and renders any token starting with http(s):// as an
 * external link with `rel="noopener noreferrer"`.
 *
 * Why hand-rolled instead of `dangerouslySetInnerHTML` + a sanitizer:
 *   we get to keep React's automatic text escaping (no third-party
 *   dependency, no risk of a bypass), and the only structural element
 *   we add is `<a>`. Nothing inserted into the DOM is HTML-controlled
 *   by the user.
 *
 * @param {string} text
 * @returns {Array<JSX.Element|string>}
 */
const URL_LIKE_RE = /^(https?:\/\/[^\s]+)$/i;

const linkifyText = (text) => {
  if (!text) return [];
  // Split on whitespace, keep the whitespace tokens so spacing renders.
  const parts = String(text).split(/(\s+)/);
  return parts.map((part, i) => {
    if (URL_LIKE_RE.test(part)) {
      const safe = sanitizeUrl(part);
      if (safe === '#') {
        return part; // dangerous scheme → render as text, no link
      }
      return (
        <a
          key={i}
          href={safe}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:text-indigo-800 underline"
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

/**
 * SafeText — render multi-line user-controlled text safely.
 *
 * Properties:
 *   - Newlines split into <p> blocks (or via whitespace-pre-line, see
 *     `mode='preserve'`)
 *   - URLs auto-linkified via `linkifyText`
 *   - HTML special characters escaped (React default — no innerHTML)
 *
 * @param {Object} props
 * @param {string} props.text - The user-controlled text to render
 * @param {'paragraphs'|'preserve'} [props.mode='paragraphs'] - Layout mode
 * @param {string} [props.className]
 * @param {boolean} [props.linkify=true] - Auto-link http(s) URLs
 * @returns {JSX.Element|null}
 */
export const SafeText = ({
  text,
  mode = 'paragraphs',
  className = '',
  linkify = true,
}) => {
  if (text == null || text === '') return null;
  const value = String(text);

  if (mode === 'preserve') {
    // Single block, newlines preserved via CSS. linkify still applied.
    return (
      <span className={`whitespace-pre-line ${className}`}>
        {linkify ? linkifyText(value) : value}
      </span>
    );
  }

  // Default: split on blank-line OR newline, render <p> per chunk.
  const blocks = value.split(/\n+/).filter((chunk) => chunk.trim().length > 0);
  if (blocks.length === 0) return null;

  return (
    <>
      {blocks.map((chunk, i) => (
        <p key={i} className={className}>
          {linkify ? linkifyText(chunk) : chunk}
        </p>
      ))}
    </>
  );
};

/**
 * Default export bundles the helpers for callers who prefer a single
 * `import sec from '../utils/security'` style.
 */
export default {
  escapeHtml,
  escapeAttribute,
  sanitizeUrl,
  SafeText,
};
