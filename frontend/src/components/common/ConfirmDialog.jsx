/**
 * @file frontend/src/components/common/ConfirmDialog.jsx
 * @description Confirmation dialog for destructive actions, extends Modal
 * @author Dev B
 */

import Modal from './Modal';

/**
 * ConfirmDialog - Confirmation dialog for delete/destructive actions
 * Wraps the Modal component with confirm/cancel buttons and danger styling.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the dialog is visible
 * @param {Function} props.onClose - Callback to close without confirming
 * @param {Function} props.onConfirm - Callback when user confirms the action
 * @param {string} [props.title='Confirm Action'] - Dialog header title
 * @param {string} props.message - The confirmation message to display
 * @param {string} [props.confirmText='Confirm'] - Text for the confirm button
 * @param {string} [props.cancelText='Cancel'] - Text for the cancel button
 * @param {boolean} [props.danger=false] - Whether to use danger (red) styling
 * @returns {JSX.Element|null} The confirmation dialog
 */
const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
}) => {
  const confirmButtonClass = danger
    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
    : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        {/* Warning icon for danger variant */}
        {danger && (
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
        )}

        {/* Message */}
        <p className="text-sm text-gray-600 text-center">{message}</p>

        {/* Action buttons */}
        <div className="flex gap-3 justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${confirmButtonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
