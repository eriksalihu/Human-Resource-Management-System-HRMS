/**
 * @file frontend/src/pages/TrainingsPage.jsx
 * @description Trainings page orchestrating list, modal form, detail view, HR participant enrollment, and post-completion rating
 * @author Dev B
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as trainingApi from '../api/trainingApi';
import TrainingList from '../components/trainings/TrainingList';
import TrainingForm from '../components/trainings/TrainingForm';
import TrainingDetail from '../components/trainings/TrainingDetail';
import ParticipantForm from '../components/trainings/ParticipantForm';
import Modal from '../components/common/Modal';
import { SkeletonTable } from '../components/common/SkeletonLoader';
import { useToast } from '../components/common/Toast';
import useAuth from '../hooks/useAuth';

/** Roles that can create / edit / delete trainings and bulk-enroll others. */
const HR_ROLES = ['Admin', 'HR Manager'];

/** UI tabs (visibility depends on role). */
const TABS = {
  CATALOG: 'catalog',
  MINE: 'mine',
};

/** Tailwind classes per training status — shared with the list view. */
const STATUS_BADGE_CLASS = {
  upcoming: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  ongoing: 'bg-green-50 text-green-700 ring-green-600/20',
  completed: 'bg-gray-50 text-gray-700 ring-gray-600/20',
  cancelled: 'bg-red-50 text-red-700 ring-red-600/20',
};

/** Format a date as DD/MM/YYYY. */
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
};

/**
 * UI view modes within the catalog tab. Mirrors the list/detail flow used
 * elsewhere in the app (PerformancePage etc.).
 */
const VIEW = {
  LIST: 'list',
  DETAIL: 'detail',
};

/**
 * TrainingsPage — full training module orchestrator.
 *
 *   - "Catalog" tab: filterable list + detail panel; HR gets create/edit/
 *     delete + an "Enroll participant" affordance on the detail view.
 *   - "My Trainings" tab: caller's enrollments grouped by status.
 *
 * Detail view is also the post-completion rating surface — the
 * `TrainingDetail` component handles "Rate this training" inline once the
 * status flips to `completed`.
 *
 * @returns {JSX.Element}
 */
