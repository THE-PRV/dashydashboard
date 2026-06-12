import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Icon, Badge, Button } from './ui.jsx';
import { getScreenshotThumbUrl } from '../api/attestations.js';
import { reviewScreenshot, approveAllScreenshots } from '../api/manager.js';
import Lightbox from './Lightbox.jsx';

const STATUS_BADGE = {
  Pending: { variant: 'pending', label: 'Pending' },
  Approved: { variant: 'used', label: 'Approved' },
  Rejected: { variant: 'danger', label: 'Rejected' },
};

/**
 * One tool tile: thumbnail (lazily fetched) + status + approve/reject controls for
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

  const badge = tool.screenshotStatus ? STATUS_BADGE[tool.screenshotStatus] ?? { variant: 'neutral', label: tool.screenshotStatus } : null;
  const isPending = tool.screenshotStatus === 'Pending';

  if (!tool.hadAccess) {
    // Exempt row — muted "no screenshot required" tile.
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
        borderRadius: 10, border: '1px dashed var(--border)', background: 'var(--surface-2)', opacity: 0.6,
      }}>
        <div style={{
          width: '100%', aspectRatio: '4 / 3', borderRadius: 8, overflow: 'hidden',
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
        }}>
          <Icon name="x" size={16} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tool.toolName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No access — exempt</div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
      borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--surface)',
    }}>
      <button
        type="button"
        onClick={() => hasScreenshot && onOpen({ cycleId, associateId, clientId, toolId: tool.toolID, toolName: tool.toolName })}
        disabled={!hasScreenshot}
        style={{
          width: '100%', aspectRatio: '4 / 3', borderRadius: 8, overflow: 'hidden', padding: 0,
          background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: hasScreenshot ? 'zoom-in' : 'default',
        }}
        title={hasScreenshot ? 'Click to view full size' : 'No screenshot uploaded'}
      >
        {thumbUrl ? (
          <img src={thumbUrl} alt={`${tool.toolName} screenshot`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Icon name="image" size={20} style={{ color: 'var(--text-muted)', opacity: thumbLoading ? 1 : 0.4 }} />
        )}
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tool.toolName}
        </div>
        {badge && <Badge variant={badge.variant} size="sm">{badge.label}</Badge>}
      </div>

      {tool.screenshotStatus === 'Rejected' && tool.screenshotRejectReason && (
        <div style={{ fontSize: 11, color: 'var(--danger-fg)' }}>{tool.screenshotRejectReason}</div>
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
            style={{
              width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12,
              borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text)', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              variant="primary" size="sm" icon="x"
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
 * grid of per-tool tiles (thumbnail + status + approve/reject). Exempt (no-access) tools
 * render a muted placeholder tile.
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
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const groups = (byClient ?? []).filter((c) => (c.tools ?? []).length > 0);
  const hasAnyScreenshotRows = groups.some((c) => c.tools.some((t) => t.hadAccess));

  // Auto-dismiss the "n approved, m rejected" toast.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!hasAnyScreenshotRows) return null;

  // Every row that actually has a screenshot, in the shared Lightbox item shape. The
  // tile-click viewer navigates across this full set (not just the clicked tile); review is
  // offered on whichever items are Pending.
  const allItems = groups.flatMap((client) =>
    (client.tools ?? [])
      .filter((t) => !!t.screenshotStatus)
      .map((t) => ({
        cycleId,
        associateId,
        clientId: client.clientID,
        clientName: client.clientName,
        toolId: t.toolID,
        toolName: t.toolName,
        screenshotStatus: t.screenshotStatus,
        screenshotRejectReason: t.screenshotRejectReason,
        screenshotUploadedAt: t.screenshotUploadedAt,
      }))
  );

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

  const handleReview = async (clientId, tool, approve, reason) => {
    const key = `${clientId}/${tool.toolID}`;
    setBusyKey(key);
    setError(null);
    try {
      await reviewScreenshot(cycleId, associateId, clientId, tool.toolID, approve, reason);
      onReviewed?.();
    } catch (err) {
      setError(err.message || 'Review failed.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleApproveAll = async () => {
    if (!window.confirm(`Approve ${pendingScreenshots} pending screenshot${pendingScreenshots === 1 ? '' : 's'} for ${memberName || 'this member'}?`)) {
      return;
    }
    setApprovingAll(true);
    setError(null);
    try {
      await approveAllScreenshots(cycleId, associateId);
      onReviewed?.();
    } catch (err) {
      setError(err.message || 'Approve all failed.');
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
      setToast(`${approved} approved, ${rejected} rejected`);
      onReviewed?.();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Screenshots
          </div>
          {pendingScreenshots > 0 && <Badge variant="pending" size="sm">Awaiting approval ({pendingScreenshots})</Badge>}
          {rejectedScreenshots > 0 && <Badge variant="danger" size="sm">Rejected ({rejectedScreenshots})</Badge>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {pendingItems.length > 0 && (
            <Button variant="outline" size="sm" icon="image" onClick={handleReviewPending}>
              Review pending ({pendingItems.length})
            </Button>
          )}
          {pendingScreenshots > 0 && (
            <Button variant="primary" size="sm" icon="check" disabled={approvingAll} onClick={handleApproveAll}
              style={{ opacity: approvingAll ? 0.6 : 1, cursor: approvingAll ? 'wait' : 'pointer' }}>
              {approvingAll ? 'Approving…' : `Approve all (${pendingScreenshots})`}
            </Button>
          )}
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: 'var(--danger-fg)' }}>{error}</div>}

      {groups.map((client) => {
        const tools = (client.tools ?? []).filter((t) => t.hadAccess || t.screenshotStatus);
        if (tools.length === 0) return null;
        return (
          <div key={client.clientID}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
              {client.clientName} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({client.clientID})</span>
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

      {toast && ReactDOM.createPortal(
        <div
          className="toast"
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 500,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '12px 18px',
            boxShadow: 'var(--shadow-lift-h)',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 13, color: 'var(--text)', maxWidth: 360,
          }}
        >
          <span style={{ color: 'var(--st-completed)', flexShrink: 0 }}>
            <Icon name="check" size={16} />
          </span>
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', flexShrink: 0, padding: 2, lineHeight: 0 }}
          >
            <Icon name="x" size={13} />
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
