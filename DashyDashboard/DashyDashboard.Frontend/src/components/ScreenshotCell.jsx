// ─────────────────────────────────────────────────────────────────────────────
// ScreenshotCell — "The Ledger" per-row proof control (DESIGN §10 "Agent").
//
// Lives in the PROOF slot of AgentView's two-slot Proof/Reason column, so it owns
// a single fixed-footprint widget regardless of state — the column lines up
// vertically down the table.
//
//   no screenshot : a compact dashed attach tile (click / drag-drop / Ctrl+V).
//   loading thumb : Skeleton tile.
//   has screenshot: ONE thumbnail with the verdict as a small CORNER BADGE
//                   (Pending=warning clock, Approved=success check, Rejected=
//                   danger alert). Replace / view / re-upload surface on HOVER
//                   (and on keyboard focus). The reject reason stays visible
//                   inline beneath the tile.
//   verdict change: the corner badge plays the stamp-in settle (`verdictAnim`).
//   failure       : a visible retry affordance.
//   rejected      : re-upload stays allowed even read-only / past-due (server rule).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import { Icon, Skeleton, Tooltip } from './ui.jsx';
import { uploadScreenshot, getScreenshotThumbUrl } from '../api/attestations.js';

// Verdict → corner-badge tone + icon (DESIGN §3: status is icon + color, never
// color alone). Tones read the status vars; nothing hard-coded.
const STATUS_BADGE = {
  Pending:  { color: 'var(--warning)', bg: 'var(--warning-bg)', border: 'var(--warning-border)', icon: 'clock', label: 'Pending review' },
  Approved: { color: 'var(--success)', bg: 'var(--success-bg)', border: 'var(--success-border)', icon: 'check', label: 'Approved' },
  Rejected: { color: 'var(--danger)',  bg: 'var(--danger-bg)',  border: 'var(--danger-border)',  icon: 'alert', label: 'Rejected' },
};

const TILE = 44; // fixed thumbnail footprint — keeps the proof slot uniform.

