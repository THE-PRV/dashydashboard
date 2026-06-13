// ─────────────────────────────────────────────────────────────────────────────
// ScreenshotBatchModal — batch proof upload (DESIGN §8 Modal + §10 "Agent").
// Drag-drop / multi-file picker → client-side parse + match against the user's own
// attestation list → preview table → compress matched files → POST batch → per-file
// server results rendered as tone Stamps (saved / unmatched / invalid).
//
// props: cycleId, clients (the associate's ClientAttestationDto[] as loaded),
//        onClose, onUploaded() — called after a successful batch so the parent refreshes.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from 'react';
import { Modal, Icon, Button, Stamp } from './ui.jsx';
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

// Matches a parsed (clientId, toolPart) against the associate's own attestation list.
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

const RESULT_STAMP = {
  saved:        { tone: 'success', label: 'Saved' },
  unmatched:    { tone: 'neutral', label: 'Unmatched' },
  invalidImage: { tone: 'danger',  label: 'Invalid' },
  notAllowed:   { tone: 'danger',  label: 'Not allowed' },
};

export default function ScreenshotBatchModal({ cycleId, clients, onClose, onUploaded }) {
  const [files, setFiles] = useState([]); // File[]
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null); // [{fileName, status, detail}]
  const [uploadedNames, setUploadedNames] = useState(null); // Map: original file.name -> canonical name
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

  return (
    <Modal
      open
      onClose={onClose}
      title="Batch upload screenshots"
      width={680}
      footer={(
        <>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', marginRight: 'auto', alignSelf: 'center' }}>
            {preview.length === 0 ? 'No files selected.' : `${matchedCount} of ${preview.length} matched and ready.`}
          </span>
          <Button onClick={onClose}>{results ? 'Close' : 'Cancel'}</Button>
          <Button variant="primary" icon="upload" loading={uploading}
            disabled={matchedCount === 0} onClick={handleUpload}>
            {`Upload ${matchedCount || ''}`.trim()}
          </Button>
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Name files{' '}
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text)' }}>{'{clientId}_{toolId}.png'}</code>
          {' '}— e.g.{' '}
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text)' }}>DTC-US_2.png</code>
        </div>

        {/* Drop zone */}
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: '28px 16px', borderRadius: 'var(--radius-card)', cursor: 'pointer',
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
            background: dragOver ? 'var(--accent-glow)' : 'var(--surface-2)',
            color: 'var(--text-muted)', transition: 'border-color .12s, background .12s',
          }}
        >
          <Icon name="upload" size={22} />
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Drag &amp; drop screenshots here</div>
          <div style={{ fontSize: 11.5 }}>or click to choose files (.png, .jpg, .webp)</div>
          <input
            type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }}
          />
        </label>

        {/* Preview / result table */}
        {preview.length > 0 && (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {['File', 'Matched to', 'Status', ''].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600,
                      letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--rule)', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => {
                  const result = resultFor(p.file.name);
                  return (
                    <tr key={p.file.name} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {p.file.name}
                      </td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        {p.matched
                          ? <span style={{ color: 'var(--text)' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>({p.clientId})</span> {p.toolName}
                            </span>
                          : <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <Icon name="alert" size={12} stroke={2} style={{ color: 'var(--warning)' }} />
                              {p.reason}
                            </span>}
                      </td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        {result ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Stamp {...(RESULT_STAMP[result.status] ?? { tone: 'neutral', label: result.status })} />
                            {result.detail && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{result.detail}</span>}
                          </span>
                        ) : p.matched ? (
                          <Stamp tone="info" label="Ready" icon="check" />
                        ) : (
                          <Stamp tone="neutral" label="Unmatched" />
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <button
                          type="button" onClick={() => removeFile(p.file.name)} disabled={uploading}
                          aria-label={`Remove ${p.file.name}`}
                          style={{ border: 0, background: 'transparent', color: 'var(--text-faint)', cursor: uploading ? 'not-allowed' : 'pointer', padding: 2, lineHeight: 0 }}
                        ><Icon name="x" size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="alert" size={13} stroke={2} /> {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
