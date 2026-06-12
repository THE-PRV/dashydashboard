// ─────────────────────────────────────────────────────────────────────────────
// AppShell — "The Ledger" chrome (DESIGN.md §7). Owns ALL app chrome:
//   left rail   : wordmark, role-aware nav, theme toggle, collapse, profile
//   header bar  : breadcrumbs (mono) + cycle picker
//   cycle ruler : time elapsed start→due, tick at today
// Views render content only. Mounted once in App.jsx around the role views.
//
// Breadcrumbs: views call useBreadcrumbs([...]) (or useShell().setBreadcrumbs)
// with an array of strings or { label, onClick } items. They reset to the
// role's default on unmount. Rail collapse persists to localStorage
// 'dashy.rail' ('collapsed' | 'expanded'). Below 900px the rail becomes an
// off-canvas overlay behind a hamburger in the header.
// ─────────────────────────────────────────────────────────────────────────────
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Icon, ProfileMenu, CycleMenu, CycleRuler, Tooltip } from './ui.jsx';

const RAIL_KEY = 'dashy.rail';
const RAIL_WIDTH = 230;
const RAIL_WIDTH_COLLAPSED = 56;

// ── Shell context: breadcrumbs ──────────────────────────────────────────────
const ShellContext = createContext(null);

export function useShell() {
  return useContext(ShellContext) ?? { breadcrumbs: null, setBreadcrumbs: () => {} };
}

