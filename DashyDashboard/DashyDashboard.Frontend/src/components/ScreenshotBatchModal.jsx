import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { Icon, Button, Badge } from './ui.jsx';
import { uploadScreenshotsBatch } from '../api/attestations.js';
import { compressImageToFile } from '../utils/imageCompress.js';

// Splits "{clientId}_{toolId}.ext" on the FIRST underscore — clientIds may contain
// hyphens but never underscores, mirroring AttestationService.SplitBatchFileName.
function splitFileName(fileName) {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const us = base.indexOf('_');
  if (us <= 0 || us === base.length - 1) return null;
  return { clientId: base.slice(0, us), toolPart: base.slice(us + 1) };
}

// Matches a parsed (clientId, toolPart) against the associate's own attestation list:
// clientId exact (case-insensitive), tool part = ToolID (string form) or ToolName
// (case-insensitive) — mirrors the server-side matching in UploadBatchAsync.
function matchFile(fileName, clients) {
  const parsed = splitFileName(fileName);
  if (!parsed) return { fileName, matched: false, reason: 'Name must be {clientId}_{toolId}.ext' };

  const client = clients.find((c) => c.clientID.toLowerCase() === parsed.clientId.toLowerCase());
  if (!client) return { fileName, matched: false, reason: `No client "${parsed.clientId}" in your attestations` };

  const tool = client.tools.find((t) =>
    String(t.toolID).toLowerCase() === parsed.toolPart.toLowerCase()
    || (t.toolName ?? '').toLowerCase() === parsed.toolPart.toLowerCase());
  if (!tool) return { fileName, matched: false, reason: `No tool "${parsed.toolPart}" for ${client.clientID}` };

  if (tool.hadAccess === false) {
    return { fileName, matched: false, reason: `${client.clientID} / ${tool.toolName} is marked no-access (exempt)` };
  }

  return {
    fileName, matched: true,
    clientId: client.clientID, clientName: client.clientName,
    toolId: tool.toolID, toolName: tool.toolName,
  };
}

const RESULT_LABEL = {
  saved: { label: 'Saved', variant: 'used' },
  unmatched: { label: 'Unmatched', variant: 'neutral' },
  invalidImage: { label: 'Invalid image', variant: 'danger' },
  notAllowed: { label: 'Not allowed', variant: 'danger' },
};

/**
 * Batch screenshot upload modal (§A4). Drag-drop / multi-file picker -> client-side parse
 * + match against the user's own attestation list -> preview table -> compress matched
 * files -> POST to the batch endpoint -> per-file server results.
 *
 * props: cycleId, clients (the associate's ClientAttestationDto[] as currently loaded),
 * onClose, onUploaded() — called after a successful batch call so the parent can refresh.
 */
