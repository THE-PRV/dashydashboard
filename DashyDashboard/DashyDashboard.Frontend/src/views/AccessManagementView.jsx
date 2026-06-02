import React, { useEffect, useMemo, useState } from 'react';
import { Icon, Avatar, Button, TopBar, SearchBar } from '../components/ui.jsx';
import {
  getTeam, getMemberAccess, grantAccess, revokeAccess,
  updateAccessEndDate, getClientsAndTools,
} from '../api/manager.js';
import { asAssociateId, asToolId, asToolIdKey } from '../lib/contracts.js';

const TODAY = new Date().toISOString().slice(0, 10);

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

const inputStyle = {
  height: 32,
  padding: '0 10px',
  borderRadius: 7,
  boxSizing: 'border-box',
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  width: '100%',
};

export default function AccessManagementView(props) {
  const { cycle } = props;
  const [members, setMembers] = useState([]);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!cycle) {
      setLoadingTeam(false);
      return;
    }

    setLoadingTeam(true);
    getTeam(cycle.cycleID)
      .then((data) => {
        const nextMembers = (data.members ?? []).map((member) => ({
          ...member,
          associateId: asAssociateId(member.associateId),
        }));
        setMembers(nextMembers);
        setSelectedId((current) => current && nextMembers.some((member) => member.associateId === current)
          ? current
          : (nextMembers[0]?.associateId ?? null));
      })
      .finally(() => setLoadingTeam(false));
  }, [cycle]);

  const visibleMembers = useMemo(() => {
    if (!search) return members;
    const q = search.toLowerCase();
    return members.filter((member) =>
      member.fullName.toLowerCase().includes(q) || member.associateId.includes(q));
  }, [members, search]);

  const selectedMember = members.find((member) => member.associateId === selectedId) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      <TopBar {...props} />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px',
        background: 'color-mix(in oklab, var(--accent), transparent 92%)',
        borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text)',
      }}>
        <Icon name="shield" size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontWeight: 600 }}>Access management</span>
        <span style={{ color: 'var(--text-muted)' }}>
          Grant, time-box, or revoke tool access for your direct reports
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <aside style={{
          width: 300, flex: 'none', borderRight: '1px solid var(--border)',
          background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search team..." />
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {loadingTeam ? (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>Loading team...</div>
            ) : visibleMembers.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>No direct reports.</div>
            ) : visibleMembers.map((member) => {
              const selected = member.associateId === selectedId;
              return (
                <button
                  key={member.associateId}
                  onClick={() => setSelectedId(member.associateId)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '11px 16px', border: 0, borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    background: selected ? 'color-mix(in oklab, var(--accent), transparent 92%)' : 'transparent',
                  }}
                >
                  <Avatar initials={(member.fullName ?? 'U').slice(0, 2).toUpperCase()} size={30} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {member.fullName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID · {member.associateId}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '20px 24px' }}>
          {selectedMember
            ? <MemberAccessPanel key={selectedMember.associateId} member={selectedMember} />
            : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Select a team member to manage their access.</div>}
        </main>
      </div>
    </div>
  );
}

function MemberAccessPanel({ member }) {
  const memberId = asAssociateId(member.associateId);
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState(null);

  function load() {
    setLoading(true);
    setError('');
    getMemberAccess(memberId)
      .then((data) => setGroups(data))
      .catch((e) => setError(e.message || 'Failed to load access.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [memberId]);

  async function withBusy(key, fn) {
    setBusyKey(key);
    setError('');
    try {
      await fn();
      const fresh = await getMemberAccess(memberId);
      setGroups(fresh);
    } catch (e) {
      setError(e.message || 'Action failed.');
    } finally {
      setBusyKey(null);
    }
  }

  const setEndDate = (clientId, toolId, value) =>
    withBusy(`${clientId}/${asToolIdKey(toolId)}`, () => updateAccessEndDate(memberId, clientId, toolId, value || null));
  const revokeNow = (clientId, toolId) =>
    withBusy(`${clientId}/${asToolIdKey(toolId)}`, () => revokeAccess(memberId, clientId, toolId));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar initials={(member.fullName ?? 'U').slice(0, 2).toUpperCase()} size={44} />
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)' }}>{member.fullName}</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Associate ID · {memberId}</div>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 13, color: 'var(--danger-fg)', padding: '8px 12px', borderRadius: 8, background: 'color-mix(in oklab, var(--danger-fg), transparent 90%)', border: '1px solid color-mix(in oklab, var(--danger-fg), transparent 70%)' }}>
          {error}
        </div>
      )}

      <GrantAccessForm memberId={memberId} onGranted={load} />

      <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          Active access
        </div>
        {loading ? (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>Loading access...</div>
        ) : !groups || groups.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>No active tool access.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Client', 'Tool', 'From', 'To', 'Actions'].map((heading) => (
                    <th key={heading} style={{
                      textAlign: 'left', padding: '9px 16px', fontSize: 11, fontWeight: 600,
                      letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                    }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.flatMap((group) => group.tools.map((tool) => {
                  const key = `${group.clientID}/${asToolIdKey(tool.toolID)}`;
                  const busy = busyKey === key;
                  return (
                    <tr key={`${key}/${tool.accessTo ?? 'open'}`} style={{ borderBottom: '1px solid var(--border-subtle)', opacity: busy ? 0.6 : 1 }}>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{group.clientName}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>{tool.toolName}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{tool.givenDate}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <input
                          type="date"
                          defaultValue={tool.accessTo ?? ''}
                          min={tool.givenDate}
                          disabled={busy}
                          onChange={(e) => setEndDate(group.clientID, tool.toolID, e.target.value || null)}
                          style={{ ...inputStyle, height: 28, width: 150 }}
                        />
                      </td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          {tool.accessTo && (
                            <button
                              onClick={() => setEndDate(group.clientID, tool.toolID, null)}
                              disabled={busy}
                              title="Clear end date (make open-ended)"
                              style={{
                                height: 26, padding: '0 9px', borderRadius: 6, border: '1px solid var(--border)',
                                background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 11,
                                fontWeight: 500, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                              }}
                            >Clear</button>
                          )}
                          <button
                            onClick={() => revokeNow(group.clientID, tool.toolID)}
                            disabled={busy}
                            title="Revoke access today"
                            style={{
                              height: 26, padding: '0 9px', borderRadius: 6,
                              border: '1px solid color-mix(in oklab, var(--danger-fg), transparent 60%)',
                              background: 'color-mix(in oklab, var(--danger-fg), transparent 92%)',
                              color: 'var(--danger-fg)', fontSize: 11, fontWeight: 500,
                              cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                            }}
                          >Revoke now</button>
                        </div>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function GrantAccessForm({ memberId, onGranted }) {
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ clientId: '', toolId: '', accessFrom: TODAY, accessTo: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getClientsAndTools().then(setClients).catch(() => setClients([]));
  }, []);

  const setField = (key) => (e) => setForm((current) => ({ ...current, [key]: e.target.value }));
  const selectedClient = clients.find((client) => client.clientID === form.clientId);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.clientId || !form.toolId) {
      setError('Select a client and tool.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await grantAccess(memberId, {
        clientID: form.clientId,
        toolID: asToolId(form.toolId),
        accessFrom: form.accessFrom || null,
        accessTo: form.accessTo || null,
      });
      setForm({ clientId: '', toolId: '', accessFrom: TODAY, accessTo: '' });
      onGranted();
    } catch (err) {
      setError(err.message || 'Failed to grant access.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{
      padding: 16, border: '1px solid var(--border)', borderRadius: 12,
      background: 'var(--surface-elev)', boxShadow: 'var(--shadow-sm)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Grant new access</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <Field label="Client">
          <select
            value={form.clientId}
            onChange={(e) => setForm((current) => ({ ...current, clientId: e.target.value, toolId: '' }))}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">Select client...</option>
            {clients.map((client) => (
              <option key={client.clientID} value={client.clientID}>{client.clientName}</option>
            ))}
          </select>
        </Field>
        <Field label="Tool">
          <select
            value={form.toolId}
            onChange={setField('toolId')}
            disabled={!selectedClient}
            style={{ ...inputStyle, cursor: selectedClient ? 'pointer' : 'not-allowed' }}
          >
            <option value="">Select tool...</option>
            {selectedClient?.tools?.map((tool) => (
              <option key={tool.toolID} value={String(tool.toolID)}>{tool.toolName}</option>
            ))}
          </select>
        </Field>
        <Field label="Access from">
          <input type="date" value={form.accessFrom} onChange={setField('accessFrom')} style={inputStyle} />
        </Field>
        <Field label="Access to (optional)">
          <input type="date" value={form.accessTo} min={form.accessFrom} onChange={setField('accessTo')} style={inputStyle} />
        </Field>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--danger-fg)' }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" size="sm" icon="plus" type="submit" style={{ opacity: saving ? 0.7 : 1, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Granting...' : 'Grant access'}
        </Button>
      </div>
    </form>
  );
}
