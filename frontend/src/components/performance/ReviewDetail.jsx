/**
 * @file frontend/src/components/performance/ReviewDetail.jsx
 * @description Performance review detail panel with rating visualization, reviewer info, strengths/weaknesses/objectives sections, and edit/delete actions
 * @author Dev B
 */

import { useState, useEffect } from 'react';
import * as performanceReviewApi from '../../api/performanceReviewApi';
import LoadingSpinner from '../common/LoadingSpinner';
import { useToast } from '../common/Toast';

/** Format an ISO-like date string as DD/MM/YYYY. */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/** Tone classes per rating bucket — same scale as the dashboard. */
const ratingTone = (rating) => {
  const n = Number(rating);
  if (!Number.isFinite(n)) return 'bg-gray-100 text-gray-700';
  if (n >= 4.5) return 'bg-emerald-100 text-emerald-800';
  if (n >= 3.5) return 'bg-green-100 text-green-800';
  if (n >= 2.5) return 'bg-yellow-100 text-yellow-800';
  if (n >= 1.5) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
};

/** Plain-language label for a numeric rating. */
const ratingLabel = (rating) => {
  const n = Number(rating);
  if (!Number.isFinite(n)) return '—';
  if (n >= 4.5) return 'Outstanding';
  if (n >= 3.5) return 'Exceeds expectations';
  if (n >= 2.5) return 'Meets expectations';
  if (n >= 1.5) return 'Needs improvement';
  return 'Below expectations';
};

/**
 * Read-only 5-star rating row with half-star resolution. Mirrors the
 * `StarRating` in `ReviewList` so view + list stay visually identical.
 */
