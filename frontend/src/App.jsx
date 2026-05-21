/**
 * @file frontend/src/App.jsx
 * @description Root application component — wraps the route tree with
 *   ThemeProvider / AuthProvider / NotificationProvider, code-splits page
 *   modules via React.lazy with per-route Suspense boundaries, surrounds
 *   the tree with a top-level ErrorBoundary, and adds per-page boundaries
 *   so a single page crash doesn't take down the navbar / sidebar /
 *   sibling routes
 * @author Dev A (original boundaries), Dev B (per-route Suspense + preload)
 *
 * Two layers of error boundaries:
 *   - **App-level** (outermost) — last line of defense. Catches errors
 *     thrown by the router, the provider stack, or anything else outside
 *     a specific route. Rendering of this boundary's fallback means the
 *     entire app is unusable; user gets a "Reload page" CTA.
 *   - **Route-level** (per page) — catches errors thrown inside a single
 *     lazy-loaded page module. The navbar / sidebar stay mounted and
 *     usable; only the affected page renders the fallback. Resets
 *     automatically when the user navigates to a different route via
 *     `resetKey={location.pathname}`.
 *
 * v2 (commit 228 — Dev B) moves the Suspense boundary from above
 * `<Routes>` down to each route's element. The benefit:
 *   - Before: when ANY page chunk loaded, the full <Routes /> subtree
 *     (including MainLayout) unmounted to show the global fallback.
 *     Users saw the navbar + sidebar flash on every cold navigation.
 *   - After: only the page's content area suspends. MainLayout stays
 *     mounted, the sidebar keeps your nav state, and the fallback
 *     renders inline where the page content would appear.
 *
 * Lazy modules are wrapped in `lazyWithPreload`, which attaches a
 * `.preload()` method so future commits (Sidebar hover, link focus,
 * idle prefetch) can warm the chunk before the user clicks.
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';
import AuthLayout from './layouts/AuthLayout';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/common/ProtectedRoute';
import LoadingSpinner from './components/common/LoadingSpinner';
import ErrorBoundary from './components/common/ErrorBoundary';
import RateLimitNotice from './components/common/RateLimitNotice';

/**
 * Public auth pages — kept eager so the login screen paints without a
 * Suspense flash on cold load (small bundle, frequently hit).
 */
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';

/**
 * Error pages — eager for the same reason. They're tiny and always
 * loaded as a fallback, so lazy-loading would just add a flash.
 */
import NotFoundPage from './pages/NotFoundPage';
import UnauthorizedPage from './pages/UnauthorizedPage';

/**
 * `lazyWithPreload` — `React.lazy` plus a `.preload()` method.
 *
 * Calling `.preload()` triggers the import without rendering the
 * component. This is the hook future link / sidebar commits will use:
 *
 *   <Link
 *     to="/employees"
 *     onPointerEnter={() => EmployeesPage.preload()}
 *     onFocus={() => EmployeesPage.preload()}
 *   />
 *
 * Multiple calls to preload() return the same cached promise — the
 * underlying dynamic import is memoized by the bundler, so calling
 * preload() liberally is cheap. We attach `.preload` directly onto the
 * lazy component so consumers don't need to import a separate registry.
 *
 * @param {() => Promise<{ default: React.ComponentType }>} loader
 * @returns {React.LazyExoticComponent & { preload: () => Promise<*> }}
 */
const lazyWithPreload = (loader) => {
  const Component = lazy(loader);
  Component.preload = loader;
  return Component;
};

/**
 * Authenticated pages are code-split. Each chunk only loads when the
 * user navigates to that page (or pre-emptively if a Sidebar link is
 * hovered). The Suspense fallback on each Route handles the loading
 * state without unmounting MainLayout.
 *
 * The /* @vite-ignore *\/ marker keeps Vite's static analyzer from
 * warning on intentionally-dynamic imports. Each `import()` here is
 * static, so chunk-naming + tree-shaking work normally.
 */
const DashboardPage = lazyWithPreload(() => import('./pages/DashboardPage'));
const DepartmentsPage = lazyWithPreload(() => import('./pages/DepartmentsPage'));
const EmployeesPage = lazyWithPreload(() => import('./pages/EmployeesPage'));
const PositionsPage = lazyWithPreload(() => import('./pages/PositionsPage'));
const AttendancePage = lazyWithPreload(() => import('./pages/AttendancePage'));
const LeavesPage = lazyWithPreload(() => import('./pages/LeavesPage'));
const SalariesPage = lazyWithPreload(() => import('./pages/SalariesPage'));
const TrainingsPage = lazyWithPreload(() => import('./pages/TrainingsPage'));
const PerformancePage = lazyWithPreload(() => import('./pages/PerformancePage'));
const DocumentsPage = lazyWithPreload(() => import('./pages/DocumentsPage'));
const NotificationsPage = lazyWithPreload(() => import('./pages/NotificationsPage'));
const UsersPage = lazyWithPreload(() => import('./pages/UsersPage'));
const ProfilePage = lazyWithPreload(() => import('./pages/ProfilePage'));

/**
 * Suspense fallback shown while a lazy route module loads. Centred so it
 * looks intentional even on a large viewport. The fallback now renders
 * INSIDE MainLayout so it occupies only the content area — the sidebar
 * and navbar remain visible and usable.
 */
