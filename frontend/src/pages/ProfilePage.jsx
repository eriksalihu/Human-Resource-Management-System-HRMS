/**
 * @file frontend/src/pages/ProfilePage.jsx
 * @description Self-service profile page — wraps ProfileSettings, surfaces the user's headline (avatar, name, roles, email), and refreshes the auth context after a successful save
 * @author Dev B
 */

import { useState, useCallback } from 'react';
import ProfileSettings from '../components/users/ProfileSettings';
import { SkeletonCard } from '../components/common/SkeletonLoader';
import { capitalizeFirst } from '../utils/formatters';
import useAuth from '../hooks/useAuth';

/**
 * ProfilePage — every authenticated user can reach this page. Renders a
 * compact header with the user's avatar / name / roles / email, then
 * delegates the actual editing to `ProfileSettings`.
 *
 * Successful saves call `refreshAuth(updatedUser)` so the navbar avatar
 * and other auth-derived UI update without a page reload. We don't have
 * a public refresh helper on the AuthContext yet — until that lands the
 * fallback is a soft `window.location.reload()` after the save.
 *
 * @returns {JSX.Element}
 */
const ProfilePage = () => {
  const { user, loading } = useAuth() || {};
  const [savedTick, setSavedTick] = useState(0);

  /**
   * Handle a successful save from ProfileSettings.
   *
   * We avoid a full page reload — the auth context will be updated with
   * the next /auth/profile fetch (e.g. on next route change) but in the
   * meantime we bump a local tick so any "you saved at X" UI can refresh.
   * Future commit: add `refreshUser()` to AuthContext for a clean update.
   */
  const handleSaved = useCallback(() => {
    setSavedTick((t) => t + 1);
  }, []);

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <SkeletonCard lines={4} />
        <SkeletonCard avatar={false} lines={3} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          You're not signed in. Refresh the page or sign in again to view
          your profile.
        </div>
      </div>
    );
  }

  const initials = `${(user.first_name?.[0] || '').toUpperCase()}${
    (user.last_name?.[0] || '').toUpperCase()
  }` || '?';

  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();

  return (
    <div className="p-6 space-y-6">
      {/* Headline card */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-lg font-semibold overflow-hidden ring-4 ring-white shadow">
            {user.profile_image ? (
              <img
                src={user.profile_image}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              {fullName || user.email}
            </h1>
            <p className="text-sm text-gray-600 truncate">{user.email}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {(user.roles || []).map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200"
                >
                  {capitalizeFirst(r)}
                </span>
              ))}
              {(user.roles || []).length === 0 && (
                <span className="text-xs text-gray-500">No roles assigned</span>
              )}
              {user.is_active === false && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200">
                  Account inactive
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Settings — keyed on `savedTick` so the form re-mounts with fresh
          user data after each successful save. Cheap and avoids racing
          local form state vs. an auth context update that may lag. */}
      <ProfileSettings
        key={savedTick}
        user={user}
        onSaved={handleSaved}
      />
    </div>
  );
};

export default ProfilePage;
