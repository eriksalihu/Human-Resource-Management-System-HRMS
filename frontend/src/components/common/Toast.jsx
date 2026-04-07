/**
 * @file frontend/src/components/common/Toast.jsx
 * @description Toast notification system with variants, auto-dismiss, and stacking
 * @author Dev B
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * Icon and color configuration for each toast variant.
 */
const variantConfig = {
  success: {
    bgClass: 'bg-green-50 border-green-200',
    iconClass: 'text-green-500',
    icon: 'M5 13l4 4L19 7',
  },
  error: {
    bgClass: 'bg-red-50 border-red-200',
    iconClass: 'text-red-500',
    icon: 'M6 18L18 6M6 6l12 12',
  },
  warning: {
    bgClass: 'bg-yellow-50 border-yellow-200',
    iconClass: 'text-yellow-500',
    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z',
  },
  info: {
    bgClass: 'bg-blue-50 border-blue-200',
    iconClass: 'text-blue-500',
    icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
};

/**
 * Single toast notification item.
 *
 * @param {Object} props
 * @param {string} props.id - Unique identifier for the toast
 * @param {string} props.message - The notification message
 * @param {string} [props.variant='info'] - Variant: 'success', 'error', 'warning', 'info'
 * @param {Function} props.onDismiss - Callback to remove this toast
 * @param {number} [props.duration=5000] - Auto-dismiss duration in milliseconds
 */
const ToastItem = ({ id, message, variant = 'info', onDismiss, duration = 5000 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const config = variantConfig[variant] || variantConfig.info;

  useEffect(() => {
    // Trigger slide-in animation
    requestAnimationFrame(() => setIsVisible(true));

    // Auto-dismiss timer
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onDismiss(id), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onDismiss(id), 300);
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border rounded-lg shadow-lg transition-all duration-300 ${config.bgClass} ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
      role="alert"
    >
      {/* Icon */}
      <svg className={`w-5 h-5 flex-shrink-0 ${config.iconClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
      </svg>

      {/* Message */}
      <p className="text-sm text-gray-700 flex-1">{message}</p>

      {/* Close button */}
      <button
        onClick={handleClose}
        className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Dismiss notification"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

/**
 * ToastContainer - Stacking container for toast notifications
 * Manages a list of active toasts and renders them in a fixed position.
 *
 * @param {Object} props
 * @param {Array} props.toasts - Array of toast objects { id, message, variant, duration }
 * @param {Function} props.onDismiss - Callback to remove a toast by id
 * @returns {JSX.Element} The toast container
 */
const ToastContainer = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          message={toast.message}
          variant={toast.variant}
          duration={toast.duration}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
};

/**
 * useToast - Custom hook for managing toast notifications
 * Returns a toast list, an addToast function, and a dismissToast function.
 *
 * @returns {{ toasts: Array, addToast: Function, dismissToast: Function }}
 */
export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, variant = 'info', duration = 5000) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, variant, duration }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
};

export default ToastContainer;
