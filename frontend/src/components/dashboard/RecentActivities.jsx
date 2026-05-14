/**
 * @file frontend/src/components/dashboard/RecentActivities.jsx
 * @description Recent system activity feed — timeline of audit-log events with action icons, user avatars, relative timestamps, and clickable links to related entities
 * @author Dev B
 *
 * The widget consumes the dashboard service's `getRecentActivities` payload
 * (already joined to Users for `user_name`). Each row is mapped through
 * `decodeActivity()` which translates the `(action, entity)` pair into a
 * human sentence + an icon + an optional deep link to the related page.
 *
 * The audit-log middleware writes `action` strings like
 * "POST /api/leave-requests" or "DELETE /api/employees" — we parse the
 * HTTP verb and entity to render clean, scannable timeline rows.
 */

import { useState, useEffect, useCallback } from 'react';
import * as dashboardApi from '../../api/dashboardApi';
import { useToast } from '../common/Toast';

/**
 * Timeline-shaped skeleton — N rows each with a circular icon
 * placeholder, two-line text bars, and a rail-anchored dot. Mirrors
 * the real layout so swap-in is jank-free.
 *
 * @param {Object} props
 * @param {number} [props.rows=5]
 */
const RecentActivitiesSkeleton = ({ rows = 5 }) => (
  <ul
    className="relative animate-pulse"
    aria-busy="true"
    aria-label="Loading recent activities"
  >
    <span
      aria-hidden="true"
      className="absolute left-[19px] top-2 bottom-2 w-px bg-gray-200"
    />
    {Array.from({ length: rows }).map((_, i) => (
      <li key={i} className="relative flex gap-3 py-3">
        <span className="relative z-10 h-9 w-9 shrink-0 rounded-full bg-gray-200" />
        <div className="flex-1 min-w-0 space-y-1.5 pt-1">
          <div className="h-3 w-3/4 rounded bg-gray-200" />
          <div className="h-2 w-1/3 rounded bg-gray-100" />
        </div>
      </li>
    ))}
  </ul>
);

/**
 * Map (verb, entity) → { label, tone, dot, link }. Falls back to a generic
 * sentence when the audit-log row doesn't match a known pattern.
 *
 * `tone` is the icon background; `dot` is the timeline rail dot.
 */
const ENTITY_META = {
  Users:               { label: 'user',                link: () => '/employees',  emoji: '👤' },
  Employees:           { label: 'employee',            link: (id) => '/employees', emoji: '👥' },
  Departments:         { label: 'department',          link: () => '/departments', emoji: '🏢' },
  Positions:           { label: 'position',            link: () => '/positions',  emoji: '💼' },
  Salaries:            { label: 'salary record',       link: () => '/salaries',   emoji: '💰' },
  LeaveRequests:       { label: 'leave request',       link: () => '/leaves',     emoji: '🏖️' },
  Attendances:         { label: 'attendance entry',    link: () => '/attendance', emoji: '⏰' },
  PerformanceReviews:  { label: 'performance review',  link: () => '/performance', emoji: '⭐' },
  Trainings:           { label: 'training',            link: () => '/trainings',  emoji: '🎓' },
  TrainingParticipants:{ label: 'training enrollment', link: () => '/trainings',  emoji: '📝' },
  Documents:           { label: 'document',            link: () => '/documents',  emoji: '📄' },
  Notifications:       { label: 'notification',        link: () => '/',           emoji: '🔔' },
};

/**
 * Translate an HTTP verb into a tense-correct verb phrase.
 * "POST" → "created", "PUT" → "updated", "DELETE" → "deleted",
 * everything else falls back to a verbatim lowercase form.
 */
const verbPhrase = (verb) => {
  const v = String(verb || '').toUpperCase();
  if (v === 'POST') return 'created';
  if (v === 'PUT' || v === 'PATCH') return 'updated';
  if (v === 'DELETE') return 'deleted';
  if (v === 'GET') return 'viewed';
  return v.toLowerCase();
};

/**
 * Specialized phrasing for leave-approval/reject/cancel routes whose path
 * trailers reveal the intent ("PUT /api/leave-requests/42/approve").
 */
const specialLeavePhrase = (action) => {
  const a = String(action || '');
  if (/\/leave-requests\/\d+\/approve\b/i.test(a)) return 'approved a leave request';
  if (/\/leave-requests\/\d+\/reject\b/i.test(a))  return 'rejected a leave request';
  if (/\/leave-requests\/\d+\/cancel\b/i.test(a))  return 'cancelled a leave request';
  return null;
};

/** Tone classes per verb — drives the timeline rail dot color. */
const VERB_TONE = {
  POST:   { dot: 'bg-emerald-500', icon: 'bg-emerald-100' },
  PUT:    { dot: 'bg-indigo-500',  icon: 'bg-indigo-100'  },
  PATCH:  { dot: 'bg-indigo-500',  icon: 'bg-indigo-100'  },
  DELETE: { dot: 'bg-rose-500',    icon: 'bg-rose-100'    },
  GET:    { dot: 'bg-gray-400',    icon: 'bg-gray-100'    },
};

