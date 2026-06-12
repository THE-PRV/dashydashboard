import React, { useCallback, useEffect, useState } from 'react';
import AgentView from './views/AgentView.jsx';
import ManagerView from './views/ManagerView.jsx';
import AccessManagementView from './views/AccessManagementView.jsx';
import UserManagementView from './views/UserManagementView.jsx';
import AdminView from './views/AdminView.jsx';
import LoginPage from './views/LoginPage.jsx';
import AppShell from './components/AppShell.jsx';
import { Button, Stamp, ToastProvider } from './components/ui.jsx';
import { getCurrentCycle, getAllCycles } from './api/cycles.js';
import {
  clearDevSessionUserId,
  DEV_LOGIN_ENABLED,
  getCurrentUser,
  setDevSessionUserId,
} from './api/auth.js';
import { asAssociateId } from './lib/contracts.js';

const THEME_KEY = 'dashy.theme';

function initialDark() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
  } catch { /* no-op */ }
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

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

// ── Full-screen states, in the ledger language ──────────────────────────────

function LedgerMark() {
  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 560,
        lineHeight: 1.1, color: 'var(--text)', letterSpacing: '-0.01em',
      }}>Attest</div>
      <div style={{
        marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 500,
        letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-faint)',
      }}>Broadridge · Access Review</div>
    </div>
  );
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
      gap: 24,
    }}>
      <LedgerMark />
      <div className="skeleton" style={{ width: 140, height: 3, borderRadius: 999 }} aria-hidden="true" />
      <div role="status" style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
        letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)',
      }}>{label}</div>
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
      <div className="overlay-pop" style={{
        width: '100%',
        maxWidth: 440,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-pop)',
        padding: '26px 24px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 12,
      }}>
        <Stamp tone="danger" icon="alert" label="Attention" animate />
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 560,
          lineHeight: 1.15, color: 'var(--text)',
        }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{message}</div>
        <div style={{
          width: '100%', borderTop: '1px solid var(--border-subtle)',
          paddingTop: 14, marginTop: 4, display: 'flex', gap: 8,
        }}>
          <Button variant="primary" icon="refresh" onClick={onRetry}>Try again</Button>
          {onLogout && <Button variant="outline" icon="logout" onClick={onLogout}>Sign out</Button>}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [role, setRole] = useState('agent');
  const [dark, setDarkState] = useState(initialDark);
  const [cycles, setCycles] = useState([]);
  const [cycle, setCycle] = useState(null);
  const [authError, setAuthError] = useState('');
  const [appError, setAppError] = useState('');
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  // Theme persists to localStorage 'dashy.theme'; first run follows the OS.
  const setDark = useCallback((next) => {
    setDarkState(next);
    try { localStorage.setItem(THEME_KEY, next ? 'dark' : 'light'); } catch { /* no-op */ }
  }, []);

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

  let screen;

  if (restoring) {
    screen = <LoadingScreen label="Checking your access" />;
  } else if (!authUser) {
    screen = (
      <LoginPage
        onLogin={handleLogin}
        error={authError}
        onRetry={handleRetry}
        canUsePasswordLogin={DEV_LOGIN_ENABLED}
      />
    );
  } else if (appError) {
    screen = (
      <ErrorScreen
        title="We could not load the dashboard"
        message={appError}
        onRetry={handleRetry}
        onLogout={handleLogout}
      />
    );
  } else if (!cycle) {
    screen = (
      <ErrorScreen
        title="No review cycle is available"
        message="The dashboard could not find an active attestation cycle yet."
        onRetry={handleRetry}
        onLogout={handleLogout}
      />
    );
  } else {
    // Every view keeps receiving the exact prop set it had before the redesign.
    const sharedViewProps = {
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

    if (role === 'superadmin') {
      // Phase 1 compat: AdminView still owns its full chrome (its own 100vh
      // navy rail), so it stays outside AppShell until the Phase 2 admin agent
      // moves it onto the shared rail (DESIGN §10).
      screen = (
        <AdminView
          {...sharedViewProps}
          superUserRole={authUser.superUserRole}
          superUserDept={authUser.superUserDept}
          superUserDepts={authUser.superUserDepts}
        />
      );
    } else {
      screen = (
        <AppShell {...sharedViewProps}>
          <div style={{ height: '100%', minHeight: 0 }}>
            {role === 'agent' && <AgentView {...sharedViewProps} />}
            {role === 'manager' && <ManagerView {...sharedViewProps} />}
            {role === 'access' && <AccessManagementView {...sharedViewProps} />}
            {role === 'admin' && <UserManagementView {...sharedViewProps} />}
          </div>
        </AppShell>
      );
    }
  }

  return <ToastProvider>{screen}</ToastProvider>;
}
