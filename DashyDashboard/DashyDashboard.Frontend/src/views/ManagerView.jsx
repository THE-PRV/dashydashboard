import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, Badge, Button, Card, Icon, Progress, SectionHeader, StatusChip, TopBar, statusMeta } from '../components/ui.jsx';
import { getMemberDetail, getTeam, exportDisputes, downloadScreenshotsZip } from '../api/manager.js';
import { reopenAttestation } from '../api/attestations.js';
import { asAssociateId } from '../lib/contracts.js';
import ScreenshotGallery from '../components/ScreenshotGallery.jsx';
import FullScreenOverlay from '../components/FullScreenOverlay.jsx';

// The five WI-6 member states, in display order, with the human labels from STATUS_META.
// Used for the summary cards row and the filter pills over the team table.
const STATE_ORDER = ['NotStarted', 'InProgress', 'AwaitingApproval', 'ActionNeeded', 'Complete'];

// A member is "submitted" (reopen-able) once they are in one of these states.
const SUBMITTED_STATES = new Set(['AwaitingApproval', 'ActionNeeded', 'Complete']);

// Render a nullable ISO date string as a short local date, or an em-dash when missing.
function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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

// A small labelled count row used in the compact member card and the overlay. `tone`
// pulls accent colors for the value when > 0 (danger for disputes, etc.).
function CountRow({ label, value, tone }) {
  const accent = value > 0 && tone === 'danger';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 12.5, color: accent ? 'var(--danger-fg)' : 'var(--text-muted)' }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
        color: accent ? 'var(--danger-fg)' : 'var(--text)',
      }}>
        {value}
      </span>
    </div>
  );
}