const RouteFallback = () => (
  <div className="flex items-center justify-center py-20">
    <LoadingSpinner />
  </div>
);

/**
 * LazyRoute — wraps a page in both an ErrorBoundary (auto-reset on
 * navigation) AND a Suspense boundary (per-route, so chunk loads don't
 * unmount the surrounding layout).
 *
 * The Suspense sits INSIDE the ErrorBoundary so chunk-load failures
 * (network errors during dynamic import) surface as a page error
 * rather than an unhandled promise rejection.
 *
 * @param {Object} props
 * @param {string} props.name - Used in error log lines for triage
 * @param {React.ReactNode} props.children
 */
const LazyRoute = ({ name, children }) => {
  const location = useLocation();
  return (
    <ErrorBoundary
      name={name}
      resetKey={location.pathname}
      title="This page hit an error"
      hideReload
    >
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
};

/**
 * Root App — provider stack + router + lazy routes.
 *
 * Provider order matters:
 *   1. ThemeProvider on the outside so theme is available everywhere,
 *      including inside the AuthLayout (login screen needs the theme too).
 *   2. AuthProvider next — the source of truth for `user` / `isAuthenticated`.
 *   3. NotificationProvider innermost — depends on `useAuth()` for its
 *      polling gate, so the AuthProvider must be its parent.
 *
 * @returns {JSX.Element}
 */
function App() {
  return (
    <ErrorBoundary name="app-root">
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <NotificationProvider>
              {/* Always-mounted global 429 banner — registers itself
                  with the axios interceptor and shows a retry-after
                  countdown regardless of the active route. */}
              <RateLimitNotice />
              <Routes>
                {/* Public auth routes */}
                <Route element={<AuthLayout />}>
                  <Route
                    path="/login"
                    element={
                      <LazyRoute name="login">
                        <LoginPage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/register"
                    element={
                      <LazyRoute name="register">
                        <RegisterPage />
                      </LazyRoute>
                    }
                  />
                  {/* Password-reset flow. The components render bare
                      forms, so they're wrapped in the same card chrome
                      LoginPage uses (AuthLayout only provides the
                      centered container + branding). */}
                  <Route
                    path="/forgot-password"
                    element={
                      <LazyRoute name="forgot-password">
                        <div className="bg-white dark:bg-gray-900 shadow-md rounded-xl p-8 border border-gray-200 dark:border-gray-800">
                          <ForgotPassword />
                        </div>
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/reset-password"
                    element={
                      <LazyRoute name="reset-password">
                        <div className="bg-white dark:bg-gray-900 shadow-md rounded-xl p-8 border border-gray-200 dark:border-gray-800">
                          <ResetPassword />
                        </div>
                      </LazyRoute>
                    }
                  />
                </Route>

                {/* Protected routes inside MainLayout */}
                <Route
                  element={
                    <ProtectedRoute>
                      <MainLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route
                    path="/"
                    element={
                      <LazyRoute name="dashboard">
                        <DashboardPage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/dashboard"
                    element={
                      <LazyRoute name="dashboard">
                        <DashboardPage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/departments"
                    element={
                      <LazyRoute name="departments">
                        <DepartmentsPage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/employees"
                    element={
                      <LazyRoute name="employees">
                        <EmployeesPage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/positions"
                    element={
                      <LazyRoute name="positions">
                        <PositionsPage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/attendance"
                    element={
                      <LazyRoute name="attendance">
                        <AttendancePage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/leaves"
                    element={
                      <LazyRoute name="leaves">
                        <LeavesPage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/leave-requests"
                    element={
                      <LazyRoute name="leaves">
                        <LeavesPage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/salaries"
                    element={
                      <LazyRoute name="salaries">
                        <SalariesPage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/trainings"
                    element={
                      <LazyRoute name="trainings">
                        <TrainingsPage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/performance"
                    element={
                      <LazyRoute name="performance">
                        <PerformancePage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/documents"
                    element={
                      <LazyRoute name="documents">
                        <DocumentsPage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/notifications"
                    element={
                      <LazyRoute name="notifications">
                        <NotificationsPage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <LazyRoute name="profile">
                        <ProfilePage />
                      </LazyRoute>
                    }
                  />

                  {/* Admin-only routes */}
                  <Route
                    path="/users"
                    element={
                      <ProtectedRoute requiredRoles={['Admin']}>
                        <LazyRoute name="users">
                          <UsersPage />
                        </LazyRoute>
                      </ProtectedRoute>
                    }
                  />
                </Route>

                {/* Error pages */}
                <Route path="/unauthorized" element={<UnauthorizedPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </NotificationProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

/**
 * Re-export the lazy page components so other modules (Sidebar, command
 * palette, idle prefetcher, etc.) can call `.preload()` on them without
 * duplicating the import map.
 */
export const lazyPages = {
  DashboardPage,
  DepartmentsPage,
  EmployeesPage,
  PositionsPage,
  AttendancePage,
  LeavesPage,
  SalariesPage,
  TrainingsPage,
  PerformancePage,
  DocumentsPage,
  NotificationsPage,
  UsersPage,
  ProfilePage,
};

export default App;
