/**
 * @file backend/src/services/email.service.js
 * @description Email service — nodemailer-backed transport with HTML templates for welcome / password-reset / leave-approval / generic notifications
 * @author Dev A
 *
 * Behaviour:
 *   - When SMTP env vars are present, sends real email via nodemailer.
 *   - When they're absent (typical in dev / CI / classroom), the service
 *     logs the rendered email to the console and returns successfully so
 *     callers don't have to special-case "no transport configured".
 *
 * Required env vars (all optional — service degrades to "log mode"):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
 *   SMTP_FROM (sender address), SMTP_SECURE ("true" / "false")
 *   APP_URL — used as the base for action links inside templates
 */

const nodemailer = require('nodemailer');

/** Default sender shown in `From:` when SMTP_FROM isn't set. */
const DEFAULT_FROM = 'HRMS <no-reply@hrms.local>';

/** Used in template links so emails point at the right deployment. */
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

/**
 * Build a singleton nodemailer transport. Returns null when SMTP env vars
 * aren't configured, signaling the service to log instead of send.
 */
let cachedTransport = null;
let cachedTransportConfigured = false;

const getTransport = () => {
  if (cachedTransportConfigured) return cachedTransport;
  cachedTransportConfigured = true;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT) {
    console.warn(
      '[email.service] SMTP_HOST / SMTP_PORT not set — email will log to console only.'
    );
    cachedTransport = null;
    return cachedTransport;
  }

  try {
    cachedTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10),
      secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
      auth:
        SMTP_USER && SMTP_PASS
          ? { user: SMTP_USER, pass: SMTP_PASS }
          : undefined,
    });
  } catch (err) {
    console.error('[email.service] Failed to create SMTP transport:', err.message);
    cachedTransport = null;
  }
  return cachedTransport;
};

/**
 * HTML escape for user-controlled values that get embedded into templates.
 * Keeps the templates injection-safe against names with `<`/`&`/etc.
 */
const escapeHtml = (input) => {
  if (input == null) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * Wrap inner content in a minimal HTML shell — same layout for every
 * template so emails feel cohesive without a heavyweight email-builder.
 *
 * @param {Object} args
 * @param {string} args.title - Visible header inside the email
 * @param {string} args.body - Pre-escaped HTML body
 * @returns {string}
 */
const layout = ({ title, body }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
    <div style="background:#4f46e5;color:#ffffff;padding:16px 20px;font-size:18px;font-weight:600;">
      ${escapeHtml(title)}
    </div>
    <div style="padding:20px;line-height:1.5;font-size:14px;">
      ${body}
    </div>
    <div style="padding:12px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
      Sent automatically by HRMS · <a href="${APP_URL}" style="color:#4f46e5;text-decoration:none;">${APP_URL}</a>
    </div>
  </div>
</body>
</html>`;

/**
 * Strip HTML tags for a plain-text fallback. Email clients that block
 * HTML rendering still get a readable message.
 */
const htmlToPlain = (html) =>
  String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Send an email via the configured transport, or log it to stdout when
 * SMTP isn't set up. Returns `{ sent: boolean, info?: Object }`.
 *
 * @param {Object} args
 * @param {string|string[]} args.to - Recipient(s)
 * @param {string} args.subject
 * @param {string} args.html - Pre-rendered HTML body (use the templates below)
 * @param {string} [args.text] - Plain-text fallback (auto-derived if absent)
 * @returns {Promise<{ sent: boolean, info?: Object, logged?: boolean }>}
 */
const send = async ({ to, subject, html, text }) => {
  if (!to) {
    throw new Error('email.service.send: `to` is required');
  }
  if (!subject) {
    throw new Error('email.service.send: `subject` is required');
  }
  if (!html) {
    throw new Error('email.service.send: `html` is required');
  }

  const transport = getTransport();
  const message = {
    from: process.env.SMTP_FROM || DEFAULT_FROM,
    to,
    subject,
    html,
    text: text || htmlToPlain(html),
  };

  if (!transport) {
    // Dev / CI fallback — print enough to verify wiring without
    // dumping massive HTML payloads into terminal logs.
    console.log(
      `[email.service] (log-only) → ${Array.isArray(to) ? to.join(', ') : to} ` +
        `| ${subject}`
    );
    return { sent: false, logged: true };
  }

  const info = await transport.sendMail(message);
  return { sent: true, info };
};

/* ──────────────────────────────────────────────────────────────────── */
/* Template helpers                                                      */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Welcome / onboarding email sent right after a user's account is created.
 *
 * @param {Object} args
 * @param {string} args.to - Recipient email
 * @param {string} args.firstName
 * @param {string} [args.tempPassword] - Optional one-time password (omit if SSO)
 * @returns {Promise<Object>}
 */
const sendWelcomeEmail = async ({ to, firstName, tempPassword }) => {
  const greeting = `Hi ${escapeHtml(firstName) || 'there'},`;
  const tempBlock = tempPassword
    ? `<p>Your temporary password is <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">${escapeHtml(
        tempPassword
      )}</code>. Please change it on first login.</p>`
    : '';
  const body = `
    <p>${greeting}</p>
    <p>Your HRMS account has been created. You can now sign in to view your profile, submit leave requests, and check your attendance.</p>
    ${tempBlock}
    <p style="margin-top:16px;">
      <a href="${APP_URL}/login" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">Sign in</a>
    </p>
    <p style="color:#6b7280;font-size:12px;">If you didn't expect this email, you can safely ignore it.</p>
  `;
  return send({
    to,
    subject: 'Welcome to HRMS',
    html: layout({ title: 'Welcome to HRMS', body }),
  });
};

/**
 * Password-reset email containing a one-time link.
 *
 * @param {Object} args
 * @param {string} args.to
 * @param {string} args.firstName
 * @param {string} args.resetToken - Single-use token; embedded in the URL
 * @returns {Promise<Object>}
 */
const sendPasswordReset = async ({ to, firstName, resetToken }) => {
  const link = `${APP_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;
  const body = `
    <p>Hi ${escapeHtml(firstName) || 'there'},</p>
    <p>We received a request to reset your HRMS password. Click below to set a new one. This link is valid for one hour.</p>
    <p style="margin-top:16px;">
      <a href="${link}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">Reset password</a>
    </p>
    <p style="color:#6b7280;font-size:12px;">If you didn't request a reset, you can safely ignore this email — your password won't change.</p>
  `;
  return send({
    to,
    subject: 'Reset your HRMS password',
    html: layout({ title: 'Reset your password', body }),
  });
};

