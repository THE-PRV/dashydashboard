import React, { useState, useEffect, useMemo, useRef } from 'react';
import AdminDonut, { statusOf } from '../components/AdminDonut.jsx';
import {
  getAdminDepartments, getDeptManagers, exportNonSubmitted, exportDisputes,
  addTool, addClient, getManagerTeam, getManagerMemberDetail, getNonSubmitted,
} from '../api/admin.js';
import { getClientsAndTools, downloadScreenshotsZip } from '../api/manager.js';
import { reopenAttestation } from '../api/attestations.js';
import ScreenshotGallery from '../components/ScreenshotGallery.jsx';
import FullScreenOverlay from '../components/FullScreenOverlay.jsx';
import CycleGallery from '../components/CycleGallery.jsx';
import {
  StatusChip, SectionHeader, Card, Button, SearchBar, Modal,
  EmptyState, Skeleton, Stamp, Badge, Icon, SortHeader, useToasts,
  useClickOutside, Combobox,
} from '../components/ui.jsx';
import { useBreadcrumbs, useHeaderActions } from '../components/AppShell.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// AdminView — "The Ledger" Phase 2. Renders CONTENT ONLY inside the shared
// AppShell (the bespoke navy sidebar is gone, DESIGN §10). Navigation is
// breadcrumb-driven: Overview → Department → Manager → Member, with an explicit
// "← Back" affordance at every drill level. At-risk individuals surface at the
// department level. Portfolio analytics use compact charts; tables use real
// <table> semantics + SortHeader. Add Tool / Add Client / reopen confirm all use
// the Modal primitive — no window.confirm / alert anywhere.
//
// Props (unchanged from Phase 1): user, cycle, cycles, onCycle, onLogout, dark,
//   onDark, superUserRole, superUserDept, superUserDepts, onRole, isManager.
// ─────────────────────────────────────────────────────────────────────────────

// Tone for the ledger status palette, keyed off completion percentage. Mirrors
// AdminDonut.statusOf thresholds but maps to the icon+color status language.
function pctTone(pct) {
  if (pct >= 90) return { tone: 'success', icon: 'check', label: 'Completed' };
  if (pct >= 75) return { tone: 'info', icon: 'half', label: 'On track' };
  if (pct >= 50) return { tone: 'warning', icon: 'clock', label: 'Needs attention' };
  return { tone: 'danger', icon: 'alert', label: 'At risk' };
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

// Map the free-text Status strings the non-submitted endpoint emits
// ("Not started" / "In progress" / "Awaiting approval" / "Action needed") to
// the ledger icon+color language (DESIGN §3 — status is never color alone).
// `rank` drives worst-first default ordering (lower = needs more attention).
const NS_STATUS_META = {
  'not started':       { tone: 'neutral', icon: 'circle', rank: 0 },
  'in progress':       { tone: 'info',    icon: 'half',   rank: 1 },
  'awaiting approval': { tone: 'warning', icon: 'clock',  rank: 2 },
  'action needed':     { tone: 'danger',  icon: 'alert',  rank: 0 },
};
function nsStatusMeta(status) {
  return NS_STATUS_META[(status || '').toLowerCase()]
    ?? { tone: 'neutral', icon: 'circle', rank: 1 };
}
// Mirror ui.jsx CHIP_TONES (soft icon+label chip — DESIGN §3/§5).
const NS_CHIP_TONES = {
  neutral: { fg: 'var(--text-muted)', bg: 'var(--surface-2)' },
  info:    { fg: 'var(--accent)',     bg: 'var(--accent-glow)' },
  warning: { fg: 'var(--warning)',    bg: 'var(--warning-bg)' },
  danger:  { fg: 'var(--danger)',     bg: 'var(--danger-bg)' },
  success: { fg: 'var(--success)',    bg: 'var(--success-bg)' },
};
const EMPTY_DEPARTMENTS = [];

// Generic sort helper for the data tables.
function useSort(initialKey, initialDir = 'asc') {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState(initialDir);
  const onSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };
  return { sortKey, sortDir, onSort };
}

// Clickable table row with ledger hover tint (DESIGN §4) — used by the data
// tables since index.css has no row-hover rule we can rely on.
function HoverRow({ onActivate, children, style }) {
  const [hover, setHover] = useState(false);
  return (
    <tr
      onClick={onActivate}
      onKeyDown={(e) => { if (e.key === 'Enter') onActivate?.(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      tabIndex={0}
      style={{
        borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
        background: hover ? 'var(--surface-2)' : 'transparent',
        transition: 'background .15s ease-out',
        ...style,
      }}
    >
      {children}
    </tr>
  );
}

function sortRows(rows, key, dir, accessors) {
  const get = accessors[key];
  if (!get) return rows;
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = get(a); const bv = get(b);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign;
    return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true }) * sign;
  });
}

