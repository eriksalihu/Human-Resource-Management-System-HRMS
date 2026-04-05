/**
 * @file frontend/src/layouts/MainLayout.jsx
 * @description Main dashboard layout with sidebar, top navbar, and content area
 * @author Dev B
 */

import { useState } from 'react';
import { Outlet } from 'react-router-dom';

/**
 * MainLayout - Dashboard layout skeleton
 * Wraps authenticated pages with sidebar navigation and top navbar.
 * Uses Tailwind CSS grid/flex for responsive layout structure.
 *
 * @returns {JSX.Element} The main application layout
 */
const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Navbar */}
      <nav className="bg-white shadow-sm border-b border-gray-200 fixed top-0 left-0 right-0 z-30 h-16">
        <div className="flex items-center justify-between h-full px-4">
          {/* Left: Hamburger + Logo */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Toggle sidebar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-xl font-semibold text-gray-800">HRMS</span>
          </div>

          {/* Right: User area placeholder */}
          <div className="flex items-center gap-4">
            {/* Notification bell placeholder */}
            <button className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 relative">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>

            {/* User profile placeholder */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-medium">
                U
              </div>
              <span className="text-sm text-gray-700 hidden md:block">User</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Layout body */}
      <div className="flex pt-16">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
          } bg-white border-r border-gray-200 min-h-[calc(100vh-4rem)] transition-all duration-300 ease-in-out fixed left-0 top-16 bottom-0 z-20`}
        >
          <div className="p-4">
            {/* Sidebar navigation placeholder */}
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-4">Navigation</p>
            <nav className="space-y-1">
              <p className="text-sm text-gray-500 px-3 py-2">Sidebar content will go here</p>
            </nav>
          </div>
        </aside>

        {/* Main content area */}
        <main
          className={`${
            sidebarOpen ? 'ml-64' : 'ml-0'
          } flex-1 transition-all duration-300 ease-in-out`}
        >
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
