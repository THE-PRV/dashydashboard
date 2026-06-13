import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Icon, Stamp, Button, Skeleton, SegmentedControl, SectionHeader, Modal, useToasts,
} from './ui.jsx';
import { getScreenshotThumbUrl } from '../api/attestations.js';
import { reviewScreenshot, approveAllScreenshots } from '../api/manager.js';
import Lightbox from './Lightbox.jsx';

// Screenshot-status → Stamp tone. Verdicts read as ink stamps (DESIGN §5).
const STATUS_STAMP = {
  Pending:  { tone: 'warning', label: 'PENDING' },
  Approved: { tone: 'success', label: 'APPROVED' },
  Rejected: { tone: 'danger',  label: 'REJECTED' },
};

// Sort order so Pending tiles surface first within each client (review-first).
const STATUS_RANK = { Pending: 0, Rejected: 1, Approved: 2 };

const FILTER_OPTIONS = [
  { id: 'All', label: 'All' },
  { id: 'Pending', label: 'Pending' },
  { id: 'Rejected', label: 'Rejected' },
  { id: 'Approved', label: 'Approved' },
];

function stampFor(status) {
  if (!status) return null;
  return STATUS_STAMP[status] ?? { tone: 'neutral', label: String(status).toUpperCase() };
}

/**
 * One tool tile: thumbnail (lazily fetched) + status stamp + approve/reject controls for
 * reviewers. Clicking the thumbnail opens the full-size image in a lightbox.
 */