// Declarative breadcrumb hook for views:
//   useBreadcrumbs(['Admin', 'Equities', { label: 'J. Smith', onClick: goBack }]);
export function useBreadcrumbs(items) {
  const { setBreadcrumbs } = useShell();
  const key = JSON.stringify((items ?? []).map((i) => (typeof i === 'string' ? i : i?.label)));
  useEffect(() => {
    setBreadcrumbs(items ?? null);
    return () => setBreadcrumbs(null);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

function useMedia(query) {
  const [matches, setMatches] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false
  ));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    mq.addEventListener('change', onChange);
    setMatches(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

const ROLE_TITLES = {
  superadmin: 'Admin Dashboard',
  agent: 'Associate view',
  manager: 'Manager view',
  access: 'Access',
  admin: 'Users',
};

// Same role model the old TopBar toggle used: the switcher exists only for
// managers/superusers; everyone else gets a single fixed entry.
function buildNav({ role, isManager, isSuperAdmin, canOpenUserDirectory, hasRoleSwitch }) {
  if (!hasRoleSwitch) {
    return [{ id: role, label: ROLE_TITLES[role] ?? 'My attestation', icon: 'list' }];
  }
  return [
    ...(isSuperAdmin ? [{ id: 'superadmin', label: 'Admin Dashboard', icon: 'grid' }] : []),
    { id: 'agent',   label: 'Associate view', icon: 'list' },
    { id: 'manager', label: 'Manager view',   icon: 'users' },
    { id: 'access',  label: 'Access',         icon: 'key' },
    ...(canOpenUserDirectory ? [{ id: 'admin', label: 'Users', icon: 'user' }] : []),
  ];
}

function Wordmark({ collapsed }) {
  if (collapsed) {
    return (
      <div aria-label="Attest — Broadridge access review" style={{
        fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600,
        lineHeight: 1, color: 'var(--text)', textAlign: 'center', userSelect: 'none',
      }}>A</div>
    );
  }
  return (
    <div style={{ userSelect: 'none', minWidth: 0 }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 600,
        lineHeight: 1.1, color: 'var(--text)', letterSpacing: '-0.01em',
      }}>Attest</div>
      <div style={{
        marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 500,
        letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
        whiteSpace: 'nowrap',
      }}>Broadridge · BPO</div>
    </div>
  );
}

function RailButton({ icon, label, active = false, collapsed, onClick, ariaCurrent }) {
  const [hovered, setHovered] = useState(false);
  const btn = (
    <button
      type="button"
      onClick={onClick}
      aria-current={ariaCurrent}
      aria-label={collapsed ? label : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', height: 34,
        padding: collapsed ? 0 : '0 10px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        border: 0, borderRadius: 'var(--radius)',
        background: active ? 'var(--accent-glow)' : (hovered ? 'var(--surface-2)' : 'transparent'),
        color: active ? 'var(--accent)' : (hovered ? 'var(--text)' : 'var(--text-muted)'),
        fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 600 : 500,
        cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'background .15s ease-out, color .15s ease-out',
      }}
    >
      {active && (
        <span aria-hidden="true" style={{
          position: 'absolute', left: collapsed ? 2 : -8, top: 7, bottom: 7,
          width: 3, borderRadius: 2, background: 'var(--accent)',
        }} />
      )}
      <Icon name={icon} size={16} stroke={active ? 1.9 : 1.6} />
      {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
    </button>
  );
  return collapsed ? <Tooltip label={label} side="right" style={{ width: '100%' }}>{btn}</Tooltip> : btn;
}

function Breadcrumbs({ items }) {
  if (!items || !items.length) return null;
  return (
    <nav aria-label="Breadcrumb" style={{ minWidth: 0, overflow: 'hidden' }}>
      <ol style={{
        display: 'flex', alignItems: 'center', gap: 8,
        listStyle: 'none', margin: 0, padding: 0,
        fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          const label = typeof item === 'string' ? item : item?.label;
          const onClick = typeof item === 'object' ? item?.onClick : undefined;
          return (
            <li key={`${label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {i > 0 && <span aria-hidden="true" style={{ color: 'var(--text-faint)' }}>/</span>}
              {onClick && !last ? (
                <button type="button" onClick={onClick} style={{
                  border: 0, background: 'transparent', padding: 0, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, color: 'var(--text-muted)',
                  textDecoration: 'none', borderRadius: 2,
                }}>{label}</button>
              ) : (
                <span aria-current={last ? 'page' : undefined} style={{
                  color: last ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: last ? 500 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function AppShell({
  user, role, onRole, isManager, isSuperAdmin = false,
  cycle, cycles, onCycle, onLogout, dark, onDark,
  children,
}) {
  const isMobile = useMedia('(max-width: 900px)');
  const [collapsedPref, setCollapsedPref] = useState(() => {
    try { return localStorage.getItem(RAIL_KEY) === 'collapsed'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState(null);

  // Off-canvas rail is always full-width; collapse only applies docked.
  const collapsed = isMobile ? false : collapsedPref;

  const toggleCollapsed = useCallback(() => {
    setCollapsedPref((prev) => {
      const next = !prev;
      try { localStorage.setItem(RAIL_KEY, next ? 'collapsed' : 'expanded'); } catch { /* no-op */ }
      return next;
    });
  }, []);

  // Close the off-canvas rail whenever the role changes or we leave mobile.
  useEffect(() => { setMobileOpen(false); }, [role, isMobile]);

  const canOpenUserDirectory = user?.superUserRole === 'Admin';
  const hasRoleSwitch = !!(isManager && typeof onRole === 'function');
  const nav = useMemo(
    () => buildNav({ role, isManager, isSuperAdmin, canOpenUserDirectory, hasRoleSwitch }),
    [role, isManager, isSuperAdmin, canOpenUserDirectory, hasRoleSwitch],
  );

  const shellValue = useMemo(() => ({ breadcrumbs, setBreadcrumbs }), [breadcrumbs]);
  const crumbs = breadcrumbs && breadcrumbs.length
    ? breadcrumbs
    : [ROLE_TITLES[role] ?? 'Workspace'];

  const railWidth = collapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH;

  const rail = (
    <aside
      aria-label="Primary"
      style={{
        display: 'flex', flexDirection: 'column',
        width: railWidth, flex: 'none',
        background: 'var(--surface)', borderRight: '1px solid var(--border)',
        transition: 'width .2s ease-out, transform .26s ease-out',
        /* no overflow:hidden — the profile popover must escape the rail box */
        ...(isMobile ? {
          position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 1000,
          width: RAIL_WIDTH,
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-102%)',
          boxShadow: mobileOpen ? 'var(--shadow-pop)' : 'none',
        } : { height: '100%' }),
      }}
    >
      {/* Logo block */}
      <div style={{
        padding: collapsed ? '18px 8px 14px' : '18px 16px 14px',
        borderBottom: '1px solid var(--border)', flex: 'none',
        display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start',
      }}>
        <Wordmark collapsed={collapsed} />
      </div>

      {/* Nav */}
      <nav aria-label="Workspace" style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: collapsed ? '12px 8px' : '12px 8px', flex: 'none',
      }}>
        {!collapsed && (
          <div style={{
            padding: '2px 10px 8px', fontSize: 10.5, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)',
          }}>Workspace</div>
        )}
        {nav.map((item) => (
          <RailButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={role === item.id}
            ariaCurrent={role === item.id ? 'page' : undefined}
            collapsed={collapsed}
            onClick={() => { if (hasRoleSwitch && item.id !== role) onRole(item.id); setMobileOpen(false); }}
          />
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Bottom block: theme, collapse, profile */}
      <div style={{
        borderTop: '1px solid var(--border)', padding: 8, flex: 'none',
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {typeof onDark === 'function' && (
          <RailButton
            icon={dark ? 'sun' : 'moon'}
            label={dark ? 'Light mode' : 'Dark mode'}
            collapsed={collapsed}
            onClick={() => onDark(!dark)}
          />
        )}
        {!isMobile && (
          <RailButton
            icon="panel"
            label={collapsed ? 'Expand rail' : 'Collapse rail'}
            collapsed={collapsed}
            onClick={toggleCollapsed}
          />
        )}
        {user && (
          <div style={{ marginTop: 6, ...(collapsed ? { display: 'flex', justifyContent: 'center' } : null) }}>
            <ProfileMenu user={user} isManager={isManager} onLogout={onLogout}
              direction="up" compact={collapsed} />
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <ShellContext.Provider value={shellValue}>
      <div style={{ height: '100vh', display: 'flex', background: 'var(--bg)', overflow: 'hidden' }}>
        {rail}
        {isMobile && mobileOpen && (
          <div className="overlay-backdrop" onMouseDown={() => setMobileOpen(false)} aria-hidden="true"
            style={{ position: 'fixed', inset: 0, zIndex: 990, background: 'rgba(16,19,26,.4)' }} />
        )}

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Header bar: breadcrumbs + cycle picker */}
          <header style={{
            display: 'flex', alignItems: 'center', gap: 12,
            height: 52, padding: isMobile ? '0 16px' : '0 24px',
            borderBottom: '1px solid var(--border)', flex: 'none',
          }}>
            {isMobile && (
              <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', background: 'var(--surface)',
                  color: 'var(--text-muted)', cursor: 'pointer', flex: 'none',
                }}>
                <Icon name="menu" size={15} />
              </button>
            )}
            <Breadcrumbs items={crumbs} />
            <div style={{ flex: 1 }} />
            {cycle && <CycleMenu cycle={cycle} cycles={cycles} onCycle={onCycle} />}
          </header>

          {/* Cycle ruler — present in every role view (DESIGN §7) */}
          {cycle && (
            <CycleRuler cycle={cycle} style={{
              padding: isMobile ? '10px 16px 12px' : '10px 24px 12px',
              borderBottom: '1px solid var(--border)', flex: 'none',
            }} />
          )}

          {/* View content */}
          <main style={{ flex: 1, minHeight: 0 }}>
            {children}
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
