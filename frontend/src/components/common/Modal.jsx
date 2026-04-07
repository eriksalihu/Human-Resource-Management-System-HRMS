/**
 * @file frontend/src/components/common/Modal.jsx
 * @description Reusable modal dialog with backdrop, size variants, and animation
 * @author Dev B
 */

import { useEffect } from 'react';

/**
 * Size variant classes for the modal container.
 */
const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

/**
 * Modal - Accessible modal dialog component
 * Renders a centered overlay with configurable size, title, and close behavior.
 * Closes on Escape key press and backdrop click.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Function} props.onClose - Callback to close the modal
 * @param {string} props.title - Modal header title
 * @param {string} [props.size='md'] - Size variant: 'sm', 'md', 'lg', 'xl'
 * @param {React.ReactNode} props.children - Modal body content
 * @returns {JSX.Element|null} The modal dialog or null if closed
 */
const Modal = ({ isOpen, onClose, title, size = 'md', children }) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity animate-[fadeIn_0.15s_ease-in-out]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal container */}
      <div
        className={`relative bg-white rounded-xl shadow-xl ${sizeClasses[size]} w-full mx-4 animate-[fadeIn_0.2s_ease-in-out] z-10`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 id="modal-title" className="text-lg font-semibold text-gray-900">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
