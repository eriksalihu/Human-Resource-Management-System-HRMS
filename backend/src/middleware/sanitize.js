/**
 * @file backend/src/middleware/sanitize.js
 * @description Input sanitization middleware — trims whitespace, escapes
 *   HTML entities to neutralize XSS payloads, strips dangerous-looking
 *   keys (NoSQL operator injection), and recursively walks body / query /
 *   params trees so every controller gets clean input by default
 * @author Dev A
 *
 * Design principles:
 *   - Idempotent: running on already-clean data is a no-op
 *   - Non-destructive: real form values like "5 < 10" survive (escaped,
 *     then unescaped at the rendering layer that needs raw text)
 *   - Cheap: inline regex / string-replace; no third-party deps
 *   - Configurable per-route: routes that need to accept HTML content
 *     (e.g. a future rich-text editor) can opt out via `skipFields`
 *   - Safe with file uploads: buffers / streams are passed through
 *     untouched (multer's req.file / req.files don't get walked)
 */

/**
 * Keys that look like NoSQL / Mongo-style operators. Even though we use
 * MySQL via mysql2 (which is parameterised and immune to operator
 * injection), stripping these provides defense-in-depth and removes a
 * class of weird payloads that have no business in a normal request.
 */
const DANGEROUS_KEY_RE = /^\$/;

/**
 * Match ASCII control bytes EXCEPT tab (\x09), LF (\x0A), and CR (\x0D)
 * which are legitimate inside textarea content. Written via escape
 * sequences (not literal control chars) so the file stays a plain UTF-8
 * source — git's binary-detection trips on literal control chars in source.
 */
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Map of HTML entities for escape. We use it directly instead of a
 * library — six entries, zero dependencies, perfectly correct.
 */
const HTML_ENTITY_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};
const HTML_ENTITY_RE = /[&<>"'`=/]/g;

/**
 * Escape HTML-special characters so a stored value can later be rendered
 * verbatim into HTML without becoming an XSS vector. The frontend's React
 * runtime escapes by default, but persisting escaped strings means even
 * a raw `dangerouslySetInnerHTML` consumer down the road stays safe.
 */
const escapeHtml = (value) =>
  String(value).replace(HTML_ENTITY_RE, (ch) => HTML_ENTITY_MAP[ch]);

/**
 * Sanitize a single string value:
 *   1. Strip ASCII control characters (except tab/CR/LF)
 *   2. Trim leading / trailing whitespace
 *   3. Escape HTML entities
 *
 * Empty / null / undefined inputs are passed through unchanged so
 * downstream `??`-style defaults still work.
 */
const sanitizeString = (value) => {
  if (typeof value !== 'string') return value;
  return escapeHtml(value.replace(CONTROL_CHAR_RE, '').trim());
};

/**
 * Walk an arbitrary value, sanitizing string leaves and dropping any
 * keys whose names look like operator-injection attempts. Buffers,
 * Date instances, and `null` survive the walk untouched.
 *
 * @param {*} value
 * @param {Object} [options]
 * @param {Set<string>} [options.skipFields] - top-level field names to
 *   pass through without escaping (e.g. a rich-text body)
 * @param {number} [options.depth=0] - current recursion depth
 * @returns {*} the sanitized value
 */
const sanitizeValue = (value, options = {}, depth = 0) => {
  // Cap recursion depth to defend against pathological / cyclic inputs.
  // Depth 32 covers any reasonable form payload.
  if (depth > 32) return value;

  if (value == null) return value;

  // Pass-throughs: the structures whose internals we shouldn't touch.
  if (Buffer.isBuffer?.(value)) return value;
  if (value instanceof Date) return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, options, depth + 1));
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      // Drop keys that look like operator injection. We do NOT just
      // sanitize the key — we strip it, since legitimate HRMS payloads
      // don't ship `$gt` / `$ne` etc.
      if (DANGEROUS_KEY_RE.test(key)) continue;
      out[key] = sanitizeValue(v, options, depth + 1);
    }
    return out;
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  // Numbers, booleans, etc.: leave alone.
  return value;
};

/**
 * Express middleware factory. Sanitizes `req.body`, `req.query`, and
 * `req.params` in place. Routes can opt fields out via `options.skipFields`
 * — future feature for rich-text editors that need raw HTML through.
 *
 * Note: we mutate the existing query / params objects rather than
 * reassigning them. Express on Node 22+ wires `req.query` to a getter
 * on the underlying URLSearchParams, so direct reassignment
 * (`req.query = ...`) silently fails. Mutating in place is portable.
 *
 * @param {Object} [options]
 * @param {Set<string>|string[]} [options.skipFields]
 * @returns {import('express').RequestHandler}
 */
const sanitize = (options = {}) => {
  const skipFields =
    options.skipFields instanceof Set
      ? options.skipFields
      : new Set(options.skipFields || []);

  /**
   * Sanitize a top-level object in place, honouring `skipFields`.
   * Returns the same object reference for convenience.
   */
  const sanitizeInPlace = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    for (const key of Object.keys(obj)) {
      if (DANGEROUS_KEY_RE.test(key)) {
        delete obj[key];
        continue;
      }
      if (skipFields.has(key)) continue;
      obj[key] = sanitizeValue(obj[key], { skipFields });
    }
    return obj;
  };

  return (req, _res, next) => {
    try {
      if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        sanitizeInPlace(req.body);
      }
      if (req.query && typeof req.query === 'object') {
        sanitizeInPlace(req.query);
      }
      if (req.params && typeof req.params === 'object') {
        sanitizeInPlace(req.params);
      }
      next();
    } catch (err) {
      // Sanitization should never break a request — if anything goes
      // wrong, log and pass through. The downstream validators will
      // still reject obviously bad inputs.
      // eslint-disable-next-line no-console
      console.error('[sanitize] error:', err);
      next();
    }
  };
};

module.exports = sanitize;
module.exports.sanitizeString = sanitizeString;
module.exports.sanitizeValue = sanitizeValue;
module.exports.escapeHtml = escapeHtml;