const TrainingsPage = () => {
  const { user } = useAuth() || {};
  const isHR = (user?.roles || []).some((r) => HR_ROLES.includes(r));

  const availableTabs = useMemo(
    () => [
      { id: TABS.CATALOG, label: 'Catalog' },
      { id: TABS.MINE, label: 'My Trainings' },
    ],
    []
  );

  const [activeTab, setActiveTab] = useState(TABS.CATALOG);
  const [visitedTabs, setVisitedTabs] = useState(
    () => new Set([TABS.CATALOG])
  );

  // Catalog view state
  const [view, setView] = useState(VIEW.LIST);
  const [selectedTraining, setSelectedTraining] = useState(null);

  // Modal form state (training create/edit)
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create'); // 'create' | 'edit'
  const [formInitialData, setFormInitialData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Participant enroll modal state
  const [participantModalOpen, setParticipantModalOpen] = useState(false);
  const [participantSubmitting, setParticipantSubmitting] = useState(false);
  const [participantRoster, setParticipantRoster] = useState([]);

  // Force-refresh keys
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const refreshList = useCallback(
    () => setListRefreshKey((k) => k + 1),
    []
  );
  const refreshDetail = useCallback(
    () => setDetailRefreshKey((k) => k + 1),
    []
  );
  const refreshAll = useCallback(() => {
    refreshList();
    refreshDetail();
  }, [refreshList, refreshDetail]);

  const { addToast } = useToast();

  /** Switch tabs, marking the new one visited so its child mounts. */
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setVisitedTabs((prev) => {
      if (prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.add(tabId);
      return next;
    });
  };

  /** Open the create-training form. */
  const handleAdd = () => {
    setFormMode('create');
    setFormInitialData(null);
    setFormOpen(true);
  };

  /** Open the edit-training form. */
  const handleEdit = (row) => {
    setFormMode('edit');
    setFormInitialData(row);
    setFormOpen(true);
  };

  const handleFormCancel = () => {
    setFormOpen(false);
    setFormInitialData(null);
  };

  /** Submit handler for the training form. */
  const handleFormSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit' && formInitialData?.id) {
        const updated = await trainingApi.update(formInitialData.id, payload);
        addToast('Training updated', 'success');
        if (
          view === VIEW.DETAIL &&
          selectedTraining?.id === formInitialData.id
        ) {
          setSelectedTraining(updated);
        }
      } else {
        await trainingApi.create(payload);
        addToast('Training created', 'success');
      }
      setFormOpen(false);
      setFormInitialData(null);
      refreshAll();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        `Failed to ${formMode === 'edit' ? 'update' : 'create'} training`;
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /** Open the detail view for a training. */
  const handleView = (row) => {
    setSelectedTraining(row);
    setView(VIEW.DETAIL);
  };

  /** Return from detail view to the catalog list. */
  const handleCloseDetail = () => {
    setSelectedTraining(null);
    setParticipantRoster([]);
    setView(VIEW.LIST);
  };

  /** Delete confirm + execute (driven from the detail view). */
  const handleDelete = async (row) => {
    if (
      !window.confirm(
        `Delete the training "${row.titulli}"? Participants will be cascade-deleted. This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await trainingApi.remove(row.id);
      addToast('Training deleted', 'success');
      handleCloseDetail();
      refreshAll();
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to delete training';
      addToast(msg, 'error');
    }
  };

  /**
   * Open the participant-enroll modal. We pre-fetch the current roster so
   * `ParticipantForm` can hide already-enrolled employees from the picker.
   */
  const handleOpenParticipantModal = async () => {
    if (!selectedTraining?.id) return;
    try {
      const roster = await trainingApi.getParticipants(selectedTraining.id);
      setParticipantRoster(Array.isArray(roster) ? roster : []);
      setParticipantModalOpen(true);
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to load participant roster';
      addToast(msg, 'error');
    }
  };

  /** Submit handler for the HR enroll-participant flow. */
  const handleParticipantSubmit = async ({ employee_id, statusi }) => {
    if (!selectedTraining?.id) return;
    setParticipantSubmitting(true);
    try {
      // Use the standard enroll endpoint to create the row, then patch
      // status if HR picked something other than 'enrolled' (back-fill case).
      const created = await trainingApi.enroll(selectedTraining.id, {
        employee_id,
      });

      if (statusi !== 'enrolled' && created?.id) {
        await trainingApi.updateParticipantStatus(created.id, { statusi });
      }

      addToast('Participant enrolled', 'success');
      setParticipantModalOpen(false);
      refreshDetail();
      refreshList();
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to enroll participant';
      addToast(msg, 'error');
    } finally {
      setParticipantSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">Trainings</h1>
        <p className="text-sm text-gray-500">
          {isHR
            ? 'Manage the training catalog, rosters, and post-completion ratings'
            : 'Browse upcoming trainings, manage your enrollments, and rate completed sessions'}
        </p>
      </div>

      {/* Tabs */}
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

      {/* Catalog tab */}
      {visitedTabs.has(TABS.CATALOG) && (
        <div hidden={activeTab !== TABS.CATALOG}>
          {view === VIEW.LIST && (
            <TrainingList
              key={`catalog-${listRefreshKey}`}
              onAdd={isHR ? handleAdd : undefined}
              onEdit={isHR ? handleEdit : undefined}
              onView={handleView}
              showAddButton={isHR}
            />
          )}

          {view === VIEW.DETAIL && selectedTraining && (
            <div className="space-y-4">
              {/* HR-only enroll-participant button */}
              {isHR && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleOpenParticipantModal}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                      />
                    </svg>
                    Enroll participant
                  </button>
                </div>
              )}

              <TrainingDetail
                key={`detail-${selectedTraining.id}-${detailRefreshKey}`}
                trainingId={selectedTraining.id}
                training={selectedTraining}
                onEdit={isHR ? handleEdit : undefined}
                onDelete={isHR ? handleDelete : undefined}
                onClose={handleCloseDetail}
                onChanged={refreshAll}
              />
            </div>
          )}
        </div>
      )}

      {/* My Trainings tab */}
      {visitedTabs.has(TABS.MINE) && (
        <div hidden={activeTab !== TABS.MINE}>
          <MyTrainingsPanel key={`mine-${listRefreshKey}`} onView={handleView} />
        </div>
      )}

      {/* Training create / edit modal */}
      <Modal
        isOpen={formOpen}
        onClose={handleFormCancel}
        title={formMode === 'edit' ? 'Edit Training' : 'New Training'}
        size="lg"
      >
        <TrainingForm
          initialData={formInitialData}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          submitting={submitting}
        />
      </Modal>

      {/* Participant enroll modal (HR / Admin only) */}
      <Modal
        isOpen={participantModalOpen}
        onClose={() => !participantSubmitting && setParticipantModalOpen(false)}
        title="Enroll participant"
        size="lg"
      >
        {selectedTraining && (
          <ParticipantForm
            training={selectedTraining}
            existingParticipants={participantRoster}
            onSubmit={handleParticipantSubmit}
            onCancel={() =>
              !participantSubmitting && setParticipantModalOpen(false)
            }
            submitting={participantSubmitting}
          />
        )}
      </Modal>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* My Trainings panel                                                   */
/* ------------------------------------------------------------------ */

/**
 * MyTrainingsPanel — caller's own training history grouped by status with
 * a tap-through into the catalog detail view.
 */
const MyTrainingsPanel = ({ onView }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await trainingApi.getMyTrainings();
      setRows(Array.isArray(result) ? result : []);
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Failed to load your trainings',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  /** Group rows by training status for the section accordion. */
  const grouped = useMemo(() => {
    const buckets = {
      upcoming: [],
      ongoing: [],
      completed: [],
      cancelled: [],
    };
    for (const r of rows) {
      const key = r.training_statusi || r.statusi || 'completed';
      if (buckets[key]) buckets[key].push(r);
    }
    return buckets;
  }, [rows]);

  if (loading) {
    return (
      <div className="p-6">
        <SkeletonTable rows={6} columns={5} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-gray-500">
        <p className="text-sm">
          You haven't enrolled in any trainings yet. Browse the catalog to get
          started.
        </p>
      </div>
    );
  }

  const sections = [
    { key: 'upcoming',  label: 'Upcoming' },
    { key: 'ongoing',   label: 'Ongoing' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="space-y-5">
      {sections.map(({ key, label }) => {
        const list = grouped[key] || [];
        if (list.length === 0) return null;
        return (
          <section key={key}>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900 capitalize">
                {label}
              </h3>
              <span className="text-xs text-gray-500">
                {list.length} training{list.length === 1 ? '' : 's'}
              </span>
            </div>
            <ul className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
              {list.map((p) => {
                const trainingStatus =
                  p.training_statusi || p.statusi || 'completed';
                const cls =
                  STATUS_BADGE_CLASS[trainingStatus] ||
                  STATUS_BADGE_CLASS.completed;
                return (
                  <li
                    key={p.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      if (onView && p.training_id) {
                        onView({ id: p.training_id, titulli: p.training_titulli });
                      }
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm font-medium text-gray-900">
                        {p.training_titulli || `Training #${p.training_id}`}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${cls}`}
                      >
                        {trainingStatus}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatDate(p.training_data_fillimit)} →{' '}
                        {formatDate(p.training_data_perfundimit)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      <span className="capitalize">
                        Status:{' '}
                        <span className="font-medium">{p.statusi}</span>
                      </span>
                      {p.vleresimi != null && (
                        <span>
                          Your rating:{' '}
                          <span className="font-semibold">
                            {Number(p.vleresimi).toFixed(1)}
                          </span>
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
};

export default TrainingsPage;
