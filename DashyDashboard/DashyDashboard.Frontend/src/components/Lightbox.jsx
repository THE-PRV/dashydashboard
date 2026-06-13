import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Icon, Button, Stamp } from './ui.jsx';
import { getScreenshotUrl } from '../api/attestations.js';

// Screenshot-status → Stamp tone. Verdicts render as ink stamps (DESIGN §5) so the
// review decision reads as a signed record, consistent everywhere.
const SS_STAMP = {
  Pending:  { tone: 'warning', label: 'PENDING' },
  Approved: { tone: 'success', label: 'APPROVED' },
  Rejected: { tone: 'danger',  label: 'REJECTED' },
};

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isInteractiveElement(target) {
  return target instanceof Element && !!target.closest(INTERACTIVE_SELECTOR);
}

function stampFor(status) {
  if (!status) return null;
  return SS_STAMP[status] ?? { tone: 'neutral', label: String(status).toUpperCase() };
}

/**
 * WI-5 — the ONE shared full-screen screenshot lightbox. Used by manager review, admin
 * review, the agent-side corner button (WI-2), per-row thumbnails, and the cycle gallery
 * (WI-9). True full-viewport, near-black backdrop, image fit-to-screen via the FULL image
 * endpoint (getScreenshotUrl → auth blob URL, revoked on change/unmount).
 *
 * Always renders on a deliberately-dark surface regardless of the app theme (matching the
 * old ReviewLightbox precedent — the only place we hardcode dark colors).
 *
 * z-index 400: above FullScreenOverlay (250) and RemarksModal (200).
 *
 * Props:
 *   items: Array<{
 *     cycleId, associateId, clientId, clientName, toolId, toolName,
 *     memberName?, screenshotStatus?, screenshotRejectReason?, screenshotUploadedAt?
 *   }>
 *   startIndex : number   — initial item (default 0; clamped)
 *   onClose    : () => void
 *   review?    : { onDecide(item, approve, reason): Promise }
 *       When provided, items whose screenshotStatus === 'Pending' show Approve / Reject
 *       (reject requires a non-empty reason via an inline input) inside the lightbox.
 *       After a decision the local status updates and the view advances to the next item.
 *       Keyboard: A or Enter = approve · R = reject · ←/→ = prev/next · Esc = close.
 *
 * Single-image use (items.length === 1) hides prev/next and works as a plain viewer.
 */
