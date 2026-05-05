/**
 * @file frontend/src/components/common/Sidebar.jsx
 * @description Collapsible sidebar navigation with dark-mode support, smooth collapse animation, and active route indicator
 * @author Dev B
 */

import { NavLink } from 'react-router-dom';

/**
 * Navigation items for the sidebar menu.
 * Each item has a label, path, and SVG icon path.
 */
const navItems = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    label: 'Departments',
    path: '/departments',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  },
  {
    label: 'Positions',
    path: '/positions',
    icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  {
    label: 'Employees',
    path: '/employees',
    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  },
  {
    label: 'Salaries',
    path: '/salaries',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    label: 'Leave Requests',
    path: '/leave-requests',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    label: 'Attendance',
    path: '/attendance',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  {
    label: 'Performance',
    path: '/performance',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    label: 'Trainings',
    path: '/trainings',
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
  {
    label: 'Documents',
    path: '/documents',
    icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
  {
    label: 'Users',
    path: '/users',
    icon: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
];

/**
 * Sidebar - Collapsible navigation sidebar component.
 *
 * Visual treatment:
 *   - Smooth width transition (`transition-[width]` over 300ms with
 *     ease-in-out) for the collapse animation
 *   - Inner content fades / shifts via `opacity` + `pointer-events-none`
 *     when collapsed so labels don't bleed during the animation
 *   - Tailwind `dark:` variants for every visible color (background,
 *     text, hover, ring, active state)
 *   - Active route gets a left-edge accent rail in addition to the
 *     existing colored background, making the current page obvious at
 *     a glance even on small displays
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the sidebar is expanded
 * @returns {JSX.Element}
 */
const Sidebar = ({ isOpen }) => {
  return (
    <aside
      aria-label="Main navigation"
      aria-hidden={!isOpen}
      className={`fixed left-0 top-16 bottom-0 z-20 min-h-[calc(100vh-4rem)] overflow-hidden border-r transition-[width] duration-300 ease-in-out
        ${isOpen ? 'w-64' : 'w-0'}
        bg-white border-gray-200
        dark:bg-gray-900 dark:border-gray-800`}
    >
      <div
        className={`p-4 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <p className="text-xs uppercase tracking-wider mb-4 px-3 text-gray-400 dark:text-gray-500">
          Menu
        </p>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150
                ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active route accent rail */}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full transition-opacity ${
                      isActive
                        ? 'bg-indigo-600 dark:bg-indigo-400 opacity-100'
                        : 'opacity-0'
                    }`}
                  />
                  <svg
                    className="w-5 h-5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={item.icon}
                    />
                  </svg>
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;
