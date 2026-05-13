import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/auth-context.tsx';

export default function PendingPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 bg-[url('/logo-bg.png')] bg-cover bg-center bg-no-repeat px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-900/40 border border-amber-700">
          <svg className="h-8 w-8 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-100">Awaiting approval</h1>
          <p className="mt-2 text-slate-400">
            Your account request for <span className="text-slate-200 font-medium">{user?.email}</span> is
            pending review by an organisation admin.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            You'll be notified once your request is approved or rejected. If you haven't heard back
            within 24 hours, contact your organisation administrator.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="text-sm text-slate-500 hover:text-red-400 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