export default function ScreenshotCell({
  cycleId,
  associateId,
  clientId,
  toolId,
  screenshotStatus,
  screenshotRejectReason,
  screenshotUploadedAt,
  readOnly = false,
  optional = false,
  isFocused = false,
  verdictAnim = false,
  onFocus,
  onUploaded,
  onError,
  onView,
  registerPasteTarget,
}) {
  const [thumbUrl, setThumbUrl] = useState(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [pasteState, setPasteState] = useState(null); // null | 'pasted' | 'uploading' | 'done'
  const [dragOver, setDragOver] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [kbFocus, setKbFocus] = useState(false); // keyboard focus within the tile (reveals actions)
  const fileInputRef = useRef(null);
  const lastFileRef = useRef(null); // for retry

  const hasScreenshot = !!screenshotStatus;
  const cacheKey = `${associateId}/${clientId}/${toolId}/${screenshotStatus ?? ''}/${screenshotUploadedAt ?? ''}`;

  // Lazily fetch the thumbnail whenever the row's screenshot identity changes. Revoke the
  // previous object URL to avoid leaks.
  useEffect(() => {
    let cancelled = false;
    let createdUrl = null;

    if (!hasScreenshot) {
      setThumbUrl(null);
      setThumbError(false);
      return undefined;
    }

    setThumbLoading(true);
    setThumbError(false);
    getScreenshotThumbUrl(cycleId, associateId, clientId, toolId)
      .then((url) => {
        if (cancelled) { if (url) URL.revokeObjectURL(url); return; }
        if (!url) { setThumbError(true); return; }
        createdUrl = url;
        setThumbUrl(url);
      })
      .catch(() => { if (!cancelled) setThumbError(true); })
      .finally(() => { if (!cancelled) setThumbLoading(false); });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const doUpload = async (file, { fromPaste = false } = {}) => {
    if (busy) return;
    lastFileRef.current = file;
    setBusy(true);
    setUploadFailed(false);
    if (fromPaste) setPasteState('uploading');
    try {
      await uploadScreenshot(cycleId, clientId, toolId, file);
      if (fromPaste) {
        setPasteState('done');
        window.setTimeout(() => setPasteState(null), 1800);
      }
      onUploaded?.();
    } catch (err) {
      if (fromPaste) setPasteState(null);
      setUploadFailed(true);
      onError?.(err.message || 'Screenshot upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (file) doUpload(file);
  };

  const retryThumb = () => {
    // Re-trigger the thumbnail effect by toggling load state; simplest is a forced refetch.
    setThumbError(false);
    setThumbLoading(true);
    getScreenshotThumbUrl(cycleId, associateId, clientId, toolId)
      .then((url) => { if (url) setThumbUrl(url); else setThumbError(true); })
      .catch(() => setThumbError(true))
      .finally(() => setThumbLoading(false));
  };

  // Register this row's paste handler so the parent's window-level paste listener can route a
  // clipboard image to whichever row is currently focused.
  useEffect(() => {
    if (!registerPasteTarget) return undefined;
    const key = `${clientId}/${toolId}`;
    registerPasteTarget(key, (file) => {
      setPasteState('pasted');
      doUpload(file, { fromPaste: true });
    });
    return () => registerPasteTarget(key, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, toolId, registerPasteTarget]);

  const canReupload = screenshotStatus === 'Rejected'; // always allowed, even read-only/past-due
  const canUploadFresh = !readOnly || canReupload;

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (!canUploadFresh || busy) return;
    const file = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (file) doUpload(file);
  };

  const badge = screenshotStatus
    ? (STATUS_BADGE[screenshotStatus] ?? { color: 'var(--text-muted)', bg: 'var(--surface-2)', border: 'var(--border)', icon: 'info', label: screenshotStatus })
    : null;

  // Reveal the action overlay on hover, keyboard focus, or while a paste is busy.
  const showActions = hovered || kbFocus;
  const replaceLabel = canReupload ? 'Re-upload' : 'Replace';

  // ── No screenshot → compact dashed attach tile ──────────────────────────────
  if (!hasScreenshot) {
    return (
      <div
        onDragOver={(e) => { if (canUploadFresh) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}
      >
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
        <Tooltip label={canUploadFresh ? (optional ? 'Optional — click, drag-drop, or Ctrl+V to attach proof' : 'Click, drag-drop, or press Ctrl+V to attach proof') : 'Read-only after the due date'} side="top">
          <button
            type="button"
            disabled={!canUploadFresh || busy}
            onFocus={onFocus}
            onClick={() => { onFocus?.(); fileInputRef.current?.click(); }}
            aria-label="Attach proof screenshot"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: 132, height: TILE, padding: '0 8px', borderRadius: 'var(--radius)',
              border: `1px dashed ${(dragOver || isFocused) ? 'var(--accent)' : 'var(--border)'}`,
              background: dragOver ? 'var(--accent-glow)' : 'var(--surface-2)',
              color: dragOver ? 'var(--accent)' : 'var(--text-muted)',
              opacity: !canUploadFresh ? 0.5 : 1,
              cursor: (!canUploadFresh || busy) ? 'not-allowed' : 'pointer',
              fontSize: 11.5, fontWeight: 500, fontFamily: 'inherit',
              transition: 'border-color .12s, background .12s, color .12s',
            }}
          >
            <Icon name={busy ? 'upload' : 'camera'} size={14} className={busy ? 'spin' : undefined} />
            {busy ? 'Uploading…' : optional ? 'Attach (optional)' : 'Attach proof'}
          </button>
        </Tooltip>

        {uploadFailed && (
          <button type="button" onClick={() => lastFileRef.current && doUpload(lastFileRef.current)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, padding: '0 6px',
              border: '1px solid var(--danger-border)', borderRadius: 'var(--radius)',
              background: 'var(--danger-bg)', color: 'var(--danger)',
              fontSize: 10.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            }}>
            <Icon name="refresh" size={11} stroke={2.2} /> Retry upload
          </button>
        )}

        {pasteState && <PasteBadge state={pasteState} />}
      </div>
    );
  }

  // ── Has screenshot → single thumbnail + corner badge + hover actions ────────
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => { setKbFocus(true); onFocus?.(); }}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setKbFocus(false); }}
      onDragOver={(e) => { if (canUploadFresh) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}
    >
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {/* The thumbnail tile (relative anchor for the corner badge + hover overlay) */}
        <div style={{
          position: 'relative', width: TILE, height: TILE, flex: 'none',
          borderRadius: 'var(--radius)', overflow: 'hidden',
          background: 'var(--surface-2)',
          border: `1px solid ${(dragOver || isFocused) ? 'var(--accent)' : 'var(--border)'}`,
          transition: 'border-color .12s',
        }}>
          {thumbLoading ? (
            <Skeleton width={TILE} height={TILE} radius="var(--radius)" />
          ) : thumbUrl ? (
            <button type="button" onClick={onView} title="View full screenshot" aria-label="View full screenshot"
              style={{ display: 'block', width: '100%', height: '100%', padding: 0, border: 0, background: 'transparent', cursor: onView ? 'zoom-in' : 'default' }}>
              <img src={thumbUrl} alt="Screenshot thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </button>
          ) : thumbError ? (
            <button type="button" onClick={retryThumb} title="Thumbnail failed — click to retry"
              aria-label="Retry loading thumbnail"
              style={{ width: '100%', height: '100%', border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="refresh" size={15} />
            </button>
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="image" size={15} style={{ color: 'var(--text-faint)' }} />
            </div>
          )}

          {/* Corner verdict badge — plays the stamp-in settle on a fresh verdict. */}
          {badge && (
            <span
              className={verdictAnim ? 'stamp-in' : undefined}
              title={badge.label}
              aria-label={`Screenshot ${badge.label}`}
              style={{
                position: 'absolute', top: 2, right: 2,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 16, height: 16, borderRadius: 999,
                background: badge.bg, border: `1.5px solid ${badge.color}`, color: badge.color,
                boxShadow: '0 0 0 1.5px var(--surface)',
              }}>
              <Icon name={badge.icon} size={9} stroke={2.6} />
            </span>
          )}

          {/* Hover / focus action overlay — Replace + view, surfaced on demand. */}
          {showActions && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              background: 'color-mix(in oklab, var(--text), transparent 35%)',
            }}>
              {onView && thumbUrl && (
                <TileAction icon="eye" label="View screenshot" onClick={onView} />
              )}
              {(canReupload || !readOnly) && (
                <TileAction icon="refresh" label={replaceLabel} busy={busy}
                  onClick={() => { onFocus?.(); fileInputRef.current?.click(); }} />
              )}
            </div>
          )}
        </div>

        {/* Re-upload nudge for a rejected shot — always visible (the actionable case). */}
        {canReupload && !showActions && (
          <button type="button" onClick={() => { onFocus?.(); fileInputRef.current?.click(); }}
            disabled={busy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 8px',
              border: '1px solid var(--danger-border)', borderRadius: 'var(--radius)',
              background: 'var(--danger-bg)', color: 'var(--danger)',
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
              cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap',
            }}>
            <Icon name="refresh" size={12} stroke={2.2} className={busy ? 'spin' : undefined} /> Re-upload
          </button>
        )}
      </div>

      {/* Rejected → reason stays visible inline beneath the tile. */}
      {screenshotStatus === 'Rejected' && (
        <span style={{
          fontSize: 11, color: 'var(--danger)', maxWidth: 200, lineHeight: 1.35,
          display: 'inline-flex', alignItems: 'flex-start', gap: 4,
        }} title={screenshotRejectReason || 'Rejected — see your manager for details.'}>
          <Icon name="alert" size={11} stroke={2.2} style={{ flex: 'none', marginTop: 2 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {screenshotRejectReason || 'Rejected'}
          </span>
        </span>
      )}

      {uploadFailed && (
        <button type="button" onClick={() => lastFileRef.current && doUpload(lastFileRef.current)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, padding: '0 6px',
            border: '1px solid var(--danger-border)', borderRadius: 'var(--radius)',
            background: 'var(--danger-bg)', color: 'var(--danger)',
            fontSize: 10.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', alignSelf: 'flex-start',
          }}>
          <Icon name="refresh" size={11} stroke={2.2} /> Retry upload
        </button>
      )}

      {pasteState && <PasteBadge state={pasteState} />}
    </div>
  );
}

// Small icon button shown in the hover overlay over the thumbnail.
function TileAction({ icon, label, onClick, busy = false }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} title={label} aria-label={label}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 'var(--radius)',
        border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
        cursor: busy ? 'wait' : 'pointer', padding: 0,
        boxShadow: 'var(--shadow-pop)',
      }}>
      <Icon name={icon} size={13} stroke={2} className={busy ? 'spin' : undefined} />
    </button>
  );
}

// Transient paste status pill (mono uppercase, accent tint).
function PasteBadge({ state }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500, letterSpacing: '0.04em',
      textTransform: 'uppercase', color: 'var(--accent)', alignSelf: 'flex-start',
      padding: '1px 6px', borderRadius: 4, background: 'var(--accent-glow)',
    }}>
      {state === 'pasted' ? 'Pasted' : state === 'uploading' ? 'Uploading' : 'Done'}
    </span>
  );
}
