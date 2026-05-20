/**
 * @file frontend/src/components/trainings/TrainingDetail.jsx
 * @description Training detail panel with full info, participant roster, enroll/withdraw buttons, and post-completion rating submission
 * @author Dev B
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as trainingApi from '../../api/trainingApi';
import LoadingSpinner from '../common/LoadingSpinner';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../common/Toast';
import useAuth from '../../hooks/useAuth';
import TextareaWithCounter from '../common/TextareaWithCounter';

/** Roles allowed to manage training rosters (status changes, edit, delete). */
const HR_ROLES = ['Admin', 'HR Manager'];

/** Tailwind classes per training status. */
const STATUS_BADGE_CLASS = {
  upcoming: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  ongoing: 'bg-green-50 text-green-700 ring-green-600/20',
  completed: 'bg-gray-50 text-gray-700 ring-gray-600/20',
  cancelled: 'bg-red-50 text-red-700 ring-red-600/20',
};

/** Tailwind classes per participant status. */
const PARTICIPANT_BADGE_CLASS = {
  enrolled: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  dropped: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  'no-show': 'bg-red-50 text-red-700 ring-red-600/20',
};

/** Format a date as DD/MM/YYYY. */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/**
 * Capacity progress bar — shared visual with the list view but more compact.
 */
const CapacityBar = ({ enrolled, capacity }) => {
  const taken = Number(enrolled) || 0;
  const total = Number(capacity) || 0;
  const ratio = total > 0 ? Math.min(taken / total, 1) : 0;
  const pct = Math.round(ratio * 100);

  let tone = 'bg-emerald-500';
  if (ratio >= 1) tone = 'bg-red-500';
  else if (ratio >= 0.8) tone = 'bg-amber-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Capacity</span>
        <span className="text-xs font-mono text-gray-700">
          {taken} / {total || '∞'}
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`${tone} h-2 rounded-full transition-all`}
          style={{ width: `${Math.max(pct, total === 0 ? 0 : 4)}%` }}
        />
      </div>
    </div>
  );
};

/**
 * Compact 5-star input used for post-completion rating submission.
 *
 * @param {{ value: number, onChange: Function, disabled?: boolean }} props
 */
const RatingPicker = ({ value = 0, onChange, disabled = false }) => {
  const [hover, setHover] = useState(0);
  const display = hover || value;

  const select = (i, isHalf) => {
    if (disabled) return;
    onChange(isHalf ? i - 0.5 : i);
  };

  return (
    <div
      className="inline-flex items-center gap-2"
      onMouseLeave={() => setHover(0)}
    >
      <div className="flex">
        {[1, 2, 3, 4, 5].map((i) => {
          let fill = 'none';
          if (display >= i) fill = 'full';
          else if (display >= i - 0.5) fill = 'half';
          return (
            <span
              key={i}
              className="relative inline-block w-6 h-6 text-yellow-500 select-none"
            >
              <svg
                className="absolute inset-0 w-6 h-6"
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
                    className="w-6 h-6"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.32.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.32-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                </span>
              )}
              <button
                type="button"
                aria-label={`${i - 0.5} stars`}
                onMouseEnter={() => setHover(i - 0.5)}
                onClick={() => select(i, true)}
                disabled={disabled}
                className="absolute inset-y-0 left-0 w-1/2 bg-transparent border-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <button
                type="button"
                aria-label={`${i} stars`}
                onMouseEnter={() => setHover(i)}
                onClick={() => select(i, false)}
                disabled={disabled}
                className="absolute inset-y-0 right-0 w-1/2 bg-transparent border-0 cursor-pointer disabled:cursor-not-allowed"
              />
            </span>
          );
        })}
      </div>
      <span className="text-sm font-medium text-gray-700 min-w-[2.5rem]">
        {Number(display || 0).toFixed(1)}
      </span>
    </div>
  );
};

/**
 * TrainingDetail — full read-only view of one training plus its participant
 * roster, with role-aware enroll / withdraw / rate / status-change actions.
 *
 * @param {Object} props
 * @param {number} [props.trainingId] - Loaded via API if provided
 * @param {Object} [props.training]   - Pre-loaded training (skips initial fetch)
 * @param {Function} [props.onEdit]
 * @param {Function} [props.onDelete]
 * @param {Function} [props.onClose]
 * @param {Function} [props.onChanged] - Fired after enroll/withdraw/rate so
 *                                       parents can refresh their lists
 * @returns {JSX.Element}
 */
