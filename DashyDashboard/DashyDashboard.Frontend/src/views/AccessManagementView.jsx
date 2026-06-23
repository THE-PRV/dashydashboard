import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Icon, Avatar, Button, SearchBar, Card, Badge, Stamp, Skeleton, EmptyState,
  SortHeader, SegmentedControl, Tooltip, SectionHeader, Modal, Drawer, Combobox, useToasts,
} from '../components/ui.jsx';
import { useBreadcrumbs } from '../components/AppShell.jsx';
import {
  getTeam, getMemberAccess, grantAccess, revokeAccess,
  updateAccessEndDate, setOpenAccess, getGrantableClientsAndTools,
  updateAccessUserId, exportAccesses,
} from '../api/manager.js';
import { asAssociateId, asToolId, asToolIdKey } from '../lib/contracts.js';

const TODAY = new Date().toISOString().slice(0, 10);

// ── shared field chrome ───────────────────────────────────────────────────────
const inputStyle = {
  height: 32, padding: '0 10px', borderRadius: 'var(--radius)', boxSizing: 'border-box',
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
};
const monoCell = {
  fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
  fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap',
};

// Table row with --surface-2 hover (no global CSS rule available to this view).
function HoverRow({ children, busy, style, ...rest }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: hovered ? 'var(--surface-2)' : 'transparent',
        opacity: busy ? 0.55 : 1,
        transition: 'background .12s ease-out, opacity .15s ease-out',
        ...style,
      }}
      {...rest}
    >
      {children}
    </tr>
  );
}

function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
      letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
    }}>{children}</div>
  );
}

// ── inline editor that commits on blur/Enter with toast feedback ──────────────
function InlineText({ value, placeholder, disabled, title, onCommit, width = 150 }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="text"
      defaultValue={value ?? ''}
      placeholder={placeholder}
      disabled={disabled}
      title={title}
      aria-label={title}
      onFocus={() => setFocused(true)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = value ?? ''; e.currentTarget.blur(); } }}
      onBlur={(e) => {
        setFocused(false);
        const next = e.target.value.trim();
        if (next !== (value ?? '')) onCommit(next || null);
      }}
      style={{
        ...inputStyle, height: 28, width,
        fontFamily: 'var(--font-mono)', fontSize: 12.5,
        border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
        boxShadow: focused ? '0 0 0 3px var(--accent-glow)' : 'none',
        transition: 'border-color .15s ease-out, box-shadow .15s ease-out',
      }}
    />
  );
}

function InlineDate({ value, min, disabled, onCommit, ariaLabel }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="date"
      defaultValue={value ?? ''}
      min={min}
      disabled={disabled}
      aria-label={ariaLabel}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onCommit(e.target.value || null)}
      style={{
        ...inputStyle, height: 28, width: 150,
        fontFamily: 'var(--font-mono)', fontSize: 12.5,
        border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
        boxShadow: focused ? '0 0 0 3px var(--accent-glow)' : 'none',
        transition: 'border-color .15s ease-out, box-shadow .15s ease-out',
      }}
    />
  );
}

