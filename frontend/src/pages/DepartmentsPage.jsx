/**
 * @file frontend/src/pages/DepartmentsPage.jsx
 * @description Departments page orchestrating list, form modal, and detail view
 * @author Dev B
 */

import { useState, useCallback } from 'react';
import * as departmentApi from '../api/departmentApi';
import DepartmentList from '../components/departments/DepartmentList';
import DepartmentForm from '../components/departments/DepartmentForm';
import DepartmentDetail from '../components/departments/DepartmentDetail';
import Modal from '../components/common/Modal';
import { useToast } from '../components/common/Toast';

/** UI view modes */
const VIEW = {
  LIST: 'list',
  DETAIL: 'detail',
};

/**
 * DepartmentsPage — full CRUD flow for departments.
 *
 * Orchestrates the list, create / edit form (inside a modal), and detail view.
 * Uses toast notifications for success / error feedback and refreshes the list
 * after each mutation.
 *
 * @returns {JSX.Element}
 */
const DepartmentsPage = () => {
  const [view, setView] = useState(VIEW.LIST);
  const [selectedDepartment, setSelectedDepartment] = useState(null);

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
   * Open the edit form for a given department.
   */
  const handleEdit = (department) => {
    setFormMode('edit');
    setFormInitialData(department);
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
        await departmentApi.update(formInitialData.id, payload);
        addToast('Department updated successfully', 'success');
      } else {
        await departmentApi.create(payload);
        addToast('Department created successfully', 'success');
      }
      setFormOpen(false);
      setFormInitialData(null);
      refreshList();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        `Failed to ${formMode === 'edit' ? 'update' : 'create'} department`;
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Open the detail view for a department.
   */
  const handleView = (department) => {
    setSelectedDepartment(department);
    setView(VIEW.DETAIL);
  };

  /**
   * Return from detail view to the list.
   */
  const handleCloseDetail = () => {
    setSelectedDepartment(null);
    setView(VIEW.LIST);
  };

  /**
   * Delete a department from the detail view.
   */
  const handleDeleteFromDetail = async (department) => {
    if (!window.confirm(`Delete department "${department.emertimi}"? This cannot be undone.`)) {
      return;
    }
    try {
      await departmentApi.remove(department.id);
      addToast('Department deleted successfully', 'success');
      handleCloseDetail();
      refreshList();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete department';
      addToast(msg, 'error');
    }
  };

  return (
    <div className="p-6">
      {view === VIEW.LIST && (
        <DepartmentList
          key={refreshKey}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onView={handleView}
        />
      )}

      {view === VIEW.DETAIL && selectedDepartment && (
        <DepartmentDetail
          departmentId={selectedDepartment.id}
          onEdit={handleEdit}
          onDelete={handleDeleteFromDetail}
          onClose={handleCloseDetail}
        />
      )}

      {/* Create / Edit modal */}
      <Modal
        isOpen={formOpen}
        onClose={handleFormCancel}
        title={formMode === 'edit' ? 'Edit Department' : 'Create Department'}
        size="md"
      >
        <DepartmentForm
          initialData={formInitialData}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          submitting={submitting}
        />
      </Modal>
    </div>
  );
};

export default DepartmentsPage;
