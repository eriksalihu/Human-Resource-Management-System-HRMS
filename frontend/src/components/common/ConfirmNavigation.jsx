/**
 * @file frontend/src/components/common/ConfirmNavigation.jsx
 * @description Unsaved-changes navigation guard. Warns the user before
 *   they leave a dirty form — both for in-app route changes (React
 *   Router `useBlocker`) and for hard browser navigations / tab close
 *   (`beforeunload`).
 * @author Dev A
 *
 * Two leave paths, two mechanisms:
 *
 *   1. **In-app navigation** (clicking a link, programmatic navigate):
 *      React Router v7's `useBlocker` intercepts the transition while
 *      `when` is true. We surface a styled ConfirmDialog; confirming
 *      calls `blocker.proceed()`, cancelling calls `blocker.reset()`.
 *      This gives a real, on-brand modal instead of the browser's
 *      generic `window.confirm`.
 *
 *   2. **Hard navigation** (refresh, closing the tab, typing a new URL,
 *      clicking an external link): the browser will not render custom
 *      UI here for security reasons, so we fall back to the native
 *      `beforeunload` prompt. The text is browser-controlled; setting
 *      `returnValue` is what actually triggers it.
 *
 * Usage — drop it inside any form component:
 *
 *   <ConfirmNavigation when={isDirty} />
 *
 * or use the hook directly for custom UI:
 *
 *   const { blocked, confirm, cancel } = useUnsavedChangesGuard(isDirty);
 */

import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';

/**
 * useUnsavedChangesGuard — the headless half. Wires the Router blocker
 * and the `beforeunload` listener; returns the blocked state plus
 * proceed/reset handlers so a caller can render whatever UI it wants.
 *
 * @param {boolean} when - True while there are unsaved changes
 * @returns {{ blocked: boolean, confirm: () => void, cancel: () => void }}
 */
export const useUnsavedChangesGuard = (when) => {
  /**
   * Block in-app transitions only when `when` is true AND the path is
   * actually changing (don't block search-param-only updates — those
   * are usually filter/pagination state, not a "leave the form" event).
   */
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname
  );

  // Hard-navigation guard (refresh / tab close / external link).
  useEffect(() => {
    if (!when) return undefined;
    const handler = (e) => {
      e.preventDefault();
      // Chrome requires returnValue to be set; the string is ignored by
      // modern browsers (they show their own generic message).
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [when]);

  // If the form becomes clean again while a block is pending (e.g. the
  // user hit "save" in the background), release the blocker so the
  // queued navigation isn't stuck.
  useEffect(() => {
    if (!when && blocker.state === 'blocked') {
      blocker.proceed();
    }
  }, [when, blocker]);

  return {
    blocked: blocker.state === 'blocked',
    confirm: () => blocker.proceed?.(),
    cancel: () => blocker.reset?.(),
  };
};

/**
 * ConfirmNavigation — declarative guard. Renders nothing until an
 * in-app navigation is blocked, then shows a confirm dialog.
 *
 * @param {Object} props
 * @param {boolean} props.when - True while there are unsaved changes
 * @param {string} [props.title='Discard unsaved changes?']
 * @param {string} [props.message] - Body copy for the dialog
 * @param {string} [props.confirmText='Leave anyway']
 * @param {string} [props.cancelText='Stay on page']
 * @returns {JSX.Element|null}
 */
const ConfirmNavigation = ({
  when,
  title = 'Discard unsaved changes?',
  message = 'You have unsaved changes on this page. If you leave now, those changes will be lost.',
  confirmText = 'Leave anyway',
  cancelText = 'Stay on page',
}) => {
  const { blocked, confirm, cancel } = useUnsavedChangesGuard(when);

  if (!blocked) return null;

  return (
    <ConfirmDialog
      isOpen={blocked}
      onClose={cancel}
      onConfirm={confirm}
      title={title}
      message={message}
      confirmText={confirmText}
      cancelText={cancelText}
      danger
    />
  );
};

export default ConfirmNavigation;