export default function ScreenshotBatchModal({ cycleId, clients, onClose, onUploaded }) {
  const [files, setFiles] = useState([]); // File[]
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null); // [{fileName, status, detail}]
  const [uploadedNames, setUploadedNames] = useState(null); // Map: original file.name -> canonical uploaded name
  const [error, setError] = useState(null);

  const preview = useMemo(
    () => files.map((file) => ({ file, ...matchFile(file.name, clients) })),
    [files, clients],
  );

  const matchedCount = preview.filter((p) => p.matched).length;

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    setFiles((previous) => {
      const existingNames = new Set(previous.map((f) => f.name));
      return [...previous, ...incoming.filter((f) => !existingNames.has(f.name))];
    });
    setResults(null);
    setUploadedNames(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };

  const removeFile = (name) => {
    setFiles((previous) => previous.filter((f) => f.name !== name));
    setResults(null);
    setUploadedNames(null);
  };

  const handleUpload = async () => {
    if (uploading || matchedCount === 0) return;
    setUploading(true);
    setError(null);
    try {
      const matched = preview.filter((p) => p.matched);
      const nameMap = new Map();
      const compressed = await Promise.all(matched.map(async (p) => {
        const ext = (p.toolId !== undefined && p.toolId !== null) ? p.toolId : 'tool';
        const canonicalBase = `${p.clientId}_${ext}`;
        const file = await compressImageToFile(p.file, canonicalBase);
        nameMap.set(p.file.name, file.name);
        return file;
      }));

      const response = await uploadScreenshotsBatch(cycleId, compressed);
      setResults(response?.results ?? []);
      setUploadedNames(nameMap);
      onUploaded?.();
    } catch (err) {
      setError(err.message || 'Batch upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const resultFor = (fileName) => {
    const canonical = uploadedNames?.get(fileName) ?? fileName;
    return results?.find((r) => r.fileName === canonical);
  };

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(15, 12, 8, 0.55)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 680, maxWidth: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', borderRadius: 14,
        border: '1px solid var(--border)', boxShadow: '0 20px 70px rgba(0,0,0,.35)',
        overflow: 'hidden', color: 'var(--text)',
      }}>
        <header style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'color-mix(in oklab, var(--accent), transparent 86%)',
              color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
            }}><Icon name="upload" size={16} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>Batch upload screenshots</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Name files <code style={{ fontFamily: 'monospace' }}>{'{clientId}_{toolId}.png'}</code> — e.g. <code style={{ fontFamily: 'monospace' }}>DTC-US_2.png</code>
              </div>
            </div>
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="x" size={14} /></button>
          </div>
        </header>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '28px 16px', borderRadius: 10, cursor: 'pointer',
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
              background: dragOver ? 'color-mix(in oklab, var(--accent), transparent 92%)' : 'var(--surface-2)',
              color: 'var(--text-muted)', transition: 'border-color .12s, background .12s',
            }}
          >
            <Icon name="upload" size={22} />
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Drag &amp; drop screenshots here</div>
            <div style={{ fontSize: 11.5 }}>or click to choose files (.png, .jpg, .webp)</div>
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }}
            />
          </label>

          {preview.length > 0 && (
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    {['File', 'Matched to', 'Status', ''].map((h) => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '8px 12px', fontSize: 10.5, fontWeight: 600,
                        letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)',
                        borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p) => {
                    const result = resultFor(p.file.name);
                    return (
                      <tr key={p.file.name} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11.5, whiteSpace: 'nowrap' }}>{p.file.name}</td>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                          {p.matched
                            ? <span>{p.clientName} ({p.clientId}) &middot; {p.toolName}</span>
                            : <span style={{ color: 'var(--text-muted)' }}>{p.reason}</span>}
                        </td>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                          {result
                            ? <Badge variant={(RESULT_LABEL[result.status] ?? RESULT_LABEL.unmatched).variant} size="sm">
                                {(RESULT_LABEL[result.status] ?? { label: result.status }).label}
                                {result.detail ? ` — ${result.detail}` : ''}
                              </Badge>
                            : p.matched
                              ? <Badge variant="pending" size="sm">Ready</Badge>
                              : <Badge variant="neutral" size="sm">Unmatched</Badge>}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => removeFile(p.file.name)}
                            disabled={uploading}
                            style={{ border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: uploading ? 'not-allowed' : 'pointer', padding: 2, lineHeight: 0 }}
                          ><Icon name="x" size={13} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {error && <div style={{ fontSize: 12, color: 'var(--danger-fg)' }}>{error}</div>}
        </div>

        <footer style={{ padding: '14px 20px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {preview.length === 0 ? 'No files selected.' : `${matchedCount} of ${preview.length} matched and ready.`}
          </span>
          <div style={{ flex: 1 }} />
          <Button onClick={onClose}>{results ? 'Close' : 'Cancel'}</Button>
          <Button
            variant="primary"
            icon="upload"
            onClick={handleUpload}
            disabled={uploading || matchedCount === 0}
            style={{ opacity: (uploading || matchedCount === 0) ? 0.6 : 1, cursor: (uploading || matchedCount === 0) ? 'not-allowed' : 'pointer' }}
          >
            {uploading ? 'Uploading…' : `Upload ${matchedCount || ''}`.trim()}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
