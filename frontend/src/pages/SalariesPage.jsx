/**
 * @file frontend/src/pages/SalariesPage.jsx
 * @description Salaries page orchestrating records list, create/edit modal, and payroll summary tab
 * @author Dev B
 */

import { useState, useCallback } from 'react';
import * as salaryApi from '../api/salaryApi';
import SalaryList from '../components/salaries/SalaryList';
import SalaryForm from '../components/salaries/SalaryForm';
import PayrollSummary from '../components/salaries/PayrollSummary';
import Modal from '../components/common/Modal';
import { useToast } from '../components/common/Toast';

/** Top-level tabs. */
const TABS = {
  RECORDS: 'records',
  PAYROLL: 'payroll',
};

const TAB_META = [
  { id: TABS.RECORDS, label: 'Records' },
  { id: TABS.PAYROLL, label: 'Payroll Summary' },
];

/**
 * SalariesPage — tabbed navigation between per-employee salary records
 * and the aggregated payroll summary, with a modal form for create / edit.
 *
 * Lazy-mounts the Payroll tab (only renders once visited) so the dashboard
 * queries don't fire until the user opens that tab.
 *
 * @returns {JSX.Element}
 */
const SalariesPage = () => {
  const [activeTab, setActiveTab] = useState(TABS.RECORDS);
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([TABS.RECORDS]));

  // Modal form state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create'); // 'create' | 'edit'
  const [formInitialData, setFormInitialData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Force-refresh key so the list reloads after mutations
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshList = useCallback(() => setRefreshKey((k) => k + 1), []);

  const { addToast } = useToast();

  /**
   * Switch to a new tab, marking it as visited so its child mounts.
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

  /**
   * Open the create form.
   */
  const handleAdd = () => {
    setFormMode('create');
    setFormInitialData(null);
    setFormOpen(true);
  };

  /**
   * Open the edit form for a given salary record.
   */
  const handleEdit = (salary) => {
    setFormMode('edit');
    setFormInitialData(salary);
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
        await salaryApi.update(formInitialData.id, payload);
        addToast('Salary record updated', 'success');
      } else {
        await salaryApi.create(payload);
        addToast('Salary record created', 'success');
      }
      setFormOpen(false);
      setFormInitialData(null);
      refreshList();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        `Failed to ${formMode === 'edit' ? 'update' : 'create'} salary record`;
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Salaries</h1>
          <p className="text-sm text-gray-500">
            Manage monthly salary records and review payroll totals
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
          {TAB_META.map((tab) => {
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

      {/* Tab panels — lazy mounted via visitedTabs, kept alive with `hidden` */}
      {visitedTabs.has(TABS.RECORDS) && (
        <div hidden={activeTab !== TABS.RECORDS}>
          <SalaryList
            key={refreshKey}
            onAdd={handleAdd}
            onEdit={handleEdit}
          />
        </div>
      )}

      {visitedTabs.has(TABS.PAYROLL) && (
        <div hidden={activeTab !== TABS.PAYROLL}>
          <PayrollSummary />
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        isOpen={formOpen}
        onClose={handleFormCancel}
        title={formMode === 'edit' ? 'Edit Salary Record' : 'Create Salary Record'}
        size="xl"
      >
        <SalaryForm
          initialData={formInitialData}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          submitting={submitting}
        />
      </Modal>
    </div>
  );
};

export default SalariesPage;
