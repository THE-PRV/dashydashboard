import React, { useEffect, useMemo, useState } from 'react';
import { Icon, Avatar, TopBar, SearchBar } from '../components/ui.jsx';
import { getAllUsers } from '../api/manager.js';
import { updateUser } from '../api/admin.js';
import { asAssociateId, displayUserName } from '../lib/contracts.js';

export default function UserManagementView({
  user, cycle, cycles, onCycle, onLogout, isManager, role, onRole, dark, onDark,
}) {
  const isAdmin = user?.superUserRole === 'Admin';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  // Edit modal state
  const [editRecord, setEditRecord] = useState(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editUserName, setEditUserName] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editManagerId, setEditManagerId] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  function loadUsers() {
    setLoading(true);
    setLoadError('');
    getAllUsers()
      .then((data) => setUsers((data ?? []).map((record) => ({
        ...record,
        associateId: asAssociateId(record.associateId),
      }))))
      .catch((e) => setLoadError(e.message || 'Failed to load users.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadUsers(); }, []);

  function openEdit(e, record) {
    e.stopPropagation();
    setEditRecord(record);
    setEditFirstName(record.firstName ?? '');
    setEditLastName(record.lastName ?? '');
    setEditUserName(record.userName ?? '');
    setEditDepartment(record.department ?? '');
    setEditManagerId(record.managerId ?? '');
    setEditEmail(record.email ?? '');
    setEditError('');
  }

  function closeEdit() {
    if (editSaving) return;
    setEditRecord(null);
  }

  async function submitEdit() {
    if (!editRecord || editSaving) return;
    setEditSaving(true);
    setEditError('');
    try {
      await updateUser(editRecord.associateId, {
        firstName: editFirstName,
        lastName: editLastName,
        userName: editUserName,
        department: editDepartment,
        managerId: editManagerId || null,
        email: editEmail,
      });
      setEditRecord(null);
      loadUsers();
    } catch (e) {
      setEditError(e.message || 'Failed to save changes.');
    } finally {
      setEditSaving(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter((record) =>
      record.fullName.toLowerCase().includes(q) ||
      displayUserName(record).toLowerCase().includes(q) ||
      record.associateId.includes(q) ||
      (record.department ?? '').toLowerCase().includes(q) ||
      (record.managerName ?? '').toLowerCase().includes(q));
  }, [users, search]);

  const inputStyle = {
    width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', padding: '9px 12px',
    fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none',
    boxSizing: 'border-box',
  };
  const labelHeadStyle = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      <TopBar
        user={user}
        cycle={cycle}
        cycles={cycles}
        onCycle={onCycle}
        onLogout={onLogout}
        isManager={isManager}
        role={role}
        onRole={onRole}
        dark={dark}
        onDark={onDark}
      />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px',
        background: 'color-mix(in oklab, var(--accent), transparent 92%)',
        borderBottom: '1px solid var(--border)',
        fontSize: 12, color: 'var(--text)',
      }}>
        <Icon name="users" size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontWeight: 600 }}>User directory</span>
        <span style={{ color: 'var(--text-muted)' }}>
          {loading ? 'Loading...' : `${users.length} users in system`}
        </span>
      </div>

      <div style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        padding: '20px 24px', gap: 14, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)' }}>
              All Users
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Read-only directory. Use the search to filter.
            </p>
          </div>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by name, ID, or user name..."
            width={280}
          />
        </div>

        {loadError && (
          <div style={{
            fontSize: 13, color: 'var(--danger-fg)', padding: '10px 14px', borderRadius: 9,
            background: 'color-mix(in oklab, var(--danger-fg), transparent 88%)',
            border: '1px solid color-mix(in oklab, var(--danger-fg), transparent 70%)',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <Icon name="x" size={14} stroke={2} />
            {loadError}
          </div>
        )}

        {loading && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: 13,
          }}>
            Loading users...
          </div>
        )}

        {!loading && (
          <div style={{
            flex: 1, minHeight: 0, overflow: 'auto',
            border: '1px solid var(--border)', borderRadius: 12,
            background: 'var(--surface)',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 1 }}>
                  {[...['ID', 'Full Name', 'User Name', 'Department', 'Manager'], ...(isAdmin ? ['Actions'] : [])].map((heading) => (
                    <th key={heading} style={{
                      textAlign: 'left', padding: '10px 14px',
                      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                      textTransform: 'uppercase', color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap',
                    }}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} style={{
                      padding: '24px 14px', textAlign: 'center',
                      color: 'var(--text-muted)', fontSize: 13,
                    }}>
                      {search ? 'No users match your search.' : 'No users found.'}
                    </td>
                  </tr>
                )}
                {filtered.map((record) => {
                  const selected = record.associateId === selectedId;
                  const initials = (record.fullName || 'U').slice(0, 2).toUpperCase();
                  return (
                    <tr
                      key={record.associateId}
                      onClick={() => setSelectedId(selected ? null : record.associateId)}
                      style={{
                        cursor: 'pointer',
                        background: selected
                          ? 'color-mix(in oklab, var(--accent), transparent 90%)'
                          : 'transparent',
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background .1s',
                      }}
                    >
                      <td style={{
                        padding: '11px 14px', color: 'var(--text-muted)',
                        fontSize: 12, fontFamily: 'var(--mono)',
                        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                      }}>
                        {record.associateId}
                      </td>
                      <td style={{ padding: '11px 14px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <Avatar initials={initials} size={28} />
                          <span style={{ fontWeight: 500, color: 'var(--text)' }}>{record.fullName}</span>
                        </div>
                      </td>
                      <td style={{
                        padding: '11px 14px', color: 'var(--text-muted)',
                        fontSize: 12, fontFamily: 'var(--mono)', whiteSpace: 'nowrap',
                      }}>
                        {displayUserName(record) || <em style={{ opacity: 0.5 }}>-</em>}
                      </td>
                      <td style={{
                        padding: '11px 14px', color: record.department ? 'var(--text)' : 'var(--text-muted)',
                        fontSize: 12, whiteSpace: 'nowrap',
                      }}>
                        {record.department || <em style={{ opacity: 0.5 }}>-</em>}
                      </td>
                      <td style={{
                        padding: '11px 14px', color: record.managerName ? 'var(--text)' : 'var(--text-muted)',
                        fontSize: 12,
                      }}>
                        {record.managerName ?? <em style={{ opacity: 0.5 }}>-</em>}
                      </td>
                      {isAdmin && (
                        <td style={{ padding: '11px 14px' }}>
                          <button
                            onClick={(e) => openEdit(e, record)}
                            title="Edit user"
                            style={{
                              background: 'transparent', border: '1px solid var(--border)',
                              borderRadius: 7, padding: '5px 7px', cursor: 'pointer',
                              color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                              lineHeight: 1,
                            }}
                          >
                            <Icon name="edit" size={14} stroke={1.8} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ════════════ EDIT USER MODAL ════════════ */}
      {editRecord && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,.52)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={closeEdit}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 14, padding: '28px 28px 24px',
              width: 420, border: '1px solid var(--border)', boxShadow: 'var(--shadow-lift-h)',
              maxHeight: '90vh', overflowY: 'auto',
            }}
          >
            <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              Edit User
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>
              {editRecord.associateId} — {editRecord.fullName}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
              <label style={{ display: 'block', marginBottom: 14 }}>
                <div style={labelHeadStyle}>First Name</div>
                <input type="text" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)}
                  disabled={editSaving} maxLength={100} style={inputStyle} />
              </label>
              <label style={{ display: 'block', marginBottom: 14 }}>
                <div style={labelHeadStyle}>Last Name</div>
                <input type="text" value={editLastName} onChange={(e) => setEditLastName(e.target.value)}
                  disabled={editSaving} maxLength={100} style={inputStyle} />
              </label>
            </div>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={labelHeadStyle}>User Name</div>
              <input type="text" value={editUserName} onChange={(e) => setEditUserName(e.target.value)}
                disabled={editSaving} maxLength={100} style={inputStyle} />
            </label>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={labelHeadStyle}>Department</div>
              <select
                value={editDepartment}
                onChange={(e) => setEditDepartment(e.target.value)}
                disabled={editSaving}
                style={{ ...inputStyle, cursor: editSaving ? 'not-allowed' : 'pointer' }}
              >
                <option value="">Select department…</option>
                {[
                  ...new Set(
                    users
                      .map((u) => u.department)
                      .filter(Boolean)
                  ),
                ]
                  .sort((a, b) => a.localeCompare(b))
                  .concat(
                    editDepartment && !users.some((u) => u.department === editDepartment)
                      ? [editDepartment]
                      : []
                  )
                  .map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
              </select>
            </label>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={labelHeadStyle}>Manager</div>
              <select
                value={editManagerId}
                onChange={(e) => setEditManagerId(e.target.value)}
                disabled={editSaving}
                style={{ ...inputStyle, cursor: editSaving ? 'not-allowed' : 'pointer' }}
              >
                <option value="">— No manager —</option>
                {users
                  .filter((u) => u.associateId !== editRecord.associateId)
                  .map((u) => (
                    <option key={u.associateId} value={u.associateId}>
                      {u.fullName} ({u.associateId})
                    </option>
                  ))}
              </select>
            </label>

            <label style={{ display: 'block', marginBottom: 18 }}>
              <div style={labelHeadStyle}>Email</div>
              <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                disabled={editSaving} maxLength={255} style={inputStyle} placeholder="email@example.com" />
            </label>

            {editError && (
              <div style={{
                marginBottom: 14, padding: '10px 12px', borderRadius: 8,
                background: 'var(--st-risk-bg)', color: 'var(--st-risk)',
                fontSize: 12.5, fontWeight: 500,
                border: '1px solid color-mix(in oklab, var(--st-risk) 28%, transparent)',
              }}>
                {editError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={closeEdit}
                disabled={editSaving}
                style={{
                  background: 'transparent', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '9px 16px', fontSize: 13, fontWeight: 500,
                  fontFamily: 'var(--font-sans)', cursor: editSaving ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitEdit}
                disabled={editSaving}
                style={{
                  background: editSaving ? 'var(--surface-2)' : 'var(--accent)',
                  color: editSaving ? 'var(--text-muted)' : 'var(--accent-fg)',
                  border: 'none', borderRadius: 8,
                  padding: '9px 18px', fontSize: 13, fontWeight: 600,
                  fontFamily: 'var(--font-sans)', cursor: editSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
