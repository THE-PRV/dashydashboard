import React, { useEffect, useId, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Icon, Button, Stamp } from './ui.jsx';
import { getScreenshotUrl } from '../api/attestations.js';

const SS_STAMP = {
  Pending: { tone: 'warning', label: 'PENDING' },
  Approved: { tone: 'success', label: 'APPROVED' },
  Rejected: { tone: 'danger', label: 'REJECTED' },
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

function itemKey(item) {
  return `${item.cycleId}/${item.associateId}/${item.clientId}/${item.toolId}`;
}

export default function Lightbox({ items = [], startIndex = 0, onClose, review }) {
  const reviewMode = !!review?.onDecide;
  const clampStart = items.length
    ? Math.max(0, Math.min(startIndex || 0, items.length - 1))
    : 0;

  const [index, setIndex] = useState(clampStart);
  const [statusOverride, setStatusOverride] = useState({});
  const [justDecidedKey, setJustDecidedKey] = useState(null);
  const [url, setUrl] = useState(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');

  const dialogRef = useRef(null);
  const reasonInputRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  const item = items.length ? items[index] : null;
  const key = item ? itemKey(item) : null;
  const override = key ? statusOverride[key] : null;
  const effectiveStatus = override?.status ?? item?.screenshotStatus;
  const effectiveReason = override?.rejectReason ?? item?.screenshotRejectReason;
  const isPending = reviewMode && effectiveStatus === 'Pending';
  const multi = items.length > 1;
  const imageReady = !!url && !imgLoading && !imgError;
  const canDecide = isPending && imageReady;

  const pendingRemaining = items.reduce((count, candidate) => {
    const status = statusOverride[itemKey(candidate)]?.status ?? candidate.screenshotStatus;
    return count + (status === 'Pending' ? 1 : 0);
  }, 0);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (!item) return undefined;

    let cancelled = false;
    let createdUrl = null;
    setUrl(null);
    setImgError(null);
    setImgLoading(true);
    setZoomed(false);

    getScreenshotUrl(item.cycleId, item.associateId, item.clientId, item.toolId)
      .then((nextUrl) => {
        if (cancelled) {
          if (nextUrl) URL.revokeObjectURL(nextUrl);
          return;
        }
        if (!nextUrl) {
          setImgError('The full-size screenshot could not be found.');
          setImgLoading(false);
          return;
        }
        createdUrl = nextUrl;
        setUrl(nextUrl);
      })
      .catch((err) => {
        if (!cancelled) {
          setImgError(err.message || 'Failed to load the full-size screenshot.');
          setImgLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [key, loadAttempt]);

  useEffect(() => {
    setShowReject(false);
    setReason('');
    setActionError(null);
    requestAnimationFrame(() => dialogRef.current?.focus());
  }, [index]);

  useEffect(() => {
    if (showReject) reasonInputRef.current?.focus();
  }, [showReject]);

  const goPrev = () => {
    if (busy || !multi) return;
    setIndex((current) => (current - 1 + items.length) % items.length);
  };

  const goNext = () => {
    if (busy || !multi) return;
    setIndex((current) => (current + 1) % items.length);
  };

  const cancelReject = () => {
    setShowReject(false);
    setReason('');
    requestAnimationFrame(() => dialogRef.current?.focus());
  };

  const advanceAfterDecision = (decidedKey, nextStatus) => {
    if (!multi) return;

    for (let offset = 1; offset < items.length; offset += 1) {
      const candidateIndex = (index + offset) % items.length;
      const candidate = items[candidateIndex];
      const candidateKey = itemKey(candidate);
      const status = candidateKey === decidedKey
        ? nextStatus
        : (statusOverride[candidateKey]?.status ?? candidate.screenshotStatus);

      if (status === 'Pending') {
        setIndex(candidateIndex);
        return;
      }
    }
  };

  const doApprove = async () => {
    if (!item || busy || !canDecide) return;

    setBusy(true);
    setActionError(null);
    try {
      await review.onDecide(item, true, null);
      setStatusOverride((current) => ({
        ...current,
        [key]: { status: 'Approved', rejectReason: null },
      }));
      setJustDecidedKey(key);
      advanceAfterDecision(key, 'Approved');
    } catch (err) {
      setActionError(err.message || 'Approve failed.');
    } finally {
      setBusy(false);
    }
  };

  const doReject = async (reasonText) => {
    if (!item || busy || !canDecide) return;

    const trimmed = (reasonText ?? '').trim();
    if (!trimmed) return;

    setBusy(true);
    setActionError(null);
    try {
      await review.onDecide(item, false, trimmed);
      setStatusOverride((current) => ({
        ...current,
        [key]: { status: 'Rejected', rejectReason: trimmed },
      }));
      setJustDecidedKey(key);
      setShowReject(false);
      setReason('');
      advanceAfterDecision(key, 'Rejected');
    } catch (err) {
      setActionError(err.message || 'Reject failed.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (busy) return;
        if (showReject) cancelReject();
        else onClose?.();
        return;
      }

      if (busy) return;

      if (event.key === 'Tab') {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll(INTERACTIVE_SELECTOR) ?? [],
        ).filter((element) =>
          !element.disabled && element.getAttribute('aria-hidden') !== 'true');

        if (focusable.length === 0) {
          event.preventDefault();
          dialogRef.current?.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey
          && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (isInteractiveElement(event.target)
        || isInteractiveElement(document.activeElement)
        || showReject) {
        return;
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          goPrev();
          break;
        case 'ArrowRight':
          event.preventDefault();
          goNext();
          break;
        case 'a':
        case 'A':
          if (canDecide) {
            event.preventDefault();
            doApprove();
          }
          break;
        case 'r':
        case 'R':
          if (canDecide) {
            event.preventDefault();
            setShowReject(true);
          }
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, showReject, canDecide, index, items.length, multi]);

  if (!item) return null;

  const stamp = stampFor(effectiveStatus);
  const uploaded = item.screenshotUploadedAt
    ? new Date(item.screenshotUploadedAt).toLocaleString()
    : null;
  const animateStamp = justDecidedKey === key;

  const navButtonStyle = (disabled) => ({
    width: 44, height: 44, borderRadius: 999, flex: 'none',
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)', color: '#fff',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  });

  return ReactDOM.createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy || imgLoading || undefined}
      tabIndex={-1}
      className="overlay-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 1300,
        background: '#08090c', color: '#fff',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 14,
          padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.12)',
          flex: 'none',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span id={titleId} style={{ fontSize: 14, fontWeight: 600 }}>
              {item.toolName || item.toolId}
            </span>
            <span style={{
              fontSize: 13, color: 'rgba(255,255,255,0.6)',
              fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
            }}>
              {item.clientName ? `${item.clientName} (${item.clientId})` : item.clientId}
            </span>
            {stamp && (
              <Stamp
                tone={stamp.tone}
                label={stamp.label}
                animate={animateStamp}
              />
            )}
          </div>
          <div
            id={descriptionId}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, marginTop: 4,
              fontSize: 11.5, color: 'rgba(255,255,255,0.5)', flexWrap: 'wrap',
            }}
          >
            {item.memberName && (
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{item.memberName}</span>
            )}
            {uploaded && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
              }}>
                Uploaded {uploaded}
              </span>
            )}
            {reviewMode && <span>{pendingRemaining} pending</span>}
            {imageReady && <span>{zoomed ? 'Click image to fit' : 'Click image for actual size'}</span>}
            {effectiveStatus === 'Rejected' && effectiveReason && (
              <span style={{ color: '#ff9a9a' }}>Reason: {effectiveReason}</span>
            )}
          </div>
        </div>

        {multi && (
          <div style={{
            fontSize: 12, color: 'rgba(255,255,255,0.7)',
            fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
            flex: 'none', paddingTop: 2,
          }}>
            {index + 1} / {items.length}
          </div>
        )}

        <button
          type="button"
          onClick={() => onClose?.()}
          disabled={busy}
          title="Close (Esc)"
          aria-label="Close viewer"
          style={{
            width: 32, height: 32, borderRadius: 8, flex: 'none',
            border: '1px solid rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.08)', color: '#fff',
            cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <div
        onClick={(event) => {
          if (event.target === event.currentTarget && !busy) onClose?.();
        }}
        style={{
          flex: 1, minHeight: 0, display: 'flex', alignItems: 'center',
          gap: 12, padding: '16px 20px',
        }}
      >
        {multi && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goPrev();
            }}
            disabled={busy}
            style={navButtonStyle(busy)}
            title="Previous (Left arrow)"
            aria-label="Previous screenshot"
          >
            <Icon name="chevleft" size={20} />
          </button>
        )}

        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            flex: 1, minWidth: 0, height: '100%', position: 'relative',
            display: 'flex',
            alignItems: zoomed ? 'flex-start' : 'center',
            justifyContent: zoomed ? 'flex-start' : 'center',
            overflow: zoomed ? 'auto' : 'hidden',
          }}
        >
          {imgError ? (
            <div
              role="alert"
              style={{
                margin: 'auto', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.85)',
                textAlign: 'center',
              }}
            >
              <Icon name="image" size={26} style={{ opacity: 0.6 }} />
              <div style={{ fontSize: 13 }}>{imgError}</div>
              <button
                type="button"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                style={{
                  minHeight: 32, padding: '0 12px', borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.28)',
                  background: 'rgba(255,255,255,0.08)', color: '#fff',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <Icon name="refresh" size={13} />
                Retry full image
              </button>
            </div>
          ) : url ? (
            <>
              {imgLoading && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    margin: 'auto', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.7)',
                  }}
                >
                  <svg
                    className="spin"
                    width={26}
                    height={26}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 3a9 9 0 1 1-9 9" />
                  </svg>
                  <div style={{ fontSize: 12.5 }}>Preparing full-size screenshot...</div>
                </div>
              )}
              <img
                src={url}
                alt={`${item.toolName || item.toolId} full screenshot`}
                onLoad={() => setImgLoading(false)}
                onError={() => {
                  setImgError('The full-size screenshot could not be displayed.');
                  setImgLoading(false);
                }}
                onClick={() => setZoomed((current) => !current)}
                title={zoomed ? 'Click to fit image' : 'Click for actual size'}
                style={{
                  display: imgLoading ? 'none' : 'block',
                  maxWidth: zoomed ? 'none' : '100%',
                  maxHeight: zoomed ? 'none' : '100%',
                  objectFit: 'contain', borderRadius: 8,
                  cursor: zoomed ? 'zoom-out' : 'zoom-in',
                  margin: zoomed ? 0 : 'auto',
                }}
              />
            </>
          ) : (
            <div
              role="status"
              aria-live="polite"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 10, color: 'rgba(255,255,255,0.7)',
              }}
            >
              <svg
                className="spin"
                width={26}
                height={26}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 3a9 9 0 1 1-9 9" />
              </svg>
              <div style={{ fontSize: 12.5 }}>
                {imgLoading ? 'Loading full-size screenshot...' : 'Preparing viewer...'}
              </div>
            </div>
          )}
        </div>

        {multi && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goNext();
            }}
            disabled={busy}
            style={navButtonStyle(busy)}
            title="Next (Right arrow)"
            aria-label="Next screenshot"
          >
            <Icon name="chevright" size={20} />
          </button>
        )}
      </div>

      {actionError && (
        <div
          role="alert"
          style={{
            padding: '0 20px 8px', fontSize: 12.5,
            color: '#ff8a8a', textAlign: 'center',
          }}
        >
          {actionError}
        </div>
      )}

      <div style={{
        padding: '12px 20px 18px', display: 'flex', flexDirection: 'column',
        gap: 10, alignItems: 'center', flex: 'none',
        borderTop: '1px solid rgba(255,255,255,0.10)',
      }}>
        {canDecide && showReject && (
          <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 620, flexWrap: 'wrap' }}>
            <input
              ref={reasonInputRef}
              type="text"
              placeholder="Reason for rejection (required)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  doReject(reason);
                }
              }}
              disabled={busy}
              aria-label="Reason for rejection"
              aria-invalid={!reason.trim()}
              style={{
                flex: '1 1 260px', minWidth: 0, padding: '8px 10px',
                fontSize: 13, borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.06)',
                color: '#fff', fontFamily: 'inherit', outline: 'none',
              }}
            />
            <Button
              variant="danger"
              size="sm"
              icon="x"
              loading={busy}
              disabled={!reason.trim()}
              onClick={() => doReject(reason)}
            >
              Confirm reject
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={cancelReject}>
              Cancel
            </Button>
          </div>
        )}

        {isPending && !imageReady && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', textAlign: 'center' }}>
            {imgError
              ? 'Reload the image before reviewing it.'
              : 'Review controls will appear when the full image is ready.'}
          </div>
        )}

        {canDecide && !showReject && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button
              variant="outline"
              size="sm"
              icon="x"
              disabled={busy}
              onClick={() => setShowReject(true)}
              title="Reject (R)"
            >
              Reject
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="check"
              loading={busy}
              onClick={doApprove}
              title="Approve (A)"
            >
              Approve screenshot
            </Button>
          </div>
        )}

        {reviewMode && !isPending && (
          <div
            role="status"
            aria-live="polite"
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 12, color: 'rgba(255,255,255,0.7)',
            }}
          >
            <Icon name={effectiveStatus === 'Approved' ? 'check' : 'info'} size={13} />
            {effectiveStatus === 'Approved'
              ? 'This screenshot is approved.'
              : effectiveStatus === 'Rejected'
                ? 'This screenshot is rejected.'
                : 'This screenshot has already been reviewed.'}
          </div>
        )}

        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center',
          fontFamily: 'var(--font-mono)', letterSpacing: '0.03em',
        }}>
          {reviewMode
            ? 'A = Approve | R = Reject | Left/Right = Navigate | Esc = Close'
            : 'Left/Right = Navigate | Esc = Close'}
        </div>
      </div>
    </div>,
    document.body,
  );
}