const TrainingDetail = ({
  trainingId,
  training: providedTraining,
  onEdit,
  onDelete,
  onClose,
  onChanged,
}) => {
  const { user } = useAuth() || {};
  const isHR = (user?.roles || []).some((r) => HR_ROLES.includes(r));

  const [training, setTraining] = useState(providedTraining || null);
  const [participants, setParticipants] = useState([]);
  const [loadingTraining, setLoadingTraining] = useState(!providedTraining);
  const [loadingRoster, setLoadingRoster] = useState(true);

  // Action-state per row + one global "act on self" busy
  const [busyParticipantId, setBusyParticipantId] = useState(null);
  const [selfBusy, setSelfBusy] = useState(false);

  // Rating modal state
  const [rateTarget, setRateTarget] = useState(null);
  const [rateValue, setRateValue] = useState(0);
  const [rateComment, setRateComment] = useState('');
  const [rateSubmitting, setRateSubmitting] = useState(false);

  // Withdraw confirmation
  const [withdrawTarget, setWithdrawTarget] = useState(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const { addToast } = useToast();

  /**
   * Resolve the caller's own participant row (if any) so we can show the
   * right action button (Enroll vs Withdraw vs Rate).
   */
  const myParticipantRow = useMemo(() => {
    if (!user?.id) return null;
    return (
      participants.find((p) => {
        // BASE_SELECT exposes Users.email as `email` — match on user id when
        // the API surfaces it, else fall back to email match.
        if (p.user_id != null && user.id != null) {
          return Number(p.user_id) === Number(user.id);
        }
        return p.email && p.email === user.email;
      }) || null
    );
  }, [participants, user]);

  const trainingId_ = training?.id || trainingId;

  /** Load the training metadata when only an id was provided. */
  useEffect(() => {
    if (providedTraining) {
      setTraining(providedTraining);
      setLoadingTraining(false);
      return;
    }
    if (!trainingId) return;

    let cancelled = false;
    (async () => {
      setLoadingTraining(true);
      try {
        const result = await trainingApi.getById(trainingId);
        if (!cancelled) setTraining(result);
      } catch (err) {
        if (!cancelled) {
          addToast(
            err.response?.data?.message || 'Failed to load training',
            'error'
          );
        }
      } finally {
        if (!cancelled) setLoadingTraining(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trainingId, providedTraining, addToast]);

  /** Fetch the participant roster. Re-runs after each mutation. */
  const loadRoster = useCallback(async () => {
    if (!trainingId_) return;
    setLoadingRoster(true);
    try {
      const list = await trainingApi.getParticipants(trainingId_);
      setParticipants(Array.isArray(list) ? list : []);
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load participants',
        'error'
      );
      setParticipants([]);
    } finally {
      setLoadingRoster(false);
    }
  }, [trainingId_, addToast]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  /** Self-enroll the caller. */
  const handleEnrollSelf = async () => {
    if (!trainingId_) return;
    setSelfBusy(true);
    try {
      await trainingApi.enroll(trainingId_);
      addToast(`Enrolled in "${training?.titulli || 'training'}"`, 'success');
      onChanged?.();
      await loadRoster();
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to enroll in training',
        'error'
      );
    } finally {
      setSelfBusy(false);
    }
  };

  /** Confirm + execute withdraw. */
  const handleWithdrawConfirm = async () => {
    const target = withdrawTarget;
    if (!target || !trainingId_) return;
    setWithdrawing(true);
    try {
      // HR / Admin can withdraw anyone; otherwise we always withdraw self.
      const payload =
        isHR && target.employee_id ? { employee_id: target.employee_id } : {};
      await trainingApi.withdraw(trainingId_, payload);
      addToast('Withdrew from training', 'info');
      setWithdrawTarget(null);
      onChanged?.();
      await loadRoster();
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to withdraw',
        'error'
      );
    } finally {
      setWithdrawing(false);
    }
  };

  /** Submit a rating for one participant row. */
  const handleSubmitRating = async () => {
    if (!rateTarget) return;
    if (!Number.isFinite(rateValue) || rateValue < 1 || rateValue > 5) {
      addToast('Rating must be between 1.0 and 5.0', 'error');
      return;
    }
    setRateSubmitting(true);
    try {
      await trainingApi.rateParticipation(rateTarget.id, {
        vleresimi: Number(rateValue),
        komenti: rateComment?.trim() || undefined,
      });
      addToast('Rating submitted', 'success');
      setRateTarget(null);
      setRateValue(0);
      setRateComment('');
      onChanged?.();
      await loadRoster();
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to submit rating',
        'error'
      );
    } finally {
      setRateSubmitting(false);
    }
  };

  /** HR: change a participant's status (enrolled / completed / dropped / no-show). */
  const handleStatusChange = async (participant, nextStatus) => {
    setBusyParticipantId(participant.id);
    try {
      await trainingApi.updateParticipantStatus(participant.id, {
        statusi: nextStatus,
      });
      addToast(`Marked ${nextStatus}`, 'success');
      onChanged?.();
      await loadRoster();
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to update participant status',
        'error'
      );
    } finally {
      setBusyParticipantId(null);
    }
  };

  if (loadingTraining) {
    return (
      <div className="flex justify-center py-10">
        <LoadingSpinner />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-gray-500">
        <p className="text-sm">Training not found.</p>
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

  const taken = Number(training.participant_count) || 0;
  const total = Number(training.kapaciteti) || 0;
  const isFull = total > 0 && taken >= total;
  const isUpcoming = training.statusi === 'upcoming';
  const isCompleted = training.statusi === 'completed';
  const statusBadge =
    STATUS_BADGE_CLASS[training.statusi] || STATUS_BADGE_CLASS.completed;

  return (
    <div className="space-y-5">
      {/* Top bar */}
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
          {onEdit && isHR && (
            <button
              type="button"
              onClick={() => onEdit(training)}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Edit
            </button>
          )}
          {onDelete && isHR && (
            <button
              type="button"
              onClick={() => onDelete(training)}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-red-300 text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Training
            </p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">
              {training.titulli}
            </h2>
            {training.trajner && (
              <p className="mt-1 text-sm text-gray-600">
                Trainer: <span className="font-medium">{training.trajner}</span>
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium capitalize ring-1 ring-inset ${statusBadge}`}
              >
                {training.statusi}
              </span>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 font-medium bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200">
                {formatDate(training.data_fillimit)} →{' '}
                {formatDate(training.data_perfundimit)}
              </span>
              {training.lokacioni && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 font-medium bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200">
                  📍 {training.lokacioni}
                </span>
              )}
            </div>
          </div>
          <div className="sm:w-56">
            <CapacityBar enrolled={taken} capacity={total} />
            {/* Self-action button */}
            <div className="mt-3">
              {!myParticipantRow && isUpcoming && !isFull && (
                <button
                  type="button"
                  onClick={handleEnrollSelf}
                  disabled={selfBusy}
                  className="w-full px-3 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {selfBusy ? 'Enrolling…' : 'Enroll me'}
                </button>
              )}
              {!myParticipantRow && isUpcoming && isFull && (
                <p className="text-xs text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-md px-2 py-1.5 text-center">
                  Training is full
                </p>
              )}
              {myParticipantRow &&
                myParticipantRow.statusi === 'enrolled' &&
                isUpcoming && (
                  <button
                    type="button"
                    onClick={() => setWithdrawTarget(myParticipantRow)}
                    className="w-full px-3 py-2 text-sm font-medium rounded-md bg-white border border-amber-300 text-amber-800 hover:bg-amber-50"
                  >
                    Withdraw
                  </button>
                )}
              {myParticipantRow &&
                isCompleted &&
                myParticipantRow.statusi !== 'cancelled' &&
                myParticipantRow.vleresimi == null && (
                  <button
                    type="button"
                    onClick={() => {
                      setRateTarget(myParticipantRow);
                      setRateValue(myParticipantRow.vleresimi || 0);
                      setRateComment('');
                    }}
                    className="w-full px-3 py-2 text-sm font-medium rounded-md bg-yellow-500 text-white hover:bg-yellow-600"
                  >
                    Rate this training
                  </button>
                )}
              {myParticipantRow && myParticipantRow.vleresimi != null && (
                <p className="text-xs text-gray-600 text-center">
                  Your rating:{' '}
                  <span className="font-semibold">
                    {Number(myParticipantRow.vleresimi).toFixed(1)} / 5.0
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        {training.pershkrimi && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Description
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-line">
              {training.pershkrimi}
            </p>
          </div>
        )}
      </div>

      {/* Roster */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            Participants{' '}
            <span className="text-gray-500 font-normal">
              ({participants.length})
            </span>
          </h3>
          <button
            type="button"
            onClick={loadRoster}
            disabled={loadingRoster}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        {loadingRoster ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : participants.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            No one has enrolled yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {participants.map((p) => {
              const cls =
                PARTICIPANT_BADGE_CLASS[p.statusi] ||
                PARTICIPANT_BADGE_CLASS.enrolled;
              const isBusy = busyParticipantId === p.id;
              return (
                <li
                  key={p.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">
                      {(p.first_name?.[0] || '')}
                      {(p.last_name?.[0] || '')}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {p.first_name} {p.last_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {p.numri_punonjesit ? `${p.numri_punonjesit} · ` : ''}
                        {p.department_emertimi || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${cls}`}
                    >
                      {p.statusi}
                    </span>
                    {p.vleresimi != null && (
                      <span className="text-xs text-gray-600">
                        ★ {Number(p.vleresimi).toFixed(1)}
                      </span>
                    )}
                    {/* HR-only status controls */}
                    {isHR && p.statusi === 'enrolled' && isCompleted && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(p, 'completed')}
                          disabled={isBusy}
                          className="text-xs font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                        >
                          Mark completed
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(p, 'no-show')}
                          disabled={isBusy}
                          className="text-xs font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
                        >
                          No-show
                        </button>
                      </>
                    )}
                    {isHR && p.statusi === 'enrolled' && isUpcoming && (
                      <button
                        type="button"
                        onClick={() => setWithdrawTarget(p)}
                        disabled={isBusy}
                        className="text-xs font-medium text-amber-700 hover:text-amber-900 disabled:opacity-50"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Rating modal — inline panel rather than nested ConfirmDialog so the
          textarea isn't trapped inside a <p> tag. */}
      {rateTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Rate training"
          className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 space-y-3"
        >
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Rate "{training.titulli}"
            </h3>
            <p className="text-sm text-gray-700 mt-1">
              Your rating helps HR evaluate trainings. Setting a rating
              automatically marks your participation as completed.
            </p>
          </div>
          <RatingPicker
            value={rateValue}
            onChange={setRateValue}
            disabled={rateSubmitting}
          />
          <TextareaWithCounter
            rows={3}
            value={rateComment}
            onChange={(e) => setRateComment(e.target.value)}
            maxLength={5000}
            placeholder="Optional feedback for the trainer / HR"
            className="block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            disabled={rateSubmitting}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (rateSubmitting) return;
                setRateTarget(null);
                setRateValue(0);
                setRateComment('');
              }}
              disabled={rateSubmitting}
              className="px-3 py-2 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitRating}
              disabled={rateSubmitting || rateValue < 1}
              className="px-3 py-2 text-sm font-medium rounded-md bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50"
            >
              {rateSubmitting ? 'Submitting…' : 'Submit rating'}
            </button>
          </div>
        </div>
      )}

      {/* Withdraw confirmation */}
      <ConfirmDialog
        isOpen={!!withdrawTarget}
        title="Withdraw from training"
        message={
          withdrawTarget
            ? `Withdraw ${
                withdrawTarget.first_name && withdrawTarget.last_name
                  ? `${withdrawTarget.first_name} ${withdrawTarget.last_name}`
                  : 'this participant'
              } from "${training.titulli}"?`
            : ''
        }
        confirmLabel="Withdraw"
        variant="danger"
        loading={withdrawing}
        onConfirm={handleWithdrawConfirm}
        onCancel={() => !withdrawing && setWithdrawTarget(null)}
      />
    </div>
  );
};

export default TrainingDetail;