const StarsBig = ({ rating }) => {
  const value = Number(rating);
  if (!Number.isFinite(value) || value <= 0) {
    return <span className="text-sm text-gray-400">No rating</span>;
  }

  const stars = [];
  for (let i = 1; i <= 5; i += 1) {
    let fill = 'none';
    if (value >= i) fill = 'full';
    else if (value >= i - 0.5) fill = 'half';

    stars.push(
      <span key={i} className="relative inline-block w-7 h-7 text-yellow-500">
        <svg
          className="absolute inset-0 w-7 h-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.32.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.32-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
          />
        </svg>
        {fill !== 'none' && (
          <span
            className="absolute inset-0 overflow-hidden"
            style={{ width: fill === 'half' ? '50%' : '100%' }}
          >
            <svg
              className="w-7 h-7"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.32.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.32-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex">{stars}</div>
      <span className="text-2xl font-bold text-gray-900">
        {value.toFixed(1)}
      </span>
      <span className="text-sm text-gray-500">/ 5.0</span>
    </div>
  );
};

/**
 * Build a five-axis "skills profile" score chart from the review's text
 * fields. We don't have a real radar chart library wired up yet (and the
 * spec says "placeholder"), so we render a stacked horizontal bar based
 * on heuristics: the rating drives baseline score, then strengths /
 * weaknesses / objectives presence give per-axis nudges.
 *
 * The intent here is "give the user a useful visual today; swap for a
 * proper Recharts radar later". The component layout is stable so the
 * future swap is a single-component replacement.
 */
const SkillsProfile = ({ review }) => {
  const base = Math.max(1, Math.min(5, Number(review.nota) || 0));
  const hasStrengths = Boolean(review.pikat_forta?.trim());
  const hasWeaknesses = Boolean(review.pikat_dobta?.trim());
  const hasObjectives = Boolean(review.objektivat?.trim());

  // Heuristic per-axis: clamp(base ± nudge, 1, 5).
  const axes = [
    {
      label: 'Performance',
      score: base,
      tone: 'bg-indigo-500',
    },
    {
      label: 'Strengths',
      score: hasStrengths ? Math.min(5, base + 0.5) : Math.max(1, base - 0.5),
      tone: 'bg-emerald-500',
    },
    {
      label: 'Growth areas',
      score: hasWeaknesses ? Math.max(1, base - 0.5) : base,
      tone: 'bg-amber-500',
    },
    {
      label: 'Objectives',
      score: hasObjectives ? Math.min(5, base + 0.3) : Math.max(1, base - 0.3),
      tone: 'bg-sky-500',
    },
    {
      label: 'Overall',
      score: base,
      tone: 'bg-purple-500',
    },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">
          Skills profile
        </h3>
        <span className="text-xs text-gray-400">
          (radar-chart placeholder)
        </span>
      </div>
      <div className="space-y-2">
        {axes.map((axis) => {
          const widthPct = (axis.score / 5) * 100;
          return (
            <div key={axis.label} className="flex items-center gap-3">
              <div className="w-28 text-xs text-gray-600 shrink-0">
                {axis.label}
              </div>
              <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`${axis.tone} h-3 rounded-full transition-all`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <div className="w-10 text-right text-xs font-mono text-gray-700">
                {axis.score.toFixed(1)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * ReviewDetail — full read-only view of a performance review with edit /
 * delete action buttons. Loads its own data when given just `reviewId`,
 * or accepts a pre-loaded `review` object to skip the round trip.
 *
 * @param {Object} props
 * @param {number} [props.reviewId] - Loaded via API if provided
 * @param {Object} [props.review]   - Pre-loaded review (skips API call)
 * @param {Function} [props.onEdit]   - Show edit form for this review
 * @param {Function} [props.onDelete] - Stage deletion confirmation
 * @param {Function} [props.onClose]  - Return to list
 * @returns {JSX.Element}
 */
const ReviewDetail = ({ reviewId, review: providedReview, onEdit, onDelete, onClose }) => {
  const [review, setReview] = useState(providedReview || null);
  const [loading, setLoading] = useState(!providedReview);
  const { addToast } = useToast();

  /**
   * Fetch the review when only an id was supplied. Re-runs whenever the
   * id changes so the parent can swap reviews without remounting us.
   */
  useEffect(() => {
    if (providedReview) {
      setReview(providedReview);
      setLoading(false);
      return;
    }
    if (!reviewId) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const result = await performanceReviewApi.getById(reviewId);
        if (!cancelled) setReview(result);
      } catch (err) {
        if (!cancelled) {
          addToast(
            err.response?.data?.message || 'Failed to load review',
            'error'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [reviewId, providedReview, addToast]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <LoadingSpinner />
      </div>
    );
  }

  if (!review) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-gray-500">
        <p className="text-sm">Review not found.</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            ← Back to list
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <svg
              className="h-4 w-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to list
          </button>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(review)}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <svg
                className="h-4 w-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(review)}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-red-300 text-red-700 hover:bg-red-50"
            >
              <svg
                className="h-4 w-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
                />
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Header card: subject + rating */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Performance review
            </p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">
              {review.first_name} {review.last_name}
            </h2>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
              {review.numri_punonjesit && (
                <span className="font-mono">{review.numri_punonjesit}</span>
              )}
              {review.department_emertimi && (
                <span>{review.department_emertimi}</span>
              )}
              {review.position_emertimi && (
                <span>· {review.position_emertimi}</span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 font-medium bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200">
                Period: {review.periudha || '—'}
              </span>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 font-medium bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">
                Reviewed on {formatDate(review.data_vleresimit)}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ring-transparent ${ratingTone(
                  review.nota
                )}`}
              >
                {ratingLabel(review.nota)}
              </span>
            </div>
          </div>
          <div className="sm:text-right">
            <StarsBig rating={review.nota} />
          </div>
        </div>
      </div>

      {/* Skills profile (radar placeholder) */}
      <SkillsProfile review={review} />

      {/* Reviewer card */}
      {(review.reviewer_first_name || review.reviewer_last_name) && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Reviewer
          </h3>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-semibold">
              {(review.reviewer_first_name?.[0] || '')}
              {(review.reviewer_last_name?.[0] || '')}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {review.reviewer_first_name} {review.reviewer_last_name}
              </p>
              <p className="text-xs text-gray-500">
                Authored on {formatDate(review.created_at)}
                {review.updated_at &&
                review.updated_at !== review.created_at
                  ? ` · last edited ${formatDate(review.updated_at)}`
                  : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Strengths */}
      <Section
        title="Strengths"
        accent="border-l-emerald-500"
        text={review.pikat_forta}
        empty="No strengths captured for this review."
      />

      {/* Areas for development */}
      <Section
        title="Areas for development"
        accent="border-l-amber-500"
        text={review.pikat_dobta}
        empty="No development areas captured for this review."
      />

      {/* Objectives */}
      <Section
        title="Objectives for next period"
        accent="border-l-sky-500"
        text={review.objektivat}
        empty="No objectives captured for this review."
      />
    </div>
  );
};

/**
 * Section — headline + paragraph card with a colored left border. Used
 * for the strengths / weaknesses / objectives blocks.
 *
 * Renders the text as plain text but preserves whitespace via `whitespace-pre-line`
 * so reviewers' line breaks survive the round-trip.
 */
const Section = ({ title, text, accent = 'border-l-gray-300', empty }) => {
  const trimmed = (text || '').trim();
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-4 border-l-4 ${accent}`}
    >
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {trimmed ? (
        <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">
          {trimmed}
        </p>
      ) : (
        <p className="mt-2 text-sm text-gray-400 italic">{empty}</p>
      )}
    </div>
  );
};

export default ReviewDetail;
