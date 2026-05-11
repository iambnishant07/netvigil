import { createBrowserRouter, Navigate } from 'react-router-dom';
import AuthGuard from './components/layout/AuthGuard.tsx';
import AppShell from './components/layout/AppShell.tsx';
import LoginPage from './pages/LoginPage.tsx';
import RegisterPage from './pages/RegisterPage.tsx';
import PendingPage from './pages/PendingPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import IncidentsPage from './pages/IncidentsPage.tsx';
import IncidentDetailPage from './pages/IncidentDetailPage.tsx';
import DevicesPage from './pages/DevicesPage.tsx';
import AlertRulesPage from './pages/AlertRulesPage.tsx';
import TeamPage from './pages/TeamPage.tsx';
import AuditLogPage from './pages/AuditLogPage.tsx';
import AdminPage from './pages/AdminPage.tsx';
import ProfilePage from './pages/ProfilePage.tsx';

export const router = createBrowserRouter([
  { path: '/login',    element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/pending',  element: <PendingPage /> },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard',        element: <DashboardPage /> },
          { path: '/incidents',        element: <IncidentsPage /> },
          { path: '/incidents/:id',    element: <IncidentDetailPage /> },
          { path: '/devices',          element: <DevicesPage /> },
          { path: '/alert-rules',      element: <AlertRulesPage /> },
          { path: '/team',             element: <TeamPage /> },
          { path: '/audit-log',        element: <AuditLogPage /> },
          { path: '/admin',            element: <AdminPage /> },
          { path: '/profile',          element: <ProfilePage /> },
        ],
      },
    ],
  },
]);
