/**
 * @file frontend/src/App.jsx
 * @description Root application component with full routing configuration
 * @author Dev B
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AuthLayout from './layouts/AuthLayout';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/common/ProtectedRoute';

// Public pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// Error pages
import NotFoundPage from './pages/NotFoundPage';
import UnauthorizedPage from './pages/UnauthorizedPage';

/**
 * Placeholder page components — replaced once real pages are built.
 */
const DashboardPage = () => (
  <div className="p-6"><h1 className="text-2xl font-bold text-gray-900">Dashboard</h1><p className="mt-2 text-gray-600">Welcome to HRMS</p></div>
);
const DepartmentsPage = () => (
  <div className="p-6"><h1 className="text-2xl font-bold text-gray-900">Departments</h1></div>
);
const EmployeesPage = () => (
  <div className="p-6"><h1 className="text-2xl font-bold text-gray-900">Employees</h1></div>
);
const PositionsPage = () => (
  <div className="p-6"><h1 className="text-2xl font-bold text-gray-900">Positions</h1></div>
);
const AttendancePage = () => (
  <div className="p-6"><h1 className="text-2xl font-bold text-gray-900">Attendance</h1></div>
);
const LeavesPage = () => (
  <div className="p-6"><h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1></div>
);
const SalariesPage = () => (
  <div className="p-6"><h1 className="text-2xl font-bold text-gray-900">Salaries</h1></div>
);
const TrainingsPage = () => (
  <div className="p-6"><h1 className="text-2xl font-bold text-gray-900">Trainings</h1></div>
);
const PerformancePage = () => (
  <div className="p-6"><h1 className="text-2xl font-bold text-gray-900">Performance Reviews</h1></div>
);
const DocumentsPage = () => (
  <div className="p-6"><h1 className="text-2xl font-bold text-gray-900">Documents</h1></div>
);
const UsersPage = () => (
  <div className="p-6"><h1 className="text-2xl font-bold text-gray-900">Users</h1></div>
);

/**
 * Root App component — sets up AuthProvider, BrowserRouter, and full route tree.
 *
 * Route structure:
 * - /login, /register → AuthLayout (public)
 * - / (dashboard), /departments, /employees, etc. → MainLayout (protected)
 * - /unauthorized → error page
 * - * → 404 catch-all
 *
 * @returns {JSX.Element} Application with routing and auth context
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
            <Route path="/departments" element={<DepartmentsPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/positions" element={<PositionsPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/leaves" element={<LeavesPage />} />
            <Route path="/salaries" element={<SalariesPage />} />
            <Route path="/trainings" element={<TrainingsPage />} />
            <Route path="/performance" element={<PerformancePage />} />
            <Route path="/documents" element={<DocumentsPage />} />

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
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
