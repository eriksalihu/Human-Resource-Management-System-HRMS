/**
 * @file frontend/src/App.jsx
 * @description Root application component — wraps the route tree with AuthProvider, ThemeProvider, and NotificationProvider, code-splits page modules via React.lazy, and uses a Suspense fallback for the loading shell
 * @author Dev A
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';
import AuthLayout from './layouts/AuthLayout';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/common/ProtectedRoute';
import LoadingSpinner from './components/common/LoadingSpinner';

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
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* Public auth routes */}
                <Route element={<AuthLayout />}>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                </Route>

                {/* Protected routes inside MainLayout */}
                <Route
                  element={
                    <ProtectedRoute>
                      <MainLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/departments" element={<DepartmentsPage />} />
                  <Route path="/employees" element={<EmployeesPage />} />
                  <Route path="/positions" element={<PositionsPage />} />
                  <Route path="/attendance" element={<AttendancePage />} />
                  <Route path="/leaves" element={<LeavesPage />} />
                  <Route path="/leave-requests" element={<LeavesPage />} />
                  <Route path="/salaries" element={<SalariesPage />} />
                  <Route path="/trainings" element={<TrainingsPage />} />
                  <Route path="/performance" element={<PerformancePage />} />
                  <Route path="/documents" element={<DocumentsPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/profile" element={<ProfilePage />} />

                  {/* Admin-only routes */}
                  <Route
                    path="/users"
                    element={
                      <ProtectedRoute requiredRoles={['Admin']}>
                        <UsersPage />
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
  );
}

export default App;
