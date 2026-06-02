import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Icon, Button } from './ui.jsx';
import { addRemark } from '../api/attestations.js';

// Single free-text remark per tool, stored on the tool's attestation for the cycle.
// pane: { cycleId, clientId, clientName, toolId, toolName, accent, initialText }
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
    } finally {
      setSaving(false);
    }
  };

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(15, 12, 8, 0.55)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', borderRadius: 14,
        border: '1px solid var(--border)', boxShadow: '0 20px 70px rgba(0,0,0,.35)',
        overflow: 'hidden', color: 'var(--text)',
      }}>
        <header style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: `color-mix(in oklab, ${pane.accent ?? 'var(--accent)'}, transparent 86%)`,
              color: pane.accent ?? 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
            }}><Icon name="message" size={16} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{pane.toolName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pane.clientName} · remark</div>
            </div>
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="x" size={14} /></button>
          </div>
        </header>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 20px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Your remark
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a remark for your auditor or manager — e.g. why this tool was or wasn't used this cycle."
            rows={6}
            maxLength={500}
            autoFocus
            style={{
              width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)',
              fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, resize: 'vertical', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Leave blank to clear the remark.</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{text.length}/500</span>
          </div>
          {error && (
            <div style={{ fontSize: 12, color: 'var(--danger-fg)', marginTop: 8 }}>{error}</div>
          )}
        </div>

        <footer style={{ padding: '14px 20px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Visible to your manager + audit.</span>
          <div style={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="check" onClick={handleSave} style={{ opacity: saving ? 0.6 : 1, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save remark'}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
