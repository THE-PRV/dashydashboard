import React, { useCallback, useEffect, useState } from 'react';
import AgentView from './views/AgentView.jsx';
import ManagerView from './views/ManagerView.jsx';
import AccessManagementView from './views/AccessManagementView.jsx';
import UserManagementView from './views/UserManagementView.jsx';
import AdminView from './views/AdminView.jsx';
import LoginPage from './views/LoginPage.jsx';
import { getCurrentCycle, getAllCycles } from './api/cycles.js';
import {
  clearDevSessionUserId,
  DEV_LOGIN_ENABLED,
  getCurrentUser,
  setDevSessionUserId,
} from './api/auth.js';
import { asAssociateId } from './lib/contracts.js';

// Roles may arrive in any casing from the DB ("admin", "ADMIN", ...). Canonicalize
// once here so every case-sensitive comparison downstream (tabs, AdminView) just works.
const ROLE_CANON = { admin: 'Admin', gfh: 'GFH', gfhdelegate: 'GFHDelegate', ifh: 'IFH' };
function canonRole(role) {
  if (!role) return null;
  return ROLE_CANON[String(role).trim().toLowerCase()] ?? role;
}

function normalizeUser(response) {
  return {
    associateId: asAssociateId(response.associateId),
    firstName: response.firstName,
    lastName: response.lastName,
    isManager: response.isManager,
    superUserRole: canonRole(response.superUserRole),
    superUserDept: response.superUserDepartment ?? null,
    superUserDepts: Array.isArray(response.superUserDepartments) ? response.superUserDepartments : [],
  };
}

function deriveRole(user) {
  if (user.superUserRole) return 'superadmin';
  return user.isManager ? 'manager' : 'agent';
}

function LoadingScreen({ label }) {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      gap: 16,
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: 24,
        color: '#fff',
        animation: 'pulse 1.4s ease-in-out infinite',
      }}>
        B
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</div>
      <style>{'@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }'}</style>
    </div>
  );
}

function ErrorScreen({ title, message, onRetry, onLogout }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px 16px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '28px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={onRetry}
            style={{
              height: 38,
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid var(--accent)',
              background: 'var(--accent)',
              color: 'var(--accent-fg)',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              style={{
                height: 38,
                padding: '0 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [role, setRole] = useState('agent');
  const [dark, setDark] = useState(false);
  const [cycles, setCycles] = useState([]);
  const [cycle, setCycle] = useState(null);
  const [authError, setAuthError] = useState('');
  const [appError, setAppError] = useState('');
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  const applyUser = useCallback((response) => {
    const user = normalizeUser(response);
    setAuthUser(user);
    setRole(deriveRole(user));
    return user;
  }, []);

  const loadCycles = useCallback(async () => {
    const [currentCycle, allCycles] = await Promise.all([getCurrentCycle(), getAllCycles()]);
    setCycle(currentCycle);
    setCycles(allCycles);
  }, []);

  const resetSessionState = useCallback(() => {
    setAuthUser(null);
    setRole('agent');
    setCycle(null);
    setCycles([]);
  }, []);

  const restoreSession = useCallback(async () => {
    setRestoring(true);
    setAuthError('');
    setAppError('');

    try {
      const response = await getCurrentUser();
      if (!response) {
        resetSessionState();
        if (!DEV_LOGIN_ENABLED) {
          setAuthError('We could not verify your sign-in. Try again or contact the dashboard administrator.');
        }
        return;
      }

      applyUser(response);
      try {
        await loadCycles();
      } catch (error) {
        setAppError(error.message || 'Could not load dashboard data.');
      }
    } catch (error) {
      resetSessionState();
      setAuthError(error.message || 'Could not verify your sign-in.');
    } finally {
      setRestoring(false);
    }
  }, [applyUser, loadCycles, resetSessionState]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const handleLogin = useCallback(async (response) => {
    setRestoring(true);
    setAuthError('');
    setAppError('');

    try {
      setDevSessionUserId(response.associateId);
      const currentUser = await getCurrentUser();
      applyUser(currentUser ?? response);
      try {
        await loadCycles();
      } catch (error) {
        setAppError(error.message || 'Could not load dashboard data.');
      }
    } catch (error) {
      clearDevSessionUserId();
      resetSessionState();
      setAuthError(error.message || 'Could not complete sign-in.');
    } finally {
      setRestoring(false);
    }
  }, [applyUser, loadCycles, resetSessionState]);

  const handleLogout = useCallback(() => {
    clearDevSessionUserId();
    setAuthError('');
    setAppError('');
    resetSessionState();
  }, [resetSessionState]);

  const handleRetry = useCallback(() => {
    restoreSession();
  }, [restoreSession]);

  const handleCycleChange = useCallback((nextCycle) => {
    setCycle(nextCycle);
    setCycles((previousCycles) => {
      if (!nextCycle) return previousCycles;
      if (previousCycles.some((entry) => entry.cycleID === nextCycle.cycleID)) {
        return previousCycles;
      }
      return [...previousCycles, nextCycle].sort((a, b) => b.cycleID - a.cycleID);
    });
  }, []);

  if (restoring) {
    return <LoadingScreen label="Checking your access..." />;
  }

  if (!authUser) {
    return (
      <LoginPage
        onLogin={handleLogin}
        error={authError}
        onRetry={handleRetry}
        canUsePasswordLogin={DEV_LOGIN_ENABLED}
      />
    );
  }

  if (appError) {
    return (
      <ErrorScreen
        title="We could not load the dashboard"
        message={appError}
        onRetry={handleRetry}
        onLogout={handleLogout}
      />
    );
  }

  const sharedTopBarProps = {
    user: authUser,
    cycle,
    cycles,
    onCycle: handleCycleChange,
    onLogout: handleLogout,
    isManager: authUser.isManager,
    isSuperAdmin: !!authUser.superUserRole,
    role,
    onRole: setRole,
    dark,
    onDark: setDark,
  };

  if (!cycle) {
    return (
      <ErrorScreen
        title="No review cycle is available"
        message="The dashboard could not find an active attestation cycle yet."
        onRetry={handleRetry}
        onLogout={handleLogout}
      />
    );
  }

  if (role === 'superadmin') {
    return (
      <AdminView
        {...sharedTopBarProps}
        superUserRole={authUser.superUserRole}
        superUserDept={authUser.superUserDept}
        superUserDepts={authUser.superUserDepts}
      />
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        {role === 'agent' && <AgentView {...sharedTopBarProps} />}
        {role === 'manager' && <ManagerView {...sharedTopBarProps} />}
        {role === 'access' && <AccessManagementView {...sharedTopBarProps} />}
        {role === 'admin' && <UserManagementView {...sharedTopBarProps} />}
      </div>
    </div>
  );
}
