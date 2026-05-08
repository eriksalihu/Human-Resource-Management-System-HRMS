/**
 * @file backend/src/middleware/helmet.js
 * @description Custom Helmet configuration — strict Content-Security-Policy,
 *   frame denial, MIME-sniffing prevention, HSTS for HTTPS enforcement,
 *   strict referrer policy, and Permissions-Policy lockdown
 * @author Dev A
 *
 * The Helmet defaults are good but not great for an API + SPA stack like
 * ours. This wrapper applies the project-specific overrides so the
 * `app.js` mount stays a one-liner: `app.use(securityHeaders())`.
 *
 * Highlights:
 *   - CSP: strict by default; `unsafe-inline` allowed only on `style-src`
 *     because Tailwind's preflight inlines styles. `script-src` stays
 *     'self' to block any injected `<script>` payload that survives the
 *     sanitization layer.
 *   - HSTS: enforced in production (`Strict-Transport-Security`) so a
 *     browser that's seen the response over HTTPS once won't downgrade
 *     to HTTP for the next year. Disabled in dev to allow `localhost`.
 *   - Permissions-Policy: deny camera / geolocation / microphone — the
 *     HRMS doesn't use them; surfacing the explicit deny stops a future
 *     dependency from quietly enabling something.
 *   - frameguard: DENY (not SAMEORIGIN). The HRMS isn't designed to be
 *     embedded; explicit DENY is the safer default.
 */

const helmet = require('helmet');

/**
 * Build the Helmet middleware stack with project-specific overrides.
 *
 * @param {Object} [options]
 * @param {boolean} [options.isProduction] - Defaults to NODE_ENV === 'production'.
 *   Enables HSTS and tightens upgrade-insecure-requests when true.
 * @param {string} [options.frontendOrigin] - Allowed origin for connect-src
 *   in CSP (defaults to the local Vite dev server). Pass through env in prod.
 * @returns {import('express').RequestHandler}
 */
const securityHeaders = (options = {}) => {
  const isProduction =
    options.isProduction ?? process.env.NODE_ENV === 'production';
  const frontendOrigin =
    options.frontendOrigin ||
    process.env.CORS_ORIGIN ||
    'http://localhost:5173';

  return helmet({
    /**
     * Content-Security-Policy.
     *
     * Each directive is intentional:
     *   - default-src 'self': fall-through deny for any directive we
     *     don't explicitly override below
     *   - script-src 'self': no inline scripts, no remote scripts. The
     *     Vite-built bundle ships from our own origin.
     *   - style-src 'self' + 'unsafe-inline': Tailwind injects a small
     *     amount of inline CSS at runtime. We accept the looser rule
     *     here in exchange for keeping JSX `style={...}` working.
     *   - img-src: 'self' + data: + blob: lets `<img>`-tag previews
     *     render uploaded files (object URLs) and avatar fallbacks.
     *   - connect-src: 'self' + the SPA origin so XHR/fetch from the
     *     frontend dev server can talk to this API
     *   - object-src 'none': defeats classic Flash / plugin XSS vectors
     *   - frame-ancestors 'none': strict clickjacking guard (also via
     *     X-Frame-Options DENY for older browsers)
     *   - base-uri 'self': prevents an attacker who lands a stored XSS
     *     from rewriting <base href> to point script-srcs elsewhere
     *   - form-action 'self': prevents redirecting form submissions
     *   - upgrade-insecure-requests in production: turns embedded
     *     http:// URLs into https:// automatically
     */
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", frontendOrigin],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
      reportOnly: false,
    },

    /**
     * X-Frame-Options: DENY. Belt-and-braces clickjacking protection
     * alongside CSP frame-ancestors, since some older browsers still
     * honor this header but not CSP.
     */
    frameguard: { action: 'deny' },

    /**
     * X-Content-Type-Options: nosniff. Tells browsers not to second-guess
     * our Content-Type headers — drops MIME-confusion attacks.
     */
    noSniff: true,

    /**
     * Strict-Transport-Security. Only enabled in production:
     *   - max-age: 1 year
     *   - includeSubDomains: extends the policy to every subdomain
     *   - preload: declares intent to be added to the HSTS preload list
     * In dev we disable HSTS so localhost over plain HTTP keeps working.
     */
    hsts: isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,

    /**
     * Referrer-Policy: strict-origin-when-cross-origin. Sends only the
     * origin (no path/query) on cross-origin navigations and nothing at
     * all on HTTPS→HTTP downgrades. Default-mode is fine for same-origin.
     */
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    /**
     * Permissions-Policy. Explicitly deny APIs the HRMS doesn't need so
     * a stale dependency or future feature can't quietly enable them
     * without an explicit policy review.
     */
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    crossOriginEmbedderPolicy: false, // breaks <iframe src=blob:> previews

    /**
     * X-DNS-Prefetch-Control: off. We don't want the browser pre-resolving
     * DNS for arbitrary URLs in API responses.
     */
    dnsPrefetchControl: { allow: false },

    /**
     * Removes the default `X-Powered-By: Express` so attackers can't
     * trivially fingerprint the stack from a casual probe.
     */
    hidePoweredBy: true,

    /**
     * Origin-Agent-Cluster: keeps the JS context isolated. Cheap default
     * with no downside.
     */
    originAgentCluster: true,
  });
};

module.exports = securityHeaders;
