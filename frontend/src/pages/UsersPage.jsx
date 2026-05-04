/**
 * @file frontend/src/pages/UsersPage.jsx
 * @description Admin user management page — list with role filters, modal create / edit, role assignment, and soft-delete (deactivate)
 * @author Dev B
 */

import { useState, useCallback } from 'react';
import axiosInstance from '../api/axiosInstance';
import UserList from '../components/users/UserList';
import UserForm from '../components/users/UserForm';
import Modal from '../components/common/Modal';
import { useToast } from '../components/common/Toast';
import useAuth from '../hooks/useAuth';

/** Roles allowed to view this page. */
const ADMIN_ROLES = ['Admin'];

/**
 * UsersPage — admin-only user management.
 *
 * Layout:
 *   - Header with "New user" button
 *   - UserList with create / edit / delete callbacks
 *   - Modal-driven UserForm for create + edit
 *
 * @returns {JSX.Element}
 */
const UsersPage = () => {
  const { user } = useAuth() || {};
  const isAdmin = (user?.roles || []).some((r) => ADMIN_ROLES.includes(r));

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create'); // 'create' | 'edit'
  const [formInitialData, setFormInitialData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);
  const refreshList = useCallback(() => setRefreshKey((k) => k + 1), []);

  const { addToast } = useToast();

  /** Open the create form. */
  const handleAdd = () => {
    setFormMode('create');
    setFormInitialData(null);
    setFormOpen(true);
  };

  /**
   * Open the edit form for a row. We re-fetch via getById so the form
   * receives the row's roles array (the list endpoint doesn't include it).
   */
  const handleEdit = async (row) => {
    setFormMode('edit');
    setFormInitialData(row); // optimistic — open the modal immediately
    setFormOpen(true);
    try {
      const { data } = await axiosInstance.get(`/users/${row.id}`);
      setFormInitialData(data?.data?.user || row);
    } catch {
      // Fall back to whatever the list row gave us.
    }
  };

  const handleFormCancel = () => {
    setFormOpen(false);
    setFormInitialData(null);
  };

  /** Submit handler — POST for create, PUT for edit. */
  const handleFormSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit' && formInitialData?.id) {
        await axiosInstance.put(`/users/${formInitialData.id}`, payload);
        addToast('User updated', 'success');
      } else {
        await axiosInstance.post('/users', payload);
        addToast('User created', 'success');
      }
      setFormOpen(false);
      setFormInitialData(null);
      refreshList();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        `Failed to ${formMode === 'edit' ? 'update' : 'create'} user`;
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Non-admins shouldn't reach this page (route guard handles that), but
  // defend in depth so a stale role cache doesn't expose the form.
  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You need an Admin role to manage users. Reach out to an administrator
          if you think this is wrong.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500">
          Create user accounts, manage roles, and deactivate access. Audit
          logs track every change.
        </p>
      </div>

      <UserList
        key={refreshKey}
        onAdd={handleAdd}
        onEdit={handleEdit}
        showAddButton={true}
      />

      <Modal
        isOpen={formOpen}
        onClose={handleFormCancel}
        title={formMode === 'edit' ? 'Edit user' : 'New user'}
        size="lg"
      >
        <UserForm
          initialData={formInitialData}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          submitting={submitting}
        />
      </Modal>
    </div>
  );
};

export default UsersPage;
