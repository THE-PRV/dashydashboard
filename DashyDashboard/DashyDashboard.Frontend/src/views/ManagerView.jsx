import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, Badge, Button, Icon, Progress, TopBar } from '../components/ui.jsx';
import { getMemberDetail, getTeam } from '../api/manager.js';
import { asAssociateId } from '../lib/contracts.js';

const STATUS_META = {
  Submitted: { label: 'Submitted', variant: 'used' },
  InProgress: { label: 'In progress', variant: 'pending' },
  NotStarted: { label: 'Not started', variant: 'notused' },
};

function statusMeta(status) {
  return STATUS_META[status] ?? STATUS_META.NotStarted;
}

function Panel({ title, subtitle, children, action }) {
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
          {subtitle && (
            <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--text-muted)' }}>{subtitle}</div>
          )}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

function EmptyState({ icon, title, body }) {
  return (
    <div
      style={{
        padding: '28px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: 'var(--text-muted)',
        textAlign: 'center',
      }}
    >
      <Icon name={icon} size={20} />
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 12.5, maxWidth: 320 }}>{body}</div>
    </div>
  );
}

export default function ManagerView({
  user,
  cycle,
  cycles,
  onCycle,
  onLogout,
  isManager,
  role,
  onRole,
  dark,
  onDark,
}) {
  const [team, setTeam] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [detailError, setDetailError] = useState('');

  const loadTeam = async () => {
    if (!cycle) {
      setTeam(null);
      setSelectedId(null);
      setLoadingTeam(false);
      return;
    }

    setLoadingTeam(true);
    setTeamError('');
    try {
      const data = await getTeam(cycle.cycleID);
      const members = (data.members ?? []).map((member) => ({
        ...member,
        associateId: asAssociateId(member.associateId),
      }));
      setTeam({ ...data, members });
      setSelectedId((current) => {
        if (current && members.some((member) => member.associateId === current)) {
          return current;
        }
        return members[0]?.associateId ?? null;
      });
    } catch (error) {
      setTeam(null);
      setSelectedId(null);
      setTeamError(error.message || 'Could not load your team.');
    } finally {
      setLoadingTeam(false);
    }
  };

  useEffect(() => {
    loadTeam();
  }, [cycle]);

  useEffect(() => {
    if (!cycle || !selectedId) {
      setDetail(null);
      setDetailError('');
      setLoadingDetail(false);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    setDetailError('');
    setDetail(null);

    getMemberDetail(selectedId, cycle.cycleID)
      .then((response) => {
        if (!cancelled) setDetail({ ...response, associateId: asAssociateId(response.associateId) });
      })
      .catch((error) => {
        if (!cancelled) setDetailError(error.message || 'Could not load member details.');
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cycle, selectedId]);

  const visibleMembers = useMemo(() => {
    const members = team?.members ?? [];
    const query = search.trim().toLowerCase();

    return members
      .filter((member) => {
        if (filter === 'done') return member.attestationStatus === 'Submitted';
        if (filter === 'pending') return member.attestationStatus === 'InProgress';
        if (filter === 'not-started') return member.attestationStatus === 'NotStarted';
        return true;
      })
      .filter((member) => {
        if (!query) return true;
        return (
          member.fullName.toLowerCase().includes(query) ||
          String(member.associateId).includes(query)
        );
      });
  }, [filter, search, team]);

  const summary = useMemo(() => {
    if (!team) {
      return [
        { label: 'Direct reports', value: 0 },
        { label: 'Submitted', value: 0 },
        { label: 'In progress', value: 0 },
        { label: 'Not started', value: 0 },
      ];
    }

    return [
      { label: 'Direct reports', value: team.totalMembers },
      { label: 'Submitted', value: team.submitted },
      { label: 'In progress', value: team.inProgress },
      { label: 'Not started', value: team.notStarted },
    ];
  }, [team]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      <TopBar
        user={user}
        cycle={cycle}
        cycles={cycles}
        onCycle={onCycle}
        onLogout={onLogout}
        search={search}
        onSearch={setSearch}
        isManager={isManager}
        role={role}
        onRole={onRole}
        dark={dark}
        onDark={onDark}
        isSuperAdmin={!!user?.superUserRole}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 24px',
          background: 'color-mix(in oklab, var(--accent), transparent 92%)',
          borderBottom: '1px solid var(--border)',
          fontSize: 12,
          color: 'var(--text)',
        }}
      >
        <Icon name="users" size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontWeight: 600 }}>Manager view</span>
        <span style={{ color: 'var(--text-muted)' }}>
          Review direct-report completion for {cycle?.cycleName ?? 'the selected cycle'}
        </span>
      </div>

      {team?.mismatchCount > 0 && (
        <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 8, padding: '10px 16px', margin: '16px 24px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', color: 'var(--danger-fg)' }}>
          <Icon name="bell" size={16} />
          <strong>{team.mismatchCount} team member{team.mismatchCount !== 1 ? 's' : ''}</strong> reported access disputes this cycle
        </div>
      )}

      <div style={{ padding: '20px 24px 0', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        {summary.map((item) => (
          <div
            key={item.label}
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {item.label}
            </div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 24px 24px', flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.9fr)', gap: 16 }}>
        <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel
            title="Team completion"
            subtitle={team ? `${team.totalAttested} of ${team.totalTools} tools attested` : 'No team data loaded'}
            action={
              <div style={{ display: 'inline-flex', gap: 6 }}>
                {[
                  ['all', 'Everyone'],
                  ['not-started', 'Not started'],
                  ['pending', 'In progress'],
                  ['done', 'Submitted'],
                ].map(([key, label]) => {
                  const active = filter === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      style={{
                        height: 28,
                        padding: '0 10px',
                        borderRadius: 999,
                        border: `1px solid ${active ? 'var(--text)' : 'var(--border)'}`,
                        background: active ? 'var(--text)' : 'var(--surface)',
                        color: active ? 'var(--bg)' : 'var(--text-muted)',
                        fontSize: 12,
                        fontWeight: active ? 600 : 500,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            }
          >
            {loadingTeam ? (
              <div style={{ padding: '18px 16px', color: 'var(--text-muted)', fontSize: 13 }}>Loading team data...</div>
            ) : teamError ? (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, color: 'var(--danger-fg)' }}>{teamError}</div>
                <div>
                  <Button variant="outline" size="sm" onClick={loadTeam}>Retry</Button>
                </div>
              </div>
            ) : visibleMembers.length === 0 ? (
              <EmptyState
                icon="search"
                title={search ? 'No matching team members' : 'No direct reports'}
                body={search ? 'Clear or change the search to see more team members.' : 'This manager does not currently have direct reports in the selected cycle.'}
              />
            ) : (
              <div style={{ maxHeight: '100%', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 1 }}>
                      {['Team member', 'Progress', 'Status', ''].map((heading) => (
                        <th
                          key={heading}
                          style={{
                            textAlign: 'left',
                            padding: '10px 14px',
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            color: 'var(--text-muted)',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMembers.map((member) => {
                      const active = member.associateId === selectedId;
                      const meta = statusMeta(member.attestationStatus);
                      return (
                        <tr
                          key={member.associateId}
                          onClick={() => setSelectedId(member.associateId)}
                          style={{
                            cursor: 'pointer',
                            background: active ? 'color-mix(in oklab, var(--accent), transparent 94%)' : 'transparent',
                            borderBottom: '1px solid var(--border-subtle)',
                          }}
                        >
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Avatar initials={(member.fullName || 'U').slice(0, 2).toUpperCase()} size={32} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {member.fullName}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID · {member.associateId}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', width: 260 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ flex: 1, minWidth: 120 }}>
                                <Progress value={member.attestedTools} max={member.totalTools || 1} height={5} />
                              </div>
                              <span style={{ fontSize: 12, color: 'var(--text)', minWidth: 58, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {member.attestedTools}/{member.totalTools}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            <Icon name="chevright" size={14} style={{ color: 'var(--text-muted)' }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Panel title="Selected member" subtitle={detail ? `${detail.attestedTools} of ${detail.totalTools} tools attested` : 'Choose a team member to inspect'}>
            {loadingDetail ? (
              <div style={{ padding: '18px 16px', color: 'var(--text-muted)', fontSize: 13 }}>Loading member details...</div>
            ) : detailError ? (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--danger-fg)' }}>{detailError}</div>
            ) : !detail ? (
              <EmptyState
                icon="users"
                title="No member selected"
                body="Select a team member from the list to review their per-client progress."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar initials={(detail.fullName || 'U').slice(0, 2).toUpperCase()} size={44} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{detail.fullName}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Associate ID · {detail.associateId}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Completion
                      </div>
                      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round(detail.progressPct * 100)}%
                      </div>
                    </div>
                    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Status
                      </div>
                      <div style={{ marginTop: 9 }}>
                        <Badge variant={statusMeta(detail.attestationStatus).variant}>{statusMeta(detail.attestationStatus).label}</Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflow: 'auto' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Per-client progress
                  </div>
                  {detail.byClient.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No client access is active for this user.</div>
                  ) : (
                    detail.byClient.map((client) => (
                      <div
                        key={client.clientID}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--surface)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {client.clientName}
                            </div>
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {client.attestedTools}/{client.totalTools}
                          </div>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <Progress value={client.attestedTools} max={client.totalTools || 1} height={4} />
                        </div>
                      </div>
                    ))
                  )}

                  {detail?.mismatches?.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, color: 'var(--danger-fg)' }}>Access disputes ({detail.mismatches.length})</div>
                      {detail.mismatches.map((m, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 6, marginBottom: 4, fontSize: '0.85rem', color: 'var(--text)' }}>
                          <span><strong>{m.toolName}</strong><span style={{ color: 'var(--text-muted)' }}> — {m.clientName}</span></span>
                          {m.remarks && <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 12 }}>{m.remarks}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
