/**
 * @file frontend/src/hooks/useNotifications.js
 * @description Custom hook wrapping NotificationContext consumption
 * @author Dev A
 *
 * Mirrors the pattern from useAuth.js — throws a descriptive error
 * when used outside of a <NotificationProvider>.
 */

import { useContext } from 'react';
import { NotificationContext } from '../context/NotificationContext';

/**
 * useNotifications — convenience hook for the NotificationContext.
 *
 * Exposes:
 *   - notifications, unreadCount, loading, error, lastUpdatedAt
 *   - refresh(), markAsRead(id), markAllAsRead(), deleteNotification(id)
 *   - subscribe(handler) — registers a "new notification" callback
 *
 * @returns {Object} notification context value
 * @throws {Error} If called outside of a NotificationProvider
 */
const useNotifications = () => {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error(
      'useNotifications must be used within a <NotificationProvider>. ' +
        'Wrap your component tree with <NotificationProvider> in App.jsx.'
    );
  }

  return context;
};

export default useNotifications;
