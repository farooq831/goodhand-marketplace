import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Usage: <ProtectedRoute allowedRoles={["vendor"]}><VendorPage /></ProtectedRoute>
// allowedRoles is optional — omit it to just require any signed-in user.
function ProtectedRoute({ children, allowedRoles }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default ProtectedRoute;