export default function AccessManagementView(props) {
  const { cycle } = props;
  const toasts = useToasts();
  const [members, setMembers] = useState([]);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!cycle) { setLoadingTeam(false); return; }
    setLoadingTeam(true);
    getTeam(cycle.cycleID, { includeEmpty: true })
      .then((data) => {
        const next = (data.members ?? []).map((m) => ({ ...m, associateId: asAssociateId(m.associateId) }));
        setMembers(next);
        setSelectedId((cur) => (cur && next.some((m) => m.associateId === cur)) ? cur : (next[0]?.associateId ?? null));
      })
      .catch((e) => toasts.error(e.message || 'Failed to load team.', { title: 'Access management' }))
      .finally(() => setLoadingTeam(false));
  }, [cycle]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleMembers = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter((m) => m.fullName.toLowerCase().includes(q) || m.associateId.includes(q));
  }, [members, search]);

  const selectedMember = members.find((m) => m.associateId === selectedId) ?? null;

  useBreadcrumbs(useMemo(
    () => (selectedMember ? ['Access', selectedMember.fullName] : ['Access']),
    [selectedMember],
  ));

  async function handleExport() {
    if (!cycle?.cycleID) return;
    setExporting(true);
    try {
      await exportAccesses(cycle.cycleID, { memberId: selectedId || null });
      toasts.success(selectedMember ? `Exported ${selectedMember.fullName}'s accesses.` : 'Exported accesses.', { title: 'Export' });
    } catch (e) {
      toasts.error(e.message || 'Export failed.', { title: 'Export' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--bg)' }}>
      {/* ── member rail ── */}
      <aside style={{
        width: 280, flex: 'none', borderRight: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', flex: 'none' }}>
          <SectionHeader>Direct reports</SectionHeader>
          <div style={{ marginTop: 10 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search team…" />
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {loadingTeam ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Skeleton width={30} height={30} radius={999} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Skeleton width="70%" height={11} />
                    <Skeleton width="40%" height={9} />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleMembers.length === 0 ? (
            <EmptyState icon="users" title="No reports"
              message={search ? 'No team member matches your search.' : 'You have no direct reports in this cycle.'}
              style={{ padding: '40px 20px' }} />
          ) : visibleMembers.map((member) => {
            const selected = member.associateId === selectedId;
            const initials = (member.fullName ?? 'U').slice(0, 2).toUpperCase();
            return (
              <button
                key={member.associateId}
                onClick={() => setSelectedId(member.associateId)}
                aria-current={selected ? 'true' : undefined}
                style={{
                  position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', textAlign: 'left', padding: '11px 16px',
                  border: 0, borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer', fontFamily: 'inherit',
                  background: selected ? 'var(--accent-glow)' : 'transparent',
                }}
              >
                {selected && <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, background: 'var(--accent)' }} />}
                <Avatar initials={initials} size={30} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {member.fullName}
                  </div>
                  <div style={{ ...monoCell, fontSize: 10.5, marginTop: 1 }}>ID {member.associateId}</div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── content ── */}
      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }} className="stagger">
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap', padding: '20px 24px 0',
        }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 560, lineHeight: 1.1, color: 'var(--text)' }}>
              Access management
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Grant, time-box, or revoke tool access for your direct reports.
            </p>
          </div>
          <Button variant="outline" icon="download" onClick={handleExport} loading={exporting} disabled={!cycle}>
            {exporting ? 'Exporting…' : 'Export accesses'}
          </Button>
        </div>

        <div style={{ padding: '20px 24px 28px' }}>
          {selectedMember
            ? <MemberAccessPanel key={selectedMember.associateId} member={selectedMember} toasts={toasts} />
            : !loadingTeam && (
              <Card>
                <EmptyState icon="key" title="Select a team member"
                  message="Choose someone from the list to review and adjust their tool access." />
              </Card>
            )}
        </div>
      </main>
    </div>
  );
}

function MemberAccessPanel({ member, toasts }) {
  const memberId = asAssociateId(member.associateId);
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null); // { clientId, clientName, toolId, toolName }
  const [sort, setSort] = useState({ key: 'client', dir: 'asc' });

  function load(silent = false) {
    if (!silent) setLoading(true);
    return getMemberAccess(memberId)
      .then((data) => setGroups(data))
      .catch((e) => toasts.error(e.message || 'Failed to load access.', { title: member.fullName }))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [memberId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function withBusy(key, fn, successMsg) {
    setBusyKey(key);
    try {
      await fn();
      await load(true);
      if (successMsg) toasts.success(successMsg, { title: member.fullName });
    } catch (e) {
      toasts.error(e.message || 'Action failed.', { title: member.fullName });
    } finally {
      setBusyKey(null);
    }
  }

  const setEndDate = (clientId, toolId, value) =>
    withBusy(`${clientId}/${asToolIdKey(toolId)}`,
      () => updateAccessEndDate(memberId, clientId, toolId, value || null),
      value ? `End date set to ${value}.` : 'End date cleared — access is now open-ended.');
  const grantFull = (clientId, toolId) =>
    withBusy(`${clientId}/${asToolIdKey(toolId)}`,
      () => setOpenAccess(memberId, clientId, toolId, false), 'Open access approved as full access.');
  const setUserId = (clientId, toolId, value) =>
    withBusy(`${clientId}/${asToolIdKey(toolId)}`,
      () => updateAccessUserId(memberId, clientId, toolId, value || null),
      value ? 'Tool user ID updated.' : 'Tool user ID cleared.');

  async function confirmRevoke() {
    const t = revokeTarget;
    if (!t) return;
    await withBusy(`${t.clientId}/${asToolIdKey(t.toolId)}`,
      () => revokeAccess(memberId, t.clientId, t.toolId),
      `Revoked ${t.toolName} for ${member.fullName}.`);
    setRevokeTarget(null);
  }

  // flatten + sort
  const rows = useMemo(() => {
    const flat = (groups ?? []).flatMap((g) => g.tools.map((tool) => ({
      clientId: g.clientID, clientName: g.clientName, ...tool,
    })));
    const dir = sort.dir === 'desc' ? -1 : 1;
    const val = (r) => {
      switch (sort.key) {
        case 'client': return `${r.clientName} ${r.clientId}`.toLowerCase();
        case 'tool': return (r.toolName ?? '').toLowerCase();
        case 'from': return r.givenDate ?? '';
        case 'to': return r.accessTo ?? '9999';
        case 'userid': return (r.toolUserId ?? '').toLowerCase();
        default: return '';
      }
    };
    return [...flat].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * dir);
  }, [groups, sort]);

  const onSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const sortProps = (key, label, align) => ({
    label, align, active: sort.key === key, dir: sort.dir, onSort: () => onSort(key),
  });

  const initials = (member.fullName ?? 'U').slice(0, 2).toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar initials={initials} size={44} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{member.fullName}</div>
          <div style={{ ...monoCell, fontSize: 11.5, marginTop: 2 }}>ASSOCIATE ID {memberId}</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Button variant="primary" icon="plus" onClick={() => setGrantOpen(true)}>Grant access</Button>
        </div>
      </div>

      <Card pad={0}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)' }}>
          <SectionHeader right={<span style={{ ...monoCell, fontSize: 11 }}>{rows.length} GRANT{rows.length === 1 ? '' : 'S'}</span>}>
            Tool access
          </SectionHeader>
        </div>

        {loading ? (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={32} />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon="key" title="No tool access"
            message={`${member.fullName} has no tool access grants. Use “Grant access” to add the first one.`}
            action={<Button variant="primary" icon="plus" onClick={() => setGrantOpen(true)}>Grant access</Button>} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                  <th style={{ padding: '0 16px', width: 36 }} aria-hidden="true" />
                  <SortHeader {...sortProps('client', 'Client')} style={{ padding: '0 16px' }} />
                  <SortHeader {...sortProps('tool', 'Tool')} style={{ padding: '0 16px' }} />
                  <SortHeader {...sortProps('from', 'From')} style={{ padding: '0 16px' }} />
                  <SortHeader {...sortProps('to', 'To')} style={{ padding: '0 16px' }} />
                  <SortHeader {...sortProps('userid', 'User ID')} style={{ padding: '0 16px' }} />
                  <th style={{ padding: '6px 16px', textAlign: 'right', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const key = `${row.clientId}/${asToolIdKey(row.toolID)}`;
                  const busy = busyKey === key;
                  return (
                    <HoverRow key={`${key}/${row.accessTo ?? 'open'}`} busy={busy}>
                      <td style={{ padding: '10px 16px', ...monoCell, fontSize: 11, color: 'var(--text-faint)' }}>{String(i + 1).padStart(2, '0')}</td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{row.clientName}</span>
                        <span style={{ ...monoCell, marginLeft: 6 }}>({row.clientId})</span>
                      </td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ fontWeight: 500, color: 'var(--text)' }}>{row.toolName}</span>
                          {row.isOpen && <Badge variant="warning" size="sm">Open access</Badge>}
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px', ...monoCell }}>{row.givenDate || '—'}</td>
                      <td style={{ padding: '10px 16px' }}>
                        {row.isOpen
                          ? <span style={monoCell}>{row.accessTo ?? '—'}</span>
                          : <InlineDate value={row.accessTo} min={row.givenDate} disabled={busy}
                              ariaLabel={`End date for ${row.toolName}`}
                              onCommit={(v) => setEndDate(row.clientId, row.toolID, v)} />}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <InlineText value={row.toolUserId} placeholder="—" disabled={busy}
                          title={`Login ${member.fullName} uses inside ${row.toolName}`}
                          onCommit={(v) => setUserId(row.clientId, row.toolID, v)} />
                      </td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {row.isOpen ? (
                          <Button variant="primary" size="sm" icon="check" loading={busy}
                            onClick={() => grantFull(row.clientId, row.toolID)}
                            title="Approve this open access as full access">Grant full</Button>
                        ) : (
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                            {row.accessTo && (
                              <Button variant="ghost" size="sm" disabled={busy}
                                onClick={() => setEndDate(row.clientId, row.toolID, null)}
                                title="Clear end date (make open-ended)">Clear</Button>
                            )}
                            <Button variant="danger" size="sm" icon="trash" disabled={busy}
                              onClick={() => setRevokeTarget({ clientId: row.clientId, clientName: row.clientName, toolId: row.toolID, toolName: row.toolName })}
                              aria-label={`Revoke ${row.toolName} for ${member.fullName}`}>Revoke</Button>
                          </div>
                        )}
                      </td>
                    </HoverRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <GrantAccessDrawer
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        memberId={memberId}
        memberName={member.fullName}
        toasts={toasts}
        onGranted={() => load(true)}
      />

      <Modal
        open={!!revokeTarget}
        onClose={() => { if (busyKey == null) setRevokeTarget(null); }}
        title="Revoke tool access"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevokeTarget(null)} disabled={busyKey != null}>Cancel</Button>
            <Button variant="danger" icon="trash" onClick={confirmRevoke} loading={busyKey != null}>Revoke access</Button>
          </>
        }
      >
        {revokeTarget && (
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
            <p style={{ margin: '0 0 12px' }}>
              You are about to revoke <strong>{revokeTarget.toolName}</strong> access on{' '}
              <strong>{revokeTarget.clientName} ({revokeTarget.clientId})</strong> for{' '}
              <strong>{member.fullName}</strong>.
            </p>
            <div style={{
              display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius)',
              background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)',
            }}>
              <Icon name="alert" size={16} stroke={2} style={{ flex: 'none', marginTop: 1 }} />
              <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                Access ends today. The associate will lose this grant immediately and it will no longer
                appear on their attestation for the current cycle. This cannot be undone here — you would
                need to grant the access again.
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Grant flow as a right-side Drawer with an explicit stepper ────────────────
// Member is preselected (the panel's member). Steps: Client → Tool → Dates & type.
function GrantAccessDrawer({ open, onClose, memberId, memberName, toasts, onGranted }) {
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ clientId: '', toolId: '', accessFrom: TODAY, accessTo: '', open: false, toolUserId: '' });
  const [saving, setSaving] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    if (!open) return;
    setLoadingClients(true);
    getGrantableClientsAndTools()
      .then(setClients)
      .catch(() => { setClients([]); toasts.error('Could not load grantable clients & tools.', { title: 'Grant access' }); })
      .finally(() => setLoadingClients(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // reset whenever the drawer (re)opens
  useEffect(() => {
    if (open) {
      setStep(0);
      setForm({ clientId: '', toolId: '', accessFrom: TODAY, accessTo: '', open: false, toolUserId: '' });
    }
  }, [open]);

  const selectedClient = clients.find((c) => c.clientID === form.clientId) ?? null;
  const selectedTool = selectedClient?.tools?.find((t) => String(t.toolID) === form.toolId) ?? null;

  const canNext = step === 0 ? !!form.clientId : step === 1 ? !!form.toolId : true;

  async function handleGrant() {
    if (!form.clientId || !form.toolId) return;
    setSaving(true);
    try {
      await grantAccess(memberId, {
        clientID: form.clientId,
        toolID: asToolId(form.toolId),
        accessFrom: form.accessFrom || null,
        accessTo: form.accessTo || null,
        open: form.open,
        toolUserId: form.toolUserId.trim() || null,
      });
      toasts.success(`Granted ${selectedTool?.toolName ?? 'tool'} to ${memberName}.`, { title: 'Access granted' });
      onGranted();
      onClose();
    } catch (e) {
      toasts.error(e.message || 'Failed to grant access.', { title: 'Grant access' });
    } finally {
      setSaving(false);
    }
  }

  const steps = ['Client', 'Tool', 'Dates & type'];

  return (
    <Drawer
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title="Grant access"
      width={480}
      footer={
        <>
          {step > 0 && <Button variant="ghost" icon="chevleft" onClick={() => setStep((s) => s - 1)} disabled={saving}>Back</Button>}
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          {step < 2
            ? <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>Continue</Button>
            : <Button variant="primary" icon="check" onClick={handleGrant} loading={saving} disabled={!form.clientId || !form.toolId}>Grant access</Button>}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* who */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
          background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        }}>
          <Avatar initials={(memberName ?? 'U').slice(0, 2).toUpperCase()} size={28} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{memberName}</div>
            <div style={{ ...monoCell, fontSize: 10.5 }}>ID {memberId}</div>
          </div>
        </div>

        {/* stepper */}
        <ol style={{ display: 'flex', alignItems: 'center', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
          {steps.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: i < steps.length - 1 ? 1 : 'none' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 20, height: 20, borderRadius: 999, flex: 'none',
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
                  background: active ? 'var(--accent)' : done ? 'var(--success-bg)' : 'var(--surface-2)',
                  color: active ? 'var(--accent-fg)' : done ? 'var(--success)' : 'var(--text-muted)',
                  border: `1px solid ${active ? 'var(--accent)' : done ? 'var(--success-border)' : 'var(--border)'}`,
                }}>
                  {done ? <Icon name="check" size={11} stroke={2.6} /> : i + 1}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: active ? 600 : 500, color: active ? 'var(--text)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</span>
                {i < steps.length - 1 && <span aria-hidden="true" style={{ flex: 1, height: 1, background: 'var(--border)', minWidth: 12 }} />}
              </li>
            );
          })}
        </ol>

        {/* step bodies */}
        {step === 0 && (
          <div>
            <FieldLabel>Client</FieldLabel>
            {loadingClients ? (
              <Skeleton height={32} />
            ) : (
              <Combobox
                ariaLabel="Client"
                value={form.clientId}
                onChange={(v) => setForm((c) => ({ ...c, clientId: v, toolId: '' }))}
                placeholder="Select client…"
                emptyOption={{ value: '', label: 'Select client…' }}
                options={clients.map((client) => ({
                  value: client.clientID, label: client.clientName, hint: client.clientID,
                }))}
              />
            )}
            {!loadingClients && clients.length === 0 && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>No grantable clients are available.</p>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <FieldLabel>Tool · {selectedClient?.clientName}</FieldLabel>
            <Combobox
              ariaLabel="Tool"
              value={form.toolId}
              disabled={!selectedClient}
              onChange={(v) => setForm((c) => ({ ...c, toolId: v }))}
              placeholder="Select tool…"
              emptyOption={{ value: '', label: 'Select tool…' }}
              options={(selectedClient?.tools ?? []).map((tool) => ({
                value: String(tool.toolID), label: tool.toolName, hint: String(tool.toolID),
              }))}
            />
            {selectedClient && (selectedClient.tools?.length ?? 0) === 0 && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>No grantable tools for this client.</p>
            )}
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <FieldLabel>Access from</FieldLabel>
                <input type="date" value={form.accessFrom}
                  onChange={(e) => setForm((c) => ({ ...c, accessFrom: e.target.value }))}
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12.5 }} aria-label="Access from" />
              </div>
              <div>
                <FieldLabel>Access to (optional)</FieldLabel>
                <input type="date" value={form.accessTo} min={form.accessFrom}
                  onChange={(e) => setForm((c) => ({ ...c, accessTo: e.target.value }))}
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12.5 }} aria-label="Access to" />
              </div>
            </div>

            <div>
              <FieldLabel>Tool user ID (optional)</FieldLabel>
              <input type="text" value={form.toolUserId}
                onChange={(e) => setForm((c) => ({ ...c, toolUserId: e.target.value }))}
                placeholder="Login inside the tool"
                style={inputStyle} aria-label="Tool user ID" />
            </div>

            <div>
              <FieldLabel>Access type</FieldLabel>
              <SegmentedControl
                ariaLabel="Access type"
                options={[{ id: 'full', label: 'Full access', icon: 'check' }, { id: 'open', label: 'Open access', icon: 'clock' }]}
                value={form.open ? 'open' : 'full'}
                onChange={(id) => setForm((c) => ({ ...c, open: id === 'open' }))}
              />
              {form.open && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--warning)', lineHeight: 1.5 }}>
                  Paperwork in-process — access stays marked pending until you grant it fully.
                </p>
              )}
            </div>

            {/* review summary */}
            <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
              <SectionHeader>Review</SectionHeader>
              <dl style={{ margin: '10px 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 12.5 }}>
                <dt style={{ color: 'var(--text-muted)' }}>Client</dt>
                <dd style={{ margin: 0, color: 'var(--text)' }}>{selectedClient ? `${selectedClient.clientName} (${selectedClient.clientID})` : '—'}</dd>
                <dt style={{ color: 'var(--text-muted)' }}>Tool</dt>
                <dd style={{ margin: 0, color: 'var(--text)' }}>{selectedTool?.toolName ?? '—'}</dd>
                <dt style={{ color: 'var(--text-muted)' }}>Window</dt>
                <dd style={{ margin: 0, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                  {form.accessFrom || '—'} → {form.accessTo || 'open-ended'}
                </dd>
                <dt style={{ color: 'var(--text-muted)' }}>Type</dt>
                <dd style={{ margin: 0 }}>
                  <Stamp tone={form.open ? 'warning' : 'success'} label={form.open ? 'OPEN' : 'FULL'} />
                </dd>
              </dl>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
