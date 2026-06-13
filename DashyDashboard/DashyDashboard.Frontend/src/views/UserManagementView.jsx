import React, { useEffect, useMemo, useState } from 'react';
import {
  Icon, Avatar, Button, SearchBar, Card, Skeleton, EmptyState,
  SortHeader, SectionHeader, Modal, useToasts,
} from '../components/ui.jsx';
import { useBreadcrumbs } from '../components/AppShell.jsx';
import { getAllUsers } from '../api/manager.js';
import { updateUser } from '../api/admin.js';
import { asAssociateId, displayUserName } from '../lib/contracts.js';

const inputStyle = {
  width: '100%', boxSizing: 'border-box', height: 34, padding: '0 12px',
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none',
};

function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
    }}>{children}</div>
  );
}

function HoverRow({ children, selected, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-selected={selected || undefined}
      style={{
        cursor: 'pointer',
        background: selected ? 'var(--accent-glow)' : (hovered ? 'var(--surface-2)' : 'transparent'),
        borderBottom: '1px solid var(--border-subtle)',
        transition: 'background .12s ease-out',
      }}
    >
      {children}
    </tr>
  );
}

export default function UserManagementView({ user }) {
  const isAdmin = user?.superUserRole === 'Admin';
  const toasts = useToasts();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });

  // Edit modal state
  const [editRecord, setEditRecord] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useBreadcrumbs(useMemo(() => ['Users'], []));

  function loadUsers() {
    setLoading(true);
    getAllUsers()
      .then((data) => setUsers((data ?? []).map((r) => ({ ...r, associateId: asAssociateId(r.associateId) }))))
      .catch((e) => toasts.error(e.message || 'Failed to load users.', { title: 'User directory' }))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadUsers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openEdit(e, record) {
    e.stopPropagation();
    setEditRecord(record);
    setEditForm({
      firstName: record.firstName ?? '',
      lastName: record.lastName ?? '',
      userName: record.userName ?? '',
      department: record.department ?? '',
      managerId: record.managerId ?? '',
      email: record.email ?? '',
    });
    setEditError('');
  }

  function closeEdit() {
    if (editSaving) return;
    setEditRecord(null);
  }

  function validate(form) {
    if (!form.firstName.trim()) return 'First name is required.';
    if (!form.lastName.trim()) return 'Last name is required.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Enter a valid email address.';
    return '';
  }

  async function submitEdit() {
    if (!editRecord || !editForm || editSaving) return;
    const problem = validate(editForm);
    if (problem) { setEditError(problem); return; }
    setEditSaving(true);
    setEditError('');
    try {
      await updateUser(editRecord.associateId, {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        userName: editForm.userName,
        department: editForm.department,
        managerId: editForm.managerId || null,
        email: editForm.email,
      });
      toasts.success(`Saved changes to ${editForm.firstName} ${editForm.lastName}.`.trim(), { title: 'User updated' });
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
    return users.filter((r) =>
      r.fullName.toLowerCase().includes(q) ||
      displayUserName(r).toLowerCase().includes(q) ||
      r.associateId.includes(q) ||
      (r.department ?? '').toLowerCase().includes(q) ||
      (r.managerName ?? '').toLowerCase().includes(q));
  }, [users, search]);

  const rows = useMemo(() => {
    const dir = sort.dir === 'desc' ? -1 : 1;
    const val = (r) => {
      switch (sort.key) {
        case 'id': return r.associateId ?? '';
        case 'name': return (r.fullName ?? '').toLowerCase();
        case 'username': return displayUserName(r).toLowerCase();
        case 'department': return (r.department ?? '').toLowerCase();
        case 'manager': return (r.managerName ?? '').toLowerCase();
        default: return '';
      }
    };
    return [...filtered].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * dir);
  }, [filtered, sort]);

  const onSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const sortProps = (key, label) => ({ label, active: sort.key === key, dir: sort.dir, onSort: () => onSort(key) });

  const colSpan = isAdmin ? 6 : 5;
  const departments = useMemo(
    () => [...new Set(users.map((u) => u.department).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [users],
  );

  return (
    <div style={{ height: '100%', minHeight: 0, overflowY: 'auto', background: 'var(--bg)' }}>
      <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 560, lineHeight: 1.1, color: 'var(--text)' }}>
              User directory
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              {loading ? 'Loading…' : `${users.length} user${users.length === 1 ? '' : 's'} in the system`}
              {isAdmin ? ' · click the edit icon to amend a record' : ' · read-only'}
            </p>
          </div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search name, ID, user name…" width={300} />
        </div>

        <Card pad={0}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)' }}>
            <SectionHeader right={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{rows.length} SHOWN</span>}>
              All users
            </SectionHeader>
          </div>

          {loading ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Skeleton width={28} height={28} radius={999} />
                  <Skeleton width="22%" height={12} />
                  <Skeleton width="16%" height={12} />
                  <Skeleton width="18%" height={12} />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon="users" title={search ? 'No matches' : 'No users'}
              message={search ? 'No users match your search. Try a different name or ID.' : 'There are no users in the system yet.'} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                    <SortHeader {...sortProps('id', 'ID')} style={{ padding: '0 14px' }} />
                    <SortHeader {...sortProps('name', 'Full name')} style={{ padding: '0 14px' }} />
                    <SortHeader {...sortProps('username', 'User name')} style={{ padding: '0 14px' }} />
                    <SortHeader {...sortProps('department', 'Department')} style={{ padding: '0 14px' }} />
                    <SortHeader {...sortProps('manager', 'Manager')} style={{ padding: '0 14px' }} />
                    {isAdmin && (
                      <th style={{ padding: '6px 14px', textAlign: 'right', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record) => {
                    const selected = record.associateId === selectedId;
                    const initials = (record.fullName || 'U').slice(0, 2).toUpperCase();
                    return (
                      <HoverRow key={record.associateId} selected={selected}
                        onClick={() => setSelectedId(selected ? null : record.associateId)}>
                        <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {record.associateId}
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <Avatar initials={initials} size={28} />
                            <span style={{ fontWeight: 500, color: 'var(--text)' }}>{record.fullName}</span>
                          </div>
                        </td>
                        <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {displayUserName(record) || <span style={{ color: 'var(--text-faint)' }}>—</span>}
                        </td>
                        <td style={{ padding: '11px 14px', fontSize: 12.5, color: record.department ? 'var(--text)' : 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                          {record.department || '—'}
                        </td>
                        <td style={{ padding: '11px 14px', fontSize: 12.5, color: record.managerName ? 'var(--text)' : 'var(--text-faint)' }}>
                          {record.managerName ?? '—'}
                        </td>
                        {isAdmin && (
                          <td style={{ padding: '8px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <Button variant="ghost" size="sm" icon="edit"
                              onClick={(e) => openEdit(e, record)}
                              aria-label={`Edit ${record.fullName}`}>Edit</Button>
                          </td>
                        )}
                      </HoverRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── Edit user modal ── */}
      <Modal
        open={!!editRecord}
        onClose={closeEdit}
        title="Edit user"
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={closeEdit} disabled={editSaving}>Cancel</Button>
            <Button variant="primary" icon="check" onClick={submitEdit} loading={editSaving}>Save changes</Button>
          </>
        }
      >
        {editRecord && editForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
              <Avatar initials={(editRecord.fullName || 'U').slice(0, 2).toUpperCase()} size={36} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{editRecord.fullName}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  ASSOCIATE ID {editRecord.associateId}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <FieldLabel>First name</FieldLabel>
                <input type="text" value={editForm.firstName} disabled={editSaving} maxLength={100}
                  aria-invalid={!editForm.firstName.trim() || undefined}
                  onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <FieldLabel>Last name</FieldLabel>
                <input type="text" value={editForm.lastName} disabled={editSaving} maxLength={100}
                  aria-invalid={!editForm.lastName.trim() || undefined}
                  onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            <div>
              <FieldLabel>User name</FieldLabel>
              <input type="text" value={editForm.userName} disabled={editSaving} maxLength={100}
                onChange={(e) => setEditForm((f) => ({ ...f, userName: e.target.value }))}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12.5 }} />
            </div>

            <div>
              <FieldLabel>Department</FieldLabel>
              <select value={editForm.department} disabled={editSaving}
                onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                style={{ ...inputStyle, cursor: editSaving ? 'not-allowed' : 'pointer' }}>
                <option value="">Select department…</option>
                {departments
                  .concat(editForm.department && !departments.includes(editForm.department) ? [editForm.department] : [])
                  .map((dept) => <option key={dept} value={dept}>{dept}</option>)}
              </select>
            </div>

            <div>
              <FieldLabel>Manager</FieldLabel>
              <select value={editForm.managerId} disabled={editSaving}
                onChange={(e) => setEditForm((f) => ({ ...f, managerId: e.target.value }))}
                style={{ ...inputStyle, cursor: editSaving ? 'not-allowed' : 'pointer' }}>
                <option value="">— No manager —</option>
                {users
                  .filter((u) => u.associateId !== editRecord.associateId)
                  .map((u) => <option key={u.associateId} value={u.associateId}>{u.fullName} ({u.associateId})</option>)}
              </select>
            </div>

            <div>
              <FieldLabel>Email</FieldLabel>
              <input type="email" value={editForm.email} disabled={editSaving} maxLength={255}
                placeholder="email@example.com"
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} style={inputStyle} />
            </div>

            {editError && (
              <div role="alert" style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 'var(--radius)',
                background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)',
                fontSize: 12.5, lineHeight: 1.5,
              }}>
                <Icon name="alert" size={15} stroke={2} style={{ flex: 'none', marginTop: 1 }} />
                {editError}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