// ── Notifications builder (client-side, no API call) — unchanged trigger logic ─
function buildNotifications(depts, cycle) {
  const items = [];
  const daysLeft = cycle?.daysLeft ?? 99;
  const duesSoon = daysLeft <= 7;

  if (duesSoon) {
    depts.forEach((d) => {
      const pct = d.totalAssociates > 0 ? (d.submittedCount / d.totalAssociates) * 100 : 0;
      if (pct < 75) {
        const st = pctTone(pct);
        items.push({
          key: d.departmentName,
          tone: st.tone,
          icon: st.icon,
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
    tone: 'info',
    icon: 'calendar',
    title: cycle?.cycleName ?? 'Current Cycle',
    desc: `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining until due date. ${attention} department${attention === 1 ? '' : 's'} need attention.`,
    time: 'Reminder',
  });

  return items;
}

// ── Identity line shared by manager/member rows (info popover replacement) ────
function MetaPopover({ title, name, email }) {
  return (
    <div style={{ minWidth: 200 }}>
      <div style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6,
      }}>{title}</div>
      <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>{name}</div>
      {email && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, fontSize: 12,
          color: 'var(--text-muted)', marginTop: 6,
        }}>
          <Icon name="message" size={13} style={{ color: 'var(--text-faint)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>{email}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminView({
  user, cycle, cycles, onLogout, dark, onDark,
  superUserRole, superUserDept, superUserDepts = EMPTY_DEPARTMENTS,
}) {
  const toasts = useToasts();

  const [depts, setDepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  // Breadcrumb-driven drill navigation.
  const [drillDept, setDrillDept] = useState(null);     // dept object
  const [drillManager, setDrillManager] = useState(null); // manager summary object
  const [drillMember, setDrillMember] = useState(null);   // member summary object (overlay)

  // Notifications.
  const [showNotif, setShowNotif] = useState(false);
  const [notifRead, setNotifRead] = useState(false);

  // Add Tool / Add Client modals.
  const [showAddTool, setShowAddTool] = useState(false);
  const [clients, setClients] = useState([]);
  const [addToolClientId, setAddToolClientId] = useState('');
  const [addToolDeptId, setAddToolDeptId] = useState(0);
  const [addToolName, setAddToolName] = useState('');
  const [addToolScreenshotRequired, setAddToolScreenshotRequired] = useState(false);
  const [addToolError, setAddToolError] = useState(null);
  const [addToolSaving, setAddToolSaving] = useState(false);

  const [showAddClient, setShowAddClient] = useState(false);
  const [addClientId, setAddClientId] = useState('');
  const [addClientName, setAddClientName] = useState('');
  const [addClientError, setAddClientError] = useState(null);
  const [addClientSaving, setAddClientSaving] = useState(false);

  const isAdmin = superUserRole === 'Admin' || superUserRole === 'GFHDelegate';
  const canAdd = superUserRole === 'GFH' || superUserRole === 'GFHDelegate' || superUserRole === 'Admin';

  // ── Data loading ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cycle?.cycleID) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAdminDepartments(cycle.cycleID)
      .then((data) => { if (!cancelled) setDepts(Array.isArray(data) ? data : []); })
      .catch((e) => { if (!cancelled) { setError(e.message || 'Failed to load department data.'); setDepts([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cycle?.cycleID]);

  function refreshDepartments() {
    if (!cycle?.cycleID) return;
    getAdminDepartments(cycle.cycleID)
      .then((data) => {
        const next = Array.isArray(data) ? data : [];
        setDepts(next);
        setDrillDept((cur) => (cur ? next.find((d) => d.departmentName === cur.departmentName) ?? cur : cur));
      })
      .catch(() => {});
  }

  useEffect(() => { setNotifRead(false); }, [cycle?.cycleID]);

  // Client list for the Add Tool dropdown.
  useEffect(() => {
    if (!canAdd) return;
    getClientsAndTools()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setClients(list);
        if (list.length > 0) setAddToolClientId(list[0].clientID);
      })
      .catch(() => {});
  }, [canAdd]);

  // ── Scope + search + zero-tool filtering ────────────────────────────────────
  const scopedDepts = useMemo(
    () => (isAdmin
      ? depts
      : depts.filter((d) => superUserDepts.includes(d.departmentName))),
    [depts, isAdmin, superUserDepts],
  );
  const q = search.trim().toLowerCase();
  const filteredDepts = useMemo(
    () => scopedDepts
      .filter((d) => d.totalAssociates > 0)
      .filter((d) => !q
        || (d.departmentName ?? '').toLowerCase().includes(q)
        || (d.gfhName ?? '').toLowerCase().includes(q)),
    [q, scopedDepts],
  );

  // ── KPI aggregates ──────────────────────────────────────────────────────────
  const totalUsers = scopedDepts.reduce((s, d) => s + (d.totalUsers ?? d.totalAssociates), 0);
  const totalAssociates = scopedDepts.reduce((s, d) => s + d.totalAssociates, 0);
  const submitted = scopedDepts.reduce((s, d) => s + d.submittedCount, 0);
  const pending = totalAssociates - submitted;
  const completionPct = totalAssociates > 0 ? Math.round((submitted / totalAssociates) * 100) : 0;
  const atRiskCount = scopedDepts.filter((d) => {
    const pct = d.totalAssociates > 0 ? (d.submittedCount / d.totalAssociates) * 100 : 0;
    return pct < 50;
  }).length;

  // ── Notifications ───────────────────────────────────────────────────────────
  const notifItems = useMemo(
    () => buildNotifications(scopedDepts, cycle),
    [cycle, scopedDepts],
  );
  const notifCount = notifRead ? 0 : Math.max(0, notifItems.length - 1);

  // ── Add Tool helpers ────────────────────────────────────────────────────────
  function openAddTool() {
    setAddToolName('');
    setAddToolScreenshotRequired(false);
    setAddToolDeptId(depts.length > 0 ? depts[0].departmentID : 0);
    setAddToolError(null);
    setAddToolSaving(false);
    setShowAddTool(true);
  }
  async function submitAddTool({ keepOpen = false } = {}) {
    if (!addToolClientId || !addToolDeptId || !addToolName.trim()) {
      setAddToolError('Pick a client and department, and enter a tool name.');
      return;
    }
    setAddToolSaving(true);
    setAddToolError(null);
    try {
      const result = await addTool(addToolClientId, addToolName.trim(), addToolDeptId, addToolScreenshotRequired);
      toasts.success(`Tool "${result.toolName}" (${result.toolId}) added to ${addToolClientId}`, { title: 'Tool added' });
      setAddToolName('');
      setAddToolScreenshotRequired(false);
      if (!keepOpen) setShowAddTool(false);
    } catch (e) {
      setAddToolError(e.message || 'Failed to add tool. Please try again.');
    } finally {
      setAddToolSaving(false);
    }
  }

  // ── Add Client helpers ──────────────────────────────────────────────────────
  function openAddClient() {
    setAddClientId('');
    setAddClientName('');
    setAddClientError(null);
    setAddClientSaving(false);
    setShowAddClient(true);
  }
  async function submitAddClient({ keepOpen = false } = {}) {
    if (!addClientId.trim() || !addClientName.trim()) {
      setAddClientError('Enter both a client ID and a client name.');
      return;
    }
    setAddClientSaving(true);
    setAddClientError(null);
    try {
      const result = await addClient(addClientId.trim(), addClientName.trim());
      toasts.success(`Client "${result.clientName}" (${result.clientId}) added`, { title: 'Client added' });
      const entry = { clientID: result.clientId, clientName: result.clientName };
      setClients((prev) => (prev.some((c) => c.clientID === entry.clientID) ? prev : [...prev, entry]));
      setAddClientId('');
      setAddClientName('');
      if (!keepOpen) setShowAddClient(false);
    } catch (e) {
      setAddClientError(e.message || 'Failed to add client. Please try again.');
    } finally {
      setAddClientSaving(false);
    }
  }

  // ── Breadcrumbs (clickable ancestors) ───────────────────────────────────────
  const rootLabel = isAdmin ? 'Admin' : `${superUserRole} View`;
  const crumbs = useMemo(() => {
    const items = [{ label: rootLabel, onClick: () => { setDrillDept(null); setDrillManager(null); setDrillMember(null); } }];
    if (drillDept) items.push({ label: drillDept.departmentName, onClick: () => { setDrillManager(null); setDrillMember(null); } });
    if (drillManager) items.push({ label: drillManager.fullName, onClick: () => setDrillMember(null) });
    if (drillMember) items.push({ label: drillMember.fullName });
    return items;
  }, [rootLabel, drillDept, drillManager, drillMember]);
  useBreadcrumbs(crumbs);

  // ── Header actions: search + add buttons + notifications + theme ────────────
  const headerNode = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {!drillDept && (
        <SearchBar value={search} onChange={setSearch} placeholder="Search departments…" width={190}
          style={{ height: 28 }} />
      )}
      {canAdd && (
        <>
          <Button size="sm" variant="outline" icon="plus" onClick={openAddClient}>Client</Button>
          <Button size="sm" variant="primary" icon="plus" onClick={openAddTool}>Tool</Button>
        </>
      )}
      <NotificationBell items={notifItems} count={notifCount} open={showNotif} setOpen={setShowNotif}
        onOpened={() => setNotifRead(true)} onMarkAll={() => setNotifRead(true)} />
    </div>
  );
  useHeaderActions(headerNode, [search, drillDept, canAdd, showNotif, notifCount, notifItems]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: 'clamp(16px, 3vw, 24px)', maxWidth: 1400, margin: '0 auto' }}>
        {error && (
          <Card pad={0} style={{
            marginBottom: 18, padding: '11px 14px', background: 'var(--danger-bg)',
            borderColor: 'var(--danger-border)', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Icon name="alert" size={15} stroke={2} style={{ color: 'var(--danger)', flex: 'none' }} />
            <span style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 500 }}>{error}</span>
          </Card>
        )}

        {/* The member detail is a FullScreenOverlay that floats ON TOP of the
            manager-team table, so the manager level stays mounted under it. */}
        {loading ? (
          <OverviewSkeleton />
        ) : drillManager ? (
          <ManagerTeamSection
            mgr={drillManager} cycle={cycle} dark={dark} superUserRole={superUserRole}
            onBack={() => setDrillManager(null)}
            onOpenMember={setDrillMember}
            onReviewed={refreshDepartments}
          />
        ) : drillDept ? (
          <DrillDownSection
            dept={drillDept} cycle={cycle} dark={dark} superUserRole={superUserRole}
            onBack={() => setDrillDept(null)}
            onOpenManager={setDrillManager}
            onReviewed={refreshDepartments}
          />
        ) : (
          <OverviewSection
            depts={filteredDepts} scopedCount={scopedDepts.length}
            totalUsers={totalUsers} totalAssociates={totalAssociates}
            submitted={submitted} pending={pending} completionPct={completionPct}
            atRiskCount={atRiskCount} cycle={cycle} dark={dark} hasQuery={!!q}
            onDrill={setDrillDept}
          />
        )}
      </div>

      {/* Member detail overlay */}
      {drillMember && drillManager && (
        <AssociateDetailOverlay
          mgr={drillManager} member={drillMember} cycle={cycle} dark={dark}
          superUserRole={superUserRole}
          onClose={() => setDrillMember(null)}
          onReopened={refreshDepartments}
          onReviewed={refreshDepartments}
        />
      )}

      {/* ── Add Tool modal ── */}
      <AddToolModal
        open={showAddTool} onClose={() => !addToolSaving && setShowAddTool(false)}
        clients={clients} depts={depts}
        clientId={addToolClientId} setClientId={setAddToolClientId}
        deptId={addToolDeptId} setDeptId={setAddToolDeptId}
        name={addToolName} setName={setAddToolName}
        screenshotRequired={addToolScreenshotRequired} setScreenshotRequired={setAddToolScreenshotRequired}
        error={addToolError} saving={addToolSaving}
        onSubmit={submitAddTool}
      />

      {/* ── Add Client modal ── */}
      <AddClientModal
        open={showAddClient} onClose={() => !addClientSaving && setShowAddClient(false)}
        clientId={addClientId} setClientId={setAddClientId}
        name={addClientName} setName={setAddClientName}
        error={addClientError} saving={addClientSaving}
        onSubmit={submitAddClient}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW — KPI band + department cards
// ─────────────────────────────────────────────────────────────────────────────
function OverviewSection({
  depts, scopedCount, totalUsers, totalAssociates, submitted, pending,
  completionPct, atRiskCount, cycle, dark, hasQuery, onDrill,
}) {
  return (
    <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {depts.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
          gap: 16, alignItems: 'stretch',
        }}>
          <Card pad={20} style={{ minWidth: 0 }}>
            <SectionHeader
              rule
              right={<span style={{
                fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums', textTransform: 'none', letterSpacing: 0,
              }}>{cycle?.cycleName ?? ''}</span>}
            >
              Portfolio progress
            </SectionHeader>

            <div style={{
              display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)',
              gap: 24, alignItems: 'center', padding: '20px 0 18px',
            }}>
              <AdminDonut pct={completionPct} size={150} strokeWidth={13} dark={dark} />
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 560,
                  color: 'var(--text)', lineHeight: 1.08, letterSpacing: '-0.02em',
                }}>
                  {submitted.toLocaleString()} of {totalAssociates.toLocaleString()}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                  tool attestations submitted
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 10, marginTop: 18,
                }}>
                  <PortfolioMetric label="People" value={totalUsers} />
                  <PortfolioMetric label="Open" value={pending} tone="warning" />
                  <PortfolioMetric label="Watchlist" value={atRiskCount} suffix={`/${scopedCount}`} />
                </div>
              </div>
            </div>

            <DeptCompletionChart depts={depts} onDrill={onDrill} />
          </Card>

          {cycle?.cycleID && (
            <NeedsAttentionPanel depts={depts} cycleId={cycle.cycleID} onDrill={onDrill} />
          )}
        </div>
      )}

      {/* Section header */}
      <SectionHeader rule
        right={<span style={{
          fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums', textTransform: 'none', letterSpacing: 0,
        }}>{depts.length} {depts.length === 1 ? 'department' : 'departments'} · {cycle?.cycleName ?? ''}</span>}
      >
        Departments
      </SectionHeader>

      {depts.length === 0 ? (
        <EmptyState
          icon={hasQuery ? 'search' : 'grid'}
          title={hasQuery ? 'No matches' : 'Nothing to review'}
          message={hasQuery ? 'No departments match your search for this cycle.' : 'No departments are in scope for this cycle yet.'}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 420px))', gap: 14, alignItems: 'start', justifyContent: 'start' }}>
          {depts.map((dept) => <DeptCard key={dept.departmentName} dept={dept} dark={dark} onDrill={onDrill} />)}
        </div>
      )}
    </div>
  );
}

