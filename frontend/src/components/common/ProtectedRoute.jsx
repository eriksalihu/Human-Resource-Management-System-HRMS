/**
 * @file frontend/src/components/common/ProtectedRoute.jsx
 * @description Route guard with authentication and role-based access control
 * @author Dev B
 */

import { Navigate, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import LoadingSpinner from './LoadingSpinner';

/**
 * ProtectedRoute — wraps route elements that require authentication.
 *
 * Behaviour:
 * 1. While the auth state is initialising, shows a full-page loading spinner.
 * 2. If the user is NOT authenticated, redirects to /login (preserving the
 *    intended destination in location state for post-login redirect).
 * 3. If `requiredRoles` are specified and the user lacks all of them,
 *    redirects to /unauthorized.
 * 4. Otherwise, renders the child element.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Protected child component(s)
 * @param {string[]} [props.requiredRoles] - Roles the user must have (at least one)
 * @returns {JSX.Element}
 */
const ProtectedRoute = ({ children, requiredRoles }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // 1 — Loading: show spinner while auth state initialises
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-sm text-gray-500">Checking authentication…</p>
        </div>
      </div>
    );
  }

  // 2 — Not authenticated: redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3 — Role check (if required)
  if (requiredRoles && requiredRoles.length > 0) {
    const userRoles = user?.roles || [];
    const hasRequiredRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRequiredRole) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  // 4 — Authorised: render child routes
  return children;
};

export default ProtectedRoute;
