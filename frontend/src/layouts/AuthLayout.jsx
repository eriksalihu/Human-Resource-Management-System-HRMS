/**
 * @file frontend/src/layouts/AuthLayout.jsx
 * @description Minimal centered layout wrapper for authentication pages (login, register, forgot/reset password)
 * @author Dev B (original), Dev A (minimal light-only redesign)
 */

import { Outlet } from 'react-router-dom';

/**
 * AuthLayout — light-only centered wrapper for auth pages.
 * Deliberately omits dark-mode classes so auth screens always
 * render with a clean white/gray-50 appearance regardless of
 * the user's theme preference.
 *
 * @returns {JSX.Element}
 */
const AuthLayout = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-md w-full space-y-8">
        <Outlet />
      </div>
    </div>
  );
};

export default AuthLayout;