function PortfolioMetric({ label, value, suffix, tone }) {
  const color = tone === 'warning' ? 'var(--warning)' : 'var(--text)';
  return (
    <div style={{
      borderLeft: '1px solid var(--rule)', paddingLeft: 10, minWidth: 0,
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--text-faint)',
      }}>{label}</div>
      <div style={{
        marginTop: 4, fontFamily: 'var(--font-display)', fontSize: 24,
        lineHeight: 1, color, fontVariantNumeric: 'tabular-nums',
      }}>
        {Number(value).toLocaleString()}
        {suffix && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK D — Department completion bar chart
// One horizontal bar per department (submitted/total %), colored by the shared
// pctTone/--st-* status palette, with mono % labels. div-bars in the ledger
// style; sorted worst-first so the laggards read top-down. Clicking a row drills.
// ─────────────────────────────────────────────────────────────────────────────
function DeptCompletionChart({ depts, onDrill }) {
  const rows = useMemo(() => (
    depts
      .map((d) => {
        const pct = d.totalAssociates > 0 ? Math.round((d.submittedCount / d.totalAssociates) * 100) : 0;
        return { dept: d, name: d.departmentName, pct, submitted: d.submittedCount, total: d.totalAssociates };
      })
      .sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name))
  ), [depts]);

  return (
    <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
      <SectionHeader style={{ marginBottom: 12 }}
        right={<span style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', textTransform: 'none', letterSpacing: 0 }}>submitted / total</span>}>
        Department comparison
      </SectionHeader>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r) => {
          const toneVar = `var(${statusOf(r.pct).varName})`;
          return (
            <button
              key={r.name} type="button" onClick={() => onDrill(r.dept)}
              aria-label={`${r.name}: ${r.pct}% complete, ${r.submitted} of ${r.total} submitted. Open department.`}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(120px, 1.35fr) 3fr auto',
                alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0',
              }}>
              <span style={{
                fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{r.name}</span>
              <span style={{ position: 'relative', height: 10, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                <span style={{
                  position: 'absolute', inset: 0, width: `${r.pct}%`, background: toneVar,
                  borderRadius: 'var(--radius)', transition: 'width .4s ease-out',
                }} />
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end',
                fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
                fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: 96,
              }}>
                <span style={{ color: 'var(--text-faint)' }}>{r.submitted}/{r.total}</span>
                <b style={{ color: toneVar, fontWeight: 600, minWidth: 38, textAlign: 'right' }}>{r.pct}%</b>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK C — "Needs attention" panel
// Lazily fetches the non-submitted/at-risk associates for the in-scope
// departments shown on the overview (Promise.all over those depts only — the
// perf guard), tags each row with its department, merges, and renders a sortable
// real <table>. Worst-first by default (lowest %, "Not started" / "Action
// needed" first). A failed per-dept fetch is skipped, not fatal.
// ─────────────────────────────────────────────────────────────────────────────
function NeedsAttentionPanel({ depts, cycleId, onDrill }) {
  const [rows, setRows] = useState(null);   // null = not loaded yet
  const [loading, setLoading] = useState(false);

  // Re-key the fetch on the exact set of shown depts + cycle so a search filter
  // or cycle change re-pulls only the now-visible departments.
  const deptKey = useMemo(() => depts.map((d) => d.departmentName).join('|'), [depts]);

  useEffect(() => {
    if (!cycleId || depts.length === 0) { setRows([]); return undefined; }
    let cancelled = false;
    setLoading(true);
    setRows(null);
    // PERF GUARD: only the departments currently shown on the overview, fetched
    // in parallel. Each dept fetch is independently caught → a single failure is
    // skipped (empty list) instead of blowing up the whole panel.
    Promise.all(
      depts.map((d) =>
        getDeptManagers(d.departmentName, cycleId)
          .then((data) => {
            const gfhName = data?.gfhName || d.gfhName || null;
            return (data?.managers ?? []).map((m) => {
              const total = m.totalTools ?? m.totalAssociates ?? 0;
              const submitted = m.submittedCount ?? 0;
              const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
              return {
                associateId: m.associateId,
                name: m.fullName || m.managerName || 'Unnamed manager',
                departmentName: d.departmentName,
                gfhName,
                total,
                submitted,
                open: Math.max(0, total - submitted),
                pct,
              };
            });
          })
          .catch(() => [])
      )
    )
      .then((groups) => {
        if (!cancelled) {
          // Only managers whose teams still have work outstanding this cycle.
          setRows(groups.flat().filter((m) => m.total > 0 && m.open > 0));
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) { setRows([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [deptKey, cycleId]);

  const sorted = useMemo(() => {
    return [...(rows ?? [])].sort((a, b) =>
      (a.pct - b.pct)              // worst completion first
      || (b.open - a.open)         // then the most still open
      || String(a.name).localeCompare(String(b.name)));
  }, [rows]);
  const visibleRows = sorted.slice(0, 5);

  const deptByName = useMemo(() => {
    const m = {};
    depts.forEach((d) => { m[d.departmentName] = d; });
    return m;
  }, [depts]);

  return (
    <Card pad={0} style={{ overflow: 'hidden', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '16px 18px 12px' }}>
        <SectionHeader
          right={!loading && rows ? (
            <span style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', textTransform: 'none', letterSpacing: 0 }}>
              {sorted.length} {sorted.length === 1 ? 'manager' : 'managers'}
            </span>
          ) : undefined}>
          Needs attention
        </SectionHeader>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
          Managers whose teams are furthest from finishing this cycle.
        </div>
      </div>

      {loading || rows === null ? (
        <div style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 10 }} aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={40} />)}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState icon="check" title="Every team's on track"
          message="No managers in the shown departments have outstanding work this cycle."
          style={{ padding: '32px 24px' }} />
      ) : (
        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {visibleRows.map((r, i) => {
            const dept = deptByName[r.departmentName];
            const st = statusOf(r.pct);
            return (
              <button
                key={`${r.departmentName}::${r.associateId}::${i}`}
                type="button"
                onClick={() => dept && onDrill(dept)}
                title={dept ? `Open ${r.departmentName}` : undefined}
                style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 12, width: '100%', padding: '11px 18px', textAlign: 'left',
                  border: 0, borderBottom: '1px solid var(--border-subtle)',
                  background: 'transparent', cursor: dept ? 'pointer' : 'default', fontFamily: 'inherit',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name}
                  </span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.departmentName}{r.gfhName ? ` · GFH ${r.gfhName}` : ''}
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', color: `var(${st.varName})`, fontSize: 13, fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{r.pct}%</span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-faint)',
                    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                  }}>{r.open} of {r.total} open</span>
                </span>
              </button>
            );
          })}
          {sorted.length > visibleRows.length && (
            <div style={{
              padding: '10px 18px', fontSize: 11.5, color: 'var(--text-faint)',
              fontFamily: 'var(--font-mono)', textAlign: 'center',
            }}>
              Showing {visibleRows.length} of {sorted.length} managers behind
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} pad={20} style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 360 }}>
            <Skeleton width={130} height={12} />
            <Skeleton width="100%" height={1} />
            <Skeleton width="100%" height={i === 0 ? 170 : 250} />
          </Card>
        ))}
      </div>
      <Skeleton width={160} height={13} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 14 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} pad={20} style={{ display: 'flex', gap: 16, alignItems: 'center', minHeight: 140 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Skeleton width="70%" height={15} />
              <Skeleton width="50%" height={11} />
              <Skeleton width={90} height={20} radius={999} />
            </div>
            <Skeleton width={96} height={96} radius={999} />
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Department card — paper surface, hairline rule, mono numerals ────────────
function DeptCard({ dept, dark, onDrill }) {
  const [gfhOpen, setGfhOpen] = useState(false);
  const gfhRef = useRef(null);
  useClickOutside(gfhRef, () => setGfhOpen(false));

  const pct = dept.totalAssociates > 0 ? Math.round((dept.submittedCount / dept.totalAssociates) * 100) : 0;
  const st = pctTone(pct);
  const allBreakdown = dept.clientBreakdown && dept.clientBreakdown.length > 0 ? dept.clientBreakdown : [];
  const breakdown = allBreakdown
    .slice()
    .sort((a, b) => {
      const aPct = a.total > 0 ? a.submitted / a.total : 0;
      const bPct = b.total > 0 ? b.submitted / b.total : 0;
      return aPct - bPct;
    })
    .slice(0, 3);
  const hiddenClients = Math.max(0, allBreakdown.length - breakdown.length);

  return (
    <Card pad={0} interactive onClick={() => onDrill(dept)} style={{ display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {dept.departmentName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginTop: 3, position: 'relative' }} ref={gfhRef}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>GFH: {dept.gfhName}</span>
              <button type="button" aria-label="GFH contact details"
                onClick={(e) => { e.stopPropagation(); setGfhOpen((v) => !v); }}
                style={{
                  width: 17, height: 17, borderRadius: 999, border: '1px solid var(--border)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-faint)', cursor: 'pointer', flex: 'none', background: 'transparent', padding: 0,
                }}>
                <Icon name="info" size={11} stroke={2} />
              </button>
              {gfhOpen && (
                <div className="pop-in" onClick={(e) => e.stopPropagation()} style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 60,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)', padding: 14,
                }}>
                  <MetaPopover title="Global Functional Head" name={dept.gfhName} email={dept.gfhEmail} />
                  {dept.office && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-muted)', marginTop: 7 }}>
                      <Icon name="briefcase" size={13} style={{ color: 'var(--text-faint)' }} />
                      <span>{dept.office}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
            <Stamp tone={st.tone} icon={st.icon} label={st.label} />
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
              <b style={{ color: 'var(--text)', fontWeight: 600 }}>{dept.submittedCount}</b> / {dept.totalAssociates}
            </span>
          </div>
        </div>

        <div style={{ flex: 'none' }}>
          <AdminDonut pct={pct} size={104} strokeWidth={10} dark={dark} />
        </div>
      </div>

      {breakdown.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '2px 20px 14px' }}>
          {breakdown.map((c) => {
            const cpct = c.total > 0 ? Math.round((c.submitted / c.total) * 100) : 0;
            const cst = statusOf(cpct);
            return (
              <div key={c.clientId} style={{ paddingTop: 12, marginTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.clientName} ({c.clientId})</span>
                  <span style={{ fontSize: 11, color: `var(${cst.varName})`, fontFamily: 'var(--font-mono)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {c.submitted}/{c.total} · {cpct}%
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${cpct}%`, background: `var(${cst.varName})`, borderRadius: 999, transition: 'width .4s ease-out' }} />
                </div>
              </div>
            );
          })}
          {hiddenClients > 0 && (
            <div style={{
              marginTop: 12, fontSize: 11, color: 'var(--text-faint)',
              fontFamily: 'var(--font-mono)',
            }}>
              +{hiddenClients} more client{hiddenClients === 1 ? '' : 's'} in department view
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── A reusable "← Back" affordance for every drill level ─────────────────────
function BackButton({ label, onClick }) {
  return (
    <Button variant="ghost" size="sm" icon="chevleft" onClick={onClick} style={{ marginBottom: 16, paddingLeft: 6 }}>
      {label}
    </Button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION BELL + PANEL — ledger cards
// ─────────────────────────────────────────────────────────────────────────────
function NotificationBell({ items, count, open, setOpen, onOpened, onMarkAll }) {
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  function toggle() {
    setOpen((v) => { const next = !v; if (next) onOpened(); return next; });
  }

  return (
    <div ref={ref} style={{ position: 'relative', flex: 'none' }}>
      <button type="button" onClick={toggle} aria-label={`Notifications${count > 0 ? ` (${count} need attention)` : ''}`}
        style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 'var(--radius)',
          border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--text-muted)', cursor: 'pointer',
        }}>
        <Icon name="bell" size={15} />
        {count > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5, minWidth: 15, height: 15, borderRadius: 999,
            padding: '0 3px', background: 'var(--danger)', color: 'var(--accent-fg)',
            fontSize: 9, fontWeight: 700, lineHeight: '15px', textAlign: 'center',
            border: '1.5px solid var(--surface)', fontFamily: 'var(--font-mono)',
          }}>{count}</span>
        )}
      </button>

      {open && (
        <div className="pop-in" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 60, width: 320,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderBottom: '1px solid var(--rule)', background: 'var(--surface-2)',
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Notifications</span>
            <button type="button" onClick={onMarkAll} style={{
              border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 11.5, color: 'var(--accent)', fontWeight: 500, padding: 0,
            }}>Mark all read</button>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {items.map((n, i) => {
              const toneFg = { success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', info: 'var(--accent)' }[n.tone] ?? 'var(--text-muted)';
              return (
                <div key={n.key} style={{
                  display: 'flex', gap: 10, padding: '12px 14px',
                  borderBottom: i < items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}>
                  <span style={{ color: toneFg, marginTop: 1, flex: 'none' }}>
                    <Icon name={n.icon} size={15} stroke={2} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{n.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.45 }}>{n.desc}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{n.time}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD TOOL / ADD CLIENT modals (Modal primitive, "Add another" affordance)
// ─────────────────────────────────────────────────────────────────────────────
const fieldLabelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
};
const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: 'var(--surface)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  color: 'var(--text)', padding: '8px 11px', fontSize: 13, fontFamily: 'var(--font-sans)',
  outline: 'none',
};

function FieldError({ children }) {
  if (!children) return null;
  return (
    <div role="alert" style={{
      display: 'flex', alignItems: 'center', gap: 7, marginTop: 14,
      padding: '9px 11px', borderRadius: 'var(--radius)',
      background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
      fontSize: 13, color: 'var(--danger)', fontWeight: 500,
    }}>
      <Icon name="alert" size={14} stroke={2} style={{ flex: 'none' }} />
      <span>{children}</span>
    </div>
  );
}

function AddToolModal({ open, onClose, clients, depts, clientId, setClientId, deptId, setDeptId, name, setName, screenshotRequired, setScreenshotRequired, error, saving, onSubmit }) {
  return (
    <Modal open={open} onClose={onClose} title="Add tool" width={420}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="outline" onClick={() => onSubmit({ keepOpen: true })} disabled={saving} loading={saving}>Add &amp; add another</Button>
          <Button variant="primary" onClick={() => onSubmit()} disabled={saving} loading={saving}>Add tool</Button>
        </>
      )}>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        The tool becomes available for managers in this department to assign to associates.
      </p>
      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={fieldLabelStyle}>Client</span>
        <Combobox
          ariaLabel="Client"
          value={clientId}
          disabled={saving || clients.length === 0}
          onChange={(v) => setClientId(v)}
          placeholder={clients.length === 0 ? 'Loading clients…' : 'Select client…'}
          options={clients.map((c) => ({ value: c.clientID, label: c.clientName, hint: c.clientID }))}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={fieldLabelStyle}>Department</span>
        <Combobox
          ariaLabel="Department"
          value={deptId}
          disabled={saving || depts.length === 0}
          onChange={(v) => setDeptId(Number(v))}
          placeholder={depts.length === 0 ? 'Loading departments…' : 'Select department…'}
          options={depts.map((d) => ({ value: d.departmentID, label: d.departmentName }))}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={fieldLabelStyle}>Tool name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()} placeholder="e.g. Trade Analytics Suite"
          disabled={saving} maxLength={100} style={inputStyle} aria-invalid={!!error} />
      </label>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: saving ? 'not-allowed' : 'pointer' }}>
        <input type="checkbox" checked={screenshotRequired}
          onChange={(e) => setScreenshotRequired(e.target.checked)} disabled={saving}
          style={{ marginTop: 2, cursor: saving ? 'not-allowed' : 'pointer' }} />
        <span>
          <span style={{ ...fieldLabelStyle, marginBottom: 2 }}>Require screenshot for this tool</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            When on, associates who used this tool must upload a screenshot that a manager approves
            before their attestation is complete. When off, any uploaded proof is optional and viewable only.
          </span>
        </span>
      </label>
      <FieldError>{error}</FieldError>
    </Modal>
  );
}

function AddClientModal({ open, onClose, clientId, setClientId, name, setName, error, saving, onSubmit }) {
  return (
    <Modal open={open} onClose={onClose} title="Add client" width={420}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="outline" onClick={() => onSubmit({ keepOpen: true })} disabled={saving} loading={saving}>Add &amp; add another</Button>
          <Button variant="primary" onClick={() => onSubmit()} disabled={saving} loading={saving}>Add client</Button>
        </>
      )}>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        The client becomes available for tool assignment and attestation cycles.
      </p>
      <label style={{ display: 'block', marginBottom: 14 }}>
        <span style={fieldLabelStyle}>Client ID</span>
        <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()} placeholder="e.g. DTC-US or 0039"
          disabled={saving} maxLength={50} style={inputStyle} aria-invalid={!!error} />
      </label>
      <label style={{ display: 'block' }}>
        <span style={fieldLabelStyle}>Client name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()} placeholder="e.g. DTC United States"
          disabled={saving} maxLength={200} style={inputStyle} aria-invalid={!!error} />
      </label>
      <FieldError>{error}</FieldError>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRILL-DOWN: DEPARTMENT — managers table + at-risk individuals + exception exports
// ─────────────────────────────────────────────────────────────────────────────
function DrillDownSection({ dept, onBack, cycle, dark, superUserRole, onOpenManager, onReviewed }) {
  const toasts = useToasts();
  const [managers, setManagers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clientFilter, setClientFilter] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportingDisputes, setExportingDisputes] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  // At-risk individuals (mandate #3) — fed from the non-submitted endpoint.
  const [atRisk, setAtRisk] = useState(null);
  const [atRiskOpen, setAtRiskOpen] = useState(false);
  const [atRiskLoading, setAtRiskLoading] = useState(false);
  const atRiskSort = useSort('completionPct', 'asc');

  useEffect(() => { setClientFilter(''); }, [dept?.departmentName]);

  useEffect(() => {
    if (!dept?.departmentName || !cycle?.cycleID) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDeptManagers(dept.departmentName, cycle.cycleID, clientFilter || undefined)
      .then((data) => { if (!cancelled) { setManagers(data); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message || 'Failed to load managers.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [dept?.departmentName, cycle?.cycleID, clientFilter]);

  // Lazy-load the at-risk list when the panel is first expanded.
  function toggleAtRisk() {
    const next = !atRiskOpen;
    setAtRiskOpen(next);
    if (next && atRisk === null && !atRiskLoading && dept?.departmentName && cycle?.cycleID) {
      setAtRiskLoading(true);
      getNonSubmitted(dept.departmentName, cycle.cycleID)
        .then((rows) => setAtRisk(Array.isArray(rows) ? rows : []))
        .catch(() => setAtRisk([]))
        .finally(() => setAtRiskLoading(false));
    }
  }

  async function runExport(fn, setBusy, label) {
    if (!dept?.departmentName || !cycle?.cycleID) return;
    setBusy(true);
    try { await fn(dept.departmentName, cycle.cycleID); }
    catch (e) { toasts.error(`${label} failed: ${e.message}`); }
    finally { setBusy(false); }
  }
  async function handleDownloadZip() {
    if (!cycle?.cycleID) return;
    setDownloadingZip(true);
    try { await downloadScreenshotsZip(cycle.cycleID); }
    catch (e) { toasts.error(`Download failed: ${e.message}`); }
    finally { setDownloadingZip(false); }
  }

  const deptPct = dept.totalAssociates > 0 ? Math.round((dept.submittedCount / dept.totalAssociates) * 100) : 0;
  const visibleManagers = (managers?.managers ?? []).filter((m) => m.totalAssociates > 0);

  return (
    <div className="stagger">
      <BackButton label="All departments" onClick={onBack} />

      {/* Department header — paper card, donut, completion */}
      <Card style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 4 }}>Department</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 560, color: 'var(--text)', lineHeight: 1.1 }}>{dept.departmentName}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>GFH: {managers?.gfhName || dept.gfhName || '—'}</div>
          <div style={{ marginTop: 14 }}>
            <StackedBar submitted={dept.submittedCount} total={dept.totalAssociates} />
          </div>
        </div>
        <div style={{ flex: 'none' }}>
          <AdminDonut pct={deptPct} size={104} strokeWidth={11} dark={dark} />
        </div>
      </Card>

      {/* Client filter */}
      {managers?.availableClients?.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Filter by client</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <FilterChip active={clientFilter === ''} onClick={() => setClientFilter('')}>All clients</FilterChip>
            {managers.availableClients.map((c) => (
              <FilterChip key={c.clientId} active={clientFilter === c.clientId} onClick={() => setClientFilter(c.clientId)}>
                {c.clientName} ({c.clientId})
              </FilterChip>
            ))}
          </div>
        </div>
      )}

      {/* At-risk individuals — expandable, fed from non-submitted endpoint */}
      <Card pad={0} style={{ marginBottom: 16, overflow: 'hidden' }}>
        <button type="button" onClick={toggleAtRisk} aria-expanded={atRiskOpen}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
            padding: '14px 18px', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
          }}>
          <Icon name="alert" size={16} stroke={2} style={{ color: 'var(--danger)', flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>Needs attention</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Associates who have not finished attesting{managers?.incompleteCount != null ? ` · ${managers.incompleteCount}` : ''}
            </div>
          </div>
          <Icon name={atRiskOpen ? 'chevup' : 'chevdown'} size={14} style={{ color: 'var(--text-muted)' }} />
        </button>
        {atRiskOpen && (
          <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {atRiskLoading ? (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={16} />)}
              </div>
            ) : !atRisk || atRisk.length === 0 ? (
              <EmptyState icon="check" title="All clear" message="Everyone in this department has finished attesting." style={{ padding: '28px 24px' }} />
            ) : (
              <AtRiskTable rows={atRisk} sort={atRiskSort} />
            )}
          </div>
        )}
      </Card>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={48} />)}
        </div>
      ) : error ? (
        <EmptyState icon="alert" title="Could not load managers" message={error} />
      ) : (
        <>
          {/* Exception exports */}
          <ExceptionExports
            incompleteCount={managers?.incompleteCount ?? 0}
            disputeCount={managers?.disputeCount ?? 0}
            cycleId={cycle?.cycleID}
            exporting={exporting} exportingDisputes={exportingDisputes} downloadingZip={downloadingZip}
            onExport={() => runExport(exportNonSubmitted, setExporting, 'Export')}
            onExportDisputes={() => runExport(exportDisputes, setExportingDisputes, 'Export')}
            onDownloadZip={handleDownloadZip}
            onOpenGallery={() => setGalleryOpen(true)}
          />

          {/* Managers table */}
          <SectionHeader rule style={{ margin: '4px 0 10px' }}
            right={<span style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', textTransform: 'none', letterSpacing: 0 }}>{visibleManagers.length}</span>}>
            Managers
          </SectionHeader>
          {visibleManagers.length === 0 ? (
            <EmptyState icon="users" title="No managers" message="No managers with assigned tools were found for this department." />
          ) : (
            <ManagersTable managers={visibleManagers} onOpen={onOpenManager} />
          )}
        </>
      )}

      {galleryOpen && cycle?.cycleID && (
        <CycleGallery cycleId={cycle.cycleID} cycleName={cycle.cycleName} onClose={() => setGalleryOpen(false)} onReviewed={onReviewed} />
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} style={{
      padding: '4px 11px', borderRadius: 999, fontSize: 12, fontWeight: active ? 600 : 500,
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      background: active ? 'var(--accent)' : 'var(--surface)',
      color: active ? 'var(--accent-fg)' : 'var(--text-muted)',
      cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
    }}>{children}</button>
  );
}

// ── At-risk individuals table ────────────────────────────────────────────────
function AtRiskTable({ rows, sort }) {
  const accessors = {
    name: (r) => r.name, manager: (r) => r.managerName,
    completionPct: (r) => r.completionPct, status: (r) => r.status,
  };
  const sorted = sortRows(rows, sort.sortKey, sort.sortDir, accessors);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--rule)' }}>
            <SortHeader label="Associate" active={sort.sortKey === 'name'} dir={sort.sortDir} onSort={() => sort.onSort('name')} style={{ padding: '0 16px' }} />
            <SortHeader label="Manager" active={sort.sortKey === 'manager'} dir={sort.sortDir} onSort={() => sort.onSort('manager')} style={{ padding: '0 16px' }} />
            <SortHeader label="Status" active={sort.sortKey === 'status'} dir={sort.sortDir} onSort={() => sort.onSort('status')} style={{ padding: '0 16px' }} />
            <SortHeader label="Done" align="right" active={sort.sortKey === 'completionPct'} dir={sort.sortDir} onSort={() => sort.onSort('completionPct')} style={{ padding: '0 16px' }} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.associateId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '10px 16px' }}>
                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{r.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>ID {r.associateId}{r.email ? ` · ${r.email}` : ''}</div>
              </td>
              <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{r.managerName || '—'}</td>
              <td style={{ padding: '10px 16px' }}>
                <Badge variant={r.status === 'Action needed' ? 'danger' : r.status === 'Awaiting approval' ? 'warning' : 'neutral'}>{r.status}</Badge>
              </td>
              <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{r.completionPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Managers table ───────────────────────────────────────────────────────────
function ManagersTable({ managers, onOpen }) {
  const sort = useSort('fullName', 'asc');
  const withPct = managers.map((m) => {
    const totalTools = m.totalTools ?? m.totalAssociates;
    return { ...m, _totalTools: totalTools, _pct: totalTools > 0 ? Math.round((m.submittedCount / totalTools) * 100) : 0 };
  });
  const accessors = {
    fullName: (m) => m.fullName, totalAssociates: (m) => m.totalAssociates,
    submitted: (m) => m.submittedCount, _pct: (m) => m._pct,
  };
  const sorted = sortRows(withPct, sort.sortKey, sort.sortDir, accessors);
  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--rule)' }}>
              <SortHeader label="Manager" active={sort.sortKey === 'fullName'} dir={sort.sortDir} onSort={() => sort.onSort('fullName')} style={{ padding: '0 18px' }} />
              <SortHeader label="Associates" align="right" active={sort.sortKey === 'totalAssociates'} dir={sort.sortDir} onSort={() => sort.onSort('totalAssociates')} style={{ padding: '0 18px' }} />
              <SortHeader label="Submitted" align="right" active={sort.sortKey === 'submitted'} dir={sort.sortDir} onSort={() => sort.onSort('submitted')} style={{ padding: '0 18px' }} />
              <SortHeader label="Progress" active={sort.sortKey === '_pct'} dir={sort.sortDir} onSort={() => sort.onSort('_pct')} style={{ padding: '0 18px' }} />
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const st = pctTone(m._pct);
              return (
                <HoverRow key={m.associateId} onActivate={() => onOpen(m)}>
                  <td style={{ padding: '11px 18px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{m.fullName}</div>
                    {m.email && <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{m.email}</div>}
                  </td>
                  <td style={{ padding: '11px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{m.totalAssociates}</td>
                  <td style={{ padding: '11px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{m.submittedCount}/{m._totalTools}</td>
                  <td style={{ padding: '11px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Stamp tone={st.tone} icon={st.icon} label={`${m._pct}%`} />
                    </div>
                  </td>
                  <td style={{ padding: '11px 18px', textAlign: 'right', color: 'var(--text-faint)' }}>
                    <Icon name="chevright" size={15} />
                  </td>
                </HoverRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Exception exports panel — ledger rows ────────────────────────────────────
function ExceptionExports({ incompleteCount, disputeCount, cycleId, exporting, exportingDisputes, downloadingZip, onExport, onExportDisputes, onDownloadZip, onOpenGallery }) {
  const Row = ({ icon, tone, title, desc, action }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 999, flex: 'none',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: tone === 'danger' ? 'var(--danger-bg)' : 'var(--accent-glow)',
          color: tone === 'danger' ? 'var(--danger)' : 'var(--accent)',
        }}><Icon name={icon} size={15} stroke={2} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{desc}</div>
        </div>
      </div>
      {action}
    </div>
  );
  return (
    <Card style={{ marginBottom: 18 }}>
      <SectionHeader>Exception exports</SectionHeader>
      <Row icon="users" tone="info" title="Incomplete submissions" desc={`${incompleteCount} associates`}
        action={<Button size="sm" variant="outline" icon="download" loading={exporting} onClick={onExport}>Export</Button>} />
      <Row icon="alert" tone="danger" title="Access disputes" desc={`${disputeCount} records`}
        action={<Button size="sm" variant="outline" icon="download" loading={exportingDisputes} onClick={onExportDisputes}>Export</Button>} />
      <Row icon="image" tone="info" title="Screenshot archive" desc={`All uploads for cycle ${cycleId ?? '—'}`}
        action={<Button size="sm" variant="outline" icon="download" loading={downloadingZip} onClick={onDownloadZip}>Export .zip</Button>} />
      <Row icon="image" tone="info" title="Screenshot gallery" desc={`Browse uploads for cycle ${cycleId ?? '—'}`}
        action={<Button size="sm" variant="outline" icon="eye" disabled={!cycleId} onClick={onOpenGallery}>View</Button>} />
      <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 10 }}>Exports include records requiring review or action.</div>
    </Card>
  );
}

// ── Stacked progress bar ─────────────────────────────────────────────────────
function StackedBar({ submitted, total }) {
  const pct = total > 0 ? (submitted / total) * 100 : 0;
  const inProg = total > 0 ? Math.min(100 - pct, Math.round((total - submitted) * 0.4 / total * 100)) : 0;
  const notStarted = Math.max(0, 100 - pct - inProg);
  const Legend = ({ color, label }) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />{label}
    </span>
  );
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Completion breakdown</div>
      <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-2)', gap: 1 }}>
        <div style={{ width: `${pct}%`, background: 'var(--success)', transition: 'width .6s ease-out' }} />
        <div style={{ width: `${inProg}%`, background: 'var(--accent)', transition: 'width .6s ease-out' }} />
        <div style={{ flex: 1, background: 'var(--surface-2)' }} />
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, flexWrap: 'wrap' }}>
        <Legend color="var(--success)" label={`Submitted (${submitted})`} />
        <Legend color="var(--accent)" label={`In progress (~${Math.round(inProg * total / 100)})`} />
        <Legend color="var(--surface-2)" label={`Not started (~${Math.round(notStarted * total / 100)})`} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRILL-DOWN: MANAGER — direct-reports table
// ─────────────────────────────────────────────────────────────────────────────
function ManagerTeamSection({ mgr, cycle, dark, superUserRole, onBack, onOpenMember, onReviewed }) {
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const sort = useSort('fullName', 'asc');

  useEffect(() => {
    if (!mgr?.associateId || !cycle?.cycleID) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getManagerTeam(mgr.associateId, cycle.cycleID)
      .then((data) => { if (!cancelled) { setTeam(data); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message || 'Failed to load team.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [mgr?.associateId, cycle?.cycleID]);

  const members = team?.members ?? [];
  const accessors = {
    fullName: (m) => m.fullName, attested: (m) => m.attestedTools,
    progressPct: (m) => m.progressPct ?? 0, status: (m) => m.attestationStatus,
  };
  const sorted = sortRows(members, sort.sortKey, sort.sortDir, accessors);

  return (
    <div className="stagger">
      <BackButton label="Managers" onClick={onBack} />
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 4 }}>Direct reports</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 560, color: 'var(--text)', marginBottom: 18, lineHeight: 1.1 }}>{mgr.fullName}</div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={48} />)}
        </div>
      ) : error ? (
        <EmptyState icon="alert" title="Could not load team" message={error} />
      ) : members.length === 0 ? (
        <EmptyState icon="users" title="No direct reports" message="This manager has no direct reports for this cycle." />
      ) : (
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                  <SortHeader label="Associate" active={sort.sortKey === 'fullName'} dir={sort.sortDir} onSort={() => sort.onSort('fullName')} style={{ padding: '0 18px' }} />
                  <SortHeader label="Status" active={sort.sortKey === 'status'} dir={sort.sortDir} onSort={() => sort.onSort('status')} style={{ padding: '0 18px' }} />
                  <SortHeader label="Tools" align="right" active={sort.sortKey === 'attested'} dir={sort.sortDir} onSort={() => sort.onSort('attested')} style={{ padding: '0 18px' }} />
                  <SortHeader label="Progress" align="right" active={sort.sortKey === 'progressPct'} dir={sort.sortDir} onSort={() => sort.onSort('progressPct')} style={{ padding: '0 18px' }} />
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => {
                  const pct = Math.round((m.progressPct ?? 0) * 100);
                  return (
                    <HoverRow key={m.associateId} onActivate={() => onOpenMember(m)}>
                      <td style={{ padding: '11px 18px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{m.fullName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>ID {m.associateId}{m.email ? ` · ${m.email}` : ''}</div>
                      </td>
                      <td style={{ padding: '11px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <StatusChip status={m.attestationStatus} />
                          {m.pendingScreenshots > 0 && <Badge variant="pending" size="sm">Awaiting {m.pendingScreenshots}</Badge>}
                          {m.rejectedScreenshots > 0 && <Badge variant="danger" size="sm">Rejected {m.rejectedScreenshots}</Badge>}
                        </div>
                      </td>
                      <td style={{ padding: '11px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{m.attestedTools}/{m.totalTools}</td>
                      <td style={{ padding: '11px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{pct}%</td>
                      <td style={{ padding: '11px 18px', textAlign: 'right', color: 'var(--text-faint)' }}><Icon name="chevright" size={15} /></td>
                    </HoverRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMBER DETAIL OVERLAY (unchanged data flow; reopen via confirm Modal)
// ─────────────────────────────────────────────────────────────────────────────
function AssociateDetailOverlay({ mgr, member, cycle, dark, superUserRole, onClose, onReopened, onReviewed }) {
  const toasts = useToasts();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reopening, setReopening] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);

  const load = React.useCallback(() => {
    if (!mgr?.associateId || !member?.associateId || !cycle?.cycleID) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getManagerMemberDetail(mgr.associateId, member.associateId, cycle.cycleID)
      .then((data) => { if (!cancelled) { setDetail(data); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message || 'Failed to load member details.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [mgr?.associateId, member?.associateId, cycle?.cycleID]);

  useEffect(() => load(), [load]);

  async function doReopen() {
    if (!cycle?.cycleID || !member?.associateId) return;
    setReopening(true);
    try {
      await reopenAttestation(cycle.cycleID, member.associateId);
      setConfirmReopen(false);
      toasts.success(`${detail?.fullName ?? member.fullName}'s attestation reopened`, { title: 'Reopened' });
      load();
      onReopened?.();
    } catch (e) {
      toasts.error(`Reopen failed: ${e.message}`);
    } finally {
      setReopening(false);
    }
  }

  function handleReviewed() { load(); onReviewed?.(); }

  const pct = Math.round((detail?.progressPct ?? 0) * 100);
  const SUBMITTED_STATES = ['AwaitingApproval', 'ActionNeeded', 'Complete'];
  const canReopen = superUserRole === 'Admin' && SUBMITTED_STATES.includes(detail?.attestationStatus);

  return (
    <FullScreenOverlay
      title={detail?.fullName ?? member.fullName}
      subtitle={`ID · ${member.associateId}${member.email ? ` · ${member.email}` : ''} · ${mgr.fullName}`}
      onClose={onClose}
    >
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton height={120} radius={10} />
          <Skeleton height={60} radius={10} />
          <Skeleton height={60} radius={10} />
        </div>
      ) : error ? (
        <EmptyState icon="alert" title="Could not load details" message={error} />
      ) : !detail ? (
        <EmptyState icon="search" title="No details" message="No details are available for this associate." />
      ) : (
        <>
          {/* Header card */}
          <Card style={{ marginBottom: 22, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 4 }}>Associate</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 560, color: 'var(--text)', lineHeight: 1.1 }}>{detail.fullName}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5, fontFamily: 'var(--font-mono)' }}>ID {detail.associateId}{member.email ? ` · ${member.email}` : ''}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <StatusChip status={detail.attestationStatus} />
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{detail.attestedTools}/{detail.totalTools} tools</span>
                {canReopen && (
                  <Button size="sm" variant="outline" icon="refresh" loading={reopening} onClick={() => setConfirmReopen(true)}>Reopen attestation</Button>
                )}
              </div>
            </div>
            <div style={{ flex: 'none' }}><AdminDonut pct={pct} size={96} strokeWidth={10} dark={dark} /></div>
          </Card>

          {/* Per-client progress */}
          <SectionHeader rule style={{ marginBottom: 12 }}>Per-client progress</SectionHeader>
          {!detail.byClient?.length ? (
            <EmptyState icon="key" title="No active access" message="No client access is active for this associate." style={{ padding: '28px 24px' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {detail.byClient.map((client) => {
                const cPct = client.totalTools > 0 ? Math.round((client.attestedTools / client.totalTools) * 100) : 0;
                const cSt = statusOf(cPct);
                return (
                  <Card key={client.clientID} pad={0} style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{client.clientName} ({client.clientID})</div>
                      <div style={{ marginTop: 8, height: 5, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                        <div style={{ width: `${cPct}%`, height: '100%', background: `var(${cSt.varName})`, transition: 'width .6s ease-out' }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{client.attestedTools}/{client.totalTools}</span>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Screenshot review gallery */}
          {(detail.pendingScreenshots > 0 || detail.rejectedScreenshots > 0 || detail.byClient?.some((c) => c.tools?.length)) && (
            <div style={{ marginBottom: 24 }}>
              <ScreenshotGallery
                cycleId={cycle.cycleID} associateId={detail.associateId} memberName={detail.fullName}
                byClient={detail.byClient} pendingScreenshots={detail.pendingScreenshots}
                rejectedScreenshots={detail.rejectedScreenshots} onReviewed={handleReviewed}
              />
            </div>
          )}

          {/* Access disputes */}
          {detail.mismatches?.length > 0 && (
            <>
              <SectionHeader rule style={{ marginBottom: 12 }}>
                <span style={{ color: 'var(--danger)' }}>Access disputes ({detail.mismatches.length})</span>
              </SectionHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail.mismatches.map((m, i) => (
                  <div key={`${m.clientID}-${m.toolName}-${i}`} style={{
                    display: 'flex', flexDirection: 'column', gap: 4, padding: '11px 14px',
                    background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
                    borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--text)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ minWidth: 0 }}>
                        <strong>{m.toolName}</strong>
                        <span style={{ color: 'var(--text-muted)' }}> — {m.clientName} ({m.clientID})</span>
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{fmtDate(m.submittedAt)}</span>
                    </div>
                    {m.remarks && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.remarks}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Reopen confirm — Modal, never window.confirm */}
      <Modal open={confirmReopen} onClose={() => !reopening && setConfirmReopen(false)} title="Reopen attestation" width={420}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmReopen(false)} disabled={reopening}>Cancel</Button>
            <Button variant="danger" loading={reopening} onClick={doReopen}>Reopen</Button>
          </>
        )}>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text)', lineHeight: 1.55 }}>
          Reopen <strong>{detail?.fullName ?? member.fullName}</strong>&apos;s submitted attestation for{' '}
          <strong>{cycle?.cycleName ?? 'this cycle'}</strong>? They will be able to edit and resubmit, and any approvals will need to be reviewed again.
        </p>
      </Modal>
    </FullScreenOverlay>
  );
}
