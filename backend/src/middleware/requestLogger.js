/**
 * @file backend/src/middleware/requestLogger.js
 * @description Detailed request logger — method, path, status, response time,
 *   authenticated user, client IP, user-agent, and a redacted snapshot of
 *   the request body for non-GET routes
 * @author Dev A
 *
 * Why a custom logger when morgan is already wired?
 *   morgan covers the basic access-log line (method / path / status /
 *   bytes / duration). It doesn't include the authenticated user id, the
 *   request body, or sensitive-field redaction. This middleware adds the
 *   structured fields HR audits care about while keeping morgan in place
 *   for casual dev-console reading.
 *
 * Sensitive-field redaction:
 *   - Replace common secret fields (password, current_password, new_password,
 *     password_hash, token, refresh_token, accessToken, refreshToken)
 *     with "[REDACTED]" before logging. The redaction is recursive so
 *     nested payloads (e.g. wrapped credentials) are caught too.
 *   - File-upload streams (multer multipart) are skipped — we log a
 *     placeholder instead of attempting to serialise binary data.
 */

/** Field names to mask before logging. Lowercased for case-insensitive match. */
const REDACTED_KEYS = new Set([
  'password',
  'current_password',
  'new_password',
  'confirm_password',
  'password_hash',
  'token',
  'refresh_token',
  'refreshtoken',
  'accesstoken',
  'authorization',
  'cookie',
  'csrf',
  'csrftoken',
  'x-csrf-token',
]);

/** Methods whose body we want to log (state-changing). */
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Cap on serialised body size in chars. Anything bigger gets truncated. */
const MAX_BODY_CHARS = 2000;

/**
 * Deep-clone a value while replacing redactable keys with "[REDACTED]".
 * Caps recursion depth as defence against cyclic / pathological inputs.
 */
const redact = (value, depth = 0) => {
  if (depth > 8) return '[depth-capped]';
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  if (typeof value === 'object') {
    // Don't try to serialise Buffers or streams — multer-style file uploads.
    if (Buffer.isBuffer?.(value)) return `[Buffer ${value.length}B]`;
    if (typeof value.pipe === 'function') return '[stream]';

    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (REDACTED_KEYS.has(String(key).toLowerCase())) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redact(v, depth + 1);
      }
    }
    return out;
  }

  return value;
};

/**
 * Stringify a redacted body, truncating past MAX_BODY_CHARS so a 100KB
 * payload doesn't blow up the log line. Returns null for empty bodies.
 */
const formatBody = (body) => {
  if (body == null) return null;
  if (typeof body !== 'object' || Object.keys(body).length === 0) return null;
  try {
    const json = JSON.stringify(redact(body));
    if (json.length <= MAX_BODY_CHARS) return json;
    return `${json.slice(0, MAX_BODY_CHARS)}…(truncated)`;
  } catch {
    return '[unserialisable]';
  }
};

/** Extract client IP honouring X-Forwarded-For under a trusted proxy. */
const clientIp = (req) => {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || '';
};

/**
 * Pick a log level from a response status. Server errors → error, client
 * errors → warn, everything else → info. Lets consumers downstream
 * filter by severity without parsing status codes themselves.
 */
const levelForStatus = (status) => {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
};

/**
 * Express middleware factory. Mount AFTER body parsing (so `req.body` is
 * populated) and AFTER authentication (so `req.user.id` is available).
 *
 * @param {Object} [options]
 * @param {(entry: Object) => void} [options.sink] - Override the default
 *   `console.log` sink with a structured-logging consumer (Winston, Pino,
 *   etc.) when the project moves past console.log.
 * @returns {import('express').RequestHandler}
 */
const requestLogger = (options = {}) => {
  const sink =
    typeof options.sink === 'function'
      ? options.sink
      : (entry) => {
          const tag = `[${entry.level.toUpperCase()}] ${entry.method} ${entry.path}`;
          // eslint-disable-next-line no-console
          console.log(
            `${tag} ${entry.status} ${entry.duration_ms}ms`,
            JSON.stringify({
              user_id: entry.user_id,
              ip: entry.ip,
              ua: entry.user_agent,
              ...(entry.body ? { body: entry.body } : {}),
              ...(entry.error ? { error: entry.error } : {}),
            })
          );
        };

  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();

    // Snapshot the body BEFORE the route handler mutates it (some
    // controllers reassign req.body or strip fields for security).
    const bodySnapshot = BODY_METHODS.has(req.method)
      ? formatBody(req.body)
      : null;

    res.on('finish', () => {
      const endedAt = process.hrtime.bigint();
      const durationMs = Number(endedAt - startedAt) / 1e6;

      const entry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        duration_ms: Math.round(durationMs * 100) / 100,
        user_id: req.user?.id || null,
        ip: clientIp(req),
        user_agent: req.headers['user-agent'] || null,
        request_id: req.id || req.headers['x-request-id'] || null,
        body: bodySnapshot,
        level: levelForStatus(res.statusCode),
      };

      // If the response carried an error code from our AppError pipeline,
      // surface it in the log so on-call doesn't have to grep two files.
      if (res.locals?.errorCode) {
        entry.error = res.locals.errorCode;
      }

      try {
        sink(entry);
      } catch (err) {
        // A logger sink should NEVER break the response pipeline.
        // eslint-disable-next-line no-console
        console.error('[requestLogger] sink threw:', err.message);
      }
    });

    next();
  };
};

module.exports = requestLogger;
module.exports.redact = redact;
module.exports.REDACTED_KEYS = REDACTED_KEYS;
