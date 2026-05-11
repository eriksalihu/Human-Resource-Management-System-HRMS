/**
 * @file frontend/src/App.jsx
 * @description Root application component — wraps the route tree with
 *   ThemeProvider / AuthProvider / NotificationProvider, code-splits page
 *   modules via React.lazy, surrounds the tree with a top-level
 *   ErrorBoundary, and adds per-page boundaries so a single page crash
 *   doesn't take down the navbar / sidebar / sibling routes
 * @author Dev A
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

/**
 * Public auth pages — kept eager so the login screen paints without a
 * Suspense flash on cold load (small bundle, frequently hit).
 */
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

/**
 * Error pages — eager for the same reason. They're tiny and always
 * loaded as a fallback, so lazy-loading would just add a flash.
 */
import NotFoundPage from './pages/NotFoundPage';
import UnauthorizedPage from './pages/UnauthorizedPage';

/**
 * Authenticated pages are code-split via React.lazy. Each chunk only
 * loads when the user navigates to that page, keeping the initial bundle
 * small. The Suspense fallback below covers the loading state for any
 * unloaded chunk.
 */
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const DepartmentsPage = lazy(() => import('./pages/DepartmentsPage'));
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'));
const PositionsPage = lazy(() => import('./pages/PositionsPage'));
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const LeavesPage = lazy(() => import('./pages/LeavesPage'));
const SalariesPage = lazy(() => import('./pages/SalariesPage'));
const TrainingsPage = lazy(() => import('./pages/TrainingsPage'));
const PerformancePage = lazy(() => import('./pages/PerformancePage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

/**
 * Suspense fallback shown while a lazy route module loads. Centred so it
 * looks intentional even on a large viewport.
 */
const RouteFallback = () => (
  <div className="flex items-center justify-center py-20">
    <LoadingSpinner />
  </div>
);

/**
 * RouteErrorBoundary — wraps a single page so a render crash doesn't
 * unmount the layout chrome. Auto-resets on route change so navigating
 * away from a broken page clears the error without manual intervention.
 *
 * @param {Object} props
 * @param {string} props.name - Used in the boundary's log line for triage
 * @param {React.ReactNode} props.children
 */
const RouteErrorBoundary = ({ name, children }) => {
  const location = useLocation();
  return (
    <ErrorBoundary
      name={name}
      resetKey={location.pathname}
      title="This page hit an error"
      hideReload
    >
      {children}
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
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  {/* Public auth routes */}
                  <Route element={<AuthLayout />}>
                    <Route
                      path="/login"
                      element={
                        <RouteErrorBoundary name="login">
                          <LoginPage />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/register"
                      element={
                        <RouteErrorBoundary name="register">
                          <RegisterPage />
                        </RouteErrorBoundary>
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
                        <RouteErrorBoundary name="dashboard">
                          <DashboardPage />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/dashboard"
                      element={
                        <RouteErrorBoundary name="dashboard">
                          <DashboardPage />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/departments"
                      element={
                        <RouteErrorBoundary name="departments">
                          <DepartmentsPage />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/employees"
                      element={
                        <RouteErrorBoundary name="employees">
                          <EmployeesPage />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/positions"
                      element={
                        <RouteErrorBoundary name="positions">
                          <PositionsPage />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/attendance"
                      element={
                        <RouteErrorBoundary name="attendance">
                          <AttendancePage />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/leaves"
                      element={
                        <RouteErrorBoundary name="leaves">
                          <LeavesPage />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/leave-requests"
                      element={
                        <RouteErrorBoundary name="leaves">
                          <LeavesPage />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/salaries"
                      element={
                        <RouteErrorBoundary name="salaries">
                          <SalariesPage />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/trainings"
                      element={
                        <RouteErrorBoundary name="trainings">
                          <TrainingsPage />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/performance"
                      element={
                        <RouteErrorBoundary name="performance">
                          <PerformancePage />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/documents"
                      element={
                        <RouteErrorBoundary name="documents">
                          <DocumentsPage />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/notifications"
                      element={
                        <RouteErrorBoundary name="notifications">
                          <NotificationsPage />
                        </RouteErrorBoundary>
                      }
                    />
                    <Route
                      path="/profile"
                      element={
                        <RouteErrorBoundary name="profile">
                          <ProfilePage />
                        </RouteErrorBoundary>
                      }
                    />

                    {/* Admin-only routes */}
                    <Route
                      path="/users"
                      element={
                        <ProtectedRoute requiredRoles={['Admin']}>
                          <RouteErrorBoundary name="users">
                            <UsersPage />
                          </RouteErrorBoundary>
                        </ProtectedRoute>
                      }
                    />
                  </Route>

                  {/* Error pages */}
                  <Route path="/unauthorized" element={<UnauthorizedPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </NotificationProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
