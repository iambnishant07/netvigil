import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/auth-context.tsx';

export default function AuthGuard() {
  const { isAuthenticated, isPending } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isPending) return <Navigate to="/pending" replace />;
  return <Outlet />;
}
