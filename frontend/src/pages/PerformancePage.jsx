/**
 * @file frontend/src/pages/PerformancePage.jsx
 * @description Performance reviews page orchestrating list, modal form, detail view, and role-based My Reviews tab
 * @author Dev B
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as performanceReviewApi from '../api/performanceReviewApi';
import ReviewList from '../components/performance/ReviewList';
import ReviewForm from '../components/performance/ReviewForm';
import ReviewDetail from '../components/performance/ReviewDetail';
import Modal from '../components/common/Modal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useToast } from '../components/common/Toast';
import useAuth from '../hooks/useAuth';

/** Roles allowed to author reviews. */
const REVIEWER_ROLES = ['Admin', 'HR Manager', 'Department Manager'];

/** Roles allowed to see the org-wide list view. */
const HR_ROLES = ['Admin', 'HR Manager', 'Department Manager'];

/** UI tabs (visibility depends on role). */
const TABS = {
  MINE: 'mine',
  ALL: 'all',
};

/** UI view modes within the "All" tab. */
const VIEW = {
  LIST: 'list',
  DETAIL: 'detail',
};

/** Tone classes per rating bucket — reused by the My Reviews list. */
const ratingTone = (rating) => {
  const n = Number(rating);
  if (!Number.isFinite(n)) return 'bg-gray-100 text-gray-700';
  if (n >= 4.5) return 'bg-emerald-100 text-emerald-800';
  if (n >= 3.5) return 'bg-green-100 text-green-800';
  if (n >= 2.5) return 'bg-yellow-100 text-yellow-800';
  if (n >= 1.5) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
};

/** Format an ISO-like date as DD/MM/YYYY. */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/**
 * PerformancePage — full review module.
 *
 * Tabs:
 *   - "My Reviews": every authenticated user — own reviews + average rating
 *   - "All Reviews": HR / Admin / Manager — full list with create/edit/delete
 *
 * Within the "All" tab, view toggles between LIST and DETAIL. Switching
 * to DETAIL preserves the underlying list state so going back is instant.
 *
 * @returns {JSX.Element}
 */
