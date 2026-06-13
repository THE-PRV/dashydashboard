import React, { useEffect, useMemo, useState } from 'react';
import {
  Avatar, Button, Card, Icon, Progress, SectionHeader, StatusChip, Stamp, Drawer,
  Modal, Skeleton, EmptyState, SortHeader, SearchBar, useToasts, statusMeta,
} from '../components/ui.jsx';
import { useBreadcrumbs } from '../components/AppShell.jsx';
import {
  getMemberDetail, getTeam, exportDisputes, downloadScreenshotsZip, getCycleScreenshots,
  reviewScreenshot,
} from '../api/manager.js';
import { reopenAttestation } from '../api/attestations.js';
import { asAssociateId } from '../lib/contracts.js';
import ScreenshotGallery from '../components/ScreenshotGallery.jsx';
import CycleGallery from '../components/CycleGallery.jsx';
import Lightbox from '../components/Lightbox.jsx';

// The five WI-6 member states, in display order, with the human labels from STATUS_META.
const STATE_ORDER = ['NotStarted', 'InProgress', 'AwaitingApproval', 'ActionNeeded', 'Complete'];

// Ledger-palette colour per state (matches the StatusChip tones) for the distribution graph.
const STATE_COLOR = {
  NotStarted: 'var(--text-faint)',
  InProgress: 'var(--accent)',
  AwaitingApproval: 'var(--warning)',
  ActionNeeded: 'var(--danger)',
  Complete: 'var(--success)',
};

// A member is "submitted" (reopen-able) once they are in one of these states.
const SUBMITTED_STATES = new Set(['AwaitingApproval', 'ActionNeeded', 'Complete']);

