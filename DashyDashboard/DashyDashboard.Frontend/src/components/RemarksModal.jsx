// ─────────────────────────────────────────────────────────────────────────────
// RemarksModal — long-form free-text remark per tool (DESIGN §8 Modal).
// One remark per tool's attestation for the cycle. The inline required-remark
// input in AgentView covers the quick path; this modal is for longer text.
// pane: { cycleId, clientId, clientName, toolId, toolName, initialText }
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { Modal, Button } from './ui.jsx';
import { addRemark } from '../api/attestations.js';

export default function RemarksModal({ pane, onClose, onSaved }) {
  const [text, setText] = useState(pane.initialText ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const trimmed = (text ?? '').trim();
      await addRemark(pane.cycleId, pane.clientId, pane.toolId, trimmed);
      onSaved?.(trimmed);
      onClose();
    } catch {
      setError('Failed to save remark. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={pane.toolName || 'Remark'}
      width={520}
      footer={(
        <>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', marginRight: 'auto', alignSelf: 'center' }}>
            Visible to your manager + audit.
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" loading={saving} onClick={handleSave}>
            Save remark
          </Button>
        </>
      )}
    >
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)',
        fontVariantNumeric: 'tabular-nums', marginBottom: 12,
      }}>
        {pane.clientName} ({pane.clientId})
      </div>

      <label style={{
        display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8,
      }}>
        Your remark
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a remark for your reviewer or auditor — e.g. why this tool was or wasn't used this cycle."
        rows={6}
        maxLength={500}
        autoFocus
        style={{
          width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 'var(--radius)',
          border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)',
          fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, resize: 'vertical', outline: 'none',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Leave blank to clear the remark.</span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
          {text.length}/500
        </span>
      </div>
      {error && (
        <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          {error}
        </div>
      )}
    </Modal>
  );
}