/**
 * Decode one activity row into a render-ready shape.
 *
 * @param {Object} row - { action, entity, entity_id, user_name, created_at }
 * @returns {{
 *   sentence: string,
 *   verb: string,
 *   emoji: string,
 *   dotClass: string,
 *   iconBg: string,
 *   link: string|null,
 * }}
 */
const decodeActivity = (row) => {
  const verbMatch = String(row.action || '').match(/^([A-Z]+)\s/);
  const verb = verbMatch ? verbMatch[1] : '';
  const verbTone = VERB_TONE[verb] || VERB_TONE.GET;

  const meta = ENTITY_META[row.entity] || {
    label: (row.entity || 'item').toLowerCase(),
    link: () => null,
    emoji: '📌',
  };

  // Special-case the leave approval routes for nicer phrasing.
  const special = specialLeavePhrase(row.action);
  const phrase = special
    ? special
    : `${verbPhrase(verb)} ${meta.label}${
        row.entity_id ? ` #${row.entity_id}` : ''
      }`;

  const link = meta.link ? meta.link(row.entity_id) : null;

  return {
    sentence: phrase,
    verb,
    emoji: meta.emoji,
    dotClass: verbTone.dot,
    iconBg: verbTone.icon,
    link,
  };
};

/**
 * Compute initials from a "First Last" string, falling back to "?" when
 * empty. Used as the avatar fallback on the timeline.
 */
const initials = (name) => {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase() || '?';
};

/** Lightweight relative-time formatter ("just now", "5 min ago", "3h ago"). */
const formatRelative = (timestamp) => {
  if (!timestamp) return '—';
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return '—';
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString('en-GB');
};

/** Absolute timestamp for hover tooltips (e.g. "2026-04-23 14:32"). */
const formatAbsolute = (timestamp) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (!Number.isFinite(d.getTime())) return '';
  return d
    .toLocaleString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', '');
};

/**
 * RecentActivities — dashboard activity feed widget.
 *
 * @param {Object} props
 * @param {number} [props.limit=10] - Max rows to fetch (1..50)
 * @param {boolean} [props.autoFetch=true] - Fetch on mount when true; when
 *   false the parent should pass `activities` directly
 * @param {Array<Object>} [props.activities] - Pre-loaded rows (skip fetching)
 * @param {Function} [props.onSelect] - Called with `(row)` when a card is clicked.
 *   When omitted, link clicks navigate via plain anchor href.
 * @param {string} [props.title='Recent activity']
 * @returns {JSX.Element}
 */
const RecentActivities = ({
  limit = 10,
  autoFetch = true,
  activities: providedActivities,
  onSelect,
  title = 'Recent activity',
}) => {
  const [rows, setRows] = useState(providedActivities || []);
  const [loading, setLoading] = useState(autoFetch && !providedActivities);
  const { addToast } = useToast();

  /** Fetch the feed when the parent didn't pass pre-loaded rows. */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await dashboardApi.getRecentActivities({ limit });
      setRows(result?.activities || []);
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load recent activity',
        'error'
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [limit, addToast]);

  useEffect(() => {
    if (providedActivities) {
      setRows(providedActivities);
      return;
    }
    if (autoFetch) load();
  }, [providedActivities, autoFetch, load]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <RecentActivitiesSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-500">
          No recent activity yet — actions across the system will show up here.
        </div>
      ) : (
        <ul className="relative">
          {/* Vertical timeline rail */}
          <span
            aria-hidden="true"
            className="absolute left-[19px] top-2 bottom-2 w-px bg-gray-200"
          />

          {rows.map((row, idx) => {
            const decoded = decodeActivity(row);
            const isLink = Boolean(decoded.link) && !onSelect;

            const inner = (
              <div className="flex items-start gap-3">
                {/* Avatar / icon column */}
                <div className="relative shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold ring-4 ring-white">
                    {initials(row.user_name)}
                  </div>
                  {/* Action emoji "stamp" overlapping bottom-right */}
                  <div
                    className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ${decoded.iconBg} ring-2 ring-white text-[11px]`}
                    aria-hidden="true"
                  >
                    {decoded.emoji}
                  </div>
                </div>

                {/* Body */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold text-gray-900">
                      {row.user_name || 'System'}
                    </span>{' '}
                    {decoded.sentence}
                  </p>
                  <p
                    className="text-xs text-gray-500 mt-0.5"
                    title={formatAbsolute(row.created_at)}
                  >
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full mr-1 align-middle ${decoded.dotClass}`}
                    />
                    {formatRelative(row.created_at)}
                    {row.entity ? ` · ${row.entity}` : ''}
                  </p>
                </div>
              </div>
            );

            return (
              <li key={row.id || `${row.created_at}-${idx}`} className="py-2">
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(row)}
                    className="block w-full text-left px-1 py-1 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                  >
                    {inner}
                  </button>
                ) : isLink ? (
                  <a
                    href={decoded.link}
                    className="block px-1 py-1 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                  >
                    {inner}
                  </a>
                ) : (
                  <div className="px-1 py-1">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default RecentActivities;
