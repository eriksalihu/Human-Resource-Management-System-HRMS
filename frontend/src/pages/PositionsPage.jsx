/**
 * @file frontend/src/pages/PositionsPage.jsx
 * @description Positions page orchestrating list, form modal, and detail view
 * @author Dev B
 */

import { useState, useCallback } from 'react';
import * as positionApi from '../api/positionApi';
import PositionList from '../components/positions/PositionList';
import PositionForm from '../components/positions/PositionForm';
import PositionDetail from '../components/positions/PositionDetail';
import Modal from '../components/common/Modal';
import { useToast } from '../components/common/Toast';

/** UI view modes */
const VIEW = {
  LIST: 'list',
  DETAIL: 'detail',
};

/**
 * PositionsPage — full CRUD flow for positions.
 *
 * Orchestrates the list, create / edit form (inside a modal), and detail view.
 * Uses toast notifications for success / error feedback and refreshes the list
 * after each mutation.
 *
 * @returns {JSX.Element}
 */
const PositionsPage = () => {
  const [view, setView] = useState(VIEW.LIST);
  const [selectedPosition, setSelectedPosition] = useState(null);

  // Form modal state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create'); // 'create' | 'edit'
  const [formInitialData, setFormInitialData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Force-refresh key for the list after mutations
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshList = useCallback(() => setRefreshKey((k) => k + 1), []);

  const { addToast } = useToast();

  /**
   * Open the create form.
   */
  const handleAdd = () => {
    setFormMode('create');
    setFormInitialData(null);
    setFormOpen(true);
  };

  /**
   * Open the edit form for a given position.
   */
  const handleEdit = (position) => {
    setFormMode('edit');
    setFormInitialData(position);
    setFormOpen(true);
  };

  /**
   * Close the form modal without saving.
   */
  const handleFormCancel = () => {
    setFormOpen(false);
    setFormInitialData(null);
  };

  /**
   * Submit the form — either create or update.
   */
  const handleFormSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit' && formInitialData?.id) {
        await positionApi.update(formInitialData.id, payload);
        addToast('Position updated successfully', 'success');
      } else {
        await positionApi.create(payload);
        addToast('Position created successfully', 'success');
      }
      setFormOpen(false);
      setFormInitialData(null);
      refreshList();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        `Failed to ${formMode === 'edit' ? 'update' : 'create'} position`;
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Open the detail view for a position.
   */
  const handleView = (position) => {
    setSelectedPosition(position);
    setView(VIEW.DETAIL);
  };

  /**
   * Return from detail view to the list.
   */
  const handleCloseDetail = () => {
    setSelectedPosition(null);
    setView(VIEW.LIST);
  };

  /**
   * Delete a position from the detail view.
   */
  const handleDeleteFromDetail = async (position) => {
    if (!window.confirm(`Delete position "${position.emertimi}"? This cannot be undone.`)) {
      return;
    }
    try {
      await positionApi.remove(position.id);
      addToast('Position deleted successfully', 'success');
      handleCloseDetail();
      refreshList();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete position';
      addToast(msg, 'error');
    }
  };

  return (
    <div className="p-6">
      {view === VIEW.LIST && (
        <PositionList
          key={refreshKey}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onView={handleView}
        />
      )}

      {view === VIEW.DETAIL && selectedPosition && (
        <PositionDetail
          positionId={selectedPosition.id}
          onEdit={handleEdit}
          onDelete={handleDeleteFromDetail}
          onClose={handleCloseDetail}
        />
      )}

      {/* Create / Edit modal */}
      <Modal
        isOpen={formOpen}
        onClose={handleFormCancel}
        title={formMode === 'edit' ? 'Edit Position' : 'Create Position'}
        size="md"
      >
        <PositionForm
          initialData={formInitialData}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          submitting={submitting}
        />
      </Modal>
    </div>
  );
};

export default PositionsPage;