const PerformancePage = () => {
  const { user } = useAuth() || {};
  const roles = user?.roles || [];
  const isReviewer = roles.some((r) => REVIEWER_ROLES.includes(r));
  const isHR = roles.some((r) => HR_ROLES.includes(r));

  /** Available tabs depend on role. */
  const availableTabs = useMemo(() => {
    const tabs = [{ id: TABS.MINE, label: 'My Reviews' }];
    if (isHR) tabs.push({ id: TABS.ALL, label: 'All Reviews' });
    return tabs;
  }, [isHR]);

  const [activeTab, setActiveTab] = useState(TABS.MINE);
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([TABS.MINE]));

  // "All" tab state
  const [view, setView] = useState(VIEW.LIST);
  const [selectedReview, setSelectedReview] = useState(null);

  // Modal form state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create'); // 'create' | 'edit'
  const [formInitialData, setFormInitialData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Refresh key forces ReviewList to remount + refetch after mutations
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshAll = useCallback(() => setRefreshKey((k) => k + 1), []);

  const { addToast } = useToast();

  /**
   * Switch tabs, marking the new one visited so its child mounts and
   * stays mounted across switches via `hidden`.
   */
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setVisitedTabs((prev) => {
      if (prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.add(tabId);
      return next;
    });
  };

  /** Open the create form. Reviewers only — list hides the button otherwise. */
  const handleAdd = () => {
    setFormMode('create');
    setFormInitialData(null);
    setFormOpen(true);
  };

  /** Open the edit form. */
  const handleEdit = (row) => {
    setFormMode('edit');
    setFormInitialData(row);
    setFormOpen(true);
  };

  const handleFormCancel = () => {
    setFormOpen(false);
    setFormInitialData(null);
  };

  /** Submit handler for the create / edit modal. */
  const handleFormSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit' && formInitialData?.id) {
        const updated = await performanceReviewApi.update(
          formInitialData.id,
          payload
        );
        addToast('Review updated', 'success');
        // If we're viewing this review, refresh its detail panel inline.
        if (
          view === VIEW.DETAIL &&
          selectedReview?.id === formInitialData.id
        ) {
          setSelectedReview(updated);
        }
      } else {
        await performanceReviewApi.create(payload);
        addToast('Review submitted', 'success');
      }
      setFormOpen(false);
      setFormInitialData(null);
      refreshAll();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        `Failed to ${formMode === 'edit' ? 'update' : 'submit'} review`;
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /** Open the detail panel for a row. */
  const handleView = (row) => {
    setSelectedReview(row);
    setView(VIEW.DETAIL);
  };

  /** Return from the detail panel back to the list. */
  const handleCloseDetail = () => {
    setSelectedReview(null);
    setView(VIEW.LIST);
  };

  /**
   * Delete from the detail panel — same flow as ReviewList's row delete
   * but driven from inside the detail view.
   */
  const handleDelete = async (row) => {
    if (
      !window.confirm(
        `Delete the ${row.periudha || ''} review for ${row.first_name} ${
          row.last_name
        }? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await performanceReviewApi.remove(row.id);
      addToast('Review deleted', 'success');
      handleCloseDetail();
      refreshAll();
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to delete review';
      addToast(msg, 'error');
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Performance Reviews</h1>
        <p className="text-sm text-gray-500">
          {isReviewer
            ? 'Author reviews for your team and track progress over periods'
            : 'View your performance feedback and objectives'}
        </p>
      </div>

      {/* Tabs (only shown when more than one is available) */}
      {availableTabs.length > 1 && (
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6" aria-label="Tabs">
            {availableTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`whitespace-nowrap border-b-2 py-2 px-1 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-indigo-600 text-indigo-700'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {/* My Reviews tab */}
      {visitedTabs.has(TABS.MINE) && (
        <div hidden={activeTab !== TABS.MINE}>
          <MyReviewsPanel key={`mine-${refreshKey}`} />
        </div>
      )}

      {/* All Reviews tab — list + detail */}
      {visitedTabs.has(TABS.ALL) && isHR && (
        <div hidden={activeTab !== TABS.ALL}>
          {view === VIEW.LIST && (
            <ReviewList
              key={`all-${refreshKey}`}
              onAdd={isReviewer ? handleAdd : undefined}
              onEdit={isReviewer ? handleEdit : undefined}
              onView={handleView}
              showAddButton={isReviewer}
            />
          )}
          {view === VIEW.DETAIL && selectedReview && (
            <ReviewDetail
              reviewId={selectedReview.id}
              review={selectedReview}
              onEdit={isReviewer ? handleEdit : undefined}
              onDelete={isReviewer ? handleDelete : undefined}
              onClose={handleCloseDetail}
            />
          )}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        isOpen={formOpen}
        onClose={handleFormCancel}
        title={
          formMode === 'edit'
            ? 'Edit Performance Review'
            : 'New Performance Review'
        }
        size="xl"
      >
        <ReviewForm
          initialData={formInitialData}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          submitting={submitting}
        />
      </Modal>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* My Reviews panel                                                     */
/* ------------------------------------------------------------------ */

/**
 * MyReviewsPanel — read-only view of the caller's own reviews and their
 * average rating across all periods.
 */
const MyReviewsPanel = () => {
  const [data, setData] = useState({
    reviews: [],
    average_rating: { average: null, review_count: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await performanceReviewApi.getMyReviews();
      setData({
        reviews: result?.reviews || [],
        average_rating:
          result?.average_rating || { average: null, review_count: 0 },
      });
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to load your reviews';
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  if (selected) {
    return (
      <ReviewDetail
        review={selected}
        onClose={() => setSelected(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <LoadingSpinner />
      </div>
    );
  }

  const avg = Number(data.average_rating?.average);
  const hasAvg = Number.isFinite(avg);

  return (
    <div className="space-y-5">
      {/* Headline tile */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Average rating across {data.average_rating.review_count} review
            {data.average_rating.review_count === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-3xl font-bold text-gray-900">
            {hasAvg ? avg.toFixed(2) : '—'}
            {hasAvg && (
              <span className="text-base font-normal text-gray-500 ml-1">
                / 5.0
              </span>
            )}
          </p>
        </div>
        {hasAvg && (
          <span
            className={`inline-flex items-center self-start sm:self-auto rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ring-transparent ${ratingTone(
              avg
            )}`}
          >
            {avg >= 4.5
              ? 'Outstanding'
              : avg >= 3.5
                ? 'Exceeds expectations'
                : avg >= 2.5
                  ? 'Meets expectations'
                  : avg >= 1.5
                    ? 'Needs improvement'
                    : 'Below expectations'}
          </span>
        )}
      </div>

      {/* Review list */}
      {data.reviews.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-gray-500">
          <p className="text-sm">
            You don't have any performance reviews yet. They'll appear here
            once your manager submits one.
          </p>
        </div>
      ) : (
        <ul className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          {data.reviews.map((r) => (
            <li
              key={r.id}
              className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-gray-50 cursor-pointer"
              onClick={() => setSelected(r)}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm text-gray-700">
                  {r.periudha || '—'}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent ${ratingTone(
                    r.nota
                  )}`}
                >
                  {Number(r.nota).toFixed(1)} / 5.0
                </span>
                <span className="text-xs text-gray-500">
                  Reviewed on {formatDate(r.data_vleresimit)}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                {r.reviewer_first_name || r.reviewer_last_name
                  ? `Reviewer: ${r.reviewer_first_name || ''} ${r.reviewer_last_name || ''}`.trim()
                  : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PerformancePage;
