import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Icon, Badge, Button } from './ui.jsx';
import { getScreenshotThumbUrl, getScreenshotUrl } from '../api/attestations.js';
import { reviewScreenshot, approveAllScreenshots } from '../api/manager.js';

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

/** Full-size image lightbox, rendered via portal. */
function Lightbox({ target, onClose }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl = null;
    setUrl(null);
    setError(null);

    getScreenshotUrl(target.cycleId, target.associateId, target.clientId, target.toolId)
      .then((u) => {
        if (cancelled) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        if (!u) { setError('Screenshot not found.'); return; }
        createdUrl = u;
        setUrl(u);
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load screenshot.'); });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [target]);

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(15, 12, 8, 0.75)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '92vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{target.toolName}</div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon name="x" size={15} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {error ? (
            <div style={{ color: '#fff', fontSize: 13 }}>{error}</div>
          ) : url ? (
            <img src={url} alt={`${target.toolName} full screenshot`} style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain' }} />
          ) : (
            <div style={{ color: '#fff', fontSize: 13 }}>Loading…</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Full-screen "Review pending" mode (Feature 2 §B3) — always renders on a DARK backdrop
 * regardless of the app theme (B6: this is the ONLY dark surface in the app).
 *
 * Iterates `items` (the member's Pending screenshots, full-size, auth-blob-fetched).
 * Keyboard: Enter = approve & advance · R = open reject-reason box (Enter inside it
 * submits the rejection & advances) · ←/→ = prev/next · Esc = exit.
 * On-screen Approve / Reject / Prev / Next buttons mirror every key for mouse users.
 * Auto-skips items already decided this session; exits (calling onClose with the
 * approved/rejected counts) once nothing is left to review.
 */
function ReviewLightbox({ cycleId, associateId, items, onDecide, onClose }) {
  const [index, setIndex] = useState(0);
  const [decided, setDecided] = useState({}); // key -> 'approved' | 'rejected'
  const [url, setUrl] = useState(null);
  const [imgError, setImgError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const reasonInputRef = useRef(null);

  const keyOf = (item) => `${item.clientID}/${item.toolID}`;

  // Find the next not-yet-decided item at or after `from` (wrapping once). Returns -1 if
  // every item has been decided — i.e. the session is complete.
  const nextPending = (from, decidedMap, dir = 1) => {
    const n = items.length;
    if (n === 0) return -1;
    for (let i = 0; i < n; i++) {
      const idx = ((from + dir * i) % n + n) % n;
      if (!decidedMap[keyOf(items[idx])]) return idx;
    }
    return -1;
  };

  const current = index >= 0 && index < items.length ? items[index] : null;
  const allDone = current == null || !!decided[keyOf(current)] && nextPending(index, decided) === -1;

  // Load the full-size image for the current item.
  useEffect(() => {
    if (!current) return undefined;
    let cancelled = false;
    let createdUrl = null;
    setUrl(null);
    setImgError(null);

    getScreenshotUrl(cycleId, associateId, current.clientID, current.toolID)
      .then((u) => {
        if (cancelled) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        if (!u) { setImgError('Screenshot not found.'); return; }
        createdUrl = u;
        setUrl(u);
      })
      .catch((err) => { if (!cancelled) setImgError(err.message || 'Failed to load screenshot.'); });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.clientID, current?.toolID]);

  // Focus the reason textbox when it opens.
  useEffect(() => {
    if (showReject) reasonInputRef.current?.focus();
  }, [showReject]);

  const advance = (dir, decidedMap) => {
    const next = nextPending(index + dir, decidedMap ?? decided, dir);
    if (next === -1) {
      onClose();
      return;
    }
    setIndex(next);
    setShowReject(false);
    setReason('');
  };

  const goPrev = () => {
    if (busy) return;
    const next = nextPending(index - 1, decided, -1);
    if (next === -1) return; // nothing else to review — stay put
    setIndex(next);
    setShowReject(false);
    setReason('');
  };

  const goNext = () => {
    if (busy) return;
    const next = nextPending(index + 1, decided, 1);
    if (next === -1) {
      onClose();
      return;
    }
    setIndex(next);
    setShowReject(false);
    setReason('');
  };

  const doApprove = async () => {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDecide(current, true, null);
      const updated = { ...decided, [keyOf(current)]: 'approved' };
      setDecided(updated);
      advance(1, updated);
    } catch (err) {
      setError(err.message || 'Approve failed.');
    } finally {
      setBusy(false);
    }
  };

  const doReject = async (reasonText) => {
    if (!current || busy) return;
    const trimmed = (reasonText ?? '').trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await onDecide(current, false, trimmed);
      const updated = { ...decided, [keyOf(current)]: 'rejected' };
      setDecided(updated);
      advance(1, updated);
    } catch (err) {
      setError(err.message || 'Reject failed.');
    } finally {
      setBusy(false);
    }
  };

  // Keyboard handling. While the reject-reason box is open, Enter submits the rejection
  // (not approve) and R types into the textbox like any other character.
  useEffect(() => {
    function onKeyDown(e) {
      if (busy) return;

      if (showReject) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowReject(false);
          setReason('');
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          doReject(reason);
        }
        // Any other key (including 'r'/'R') is left to the textbox itself.
        return;
      }

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          doApprove();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          setShowReject(true);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goNext();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, showReject, reason, current, decided, index]);

  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: '#0b0c0f', color: '#fff',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header / caption */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {current ? (
            <>Review pending screenshot — <span style={{ opacity: 0.75 }}>{current.clientName} ({current.clientID})</span> · {current.toolName}</>
          ) : (
            <>Review pending screenshots</>
          )}
        </div>
        <button onClick={onClose} style={{
          width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)',
          background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }} title="Exit (Esc)"><Icon name="x" size={15} /></button>
      </div>

      {/* Image */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {allDone ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.85)' }}>
            <Icon name="check" size={32} stroke={1.6} />
            <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600 }}>All pending screenshots reviewed</div>
          </div>
        ) : imgError ? (
          <div style={{ fontSize: 13 }}>{imgError}</div>
        ) : url ? (
          <img src={url} alt={`${current.toolName} full screenshot`} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, objectFit: 'contain' }} />
        ) : (
          <div style={{ fontSize: 13 }}>Loading…</div>
        )}
      </div>

      {error && (
        <div style={{ padding: '0 20px 8px', fontSize: 12.5, color: '#ff8a8a', textAlign: 'center' }}>{error}</div>
      )}

      {/* Controls */}
      <div style={{ padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        {showReject && !allDone ? (
          <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 480 }}>
            <input
              ref={reasonInputRef}
              type="text"
              placeholder="Reason for rejection… (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              style={{
                flex: 1, padding: '8px 10px', fontSize: 13, borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)',
                color: '#fff', fontFamily: 'inherit',
              }}
            />
            <Button
              variant="primary" size="sm" icon="x"
              disabled={busy || !reason.trim()}
              onClick={() => doReject(reason)}
              style={{ opacity: (busy || !reason.trim()) ? 0.6 : 1, cursor: (busy || !reason.trim()) ? 'not-allowed' : 'pointer' }}
            >
              Confirm reject
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => { setShowReject(false); setReason(''); }}>
              Cancel
            </Button>
          </div>
        ) : !allDone ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button variant="outline" size="sm" icon="chevleft" disabled={busy} onClick={goPrev} title="Previous (←)">Prev</Button>
            <Button variant="outline" size="sm" icon="x" disabled={busy} onClick={() => setShowReject(true)} title="Reject (R)">Reject</Button>
            <Button variant="primary" size="sm" icon="check" disabled={busy} onClick={doApprove} title="Approve & advance (Enter)">
              {busy ? 'Working…' : 'Approve'}
            </Button>
            <Button variant="outline" size="sm" icon="chevright" disabled={busy} onClick={goNext} title="Next (→)">Next</Button>
          </div>
        ) : (
          <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
        )}
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          Enter = Approve &amp; advance · R = Reject · ←/→ = Prev/Next · Esc = Exit
        </div>
      </div>
    </div>,
    document.body,
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
  const [lightbox, setLightbox] = useState(null);
  const [reviewMode, setReviewMode] = useState(false);
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

  // Flatten every Pending screenshot across clients for review mode (§B3).
  const pendingItems = groups.flatMap((client) =>
    (client.tools ?? [])
      .filter((t) => t.screenshotStatus === 'Pending')
      .map((t) => ({
        clientID: client.clientID,
        clientName: client.clientName,
        toolID: t.toolID,
        toolName: t.toolName,
      }))
  );

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

  // Review mode (§B3): one approve/reject decision per call, tallied for the exit toast.
  const reviewTallyRef = useRef({ approved: 0, rejected: 0 });

  const handleReviewModeOpen = () => {
    reviewTallyRef.current = { approved: 0, rejected: 0 };
    setReviewMode(true);
  };

  const handleReviewModeDecide = async (item, approve, reason) => {
    await reviewScreenshot(cycleId, associateId, item.clientID, item.toolID, approve, reason);
    if (approve) reviewTallyRef.current.approved += 1;
    else reviewTallyRef.current.rejected += 1;
  };

  const handleReviewModeClose = () => {
    setReviewMode(false);
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
            <Button variant="outline" size="sm" icon="image" onClick={handleReviewModeOpen}>
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
                  onOpen={setLightbox}
                  onReview={(t, approve, reason) => handleReview(client.clientID, t, approve, reason)}
                  busy={busyKey === `${client.clientID}/${tool.toolID}`}
                />
              ))}
            </div>
          </div>
        );
      })}

      {lightbox && <Lightbox target={lightbox} onClose={() => setLightbox(null)} />}

      {reviewMode && (
        <ReviewLightbox
          cycleId={cycleId}
          associateId={associateId}
          items={pendingItems}
          onDecide={handleReviewModeDecide}
          onClose={handleReviewModeClose}
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
