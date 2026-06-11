import React, { useEffect, useRef, useState } from 'react';
import { Icon, Badge, Button } from './ui.jsx';
import { uploadScreenshot, getScreenshotThumbUrl } from '../api/attestations.js';
import { compressImageToFile } from '../utils/imageCompress.js';

const STATUS_BADGE = {
  Pending: { variant: 'pending', label: 'Pending' },
  Approved: { variant: 'used', label: 'Approved' },
  Rejected: { variant: 'danger', label: 'Rejected' },
};

/**
 * Per-tool screenshot upload control + status chip.
 *
 * - No screenshot yet: a camera/attach icon button opens a file picker.
 * - Has a screenshot: thumbnail (fetched from /thumb as a blob) + status chip.
 * - Rejected: reviewer's reason shown inline + a Re-upload button (always allowed,
 *   even read-only/past-due, per §A5).
 * - Exempt rows (no access) render nothing — caller should not mount this component
 *   for those rows.
 *
 * The thumbnail is fetched lazily and cached per (associateId, clientId, toolId,
 * screenshotStatus, uploadedAt) — the object URL is revoked on unmount/replacement.
 */
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
  onFocus,
  onUploaded,
  onError,
  registerPasteTarget,
}) {
  const [thumbUrl, setThumbUrl] = useState(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pasteState, setPasteState] = useState(null); // null | 'pasted' | 'uploading' | 'done'
  const fileInputRef = useRef(null);
  const cellRef = useRef(null);

  const hasScreenshot = !!screenshotStatus;
  const cacheKey = `${associateId}/${clientId}/${toolId}/${screenshotStatus ?? ''}/${screenshotUploadedAt ?? ''}`;

  // Lazily fetch the thumbnail whenever the row's screenshot identity changes (new
  // upload, status change). Revoke the previous object URL to avoid leaks.
  useEffect(() => {
    let cancelled = false;
    let createdUrl = null;

    if (!hasScreenshot) {
      setThumbUrl(null);
      return undefined;
    }

    setThumbLoading(true);
    getScreenshotThumbUrl(cycleId, associateId, clientId, toolId)
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

  const doUpload = async (file, { fromPaste = false } = {}) => {
    if (busy) return;
    setBusy(true);
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

  // Register this row's paste handler so the parent's single window-level paste
  // listener can route a clipboard image to whichever row is currently focused.
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

  const badge = screenshotStatus ? STATUS_BADGE[screenshotStatus] ?? { variant: 'neutral', label: screenshotStatus } : null;

  return (
    <div
      ref={cellRef}
      tabIndex={0}
      onFocus={onFocus}
      onClick={onFocus}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 36,
        borderRadius: 8,
        padding: 4,
        outline: isFocused ? '2px solid var(--accent)' : '2px solid transparent',
        outlineOffset: 1,
        transition: 'outline-color .12s',
      }}
      title={isFocused ? 'Focused — paste a screenshot with Ctrl+V' : 'Click to focus, then Ctrl+V to paste a screenshot'}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {!hasScreenshot && (
        <button
          type="button"
          disabled={!canUploadFresh || busy}
          onClick={() => fileInputRef.current?.click()}
          title={canUploadFresh ? 'Attach a screenshot' : 'Read-only after the due date'}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            height: 28, padding: '0 10px', borderRadius: 7,
            border: '1px dashed var(--border)',
            background: 'var(--surface-2)',
            color: canUploadFresh ? 'var(--text-muted)' : 'var(--text-muted)',
            opacity: !canUploadFresh ? 0.5 : 1,
            cursor: !canUploadFresh || busy ? 'not-allowed' : 'pointer',
            fontSize: 11.5, fontWeight: 500, fontFamily: 'inherit',
          }}
        >
          <Icon name="camera" size={13} />
          {busy ? 'Uploading…' : 'Attach'}
        </button>
      )}

      {hasScreenshot && (
        <>
          <div style={{
            width: 36, height: 36, borderRadius: 6, overflow: 'hidden', flex: 'none',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {thumbUrl ? (
              <img src={thumbUrl} alt="Screenshot thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Icon name="image" size={14} style={{ color: 'var(--text-muted)', opacity: thumbLoading ? 1 : 0.4 }} />
            )}
          </div>

          {badge && <Badge variant={badge.variant} size="sm">{badge.label}</Badge>}

          {screenshotStatus === 'Rejected' && (
            <span
              title={screenshotRejectReason || 'Rejected — see manager for details.'}
              style={{
                fontSize: 11, color: 'var(--danger-fg)', maxWidth: 140,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {screenshotRejectReason || 'Rejected'}
            </span>
          )}

          {(canReupload || !readOnly) && (
            <Button
              variant="outline"
              size="sm"
              icon="refresh"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              style={{ height: 26, padding: '0 8px', fontSize: 11, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}
            >
              {busy ? 'Uploading…' : 'Re-upload'}
            </Button>
          )}
        </>
      )}

      {pasteState && (
        <span style={{
          fontSize: 10.5, fontWeight: 600, color: 'var(--accent)',
          padding: '1px 6px', borderRadius: 999,
          background: 'color-mix(in oklab, var(--accent), transparent 88%)',
        }}>
          {pasteState === 'pasted' ? 'Pasted…' : pasteState === 'uploading' ? 'Uploading…' : 'Done'}
        </span>
      )}
    </div>
  );
}
