/**
 * @file frontend/src/pages/EmployeesPage.jsx
 * @description Employees page orchestrating list, form modal, detail view, and termination flow
 * @author Dev B
 */

import { useState, useCallback } from 'react';
import * as employeeApi from '../api/employeeApi';
import EmployeeList from '../components/employees/EmployeeList';
import EmployeeForm from '../components/employees/EmployeeForm';
import EmployeeDetail from '../components/employees/EmployeeDetail';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useToast } from '../components/common/Toast';

/** UI view modes. */
const VIEW = {
  LIST: 'list',
  DETAIL: 'detail',
};

/**
 * EmployeesPage — full CRUD flow for employees.
 *
 * Orchestrates the list view, modal create / edit form, tabbed detail view,
 * and termination confirmation dialog. Uses toast notifications for all
 * success / error feedback and force-refreshes the list after each mutation.
 *
 * @returns {JSX.Element}
 */
const EmployeesPage = () => {
  const [view, setView] = useState(VIEW.LIST);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Form modal state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create'); // 'create' | 'edit'
  const [formInitialData, setFormInitialData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Termination confirmation
  const [terminateTarget, setTerminateTarget] = useState(null);
  const [terminating, setTerminating] = useState(false);

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
   * Open the edit form for a given employee.
   */
  const handleEdit = (employee) => {
    setFormMode('edit');
    setFormInitialData(employee);
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
        const updated = await employeeApi.update(formInitialData.id, payload);
        addToast('Employee updated successfully', 'success');
        // If we're in the detail view of this employee, refresh its data
        if (view === VIEW.DETAIL && selectedEmployee?.id === formInitialData.id) {
          setSelectedEmployee(updated);
        }
      } else {
        await employeeApi.create(payload);
        addToast('Employee created successfully', 'success');
      }
      setFormOpen(false);
      setFormInitialData(null);
      refreshList();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        `Failed to ${formMode === 'edit' ? 'update' : 'create'} employee`;
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Open the detail view for an employee.
   */
  const handleView = (employee) => {
    setSelectedEmployee(employee);
    setView(VIEW.DETAIL);
  };

  /**
   * Return from detail view to the list.
   */
  const handleCloseDetail = () => {
    setSelectedEmployee(null);
    setView(VIEW.LIST);
  };

  /**
   * Ask for confirmation before terminating an employee.
   */
  const handleTerminateRequest = (employee) => {
    setTerminateTarget(employee);
  };

  /**
   * Perform the termination (soft-delete).
   */
  const handleTerminateConfirm = async () => {
    if (!terminateTarget) return;
    setTerminating(true);
    try {
      await employeeApi.remove(terminateTarget.id);
      addToast(
        `${terminateTarget.first_name} ${terminateTarget.last_name} terminated`,
        'success'
      );
      setTerminateTarget(null);
      // If we were viewing the terminated employee, bounce back to the list
      if (view === VIEW.DETAIL && selectedEmployee?.id === terminateTarget.id) {
        handleCloseDetail();
      }
      refreshList();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to terminate employee';
      addToast(msg, 'error');
    } finally {
      setTerminating(false);
    }
  };

  return (
    <div className="p-6">
      {view === VIEW.LIST && (
        <EmployeeList
          key={refreshKey}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onView={handleView}
        />
      )}

      {view === VIEW.DETAIL && selectedEmployee && (
        <EmployeeDetail
          employeeId={selectedEmployee.id}
          onEdit={handleEdit}
          onTerminate={handleTerminateRequest}
          onClose={handleCloseDetail}
        />
      )}

      {/* Create / Edit modal */}
      <Modal
        isOpen={formOpen}
        onClose={handleFormCancel}
        title={formMode === 'edit' ? 'Edit Employee' : 'Create Employee'}
        size="xl"
      >
        <EmployeeForm
          initialData={formInitialData}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          submitting={submitting}
        />
      </Modal>

      {/* Termination confirmation */}
      <ConfirmDialog
        isOpen={!!terminateTarget}
        title="Terminate Employee"
        message={`Are you sure you want to terminate ${terminateTarget?.first_name} ${terminateTarget?.last_name}? Their record will be set to "terminated".`}
        confirmLabel="Terminate"
        variant="danger"
        loading={terminating}
        onConfirm={handleTerminateConfirm}
        onCancel={() => setTerminateTarget(null)}
      />
    </div>
  );
};

export default EmployeesPage;
