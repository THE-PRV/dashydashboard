import React, { useState, useEffect, useRef } from 'react';
import AdminDonut, { statusOf } from '../components/AdminDonut.jsx';
import { getAdminDepartments, getDeptManagers } from '../api/admin.js';
import { getClientsAndTools } from '../api/manager.js';
import { addTool } from '../api/admin.js';

// ─────────────────────────────────────────────────────────────────────────────
// AdminView — port of admin-dashboard-mockup.html to a live React component.
//
// Props:
//   user           { associateId, firstName, lastName, isManager, superUserRole, superUserDept }
//   cycle          { cycleID, cycleName, startDate, endDate, dueDate, daysLeft }
//   cycles         Array of cycle objects
//   onCycle        (cycle) => void
//   onLogout       () => void
//   dark           boolean
//   onDark         (bool) => void
//   superUserRole  "Admin" | "GFH" | "IFH"
//   superUserDept  string | null
// ─────────────────────────────────────────────────────────────────────────────

// ── Small inline SVG icon helper (mockup uses raw inline SVGs everywhere) ─────
function Svg({ children, size = 16, stroke = 2, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// ── Notifications builder (client-side, no API call) ──────────────────────────
function buildNotifications(depts, cycle) {
  const items = [];
  const daysLeft = cycle?.daysLeft ?? 99;
  const duesSoon = daysLeft <= 7;

  if (duesSoon) {
    depts.forEach((d) => {
      const pct = d.totalAssociates > 0 ? (d.submittedCount / d.totalAssociates) * 100 : 0;
      if (pct < 75) {
        const st = statusOf(pct);
        items.push({
          key: d.departmentName,
          varName: st.varName,
          title: `${d.departmentName} — ${st.label}`,
          desc: `${d.submittedCount} of ${d.totalAssociates} submitted (${Math.round(pct)}%). Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
          time: `${daysLeft}d left`,
        });
      }
    });
  }

  // The cycle reminder always closes out the list and is NOT counted in the badge.
  const attention = items.length;
  items.push({
    key: '__reminder',
    varName: '--st-ontrack',
    title: cycle?.cycleName ?? 'Current Cycle',
    desc: `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining until due date. ${attention} department${attention === 1 ? '' : 's'} need attention.`,
    time: 'Reminder',
  });

  return items;
}

// ── Generic dropdown wrapper that closes on outside click ─────────────────────
function useOutsideClose(ref, onClose, active) {
  useEffect(() => {
    if (!active) return undefined;
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, onClose, active]);
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminView({
  user,
  cycle,
  cycles,
  onCycle,
  onLogout,
  dark,
  onDark,
  superUserRole,
  superUserDept,
  onRole,
  isManager,
}) {
  const [depts, setDepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeNav, setActiveNav] = useState('overview');
  const [search, setSearch] = useState('');
  const [drillDept, setDrillDept] = useState(null);

  // header dropdowns
  const [showCycleMenu, setShowCycleMenu] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [notifRead, setNotifRead] = useState(false);

  // modals / popovers
  const [showAddTool, setShowAddTool] = useState(false);
  const [clients, setClients] = useState([]);
  const [addToolClientId, setAddToolClientId] = useState('');
  const [addToolName, setAddToolName] = useState('');
  const [addToolError, setAddToolError] = useState(null);
  const [addToolSaving, setAddToolSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [gfhPopover, setGfhPopover] = useState(null);

  // ── Data loading: on mount and whenever cycle.cycleID changes ──────────────
  useEffect(() => {
    if (!cycle?.cycleID) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAdminDepartments(cycle.cycleID)
      .then((data) => {
        if (cancelled) return;
        setDepts(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || 'Failed to load department data.');
        setDepts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [cycle?.cycleID]);

  // Reset notification read-state when the cycle changes.
  useEffect(() => { setNotifRead(false); }, [cycle?.cycleID]);

  // Close the GFH popover on scroll / resize to avoid drift.
  useEffect(() => {
    if (!gfhPopover) return undefined;
    function close() { setGfhPopover(null); }
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [gfhPopover]);

  // Fetch client list once for the Add Tool dropdown (GFH only)
  useEffect(() => {
    if (superUserRole !== 'GFH' && superUserRole !== 'GFHDelegate' && superUserRole !== 'Admin') return;
    getClientsAndTools()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setClients(list);
        if (list.length > 0) setAddToolClientId(list[0].clientID);
      })
      .catch(() => {}); // non-fatal
  }, [superUserRole]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Add Tool helpers ────────────────────────────────────────────────────────
  function openAddTool() {
    setAddToolName('');
    setAddToolError(null);
    setAddToolSaving(false);
    setShowAddTool(true);
  }

  async function submitAddTool() {
    if (!addToolClientId || !addToolName.trim()) return;
    setAddToolSaving(true);
    setAddToolError(null);
    try {
      const result = await addTool(addToolClientId, addToolName.trim());
      setShowAddTool(false);
      setAddToolName('');
      setToast(`Tool "${result.toolName}" (${result.toolId}) added to ${addToolClientId}`);
    } catch (e) {
      setAddToolError(e.message || 'Failed to add tool. Please try again.');
    } finally {
      setAddToolSaving(false);
    }
  }

  // ── Scope filtering ─────────────────────────────────────────────────────────
  const isAdmin = superUserRole === 'Admin';
  const scopedDepts = isAdmin
    ? depts
    : depts.filter((d) => d.departmentName === superUserDept);

  // ── Search + zero-tool filtering ─────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const filteredDepts = scopedDepts
    .filter((d) => d.totalAssociates > 0)
    .filter((d) => !q || (d.departmentName ?? '').toLowerCase().includes(q) || (d.gfhName ?? '').toLowerCase().includes(q));

  // ── KPI band aggregates (computed over the scoped set) ──────────────────────
  const totalAssociates = scopedDepts.reduce((s, d) => s + d.totalAssociates, 0);
  const submitted = scopedDepts.reduce((s, d) => s + d.submittedCount, 0);
  const pending = totalAssociates - submitted;
  const completionPct = totalAssociates > 0 ? Math.round((submitted / totalAssociates) * 100) : 0;
  const atRiskCount = scopedDepts.filter((d) => {
    const pct = d.totalAssociates > 0 ? (d.submittedCount / d.totalAssociates) * 100 : 0;
    return pct < 50;
  }).length;

  // ── Notifications ──────────────────────────────────────────────────────────
  const notifItems = buildNotifications(scopedDepts, cycle);
  const notifCount = notifRead ? 0 : Math.max(0, notifItems.length - 1);

  // ── Page title ──────────────────────────────────────────────────────────────
  const pageTitle = isAdmin
    ? 'Admin Dashboard'
    : `${user?.firstName ?? ''} ${user?.lastName ?? ''} — ${superUserRole} View`.trim();

  const initials = `${(user?.firstName ?? 'U')[0] ?? 'U'}${(user?.lastName ?? '')[0] ?? ''}`.toUpperCase();

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* ════════════ SIDEBAR ════════════ */}
      <Sidebar
        activeNav={activeNav}
        onNav={setActiveNav}
        onLogout={onLogout}
        onRole={onRole}
        isManager={isManager}
        user={user}
        superUserRole={superUserRole}
        superUserDept={superUserDept}
      />

      {/* ════════════ MAIN AREA ════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        {/* ──── TOPBAR ──── */}
        <header
          style={{
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            padding: '0 24px',
            height: 56,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
            position: 'relative',
            zIndex: 30,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            {pageTitle}
          </h1>

          <div style={{ flex: 1 }} />

          {/* Search */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Svg size={15} style={{ position: 'absolute', left: 11, color: 'var(--text-faint)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </Svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search departments…"
              style={{
                fontFamily: 'var(--font-sans)',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text)',
                padding: '8px 12px 8px 33px',
                fontSize: 13,
                width: 200,
                outline: 'none',
              }}
            />
          </div>

          {/* Add Tool (GFH, GFH-Delegate, and Admin) */}
          {(superUserRole === 'GFH' || superUserRole === 'GFHDelegate' || superUserRole === 'Admin') && (
            <button
              onClick={() => openAddTool()}
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <Svg size={15} stroke={2.4}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </Svg>
              Add Tool
            </button>
          )}

          {/* Cycle picker */}
          <CyclePicker
            cycle={cycle}
            cycles={cycles}
            onCycle={onCycle}
            open={showCycleMenu}
            setOpen={setShowCycleMenu}
          />

          {/* Notifications */}
          <NotificationBell
            items={notifItems}
            count={notifCount}
            open={showNotifPanel}
            setOpen={setShowNotifPanel}
            onOpened={() => setNotifRead(true)}
            onMarkAll={() => setNotifRead(true)}
          />

          {/* Theme toggle */}
          <button
            onClick={() => onDark(!dark)}
            title="Toggle theme"
            style={iconBtnStyle}
          >
            {dark ? (
              <Svg size={16}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </Svg>
            ) : (
              <Svg size={16}>
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </Svg>
            )}
          </button>

          {/* Profile */}
          <ProfileMenu
            initials={initials}
            user={user}
            superUserRole={superUserRole}
            superUserDept={superUserDept}
            open={showProfileMenu}
            setOpen={setShowProfileMenu}
            onLogout={onLogout}
          />
        </header>

        {/* ──── SCROLLABLE CONTENT ──── */}
        <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {error && (
            <div
              style={{
                marginBottom: 18,
                padding: '12px 16px',
                borderRadius: 'var(--radius)',
                background: 'var(--st-risk-bg)',
                color: 'var(--st-risk)',
                border: '1px solid color-mix(in oklab, var(--st-risk) 35%, transparent)',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)', fontSize: 14 }}>
              Loading department data…
            </div>
          ) : drillDept ? (
            <DrillDownSection
              dept={drillDept}
              cycle={cycle}
              dark={dark}
              onBack={() => setDrillDept(null)}
            />
          ) : (
            <>
              {/* KPI band */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                <KpiCard eyebrow="Total Associates" value={totalAssociates} unit={`${scopedDepts.length} depts`} />
                <KpiCard eyebrow="Submitted" value={submitted} unit={`${completionPct}%`} accent="var(--st-completed)" />
                <KpiCard eyebrow="Pending" value={pending} unit="open" />
                <KpiCard eyebrow="At Risk Depts" value={atRiskCount} unit={`of ${scopedDepts.length}`} accent="var(--st-risk)" />
              </div>

              {/* Section header */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '4px 0 14px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                  Departments
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                  {filteredDepts.length} {filteredDepts.length === 1 ? 'department' : 'departments'} · {cycle?.cycleName ?? ''}
                </span>
              </div>

              {/* Department grid */}
              {filteredDepts.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
                  {q ? 'No departments match your search.' : 'No departments to display for this scope.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                  {filteredDepts.map((dept) => (
                    <DeptCard
                      key={dept.departmentName}
                      dept={dept}
                      dark={dark}
                      onDrill={setDrillDept}
                      onInfo={setGfhPopover}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ════════════ GFH INFO POPOVER ════════════ */}
      {gfhPopover && <GfhPopover info={gfhPopover} onClose={() => setGfhPopover(null)} />}

      {/* ════════════ ADD TOOL MODAL ════════════ */}
      {showAddTool && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,.52)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => !addToolSaving && setShowAddTool(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 14, padding: '28px 28px 24px',
              width: 380, border: '1px solid var(--border)', boxShadow: 'var(--shadow-lift-h)',
            }}
          >
            <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              Add Tool
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>
              The tool will be available for all managers in this department to assign to associates.
            </p>

            {/* Client select */}
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>
                Client
              </div>
              <select
                value={addToolClientId}
                onChange={(e) => setAddToolClientId(e.target.value)}
                disabled={addToolSaving}
                style={{
                  width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text)', padding: '9px 12px',
                  fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none',
                  cursor: addToolSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {clients.length === 0 && <option value="">Loading clients…</option>}
                {clients.map((c) => (
                  <option key={c.clientID} value={c.clientID}>
                    {c.clientID} — {c.clientName}
                  </option>
                ))}
              </select>
            </label>

            {/* Tool name input */}
            <label style={{ display: 'block', marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>
                Tool Name
              </div>
              <input
                type="text"
                value={addToolName}
                onChange={(e) => setAddToolName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitAddTool()}
                placeholder="e.g. Trade Analytics Suite"
                disabled={addToolSaving}
                maxLength={100}
                style={{
                  width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text)', padding: '9px 12px',
                  fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </label>

            {/* Inline error */}
            {addToolError && (
              <div style={{
                marginBottom: 14, padding: '10px 12px', borderRadius: 8,
                background: 'var(--st-risk-bg)', color: 'var(--st-risk)',
                fontSize: 12.5, fontWeight: 500,
                border: '1px solid color-mix(in oklab, var(--st-risk) 28%, transparent)',
              }}>
                {addToolError}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setShowAddTool(false)}
                disabled={addToolSaving}
                style={{
                  background: 'transparent', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '9px 16px', fontSize: 13, fontWeight: 500,
                  fontFamily: 'var(--font-sans)', cursor: addToolSaving ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitAddTool}
                disabled={addToolSaving || !addToolClientId || !addToolName.trim()}
                style={{
                  background: !addToolSaving && addToolClientId && addToolName.trim() ? 'var(--accent)' : 'var(--surface-2)',
                  color: !addToolSaving && addToolClientId && addToolName.trim() ? 'var(--accent-fg)' : 'var(--text-muted)',
                  border: '1px solid transparent', borderRadius: 8,
                  padding: '9px 16px', fontSize: 13, fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                  cursor: addToolSaving || !addToolClientId || !addToolName.trim() ? 'not-allowed' : 'pointer',
                  transition: 'background .15s ease, color .15s ease',
                }}
              >
                {addToolSaving ? 'Adding…' : 'Add Tool'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className="toast"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 300,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '12px 18px',
            boxShadow: 'var(--shadow-lift-h)',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 13, color: 'var(--text)', maxWidth: 360,
          }}
        >
          <span style={{ color: 'var(--st-completed)', flexShrink: 0 }}>
            <Svg size={16}><polyline points="20 6 9 17 4 12" /></Svg>
          </span>
          <span>{toast}</span>
          <span onClick={() => setToast(null)} style={{ marginLeft: 'auto', color: 'var(--text-faint)', cursor: 'pointer', flexShrink: 0 }}>
            <Svg size={14}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared style for the topbar icon buttons.
const iconBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
};

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────────────────────
function Sidebar({ activeNav, onNav, onLogout, onRole, isManager, user, superUserRole, superUserDept }) {
  const navItems = [
    {
      id: 'overview',
      label: 'Overview',
      icon: (
        <>
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </>
      ),
    },
  ];

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Logo row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 22,
            color: '#ffffff',
            boxShadow: '0 0 0 1px rgba(16,185,129,0.3), 0 2px 8px rgba(16,185,129,0.2)',
            flexShrink: 0,
          }}
        >
          B
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em', color: 'var(--text)' }}>Access Review</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '0.02em' }}>Broadridge BPO T+1</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', padding: '4px 10px 6px' }}>
          Workspace
        </div>
        {navItems.map((item) => {
          const active = activeNav === item.id;
          return (
            <div
              key={item.id}
              onClick={() => onNav(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '10px 14px',
                borderRadius: 8,
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                userSelect: 'none',
                background: active ? 'color-mix(in oklab, var(--accent) 12%, transparent)' : 'transparent',
              }}
            >
              <Svg size={17} style={{ color: active ? 'var(--accent)' : 'var(--text-faint)' }}>
                {item.icon}
              </Svg>
              {item.label}
            </div>
          );
        })}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Team View escape hatch — only for users who are also managers */}
      {isManager && onRole && (
        <div style={{ padding: '0 12px 8px', borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 4 }}>
          <div
            onClick={() => onRole('manager')}
            style={{
              display: 'flex', alignItems: 'center', gap: 11,
              padding: '10px 14px', borderRadius: 8,
              color: 'var(--text-muted)', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', userSelect: 'none',
            }}
          >
            <Svg size={17} style={{ color: 'var(--text-faint)' }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 1-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </Svg>
            Team View
          </div>
        </div>
      )}

      {/* Sign out */}
      <div style={{ padding: '4px 12px 8px' }}>
        <div
          onClick={onLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '10px 14px',
            borderRadius: 8,
            color: 'var(--text-muted)',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <Svg size={17} style={{ color: 'var(--text-faint)' }}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </Svg>
          Sign Out
        </div>
      </div>

      {/* Role badge (replaces the demo switcher from the mockup) */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          Logged in as
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
          {user?.firstName} {user?.lastName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>
          {superUserRole}
          {superUserDept ? ` · ${superUserDept}` : ''}
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CYCLE PICKER
// ─────────────────────────────────────────────────────────────────────────────
function CyclePicker({ cycle, cycles, onCycle, open, setOpen }) {
  const ref = useRef(null);
  useOutsideClose(ref, () => setOpen(false), open);

  const list = Array.isArray(cycles) ? cycles : [];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '7px 11px',
          cursor: 'pointer',
          color: 'var(--text)',
          fontSize: 13,
          fontWeight: 500,
          fontFamily: 'var(--font-sans)',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '0.04em' }}>CYCLE</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{cycle?.cycleName ?? '—'}</span>
        <Svg size={14} stroke={2.2} style={{ color: 'var(--text-faint)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }}>
          <polyline points="6 9 12 15 18 9" />
        </Svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + 8px)',
            minWidth: 240,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-lift)',
            padding: 6,
            zIndex: 60,
          }}
        >
          {list.map((c) => {
            const sel = c.cycleID === cycle?.cycleID;
            return (
              <div
                key={c.cycleID}
                onClick={() => { onCycle(c); setOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: 13,
                  color: sel ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <Svg size={14} style={{ color: 'var(--text-faint)' }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </Svg>
                  <span>{c.cycleName}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                  {c.daysLeft != null && (
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {c.daysLeft < 0 ? `${-c.daysLeft}d ago` : `${c.daysLeft}d left`}
                    </span>
                  )}
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: sel ? 'var(--accent)' : 'var(--text-faint)' }} />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION BELL + PANEL
// ─────────────────────────────────────────────────────────────────────────────
function NotificationBell({ items, count, open, setOpen, onOpened, onMarkAll }) {
  const ref = useRef(null);
  useOutsideClose(ref, () => setOpen(false), open);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (next) onOpened();
      return next;
    });
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <button onClick={toggle} title="Notifications" style={iconBtnStyle}>
          <Svg size={16}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </Svg>
        </button>
        {count > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              padding: '0 3px',
              background: 'var(--st-risk)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              lineHeight: '16px',
              textAlign: 'center',
              border: '1.5px solid var(--surface-2)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {count}
          </span>
        )}
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            minWidth: 280,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-lift)',
            zIndex: 60,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Notifications</span>
            <span onClick={onMarkAll} style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
              Mark all read
            </span>
          </div>
          <div>
            {items.map((n, i) => (
              <div
                key={n.key}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: '12px 14px',
                  borderBottom: i < items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: `var(${n.varName})` }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{n.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{n.desc}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 4 }}>{n.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE MENU
// ─────────────────────────────────────────────────────────────────────────────
function ProfileMenu({ initials, user, superUserRole, superUserDept, open, setOpen, onLogout }) {
  const ref = useRef(null);
  useOutsideClose(ref, () => setOpen(false), open);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: 'var(--radius)',
          padding: '4px 6px',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1f8fff, #0b62d6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {initials}
        </div>
        <Svg size={14} stroke={2.2} style={{ color: 'var(--text-faint)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }}>
          <polyline points="6 9 12 15 18 9" />
        </Svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            minWidth: 210,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lift)',
            padding: 6,
            zIndex: 60,
          }}
        >
          <div style={{ padding: '9px 10px 11px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 5 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>
              {user?.firstName} {user?.lastName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              {superUserRole}
              {superUserDept ? ` · ${superUserDept}` : ''}
            </div>
          </div>
          <div
            onClick={() => { setOpen(false); onLogout?.(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <Svg size={15}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </Svg>
            Sign out
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI CARD
// ─────────────────────────────────────────────────────────────────────────────
function KpiCard({ eyebrow, value, unit, accent }) {
  return (
    <div
      style={{
        background: 'var(--surface-elev)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        boxShadow: '0 1px 0 var(--hairline) inset, var(--shadow-lift)',
        position: 'relative',
        overflow: 'hidden',
        padding: '18px 20px',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: accent ?? 'var(--accent)' }} />
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
        {eyebrow}
      </div>
      <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 700, margin: '12px 0 4px', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
        {value}
        {unit != null && <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 600, marginLeft: 8 }}>{unit}</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPARTMENT CARD
// ─────────────────────────────────────────────────────────────────────────────
function DeptCard({ dept, dark, onDrill, onInfo }) {
  const [hover, setHover] = useState(false);
  const pct = dept.totalAssociates > 0
    ? Math.round((dept.submittedCount / dept.totalAssociates) * 100)
    : 0;
  const st = statusOf(pct);

  const badgeBg = `var(${st.varName}-bg)`;
  const badgeFg = `var(${st.varName})`;

  const hasBreakdown = dept.clientBreakdown && dept.clientBreakdown.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
    <div
      onClick={() => onDrill(dept)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--surface-elev)',
        border: `1px solid ${hover ? 'color-mix(in oklab, var(--accent), var(--border) 55%)' : 'var(--border)'}`,
        borderRadius: hasBreakdown
          ? 'var(--radius-card) var(--radius-card) 0 0'
          : 'var(--radius-card)',
        boxShadow: hover
          ? '0 1px 0 var(--hairline) inset, var(--shadow-lift-h)'
          : '0 1px 0 var(--hairline) inset, var(--shadow-lift)',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '22px 24px',
        minHeight: 160,
        transition: 'border-color .18s ease, box-shadow .18s ease',
      }}
    >
      {/* Left: name + GFH */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)', letterSpacing: '-0.01em', marginBottom: 4 }}>
            {dept.departmentName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>GFH: {dept.gfhName}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onInfo({
                  deptName: dept.departmentName,
                  name: dept.gfhName,
                  email: dept.gfhEmail,
                  office: dept.office,
                  rect: e.currentTarget.getBoundingClientRect(),
                });
              }}
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: '1px solid var(--border)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-faint)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Svg size={10} stroke={2.4}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </Svg>
            </span>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Footer: status badge + count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 9px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              background: badgeBg,
              color: badgeFg,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: badgeFg }} />
            {st.label}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            <b style={{ color: 'var(--text)', fontWeight: 600 }}>{dept.submittedCount}</b> of {dept.totalAssociates}
          </span>
        </div>
      </div>

      {/* Right: donut */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AdminDonut pct={pct} size={120} strokeWidth={11} dark={dark} />
      </div>

    </div>

      {/* Per-client breakdown — shown below the card, not clickable for drill */}
      {hasBreakdown && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderTop: 'none',
          borderRadius: '0 0 var(--radius-card) var(--radius-card)',
          padding: '4px 24px 16px',
        }}>
          {dept.clientBreakdown.map((c) => {
            const cpct = c.total > 0 ? Math.round((c.submitted / c.total) * 100) : 0;
            const cst = statusOf(cpct);
            return (
              <div key={c.clientId} style={{ paddingTop: 14, marginTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{c.clientName}</span>
                  <span style={{ fontSize: 11, color: `var(${cst.varName})`, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {c.submitted}/{c.total} · {cpct}%
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-2)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${cpct}%`,
                    background: `var(${cst.varName})`,
                    borderRadius: 2,
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>
            );
          })}

        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GFH INFO POPOVER
// ─────────────────────────────────────────────────────────────────────────────
function GfhPopover({ info, onClose }) {
  const ref = useRef(null);
  useOutsideClose(ref, onClose, true);

  // Position relative to the clicked info icon, clamped to the viewport.
  const PW = 226;
  const rect = info.rect;
  let left = rect.left;
  let top = rect.bottom + 8;
  if (left + PW > window.innerWidth - 12) left = window.innerWidth - PW - 12;
  left = Math.max(12, left);
  top = Math.max(12, top);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        zIndex: 80,
        left,
        top,
        minWidth: PW,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lift)',
        padding: '14px 15px',
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>
        Global Functional Head
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{info.name}</div>
      {info.email && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginTop: 7 }}>
          <Svg size={13} style={{ color: 'var(--text-faint)' }}>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </Svg>
          <span style={{ fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info.email}</span>
        </div>
      )}
      {info.office && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginTop: 7 }}>
          <Svg size={13} style={{ color: 'var(--text-faint)' }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </Svg>
          <span>{info.office}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRILL-DOWN SECTION
// ─────────────────────────────────────────────────────────────────────────────
function DrillDownSection({ dept, onBack, cycle, dark }) {
  const [managers, setManagers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mgrPopover, setMgrPopover] = useState(null);
  const [clientFilter, setClientFilter] = useState('');  // '' = all clients

  // Reset client filter whenever the department changes
  useEffect(() => { setClientFilter(''); }, [dept?.departmentName]);

  useEffect(() => {
    if (!dept?.departmentName || !cycle?.cycleID) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDeptManagers(dept.departmentName, cycle.cycleID, clientFilter || undefined).then((data) => {
      if (!cancelled) { setManagers(data); setLoading(false); }
    }).catch((e) => {
      if (!cancelled) { setError(e.message || 'Failed to load managers.'); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [dept?.departmentName, cycle?.cycleID, clientFilter]);

  const deptPct = dept.totalAssociates > 0
    ? Math.round((dept.submittedCount / dept.totalAssociates) * 100)
    : 0;
  const deptSt = statusOf(deptPct);

  // Close manager popover on outside click
  useEffect(() => {
    if (!mgrPopover) return;
    function close() { setMgrPopover(null); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [mgrPopover]);

  return (
    <div>
      {/* Breadcrumb */}
      <button
        onClick={onBack}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          background: 'transparent', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '7px 13px 7px 10px',
          color: 'var(--text-muted)', fontSize: 12.5, fontWeight: 500,
          fontFamily: 'var(--font-sans)', cursor: 'pointer', marginBottom: 18,
        }}
      >
        <Svg size={15}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></Svg>
        All Departments
      </button>

      {/* Client filter */}
      {managers?.availableClients?.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
            Filter by client:
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setClientFilter('')}
              style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: clientFilter === '' ? 600 : 400,
                border: '1px solid var(--border)',
                background: clientFilter === '' ? 'var(--accent)' : 'var(--surface-2)',
                color: clientFilter === '' ? 'var(--accent-fg)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              All clients
            </button>
            {managers.availableClients.map((c) => (
              <button
                key={c.clientId}
                onClick={() => setClientFilter(c.clientId)}
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: clientFilter === c.clientId ? 600 : 400,
                  border: '1px solid var(--border)',
                  background: clientFilter === c.clientId ? 'var(--accent)' : 'var(--surface-2)',
                  color: clientFilter === c.clientId ? 'var(--accent-fg)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.clientName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dept header card */}
      <div style={{
        background: 'var(--surface-elev)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)', padding: '24px 28px',
        marginBottom: 24, boxShadow: '0 1px 0 var(--hairline) inset, var(--shadow-lift)',
        display: 'flex', alignItems: 'center', gap: 28, position: 'relative', overflow: 'hidden',
      }}>
        {/* Left: meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 5 }}>
            Department
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            {dept.departmentName}
          </div>
          {managers && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              GFH: {managers.gfhName || dept.gfhName || '—'}
            </div>
          )}

          {/* Stacked bar */}
          <div style={{ marginTop: 18, padding: '20px 24px', marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Completion breakdown
            </div>
            <StackedBar submitted={dept.submittedCount} total={dept.totalAssociates} />
          </div>
        </div>

        {/* Right: donut */}
        <div style={{ flexShrink: 0 }}>
          <AdminDonut pct={deptPct} size={96} strokeWidth={10} dark={dark} />
        </div>

        {/* Bottom status rail */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: `var(--border)` }} />
      </div>

      {/* Manager grid or loading */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>
          Loading managers…
        </div>
      ) : error ? (
        <div style={{ color: 'var(--st-risk)', fontSize: 13, padding: '12px 0' }}>{error}</div>
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 12 }}>
            Managers ({managers?.managers?.length ?? 0})
          </div>
          {(!managers?.managers?.length) ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}>
              No managers found for this department.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
              {managers.managers.filter((m) => m.totalAssociates > 0).map((mgr) => (
                <ManagerCard key={mgr.associateId} mgr={mgr} dark={dark} onInfo={setMgrPopover} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Manager info popover */}
      {mgrPopover && (
        <div
          onClick={() => setMgrPopover(null)}
          style={{
            position: 'fixed', zIndex: 80,
            left: Math.min(Math.max(12, mgrPopover.rect.left), window.innerWidth - 226 - 12),
            top: mgrPopover.rect.bottom + 8,
            minWidth: 226,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lift)',
            padding: '14px 15px',
          }}
        >
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>
            Manager
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{mgrPopover.name}</div>
          {mgrPopover.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginTop: 7 }}>
              <Svg size={13} style={{ color: 'var(--text-faint)' }}>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </Svg>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{mgrPopover.email}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Stacked progress bar: submitted / remaining
function StackedBar({ submitted, total }) {
  const pct = total > 0 ? (submitted / total) * 100 : 0;
  const inProg = total > 0 ? Math.min(100 - pct, Math.round((total - submitted) * 0.4 / total * 100)) : 0;
  const notStarted = Math.max(0, 100 - pct - inProg);

  return (
    <div>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--surface-2)', gap: 1 }}>
        <div style={{ width: `${pct}%`, background: 'var(--st-completed)', borderRadius: '4px 0 0 4px', transition: 'width 0.8s cubic-bezier(.4,0,.2,1)' }} />
        <div style={{ width: `${inProg}%`, background: 'var(--st-ontrack)', transition: 'width 0.8s cubic-bezier(.4,0,.2,1)' }} />
        <div style={{ flex: 1, background: 'var(--surface-2)' }} />
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--st-completed)' }} />
          Submitted ({submitted})
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--st-ontrack)' }} />
          In Progress (~{Math.round(inProg * total / 100)})
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--surface-2)' }} />
          Not Started (~{Math.round(notStarted * total / 100)})
        </span>
      </div>
    </div>
  );
}

// Manager card in the drill-down grid
function ManagerCard({ mgr, dark, onInfo }) {
  const [hover, setHover] = useState(false);
  const pct = mgr.totalAssociates > 0
    ? Math.round((mgr.submittedCount / mgr.totalAssociates) * 100)
    : 0;
  const st = statusOf(pct);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--surface-elev)', border: `1px solid ${hover ? 'color-mix(in oklab, var(--accent), var(--border) 55%)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-card)', boxShadow: '0 1px 0 var(--hairline) inset, var(--shadow-lift)',
        padding: '20px 22px', minHeight: 160,
        display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', overflow: 'hidden',
        transition: 'border-color .18s ease',
      }}
    >
      {/* Name row + info button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{mgr.fullName}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            {mgr.totalAssociates} associate{mgr.totalAssociates !== 1 ? 's' : ''}
          </div>
        </div>
        {/* Info icon */}
        <span
          onClick={(e) => {
            e.stopPropagation();
            onInfo({ name: mgr.fullName, email: mgr.email, rect: e.currentTarget.getBoundingClientRect() });
          }}
          style={{
            width: 22, height: 22, borderRadius: '50%', border: '1px solid var(--border)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-faint)', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Svg size={12} stroke={2.2}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </Svg>
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AdminDonut pct={pct} size={80} strokeWidth={9} dark={dark} />
      </div>

      {/* Status badge + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px',
          borderRadius: 999, fontSize: 10.5, fontWeight: 600,
          background: `var(${st.varName}-bg)`, color: `var(${st.varName})`,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: `var(${st.varName})` }} />
          {st.label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {mgr.submittedCount}/{mgr.totalAssociates}
        </span>
      </div>

    </div>
  );
}
