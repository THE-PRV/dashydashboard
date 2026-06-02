import React, { useEffect, useMemo, useState } from 'react';
import { Icon, Avatar, TopBar, SearchBar } from '../components/ui.jsx';
import { getAllUsers } from '../api/manager.js';
import { asAssociateId, displayUserName } from '../lib/contracts.js';

export default function UserManagementView({
  user, cycle, cycles, onCycle, onLogout, isManager, role, onRole, dark, onDark,
}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    getAllUsers()
      .then((data) => setUsers((data ?? []).map((record) => ({
        ...record,
        associateId: asAssociateId(record.associateId),
      }))))
      .catch((e) => setLoadError(e.message || 'Failed to load users.'))
      .finally(() => setLoading(false));
  }, []);

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
                  {['ID', 'Full Name', 'User Name', 'Department', 'Manager'].map((heading) => (
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
                    <td colSpan={5} style={{
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