// Render a nullable ISO date string as a short local date, or an em-dash when missing.
function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// "3 days ago" style relative age for the oldest pending item in the action queue.
function relativeAge(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

// Team status distribution — a single stacked bar + legend over the five states.
function TeamStatusBar({ states, total }) {
  if (!total) return null;
  return (
    <Card pad={16}>
      <SectionHeader rule>Team status distribution</SectionHeader>
      <div role="img" aria-label="Distribution of team members across the five attestation states"
        style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', marginTop: 12, background: 'var(--surface-2)' }}>
        {states.filter((s) => s.value > 0).map((s) => (
          <div key={s.key} title={`${statusMeta(s.key).label}: ${s.value}`}
            style={{ width: `${(s.value / total) * 100}%`, background: STATE_COLOR[s.key] ?? 'var(--text-faint)' }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 14 }}>
        {states.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-muted)' }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 2, background: STATE_COLOR[s.key] ?? 'var(--text-faint)', flex: 'none' }} />
            <span>{statusMeta(s.key).label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Per-client completion row (client name + n/m + small progress bar).
function ClientProgressRow({ client, showId = false }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {client.clientName}
          {showId && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontFamily: 'var(--font-mono)' }}> ({client.clientID})</span>}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {client.attestedTools}/{client.totalTools}
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        <Progress value={client.attestedTools} max={client.totalTools || 1} height={4} />
      </div>
    </div>
  );
}

// One row in the action queue card: icon + label + count + action.
function QueueRow({ icon, tone, title, detail, count, actionLabel, onAction, disabled }) {
  const toneColor = {
    warning: 'var(--warning)', danger: 'var(--danger)', info: 'var(--accent)', neutral: 'var(--text-muted)',
  }[tone] ?? 'var(--text-muted)';
  const toneBg = {
    warning: 'var(--warning-bg)', danger: 'var(--danger-bg)', info: 'var(--accent-glow)', neutral: 'var(--surface-2)',
  }[tone] ?? 'var(--surface-2)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 'var(--radius)', flex: 'none',
        background: toneBg, color: toneColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={17} stroke={2} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: toneColor, fontVariantNumeric: 'tabular-nums' }}>
            {count}
          </span>
        </div>
        {detail && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{detail}</div>}
      </div>
      {actionLabel && (
        <Button
          variant={tone === 'neutral' ? 'outline' : 'primary'}
          size="sm"
          icon={icon === 'camera' || icon === 'clock' ? 'image' : (icon === 'download' ? 'download' : 'arrow_up_right')}
          disabled={disabled}
          onClick={onAction}
          style={{ flex: 'none' }}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export default function ManagerView({ user, cycle, cycles, onCycle }) {
  const toasts = useToasts();
  useBreadcrumbs(['Manager view']);

  const [team, setTeam] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [exportingDisputes, setExportingDisputes] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  // Action-queue review: the cycle's pending screenshots, oldest-first, opened in the Lightbox.
  const [queueItems, setQueueItems] = useState(null);   // CycleScreenshotItemDto[] | null
  const [queueLoading, setQueueLoading] = useState(false);
  const [reviewLightbox, setReviewLightbox] = useState(null);

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
        if (current && members.some((member) => member.associateId === current)) return current;
        return null;
      });
    } catch (error) {
      setTeam(null);
      setSelectedId(null);
      setTeamError(error.message || 'Could not load your team.');
    } finally {
      setLoadingTeam(false);
    }
  };

  useEffect(() => { loadTeam(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cycle]);

  // Pull the cycle screenshot listing once per cycle so the action queue can show
  // pending/rejected counts and feed the focused review flow (oldest-first).
  const loadQueue = async () => {
    if (!cycle?.cycleID) { setQueueItems(null); return; }
    setQueueLoading(true);
    try {
      const data = await getCycleScreenshots(cycle.cycleID);
      setQueueItems(Array.isArray(data) ? data : []);
    } catch {
      setQueueItems([]); // queue degrades to team-derived counts on failure
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => { loadQueue(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cycle]);

  // Load the selected member's detail for the drawer.
  useEffect(() => {
    if (!cycle || !selectedId) {
      setDetail(null); setDetailError(''); setLoadingDetail(false);
      return undefined;
    }
    let cancelled = false;
    setLoadingDetail(true); setDetailError(''); setDetail(null);
    getMemberDetail(selectedId, cycle.cycleID)
      .then((response) => { if (!cancelled) setDetail({ ...response, associateId: asAssociateId(response.associateId) }); })
      .catch((error) => { if (!cancelled) setDetailError(error.message || 'Could not load member details.'); })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
  }, [cycle, selectedId]);

  // Refresh detail + team + queue after a screenshot review action.
  function refreshAll() {
    if (!cycle?.cycleID) return;
    loadTeam();
    loadQueue();
    if (selectedId) {
      getMemberDetail(selectedId, cycle.cycleID)
        .then((response) => setDetail({ ...response, associateId: asAssociateId(response.associateId) }))
        .catch(() => {});
    }
  }

  async function handleExportDisputes() {
    if (!cycle?.cycleID) return;
    setExportingDisputes(true);
    try {
      await exportDisputes(cycle.cycleID);
      toasts.success('Disputes exported');
    } catch (e) {
      toasts.error('Export failed: ' + (e.message || 'unknown error'));
    } finally {
      setExportingDisputes(false);
    }
  }

  async function handleDownloadZip() {
    if (!cycle?.cycleID) return;
    setDownloadingZip(true);
    try {
      await downloadScreenshotsZip(cycle.cycleID);
      toasts.success('Screenshot archive downloaded');
    } catch (e) {
      toasts.error('Download failed: ' + (e.message || 'unknown error'));
    } finally {
      setDownloadingZip(false);
    }
  }

  async function handleReopen() {
    if (!cycle?.cycleID || !selectedId) return;
    setConfirmReopen(false);
    setReopening(true);
    try {
      await reopenAttestation(cycle.cycleID, selectedId);
      toasts.success(`Reopened ${detail?.fullName ?? selectedId}'s attestation`);
      refreshAll();
    } catch (e) {
      toasts.error('Reopen failed: ' + (e.message || 'unknown error'));
    } finally {
      setReopening(false);
    }
  }

  // ── Action-queue derived data ──────────────────────────────────────────────
  const queue = useMemo(() => {
    const items = queueItems ?? [];
    const pending = items
      .filter((i) => i.screenshotStatus === 'Pending')
      .sort((a, b) => new Date(a.screenshotUploadedAt ?? 0) - new Date(b.screenshotUploadedAt ?? 0));
    const rejected = items.filter((i) => i.screenshotStatus === 'Rejected');
    const oldestPending = pending[0]?.screenshotUploadedAt ?? null;
    return { pending, rejected, oldestPending };
  }, [queueItems]);

  // Lightbox item shape for the focused review flow (pending, oldest-first).
  const queueLightboxItems = useMemo(() => queue.pending.map((i) => ({
    cycleId: cycle?.cycleID,
    associateId: i.associateId,
    clientId: i.clientId,
    clientName: i.clientName,
    memberName: i.associateName,
    toolId: i.toolId,
    toolName: i.toolName,
    screenshotStatus: i.screenshotStatus,
    screenshotRejectReason: i.screenshotRejectReason,
    screenshotUploadedAt: i.screenshotUploadedAt,
  })), [queue.pending, cycle]);

  const startFocusedReview = () => {
    if (!queueLightboxItems.length) return;
    setReviewLightbox({ items: queueLightboxItems, startIndex: 0, approved: 0, rejected: 0 });
  };

  const handleQueueDecide = async (lbItem, approve, reason) => {
    await reviewScreenshot(cycle.cycleID, lbItem.associateId, lbItem.clientId, lbItem.toolId, approve, reason);
    setReviewLightbox((cur) => (cur
      ? { ...cur, approved: cur.approved + (approve ? 1 : 0), rejected: cur.rejected + (approve ? 0 : 1) }
      : cur));
  };

  const handleQueueClose = () => {
    setReviewLightbox((cur) => {
      if (cur && (cur.approved > 0 || cur.rejected > 0)) {
        toasts.success(`${cur.approved} approved, ${cur.rejected} rejected`);
      }
      return null;
    });
    refreshAll();
  };

  const totalAttention = queue.pending.length + queue.rejected.length + (team?.mismatchCount ?? 0);

  // ── Team table view-model ──────────────────────────────────────────────────
  const visibleMembers = useMemo(() => {
    const members = team?.members ?? [];
    const query = search.trim().toLowerCase();
    const filtered = members
      .filter((member) => (filter === 'all' ? true : member.attestationStatus === filter))
      .filter((member) => {
        if (!query) return true;
        return member.fullName.toLowerCase().includes(query) || String(member.associateId).includes(query);
      });
    const dir = sortDir === 'asc' ? 1 : -1;
    const statusRank = (s) => STATE_ORDER.indexOf(s);
    return filtered.slice().sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = (a.fullName || '').localeCompare(b.fullName || '');
      else if (sortKey === 'progress') cmp = (a.progressPct ?? 0) - (b.progressPct ?? 0);
      else if (sortKey === 'status') cmp = statusRank(a.attestationStatus) - statusRank(b.attestationStatus);
      if (cmp === 0) cmp = (a.fullName || '').localeCompare(b.fullName || '');
      return cmp * dir;
    });
  }, [filter, search, team, sortKey, sortDir]);

  const onSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };

  // KPI / filter band — Direct reports + the five WI-6 state counts off TeamDto.
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

  const openMember = (id) => { setSelectedId(id); setDrawerOpen(true); };

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 24px 28px', maxWidth: 1320, margin: '0 auto' }}>

        {/* View toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 560, lineHeight: 1.1, color: 'var(--text)' }}>
              Manager review
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              Direct-report completion for {cycle?.cycleName ?? 'the selected cycle'}
            </div>
          </div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search team…" width={240} />
          {cycle?.cycleID && (
            <>
              <Button variant="outline" icon="image" onClick={() => setGalleryOpen(true)}>
                View screenshots
              </Button>
              <Button variant="outline" icon="download" disabled={downloadingZip} onClick={handleDownloadZip}
                title="Download every screenshot for this cycle as a .zip file">
                {downloadingZip ? 'Preparing…' : 'Export .zip'}
              </Button>
            </>
          )}
        </div>

        {/* ── Action queue — the centerpiece (DESIGN §10 Manager) ── */}
        <Card pad={0}>
          <div style={{ padding: '14px 16px 0' }}>
            <SectionHeader
              rule
              right={(
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {queueLoading && <Skeleton width={56} height={14} />}
                  {!queueLoading && (totalAttention > 0
                    ? <Stamp tone={queue.pending.length || queue.rejected.length ? 'warning' : 'danger'} label={`${totalAttention} TO ACT`} />
                    : <Stamp tone="success" label="ALL CLEAR" />)}
                </span>
              )}
            >
              Action queue
            </SectionHeader>
          </div>
          <div style={{ padding: '4px 16px 14px' }}>
            {queueLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0' }}>
                <Skeleton width="100%" height={40} />
                <Skeleton width="100%" height={40} />
              </div>
            ) : totalAttention === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0', color: 'var(--text-muted)' }}>
                <Icon name="check" size={16} style={{ color: 'var(--success)' }} />
                <span style={{ fontSize: 13 }}>Nothing needs your attention right now — every screenshot is reviewed and no disputes are open.</span>
              </div>
            ) : (
              <div>
                {queue.pending.length > 0 && (
                  <QueueRow
                    icon="clock" tone="warning"
                    title="Screenshots awaiting approval"
                    detail={queue.oldestPending ? `Oldest uploaded ${relativeAge(queue.oldestPending)}` : 'Review one at a time'}
                    count={queue.pending.length}
                    actionLabel="Start review"
                    onAction={startFocusedReview}
                  />
                )}
                {queue.rejected.length > 0 && (
                  <QueueRow
                    icon="alert" tone="danger"
                    title="Rejected — awaiting re-upload"
                    detail="Associates must re-submit these screenshots"
                    count={queue.rejected.length}
                    actionLabel="View all"
                    onAction={() => setGalleryOpen(true)}
                  />
                )}
                {(team?.mismatchCount ?? 0) > 0 && (
                  <QueueRow
                    icon="bell" tone="danger"
                    title="Access disputes"
                    detail={`${team.mismatchCount} team member${team.mismatchCount === 1 ? '' : 's'} reported a dispute`}
                    count={team.mismatchCount}
                    actionLabel={exportingDisputes ? 'Exporting…' : 'Export'}
                    onAction={handleExportDisputes}
                    disabled={exportingDisputes}
                  />
                )}
              </div>
            )}
          </div>
        </Card>

        {/* ── KPI / filter band ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12 }}>
          {summary.map((item) => {
            const active = filter === item.key;
            // Every card filters now — "Direct reports" sets the filter back to 'all'
            // (clears any status filter); the status cards toggle their own state.
            const onClick = item.key === 'all'
              ? () => setFilter('all')
              : () => setFilter(active ? 'all' : item.key);
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                title={item.key === 'all' ? 'Show all direct reports' : `Filter to ${item.label}`}
                onClick={onClick}
                style={{
                  textAlign: 'left', padding: '12px 14px',
                  borderRadius: 'var(--radius-card)', background: 'var(--surface)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  boxShadow: active ? '0 0 0 3px var(--accent-glow)' : 'var(--shadow-sm)',
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'border-color .15s ease-out, box-shadow .15s ease-out',
                }}
              >
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.label}
                </div>
                <div style={{ marginTop: 5, fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 540, lineHeight: 1, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.015em' }}>
                  {item.value}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Team status distribution graph ── */}
        <TeamStatusBar states={summary.slice(1)} total={team?.totalMembers ?? 0} />

        {/* ── Team table ── */}
        <Card pad={0}>
          <div style={{ padding: '14px 16px 0' }}>
            <SectionHeader
              rule
              right={(
                <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {[['all', 'All'], ...STATE_ORDER.map((s) => [s, statusMeta(s).label])].map(([key, label]) => {
                    const active = filter === key;
                    return (
                      <button
                        key={key} type="button" onClick={() => setFilter(key)} aria-pressed={active}
                        style={{
                          height: 26, padding: '0 10px', borderRadius: 999,
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          background: active ? 'var(--accent-glow)' : 'var(--surface)',
                          color: active ? 'var(--accent)' : 'var(--text-muted)',
                          fontSize: 11.5, fontWeight: active ? 600 : 500, fontFamily: 'inherit',
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            >
              Team
              {team && (
                <span style={{ marginLeft: 8, textTransform: 'none', fontWeight: 400, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                  {team.totalAttested}/{team.totalTools} tools
                </span>
              )}
            </SectionHeader>
          </div>

          {loadingTeam ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} width="100%" height={44} />)}
            </div>
          ) : teamError ? (
            <div style={{ padding: 16 }}>
              <EmptyState icon="alert" title="Couldn't load your team" message={teamError}
                action={<Button variant="outline" size="sm" icon="refresh" onClick={loadTeam}>Retry</Button>} />
            </div>
          ) : visibleMembers.length === 0 ? (
            <EmptyState
              icon="users"
              title={search || filter !== 'all' ? 'No matching team members' : 'No direct reports'}
              message={search || filter !== 'all'
                ? 'Clear or change the search and filter to see more team members.'
                : 'This manager has no direct reports in the selected cycle.'}
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                    <th style={{ padding: '0 16px', width: 36 }} aria-hidden="true" />
                    <SortHeader label="Team member" active={sortKey === 'name'} dir={sortDir} onSort={() => onSort('name')} style={{ padding: '0 16px' }} />
                    <SortHeader label="Progress" active={sortKey === 'progress'} dir={sortDir} onSort={() => onSort('progress')} style={{ padding: '0 16px', width: 240 }} />
                    <SortHeader label="Status" active={sortKey === 'status'} dir={sortDir} onSort={() => onSort('status')} style={{ padding: '0 16px' }} />
                    <th style={{ padding: '0 16px', width: 40 }} aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {visibleMembers.map((member) => {
                    const active = member.associateId === selectedId;
                    return (
                      <tr
                        key={member.associateId}
                        onClick={() => openMember(member.associateId)}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMember(member.associateId); } }}
                        style={{
                          cursor: 'pointer',
                          background: active ? 'var(--accent-glow)' : 'transparent',
                          borderBottom: '1px solid var(--border-subtle)',
                        }}
                      >
                        <td style={{ padding: '10px 16px', width: 36 }}>
                          <Avatar initials={(member.fullName || 'U').slice(0, 2).toUpperCase()} size={30} />
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {member.fullName}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.03em' }}>
                              ID {member.associateId}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', width: 240 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 100 }}>
                              <Progress value={member.attestedTools} max={member.totalTools || 1} height={5}
                                tone={member.attestedTools >= member.totalTools && member.totalTools > 0 ? 'success' : 'accent'} />
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--text)', minWidth: 52, textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                              {member.attestedTools}/{member.totalTools}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <StatusChip status={member.attestationStatus} />
                            {member.pendingScreenshots > 0 && <Stamp tone="warning" label={`${member.pendingScreenshots} PENDING`} />}
                            {member.rejectedScreenshots > 0 && <Stamp tone="danger" label={`${member.rejectedScreenshots} REJECTED`} />}
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', width: 40 }}>
                          <Icon name="chevright" size={14} style={{ color: 'var(--text-faint)' }} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── Member detail Drawer ── */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={detail ? detail.fullName : 'Member detail'}
        width={560}
        footer={canReopen ? (
          <Button variant="outline" icon="refresh" disabled={reopening} onClick={() => setConfirmReopen(true)}>
            {reopening ? 'Reopening…' : 'Reopen attestation'}
          </Button>
        ) : undefined}
      >
        {loadingDetail ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Skeleton width="60%" height={20} />
            <Skeleton width="100%" height={48} />
            <Skeleton width="100%" height={120} />
          </div>
        ) : detailError ? (
          <EmptyState icon="alert" title="Couldn't load member" message={detailError} />
        ) : !detail ? (
          <EmptyState icon="users" title="No member selected" message="Select a team member to review their progress." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Identity + status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar initials={(detail.fullName || 'U').slice(0, 2).toUpperCase()} size={44} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail.fullName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.03em' }}>ASSOCIATE ID {detail.associateId}</div>
              </div>
              <StatusChip status={detail.attestationStatus} />
            </div>

            {/* Overall completion */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                <SectionHeader>Completion</SectionHeader>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                  {detail.attestedTools}/{detail.totalTools} · {Math.round((detail.progressPct ?? 0) * 100)}%
                </span>
              </div>
              <Progress value={detail.attestedTools} max={detail.totalTools || 1} height={6}
                tone={detail.attestedTools >= detail.totalTools && detail.totalTools > 0 ? 'success' : 'accent'} />
            </div>

            {/* Per-client progress */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionHeader rule>Per-client progress</SectionHeader>
              {detail.byClient.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No client access is active for this user.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {detail.byClient.map((client) => <ClientProgressRow key={client.clientID} client={client} showId />)}
                </div>
              )}
            </section>

            {/* Screenshot review */}
            {(detail.pendingScreenshots > 0 || detail.rejectedScreenshots > 0 || detail.byClient.some((c) => c.tools?.length)) && (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ScreenshotGallery
                  cycleId={cycle.cycleID}
                  associateId={detail.associateId}
                  memberName={detail.fullName}
                  byClient={detail.byClient}
                  pendingScreenshots={detail.pendingScreenshots}
                  rejectedScreenshots={detail.rejectedScreenshots}
                  onReviewed={refreshAll}
                />
              </section>
            )}

            {/* Access disputes */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionHeader rule right={disputeCount > 0 ? <Stamp tone="danger" label={String(disputeCount)} icon={false} /> : undefined}>
                Access disputes
              </SectionHeader>
              {disputeCount === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No access disputes reported this cycle.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detail.mismatches.map((m, i) => (
                    <div key={`${m.clientID}-${m.toolName}-${i}`} style={{
                      padding: '12px 14px', borderRadius: 'var(--radius-card)',
                      background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{m.toolName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                          Answered {formatDate(m.submittedAt)}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                        {m.clientName} ({m.clientID})
                      </div>
                      {m.remarks ? (
                        <div style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.remarks}</div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>No remark provided.</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </Drawer>

      {/* Reopen confirm Modal (no window.confirm) */}
      <Modal
        open={confirmReopen}
        onClose={() => setConfirmReopen(false)}
        title="Reopen attestation"
        width={420}
        footer={(
          <>
            <Button variant="outline" onClick={() => setConfirmReopen(false)}>Cancel</Button>
            <Button variant="danger" icon="refresh" onClick={handleReopen}>Reopen</Button>
          </>
        )}
      >
        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
          Reopen <strong>{detail?.fullName ?? selectedId}</strong>'s submitted attestation for{' '}
          <strong>{cycle?.cycleName ?? 'this cycle'}</strong>? They will be able to edit and re-submit, and their status returns to in-progress.
        </div>
      </Modal>

      {/* Cycle screenshot gallery (WI-9) */}
      {galleryOpen && cycle?.cycleID && (
        <CycleGallery
          cycleId={cycle.cycleID}
          cycleName={cycle.cycleName}
          onClose={() => setGalleryOpen(false)}
          onReviewed={refreshAll}
        />
      )}

      {/* Focused review flow from the action queue (pending, oldest-first) */}
      {reviewLightbox && (
        <Lightbox
          items={reviewLightbox.items}
          startIndex={reviewLightbox.startIndex}
          review={{ onDecide: handleQueueDecide }}
          onClose={handleQueueClose}
        />
      )}
    </div>
  );
}