function GalleryTile({ cycleId, associateId, clientId, tool, onOpen, onReview, busy }) {
  const [thumbUrl, setThumbUrl] = useState(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const hasScreenshot = !!tool.screenshotStatus;
  const cacheKey = `${associateId}/${clientId}/${tool.toolID}/${tool.screenshotStatus ?? ''}/${tool.screenshotUploadedAt ?? ''}`;

  useEffect(() => {
    let cancelled = false;
    let createdUrl = null;

    if (!hasScreenshot) {
      setThumbUrl(null);
      return undefined;
    }

    setThumbLoading(true);
    getScreenshotThumbUrl(cycleId, associateId, clientId, tool.toolID)
      .then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setThumbUrl(url);
      })
      .catch(() => {
        if (!cancelled) setThumbUrl(null);
      })
      .finally(() => {
        if (!cancelled) setThumbLoading(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const stamp = stampFor(tool.screenshotStatus);
  const isPending = tool.screenshotStatus === 'Pending';

  if (!tool.hadAccess) {
    // Exempt row — muted "No access — exempt" tile (consistent terminology, DESIGN §5).
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
        borderRadius: 'var(--radius-card)', border: '1px dashed var(--border)',
        background: 'var(--surface-2)', opacity: 0.7,
      }}>
        <div style={{
          width: '100%', aspectRatio: '4 / 3', borderRadius: 'var(--radius)', overflow: 'hidden',
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)',
        }}>
          <Icon name="minus" size={18} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tool.toolName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>No access — exempt</div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
      borderRadius: 'var(--radius-card)', border: '1px solid var(--border-subtle)', background: 'var(--surface)',
    }}>
      <button
        type="button"
        onClick={() => hasScreenshot && onOpen({ cycleId, associateId, clientId, toolId: tool.toolID, toolName: tool.toolName })}
        disabled={!hasScreenshot}
        aria-label={hasScreenshot ? `View ${tool.toolName} screenshot full size` : `${tool.toolName} — no screenshot uploaded`}
        style={{
          width: '100%', aspectRatio: '4 / 3', borderRadius: 'var(--radius)', overflow: 'hidden', padding: 0,
          background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: hasScreenshot ? 'zoom-in' : 'default',
        }}
        title={hasScreenshot ? 'Click to view full size' : 'No screenshot uploaded'}
      >
        {thumbUrl ? (
          <img src={thumbUrl} alt={`${tool.toolName} screenshot`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : thumbLoading ? (
          <Skeleton width="100%" height="100%" radius={0} />
        ) : (
          <Icon name="image" size={20} style={{ color: 'var(--text-faint)', opacity: 0.5 }} />
        )}
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tool.toolName}
        </div>
        {stamp && <Stamp tone={stamp.tone} label={stamp.label} />}
      </div>

      {tool.screenshotStatus === 'Rejected' && tool.screenshotRejectReason && (
        <div style={{ fontSize: 11, color: 'var(--danger)', lineHeight: 1.4 }}>{tool.screenshotRejectReason}</div>
      )}

      {tool.usedThisCycle === false && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Marked not used this cycle</div>
      )}

      {isPending && !showReject && (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            variant="primary" size="sm" icon="check"
            disabled={busy}
            onClick={() => onReview(tool, true, null)}
            style={{ flex: 1, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}
          >
            Approve
          </Button>
          <Button
            variant="outline" size="sm" icon="x"
            disabled={busy}
            onClick={() => setShowReject(true)}
            style={{ flex: 1, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}
          >
            Reject
          </Button>
        </div>
      )}

      {isPending && showReject && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            type="text"
            autoFocus
            placeholder="Reason for rejection…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Reason for rejection"
            aria-invalid={!reason.trim()}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12,
              borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text)', fontFamily: 'inherit', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              variant="danger" size="sm" icon="x"
              disabled={busy || !reason.trim()}
              onClick={() => onReview(tool, false, reason.trim())}
              style={{ flex: 1, opacity: (busy || !reason.trim()) ? 0.6 : 1, cursor: (busy || !reason.trim()) ? 'not-allowed' : 'pointer' }}
            >
              Confirm reject
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => { setShowReject(false); setReason(''); }} style={{ flex: 1 }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Reviewer screenshot gallery (Feature 2 §B2). Renders one section per client, with a
 * grid of per-tool tiles (thumbnail + status stamp + approve/reject). Exempt (no-access)
 * tools render a muted "No access — exempt" placeholder tile. A status filter (Pending
 * first) narrows the visible tiles; bulk-approve uses a confirm Modal (no window.confirm).
 *
 * props:
 *  - cycleId, associateId, memberName: identify whose gallery this is (memberName is used
 *    in the "Approve all" confirm dialog and the review-mode caption)
 *  - byClient: MemberDetailDto.byClient (ClientProgressDto[] with `tools: MemberToolDto[]`)
 *  - pendingScreenshots, rejectedScreenshots: counts for the summary header
 *  - onReviewed(): called after a successful approve/reject/approve-all so the parent can refresh
 */
export default function ScreenshotGallery({ cycleId, associateId, memberName, byClient, pendingScreenshots = 0, rejectedScreenshots = 0, onReviewed }) {
  // `lightbox` holds { items, startIndex, review } for the shared Lightbox, or null when closed.
  const [lightbox, setLightbox] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [filter, setFilter] = useState('All');
  const toasts = useToasts();

  const groups = (byClient ?? []).filter((c) => (c.tools ?? []).length > 0);
  const hasAnyScreenshotRows = groups.some((c) => c.tools.some((t) => t.hadAccess));

  // Every row that actually has a screenshot, in the shared Lightbox item shape. The
  // tile-click viewer navigates across this full set (not just the clicked tile); review is
  // offered on whichever items are Pending. Sorted Pending → Rejected → Approved.
  const allItems = useMemo(() => groups.flatMap((client) =>
    (client.tools ?? [])
      .filter((t) => !!t.screenshotStatus)
      .map((t) => ({
        cycleId,
        associateId,
        clientId: client.clientID,
        clientName: client.clientName,
        memberName,
        toolId: t.toolID,
        toolName: t.toolName,
        screenshotStatus: t.screenshotStatus,
        screenshotRejectReason: t.screenshotRejectReason,
        screenshotUploadedAt: t.screenshotUploadedAt,
      })),
  ).sort((a, b) => (STATUS_RANK[a.screenshotStatus] ?? 9) - (STATUS_RANK[b.screenshotStatus] ?? 9)),
  [groups, cycleId, associateId, memberName]);

  // The Pending subset, in the same shape, for the "Review pending" entry point (§B3).
  const pendingItems = allItems.filter((it) => it.screenshotStatus === 'Pending');

  // One approve/reject decision against the server; tallied so the lightbox-close toast can
  // report what happened. Shared by tile-controls, tile-viewer review, and review mode.
  const reviewTallyRef = useRef({ approved: 0, rejected: 0 });

  const decide = async (item, approve, reason) => {
    await reviewScreenshot(cycleId, associateId, item.clientId, item.toolId, approve, reason);
    if (approve) reviewTallyRef.current.approved += 1;
    else reviewTallyRef.current.rejected += 1;
  };

  if (!hasAnyScreenshotRows) return null;

  const handleReview = async (clientId, tool, approve, reason) => {
    const key = `${clientId}/${tool.toolID}`;
    setBusyKey(key);
    try {
      await reviewScreenshot(cycleId, associateId, clientId, tool.toolID, approve, reason);
      toasts.success(approve ? `Approved ${tool.toolName}` : `Rejected ${tool.toolName}`);
      onReviewed?.();
    } catch (err) {
      toasts.error(err.message || 'Review failed.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleApproveAll = async () => {
    setConfirmAll(false);
    setApprovingAll(true);
    try {
      await approveAllScreenshots(cycleId, associateId);
      toasts.success(`Approved ${pendingScreenshots} screenshot${pendingScreenshots === 1 ? '' : 's'}`);
      onReviewed?.();
    } catch (err) {
      toasts.error(err.message || 'Approve all failed.');
    } finally {
      setApprovingAll(false);
    }
  };

  // Open the shared lightbox. `review` enables in-lightbox approve/reject on Pending items.
  const openLightbox = (items, startIndex, { review = true } = {}) => {
    if (!items.length) return;
    reviewTallyRef.current = { approved: 0, rejected: 0 };
    setLightbox({
      items,
      startIndex,
      review: review ? { onDecide: decide } : undefined,
    });
  };

  // Tile click → open the viewer at that item, navigating across ALL screenshots, review enabled.
  const handleTileOpen = (target) => {
    const idx = allItems.findIndex((it) => it.clientId === target.clientId && it.toolId === target.toolId);
    openLightbox(allItems, idx < 0 ? 0 : idx, { review: true });
  };

  // "Review pending" → open the viewer over just the Pending set, review enabled.
  const handleReviewPending = () => openLightbox(pendingItems, 0, { review: true });

  const handleLightboxClose = () => {
    setLightbox(null);
    const { approved, rejected } = reviewTallyRef.current;
    if (approved > 0 || rejected > 0) {
      toasts.success(`${approved} approved, ${rejected} rejected`);
      onReviewed?.();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
      <SectionHeader
        rule
        right={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <SegmentedControl
              size="sm"
              ariaLabel="Filter screenshots by status"
              options={FILTER_OPTIONS}
              value={filter}
              onChange={setFilter}
            />
            {pendingItems.length > 0 && (
              <Button variant="outline" size="sm" icon="image" onClick={handleReviewPending}>
                Review pending ({pendingItems.length})
              </Button>
            )}
            {pendingScreenshots > 0 && (
              <Button variant="primary" size="sm" icon="check" disabled={approvingAll} onClick={() => setConfirmAll(true)}
                style={{ opacity: approvingAll ? 0.6 : 1, cursor: approvingAll ? 'wait' : 'pointer' }}>
                {approvingAll ? 'Approving…' : `Approve all (${pendingScreenshots})`}
              </Button>
            )}
          </div>
        )}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          Screenshots
          {pendingScreenshots > 0 && <Stamp tone="warning" label={`${pendingScreenshots} PENDING`} />}
          {rejectedScreenshots > 0 && <Stamp tone="danger" label={`${rejectedScreenshots} REJECTED`} />}
        </span>
      </SectionHeader>

      {groups.map((client) => {
        const tools = (client.tools ?? [])
          .filter((t) => t.hadAccess || t.screenshotStatus)
          .filter((t) => filter === 'All' || t.screenshotStatus === filter)
          .slice()
          .sort((a, b) => (STATUS_RANK[a.screenshotStatus] ?? 8) - (STATUS_RANK[b.screenshotStatus] ?? 8));
        if (tools.length === 0) return null;
        return (
          <div key={client.clientID}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
              {client.clientName}{' '}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontFamily: 'var(--font-mono)' }}>({client.clientID})</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {tools.map((tool) => (
                <GalleryTile
                  key={tool.toolID}
                  cycleId={cycleId}
                  associateId={associateId}
                  clientId={client.clientID}
                  tool={tool}
                  onOpen={handleTileOpen}
                  onReview={(t, approve, reason) => handleReview(client.clientID, t, approve, reason)}
                  busy={busyKey === `${client.clientID}/${tool.toolID}`}
                />
              ))}
            </div>
          </div>
        );
      })}

      {lightbox && (
        <Lightbox
          items={lightbox.items}
          startIndex={lightbox.startIndex}
          review={lightbox.review}
          onClose={handleLightboxClose}
        />
      )}

      <Modal
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Approve all pending screenshots"
        width={420}
        footer={(
          <>
            <Button variant="outline" onClick={() => setConfirmAll(false)}>Cancel</Button>
            <Button variant="primary" icon="check" onClick={handleApproveAll}>
              Approve {pendingScreenshots}
            </Button>
          </>
        )}
      >
        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
          Approve all {pendingScreenshots} pending screenshot{pendingScreenshots === 1 ? '' : 's'} for{' '}
          <strong>{memberName || 'this member'}</strong>? This signs off every awaiting-approval proof at once.
        </div>
      </Modal>
    </div>
  );
}