export default function Lightbox({ items = [], startIndex = 0, onClose, review }) {
  const reviewMode = !!review?.onDecide;
  const clampStart = items.length ? Math.max(0, Math.min(startIndex || 0, items.length - 1)) : 0;

  const [index, setIndex] = useState(clampStart);
  // Local status overrides keyed by item identity, so a decision reflects immediately in the
  // caption + hides the review controls without waiting for a parent refetch. `justDecided`
  // drives the one-shot stamp-in animation on the verdict.
  const [statusOverride, setStatusOverride] = useState({}); // key -> { status, rejectReason }
  const [justDecidedKey, setJustDecidedKey] = useState(null);
  const [url, setUrl] = useState(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const reasonInputRef = useRef(null);
  const restoreFocusRef = useRef(null);

  const item = items.length ? items[index] : null;
  const keyOf = (it) => `${it.cycleId}/${it.associateId}/${it.clientId}/${it.toolId}`;
  const override = item ? statusOverride[keyOf(item)] : null;
  const effectiveStatus = override?.status ?? item?.screenshotStatus;
  const effectiveReason = override?.rejectReason ?? item?.screenshotRejectReason;
  const isPending = reviewMode && effectiveStatus === 'Pending';
  const multi = items.length > 1;

  // Remember + restore focus around the lightbox lifetime.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    return () => restoreFocusRef.current?.focus?.();
  }, []);

  // Load the full-size image whenever the current item identity changes. Revoke the prior
  // object URL to avoid leaks (copies the existing cancellation idiom from ScreenshotGallery).
  useEffect(() => {
    if (!item) return undefined;
    let cancelled = false;
    let createdUrl = null;
    setUrl(null);
    setImgError(null);
    setImgLoading(true);

    getScreenshotUrl(item.cycleId, item.associateId, item.clientId, item.toolId)
      .then((u) => {
        if (cancelled) { if (u) URL.revokeObjectURL(u); return; }
        if (!u) { setImgError('Screenshot not found.'); return; }
        createdUrl = u;
        setUrl(u);
      })
      .catch((err) => { if (!cancelled) setImgError(err.message || 'Failed to load screenshot.'); })
      .finally(() => { if (!cancelled) setImgLoading(false); });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item && keyOf(item)]);

  // Reset the reject input each time we move to a different item.
  useEffect(() => {
    setShowReject(false);
    setReason('');
    setActionError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    if (showReject) reasonInputRef.current?.focus();
  }, [showReject]);

  const goPrev = () => {
    if (busy || !multi) return;
    setIndex((i) => (i - 1 + items.length) % items.length);
  };
  const goNext = () => {
    if (busy || !multi) return;
    setIndex((i) => (i + 1) % items.length);
  };
  // After a decision: move to the next item if there is one, else close.
  const advanceAfterDecision = () => {
    if (multi && index < items.length - 1) setIndex((i) => i + 1);
    else if (multi) setIndex((i) => (i + 1) % items.length);
  };

  const doApprove = async () => {
    if (!item || busy || !isPending) return;
    const key = keyOf(item);
    setBusy(true);
    setActionError(null);
    try {
      await review.onDecide(item, true, null);
      setStatusOverride((m) => ({ ...m, [key]: { status: 'Approved', rejectReason: null } }));
      setJustDecidedKey(key);
      advanceAfterDecision();
    } catch (err) {
      setActionError(err.message || 'Approve failed.');
    } finally {
      setBusy(false);
    }
  };

  const doReject = async (reasonText) => {
    if (!item || busy || !isPending) return;
    const trimmed = (reasonText ?? '').trim();
    if (!trimmed) return;
    const key = keyOf(item);
    setBusy(true);
    setActionError(null);
    try {
      await review.onDecide(item, false, trimmed);
      setStatusOverride((m) => ({ ...m, [key]: { status: 'Rejected', rejectReason: trimmed } }));
      setJustDecidedKey(key);
      setShowReject(false);
      setReason('');
      advanceAfterDecision();
    } catch (err) {
      setActionError(err.message || 'Reject failed.');
    } finally {
      setBusy(false);
    }
  };

  // Keyboard: ←/→ navigate; Esc closes. In review mode on a Pending item: A or Enter
  // approves, R opens the reject input. While the reject input is open, Enter submits the
  // rejection and typed letters go to the textbox.
  useEffect(() => {
    function onKeyDown(e) {
      // Capture Escape before lower overlays' document listeners. One key press should only
      // dismiss the topmost active layer (the reject input first, then this lightbox).
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (showReject) {
          setShowReject(false);
          setReason('');
        } else {
          onClose?.();
        }
        return;
      }

      if (busy) return;

      // Let focused controls handle Enter, arrows, and typed shortcut letters normally.
      // Checking activeElement as well covers synthetic key events dispatched on document.
      if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;

      if (showReject) return;

      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); goPrev(); break;
        case 'ArrowRight': e.preventDefault(); goNext(); break;
        case 'Enter':      if (isPending) { e.preventDefault(); doApprove(); } break;
        case 'a': case 'A': if (isPending) { e.preventDefault(); doApprove(); } break;
        case 'r': case 'R': if (isPending) { e.preventDefault(); setShowReject(true); } break;
        default: break;
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, showReject, reason, isPending, index, items.length, multi]);

  if (!item) return null;

  const stamp = stampFor(effectiveStatus);
  const uploaded = item.screenshotUploadedAt
    ? new Date(item.screenshotUploadedAt).toLocaleString()
    : null;
  const animateStamp = justDecidedKey === keyOf(item);

  const navBtnStyle = (disabled) => ({
    width: 44, height: 44, borderRadius: 999, flex: 'none',
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)', color: '#fff',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  });

  return ReactDOM.createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot viewer"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: '#08090c', color: '#fff',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header / caption */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 14,
          padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.12)', flex: 'none',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{item.toolName || item.toolId}</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
              {item.clientName ? `${item.clientName} (${item.clientId})` : item.clientId}
            </span>
            {stamp && <Stamp tone={stamp.tone} label={stamp.label} animate={animateStamp} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 11.5, color: 'rgba(255,255,255,0.5)', flexWrap: 'wrap' }}>
            {item.memberName && <span style={{ color: 'rgba(255,255,255,0.7)' }}>{item.memberName}</span>}
            {uploaded && <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>Uploaded {uploaded}</span>}
            {effectiveStatus === 'Rejected' && effectiveReason && (
              <span style={{ color: '#ff9a9a' }}>Reason: {effectiveReason}</span>
            )}
          </div>
        </div>

        {multi && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', flex: 'none', paddingTop: 2 }}>
            {index + 1} / {items.length}
          </div>
        )}

        <button
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close viewer"
          style={{
            width: 32, height: 32, borderRadius: 8, flex: 'none',
            border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.08)',
            color: '#fff', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* Image stage (with side nav arrows) */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px' }}>
        {multi && (
          <button onClick={(e) => { e.stopPropagation(); goPrev(); }} style={navBtnStyle(busy)} title="Previous (←)" aria-label="Previous screenshot">
            <Icon name="chevleft" size={20} />
          </button>
        )}

        <div
          onClick={(e) => e.stopPropagation()}
          style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {imgError ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.85)' }}>
              <Icon name="image" size={26} style={{ opacity: 0.6 }} />
              <div style={{ fontSize: 13 }}>{imgError}</div>
            </div>
          ) : url ? (
            <img
              src={url}
              alt={`${item.toolName || item.toolId} full screenshot`}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.7)' }}>
              <svg className="spin" width={26} height={26} viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M12 3a9 9 0 1 1-9 9" />
              </svg>
              <div style={{ fontSize: 12.5 }}>{imgLoading ? 'Loading screenshot…' : ' '}</div>
            </div>
          )}
        </div>

        {multi && (
          <button onClick={(e) => { e.stopPropagation(); goNext(); }} style={navBtnStyle(busy)} title="Next (→)" aria-label="Next screenshot">
            <Icon name="chevright" size={20} />
          </button>
        )}
      </div>

      {actionError && (
        <div style={{ padding: '0 20px 8px', fontSize: 12.5, color: '#ff8a8a', textAlign: 'center' }}>{actionError}</div>
      )}

      {/* Footer — review controls (when applicable) + key hints */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ padding: '12px 20px 18px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', flex: 'none', borderTop: '1px solid rgba(255,255,255,0.10)' }}
      >
        {isPending && showReject && (
          <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 520 }}>
            <input
              ref={reasonInputRef}
              type="text"
              placeholder="Reason for rejection… (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  doReject(reason);
                }
              }}
              disabled={busy}
              aria-label="Reason for rejection"
              style={{
                flex: 1, padding: '8px 10px', fontSize: 13, borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)',
                color: '#fff', fontFamily: 'inherit', outline: 'none',
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
        )}

        {isPending && !showReject && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button variant="outline" size="sm" icon="x" disabled={busy} onClick={() => setShowReject(true)} title="Reject (R)">Reject</Button>
            <Button variant="primary" size="sm" icon="check" disabled={busy} onClick={doApprove} title="Approve (A)">
              {busy ? 'Working…' : 'Approve'}
            </Button>
          </div>
        )}

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontFamily: 'var(--font-mono)', letterSpacing: '0.03em' }}>
          {reviewMode ? (
            <>A = Approve · R = Reject · ←/→ = Prev/Next · Esc = Close</>
          ) : (
            <>←/→ = Prev/Next · Esc = Close</>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
