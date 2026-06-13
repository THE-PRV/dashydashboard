// ─────────────────────────────────────────────────────────────────────────────
// ScreenshotCell — "The Ledger" per-row proof control (DESIGN §10 "Agent").
//
//   no screenshot : a dashed attach zone (click / drag-drop / Ctrl+V when focused).
//   loading thumb : Skeleton placeholder.
//   has screenshot: thumbnail + status Stamp (Pending=warning clock, Approved=
//                   success check, Rejected=danger alert with the reason inline).
//   verdict change: stamp-in settle animation (driven by `verdictAnim` from parent).
//   failure       : a visible retry affordance.
//   rejected      : re-upload stays allowed even read-only / past-due (server rule).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import { Icon, Stamp, Button, Skeleton, Tooltip } from './ui.jsx';
import { uploadScreenshot, getScreenshotThumbUrl } from '../api/attestations.js';
import { compressImageToFile } from '../utils/imageCompress.js';

const STATUS_STAMP = {
  Pending:  { tone: 'warning', label: 'Pending' },
  Approved: { tone: 'success', label: 'Approved' },
  Rejected: { tone: 'danger',  label: 'Rejected' },
};

export default function ScreenshotCell({
  cycleId,
  associateId,
  clientId,
  toolId,
  screenshotStatus,
  screenshotRejectReason,
  screenshotUploadedAt,
  readOnly = false,
  isFocused = false,
  verdictAnim = false,
  onFocus,
  onUploaded,
  onError,
  registerPasteTarget,
}) {
  const [thumbUrl, setThumbUrl] = useState(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [pasteState, setPasteState] = useState(null); // null | 'pasted' | 'uploading' | 'done'
  const [dragOver, setDragOver] = useState(false);
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
      const compressed = await compressImageToFile(file, file.name);
      await uploadScreenshot(cycleId, clientId, toolId, compressed);
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

  const stamp = screenshotStatus ? (STATUS_STAMP[screenshotStatus] ?? { tone: 'neutral', label: screenshotStatus }) : null;

  return (
    <div
      tabIndex={0}
      onFocus={onFocus}
      onClick={onFocus}
      onDragOver={(e) => { if (canUploadFresh) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, minHeight: 36,
        borderRadius: 'var(--radius)', padding: 3,
        outline: (isFocused || dragOver) ? '2px solid var(--accent)' : '2px solid transparent',
        outlineOffset: 1,
        background: dragOver ? 'var(--accent-glow)' : 'transparent',
        transition: 'outline-color .12s, background .12s',
      }}
    >
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* No screenshot → dashed attach zone with paste/drag hint */}
      {!hasScreenshot && (
        <Tooltip label={canUploadFresh ? 'Click, drag-drop, or press Ctrl+V to attach' : 'Read-only after the due date'} side="top">
          <button
            type="button"
            disabled={!canUploadFresh || busy}
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 28, padding: '0 10px', borderRadius: 'var(--radius)',
              border: `1px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
              background: 'var(--surface-2)', color: 'var(--text-muted)',
              opacity: !canUploadFresh ? 0.5 : 1,
              cursor: (!canUploadFresh || busy) ? 'not-allowed' : 'pointer',
              fontSize: 11.5, fontWeight: 500, fontFamily: 'inherit',
            }}
          >
            <Icon name={busy ? 'upload' : 'camera'} size={13} className={busy ? 'spin' : undefined} />
            {busy ? 'Uploading…' : 'Attach proof'}
          </button>
        </Tooltip>
      )}

      {/* Has screenshot → thumbnail + status stamp */}
      {hasScreenshot && (
        <>
          <div style={{
            width: 36, height: 36, borderRadius: 'var(--radius)', overflow: 'hidden', flex: 'none',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
          }}>
            {thumbLoading ? (
              <Skeleton width={36} height={36} radius="var(--radius)" />
            ) : thumbUrl ? (
              <img src={thumbUrl} alt="Screenshot thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : thumbError ? (
              <button type="button" onClick={retryThumb} title="Thumbnail failed — click to retry"
                aria-label="Retry loading thumbnail"
                style={{ border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex' }}>
                <Icon name="refresh" size={14} />
              </button>
            ) : (
              <Icon name="image" size={14} style={{ color: 'var(--text-faint)' }} />
            )}
          </div>

          {stamp && (
            <Stamp tone={stamp.tone} label={stamp.label} animate={verdictAnim}
              title={screenshotStatus === 'Rejected' ? (screenshotRejectReason || 'Rejected') : undefined} />
          )}

          {screenshotStatus === 'Rejected' && (
            <span style={{
              fontSize: 11, color: 'var(--danger)', maxWidth: 150,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={screenshotRejectReason || 'Rejected — see your manager for details.'}>
              {screenshotRejectReason || 'Rejected'}
            </span>
          )}

          {(canReupload || !readOnly) && (
            <Button variant="outline" size="sm" icon="refresh" loading={busy}
              onClick={() => fileInputRef.current?.click()}
              style={{ height: 26, padding: '0 8px', fontSize: 11 }}>
              {canReupload ? 'Re-upload' : 'Replace'}
            </Button>
          )}
        </>
      )}

      {/* Upload failure retry (when no screenshot is shown yet) */}
      {uploadFailed && !hasScreenshot && (
        <Button variant="outline" size="sm" icon="refresh"
          onClick={() => lastFileRef.current && doUpload(lastFileRef.current)}
          style={{ height: 26, padding: '0 8px', fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger-border)' }}>
          Retry
        </Button>
      )}

      {pasteState && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500, letterSpacing: '0.04em',
          textTransform: 'uppercase', color: 'var(--accent)',
          padding: '1px 6px', borderRadius: 4, background: 'var(--accent-glow)',
        }}>
          {pasteState === 'pasted' ? 'Pasted' : pasteState === 'uploading' ? 'Uploading' : 'Done'}
        </span>
      )}
    </div>
  );
}