// Per-client completion row (client name + n/m + small progress bar). `showId` adds the
// client id parenthetical (used in the richer overlay listing).
function ClientProgressRow({ client, showId = false }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {client.clientName}
          {showId && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ({client.clientID})</span>}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {client.attestedTools}/{client.totalTools}
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        <Progress value={client.attestedTools} max={client.totalTools || 1} height={4} />
      </div>
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
  const [exportingDisputes, setExportingDisputes] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);

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

  async function handleExportDisputes() {
    if (!cycle?.cycleID) return;
    setExportingDisputes(true);
    try {
      await exportDisputes(cycle.cycleID);
    } catch (e) {
      alert('Export failed: ' + e.message);
    } finally {
      setExportingDisputes(false);
    }
  }

  async function handleDownloadZip() {
    if (!cycle?.cycleID) return;
    setDownloadingZip(true);
    try {
      await downloadScreenshotsZip(cycle.cycleID);
    } catch (e) {
      alert('Download failed: ' + e.message);
    } finally {
      setDownloadingZip(false);
    }
  }

  async function handleReopen() {
    if (!cycle?.cycleID || !selectedId) return;
    if (!window.confirm(`Reopen ${detail?.fullName ?? selectedId}'s submitted attestation for ${cycle.cycleName ?? 'this cycle'}?`)) return;
    setReopening(true);
    try {
      await reopenAttestation(cycle.cycleID, selectedId);
      // Refresh both the member detail and the team list.
      getMemberDetail(selectedId, cycle.cycleID)
        .then((response) => setDetail({ ...response, associateId: asAssociateId(response.associateId) }))
        .catch(() => {});
      loadTeam();
    } catch (e) {
      alert('Reopen failed: ' + e.message);
    } finally {
      setReopening(false);
    }
  }

  // Refresh the selected member's detail (and the team list's pending/rejected
  // counts) after a screenshot approve/reject/approve-all.
  function refreshDetail() {
    if (!cycle?.cycleID || !selectedId) return;
    getMemberDetail(selectedId, cycle.cycleID)
      .then((response) => setDetail({ ...response, associateId: asAssociateId(response.associateId) }))
      .catch(() => {});
    loadTeam();
  }

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

  // Close the overlay whenever the selected member or cycle changes out from under it.
  useEffect(() => {
    setOverlayOpen(false);
  }, [selectedId, cycle]);

  const visibleMembers = useMemo(() => {
    const members = team?.members ?? [];
    const query = search.trim().toLowerCase();

    return members
      .filter((member) => (filter === 'all' ? true : member.attestationStatus === filter))
      .filter((member) => {
        if (!query) return true;
        return (
          member.fullName.toLowerCase().includes(query) ||
          String(member.associateId).includes(query)
        );
      });
  }, [filter, search, team]);

  // Six compact summary cards: Direct reports + the five WI-6 state counts straight off TeamDto.
  const summary = useMemo(() => {
    const t = team ?? {};
    return [
      { key: 'all', label: 'Direct reports', value: t.totalMembers ?? 0 },
      { key: 'NotStarted', label: statusMeta('NotStarted').label, value: t.notStarted ?? 0 },
      { key: 'InProgress', label: statusMeta('InProgress').label, value: t.inProgress ?? 0 },
      { key: 'AwaitingApproval', label: statusMeta('AwaitingApproval').label, value: t.awaitingApproval ?? 0 },
      { key: 'ActionNeeded', label: statusMeta('ActionNeeded').label, value: t.actionNeeded ?? 0 },
      { key: 'Complete', label: statusMeta('Complete').label, value: t.complete ?? 0 },
    ];
  }, [team]);

  const canReopen = detail && SUBMITTED_STATES.has(detail.attestationStatus);
  const disputeCount = detail?.mismatches?.length ?? 0;

  const reopenButton = (compact = false) => (
    <Button
      variant="outline"
      size={compact ? 'sm' : 'md'}
      icon="refresh"
      disabled={reopening}
      onClick={handleReopen}
      style={{ opacity: reopening ? 0.7 : 1, cursor: reopening ? 'not-allowed' : 'pointer' }}
    >
      {reopening ? 'Reopening…' : 'Reopen attestation'}
    </Button>
  );

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
        {cycle?.cycleID && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* WI-9 mount point: cycle gallery button */}
            <Button
              variant="outline" size="sm" icon="download"
              disabled={downloadingZip}
              onClick={handleDownloadZip}
              style={{ opacity: downloadingZip ? 0.6 : 1, cursor: downloadingZip ? 'wait' : 'pointer' }}
            >
              {downloadingZip ? 'Preparing…' : `Download all screenshots (cycle ${cycle.cycleID})`}
            </Button>
          </div>
        )}
      </div>

      {team?.mismatchCount > 0 && (
        <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 8, padding: '10px 16px', margin: '16px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: '0.875rem', color: 'var(--danger-fg)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="bell" size={16} />
            <strong>{team.mismatchCount} team member{team.mismatchCount !== 1 ? 's' : ''}</strong> reported access disputes this cycle
          </span>
          <button
            className="btn-lift"
            onClick={handleExportDisputes}
            disabled={exportingDisputes}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--danger-fg)', color: '#fff',
              border: 'none', borderRadius: 6, padding: '6px 11px',
              fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
              cursor: exportingDisputes ? 'not-allowed' : 'pointer', opacity: exportingDisputes ? 0.7 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exportingDisputes ? 'Exporting…' : 'Export disputes'}
          </button>
        </div>
      )}

      <div style={{ padding: '20px 24px 0', display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12 }}>
        {summary.map((item) => {
          const active = filter === item.key;
          const clickable = item.key !== 'all';
          return (
            <div
              key={item.key}
              onClick={clickable ? () => setFilter(active ? 'all' : item.key) : undefined}
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: 'var(--surface)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                boxShadow: 'var(--shadow-sm)',
                cursor: clickable ? 'pointer' : 'default',
                transition: 'border-color .12s',
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.label}
              </div>
              <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {item.value}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '16px 24px 24px', flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.9fr)', gap: 16 }}>
        <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel
            title="Team completion"
            subtitle={team ? `${team.totalAttested} of ${team.totalTools} tools attested` : 'No team data loaded'}
            action={
              <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {[['all', 'All'], ...STATE_ORDER.map((s) => [s, statusMeta(s).label])].map(([key, label]) => {
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
                title={search || filter !== 'all' ? 'No matching team members' : 'No direct reports'}
                body={search || filter !== 'all' ? 'Clear or change the search/filter to see more team members.' : 'This manager does not currently have direct reports in the selected cycle.'}
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <StatusChip status={member.attestationStatus} />
                              {member.pendingScreenshots > 0 && (
                                <Badge variant="neutral" size="sm">{member.pendingScreenshots} pending</Badge>
                              )}
                              {member.rejectedScreenshots > 0 && (
                                <Badge variant="neutral" size="sm">{member.rejectedScreenshots} rejected</Badge>
                              )}
                            </div>
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
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Identity + overall status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar initials={(detail.fullName || 'U').slice(0, 2).toUpperCase()} size={44} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail.fullName}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Associate ID · {detail.associateId}</div>
                  </div>
                  <StatusChip status={detail.attestationStatus} />
                </div>

                {/* Overall completion bar */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                    <SectionHeader>Completion</SectionHeader>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {detail.attestedTools}/{detail.totalTools} · {Math.round((detail.progressPct ?? 0) * 100)}%
                    </span>
                  </div>
                  <Progress value={detail.attestedTools} max={detail.totalTools || 1} height={6} />
                </div>

                {/* Per-client completion — compact, no thumbnails, no scroll container */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <SectionHeader>Per-client progress</SectionHeader>
                  {detail.byClient.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No client access is active for this user.</div>
                  ) : (
                    detail.byClient.map((client) => <ClientProgressRow key={client.clientID} client={client} />)
                  )}
                </div>

                {/* Compact count rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: '1px solid var(--border-subtle)' }}>
                  <CountRow label="Access disputes" value={disputeCount} tone="danger" />
                  <CountRow label="Screenshots awaiting approval" value={detail.pendingScreenshots ?? 0} />
                  {(detail.rejectedScreenshots ?? 0) > 0 && (
                    <CountRow label="Rejected screenshots" value={detail.rejectedScreenshots} tone="danger" />
                  )}
                </div>

                {/* Open details affordance */}
                <Button variant="primary" icon="arrow_up_right" onClick={() => setOverlayOpen(true)} style={{ justifyContent: 'center' }}>
                  Open details
                </Button>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {overlayOpen && detail && (
        <FullScreenOverlay
          title={`${detail.fullName} · ${detail.associateId}`}
          subtitle={`${cycle?.cycleName ?? 'Cycle'} · ${detail.attestedTools} of ${detail.totalTools} tools attested`}
          onClose={() => setOverlayOpen(false)}
          actions={canReopen ? reopenButton(false) : undefined}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {/* Overall status row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <StatusChip status={detail.attestationStatus} />
              <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <Progress value={detail.attestedTools} max={detail.totalTools || 1} height={6} />
                </div>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {detail.attestedTools}/{detail.totalTools} · {Math.round((detail.progressPct ?? 0) * 100)}%
                </span>
              </div>
            </div>

            {/* Per-client progress (richer — with ids) */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionHeader>Per-client progress</SectionHeader>
              {detail.byClient.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No client access is active for this user.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                  {detail.byClient.map((client) => (
                    <Card key={client.clientID} pad={12}>
                      <ClientProgressRow client={client} showId />
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Screenshot review grid */}
            {(detail.pendingScreenshots > 0 || detail.rejectedScreenshots > 0 || detail.byClient.some((c) => c.tools?.length)) && (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <SectionHeader>Screenshot review</SectionHeader>
                <ScreenshotGallery
                  cycleId={cycle.cycleID}
                  associateId={detail.associateId}
                  memberName={detail.fullName}
                  byClient={detail.byClient}
                  pendingScreenshots={detail.pendingScreenshots}
                  rejectedScreenshots={detail.rejectedScreenshots}
                  onReviewed={refreshDetail}
                />
              </section>
            )}

            {/* Access disputes (WI-4) — full list with tool, client name (id), remark, date answered */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionHeader>Access disputes ({disputeCount})</SectionHeader>
              {disputeCount === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No access disputes reported this cycle.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detail.mismatches.map((m, i) => (
                    <div
                      key={`${m.clientID}-${m.toolName}-${i}`}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: 'var(--danger-bg)',
                        border: '1px solid var(--danger-border)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{m.toolName}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          Answered {formatDate(m.submittedAt)}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {m.clientName} ({m.clientID})
                      </div>
                      {m.remarks ? (
                        <div style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {m.remarks}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
                          No remark provided.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </FullScreenOverlay>
      )}
    </div>
  );
}