/**
 * Leave approval / rejection / submission email.
 *
 * @param {Object} args
 * @param {string} args.to
 * @param {string} args.firstName
 * @param {'approved'|'rejected'|'cancelled'|'submitted'} args.outcome
 * @param {string} args.startDate - YYYY-MM-DD
 * @param {string} args.endDate - YYYY-MM-DD
 * @param {string} args.leaveType
 * @param {string} [args.approverName] - Name of the approver (when applicable)
 * @returns {Promise<Object>}
 */
const sendLeaveApproval = async ({
  to,
  firstName,
  outcome,
  startDate,
  endDate,
  leaveType,
  approverName,
}) => {
  const verb =
    {
      approved: 'has been <strong style="color:#047857;">approved</strong>',
      rejected: 'has been <strong style="color:#b91c1c;">rejected</strong>',
      cancelled: 'has been <strong>cancelled</strong>',
      submitted: 'has been <strong>received</strong>',
    }[outcome] || 'has been updated';

  const approverLine = approverName
    ? `<p>Decision by: <strong>${escapeHtml(approverName)}</strong></p>`
    : '';

  const body = `
    <p>Hi ${escapeHtml(firstName) || 'there'},</p>
    <p>Your <strong>${escapeHtml(leaveType)}</strong> leave request from
       <strong>${escapeHtml(startDate)}</strong> to
       <strong>${escapeHtml(endDate)}</strong> ${verb}.</p>
    ${approverLine}
    <p style="margin-top:16px;">
      <a href="${APP_URL}/leaves" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">View in HRMS</a>
    </p>
  `;
  return send({
    to,
    subject: `Leave request ${outcome}`,
    html: layout({ title: `Leave ${outcome}`, body }),
  });
};

/**
 * Generic notification email — used for the catch-all "you got a
 * notification in HRMS" trigger so we don't have to write a bespoke
 * template for every event type.
 *
 * @param {Object} args
 * @param {string} args.to
 * @param {string} args.firstName
 * @param {string} args.title
 * @param {string} args.message - Plain text; line breaks preserved
 * @param {string} [args.link] - Optional deep-link path (e.g. "/leaves/42")
 * @returns {Promise<Object>}
 */
const sendNotification = async ({ to, firstName, title, message, link }) => {
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br />');
  const cta = link
    ? `<p style="margin-top:16px;">
        <a href="${APP_URL}${link.startsWith('/') ? '' : '/'}${escapeHtml(link)}"
           style="display:inline-block;background:#4f46e5;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">
          Open in HRMS
        </a>
      </p>`
    : '';

  const body = `
    <p>Hi ${escapeHtml(firstName) || 'there'},</p>
    <p>${safeMessage}</p>
    ${cta}
  `;
  return send({
    to,
    subject: title,
    html: layout({ title, body }),
  });
};

module.exports = {
  // Low-level
  send,
  // Templates
  sendWelcomeEmail,
  sendPasswordReset,
  sendLeaveApproval,
  sendNotification,
  // Exposed for tests
  _internals: { layout, escapeHtml, htmlToPlain, getTransport },
};
