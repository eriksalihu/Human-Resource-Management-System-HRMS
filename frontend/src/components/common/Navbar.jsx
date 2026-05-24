/**
 * @file frontend/src/components/common/Navbar.jsx
 * @description Top navigation bar — sidebar toggle, search, theme toggle, notification bell with unread count, and user dropdown with profile / settings / logout
 * @author Dev B
 *
 * Auth, theme, and notification context consumers are wrapped in `useContext`
 * directly (not via the existing `useAuth` hook) so the navbar degrades
 * gracefully when any provider is missing — useful while routes are being
 * wired up incrementally and a stray <Navbar/> outside its providers
 * shouldn't crash the app.
 */

import { useState, useRef, useEffect, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { NotificationContext } from '../../context/NotificationContext';

/**
 * Format a notification count for the badge — caps at "99+" so the bubble
 * never grows wide enough to break the layout.
 */
const formatBadge = (n) => {
  const num = Number(n) || 0;
  if (num <= 0) return null;
  if (num > 99) return '99+';
  return String(num);
};

/**
 * Navbar — top-of-app navigation bar.
 *
 * @param {Object} props
 * @param {Function} props.onToggleSidebar
 * @returns {JSX.Element}
 */
const Navbar = ({ onToggleSidebar }) => {
  const auth = useContext(AuthContext);
  const notifications = useContext(NotificationContext);

  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const profileRef = useRef(null);
  const notifRef = useRef(null);

  /** Close menus on outside click. */
  useEffect(() => {
    const handler = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /** Close menus on Escape. */
  useEffect(() => {
    const handler = (event) => {
      if (event.key !== 'Escape') return;
      setProfileOpen(false);
      setNotifOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  /** Resolve display name + initials from auth context. */
  const user = auth?.user || null;
  const fullName = user
    ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email
    : '';
  const initials = user
    ? `${(user.first_name?.[0] || '').toUpperCase()}${(user.last_name?.[0] || '').toUpperCase()}` || 'U'
    : 'U';

  /** Notification badge count. */
  const unread = notifications?.unreadCount || 0;
  const badge = formatBadge(unread);
  const recent = (notifications?.notifications || []).slice(0, 5);

  /**
   * Logout via auth context, then redirect to login.
   *
   * `{ replace: true }` drops the protected page from the history
   * stack so pressing Back after logout can't briefly re-render a
   * stale authenticated screen before ProtectedRoute bounces it.
   */
  const handleLogout = async () => {
    setProfileOpen(false);
    if (!auth?.logout) {
      navigate('/login', { replace: true });
      return;
    }
    try {
      await auth.logout();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <nav
      className="no-print fixed top-0 left-0 right-0 z-30 h-16 border-b shadow-sm
        bg-white border-gray-200
"
    >
      <div className="flex items-center justify-between h-full px-4">
        {/* Left: Hamburger + Logo */}
        <div className="flex items-center gap-4">
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500
              text-gray-500 hover:text-gray-700 hover:bg-gray-100
"
            aria-label="Toggle sidebar"
            aria-controls="app-sidebar"
            aria-haspopup="true"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <Link
            to="/dashboard"
            className="text-xl font-semibold text-gray-800"
          >
            HRMS
          </Link>
        </div>

        {/* Center: Search bar */}
        <div className="hidden md:flex flex-1 max-w-md mx-8">
          <div className="relative w-full">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="search"
              placeholder="Search…"
              className="w-full pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                bg-white border border-gray-300 text-gray-900 placeholder-gray-400
"
            />
          </div>
        </div>

        {/* Right: Notifications + Profile */}
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
              aria-expanded={notifOpen}
              className="relative p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500
                text-gray-500 hover:text-gray-700 hover:bg-gray-100
"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {badge && (
                <span
                  className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold text-white bg-red-500 ring-2 ring-white"
                  aria-hidden="true"
                >
                  {badge}
                </span>
              )}
            </button>

            {notifOpen && (
              <div
                role="menu"
                aria-label="Notifications"
                className="absolute right-0 mt-2 w-80 max-h-96 overflow-auto rounded-lg shadow-lg py-1 z-50
                  bg-white border border-gray-200
"
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">
                    Notifications
                  </p>
                  {unread > 0 && notifications?.markAllAsRead && (
                    <button
                      type="button"
                      onClick={() => notifications.markAllAsRead()}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                {recent.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-500">
                    No notifications yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {recent.map((n) => (
                      <li key={n.id}>
                        <Link
                          to={n.link || '/notifications'}
                          onClick={() => {
                            setNotifOpen(false);
                            if (!n.is_read && notifications?.markAsRead) {
                              notifications.markAsRead(n.id);
                            }
                          }}
                          className={`block px-3 py-2 hover:bg-gray-50 ${
                            !n.is_read ? 'bg-indigo-50/40' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {!n.is_read && (
                              <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-indigo-50 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-sm truncate ${
                                  n.is_read
                                    ? 'text-gray-700'
                                    : 'text-gray-900 font-medium'
                                }`}
                              >
                                {n.title}
                              </p>
                              {n.message && (
                                <p className="text-xs text-gray-500 line-clamp-2">
                                  {n.message}
                                </p>
                              )}
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  to="/notifications"
                  onClick={() => setNotifOpen(false)}
                  className="block px-3 py-2 text-center text-xs font-medium border-t border-gray-100
                    text-indigo-600 hover:bg-gray-50
"
                >
                  See all notifications →
                </Link>
              </div>
            )}
          </div>

          {/* User profile dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((v) => !v)}
              aria-label="User menu"
              aria-expanded={profileOpen}
              className="flex items-center gap-2 p-1.5 rounded-lg transition-colors
                hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500
"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-medium overflow-hidden">
                {user?.profile_image ? (
                  <img
                    src={user.profile_image}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
              <span className="text-sm text-gray-700 hidden md:block max-w-[10rem] truncate">
                {fullName || 'Guest'}
              </span>
              <svg
                className={`w-4 h-4 transition-transform ${
                  profileOpen ? 'rotate-180' : ''
                } text-gray-500`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {profileOpen && (
              <div
                role="menu"
                aria-label="User menu"
                className="absolute right-0 mt-2 w-56 rounded-lg shadow-lg py-1 z-50
                  bg-white border border-gray-200
"
              >
                {user && (
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {fullName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {user.email}
                    </p>
                  </div>
                )}
                <Link
                  to="/profile"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm
                    text-gray-700 hover:bg-gray-50
"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  Profile
                </Link>
                <Link
                  to="/profile"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm
                    text-gray-700 hover:bg-gray-50
"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  Settings
                </Link>
                <hr className="my-1 border-gray-200" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm
                    text-red-600 hover:bg-red-50
"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
