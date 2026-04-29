import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/auth-context.tsx';

export default function AuthGuard() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}
