/**
 * @file frontend/src/layouts/AuthLayout.jsx
 * @description Centered layout wrapper for authentication pages (login, register)
 * @author Dev B
 */

import { Outlet } from 'react-router-dom';

/**
 * AuthLayout — centered layout for login and registration pages
 * Uses Tailwind CSS for a clean, centered card-style design
 * @returns {JSX.Element} Centered layout wrapping child routes via Outlet
 */
const AuthLayout = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">HRMS</h1>
          <p className="mt-2 text-sm text-gray-600">
            Sistemi per Menaxhimin e Resurseve Njerezore
          </p>
        </div>
        <Outlet />
      </div>
    </div>
  );
};

export default AuthLayout;
