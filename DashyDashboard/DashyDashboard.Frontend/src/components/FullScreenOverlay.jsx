import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Icon } from './ui.jsx';

/**
 * WI-3 shell — a full-viewport in-app takeover (NOT a small modal). Portals to
 * document.body, covers the page with a dark scrim and a content panel that itself
 * fills the viewport. Esc closes; body scroll is locked while open so the page behind
 * does not scroll-bleed. The body area scrolls internally.
 *
 * The Manager member overlay (WI-3), the Admin associate drill-down (WI-8) and the
 * cycle screenshot gallery (WI-9) all mount their content INSIDE this generic shell.
 *
 * z-index 250: it sits ABOVE RemarksModal (200) and BELOW the Lightbox (400), so a
 * lightbox opened from within the overlay layers on top of it.
 *
 * Props:
 *   title     : string | node   — header title (required)
 *   subtitle  : node            — optional secondary line under / beside the title
 *   actions   : node            — optional slot rendered in the header, left of the ✕
 *   onClose   : () => void      — called on ✕, Esc, or scrim click outside the panel
 *   children  : node            — overlay body (scrolls internally)
 *   footer    : node            — optional sticky footer row
 *   closeOnBackdrop : bool       — default true; scrim click closes
 */
export default function FullScreenOverlay({
  title,
  subtitle,
  actions,
  onClose,
  children,
  footer,
  closeOnBackdrop = true,
}) {
  // Esc to close.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Lock body scroll while open; restore the prior value on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return ReactDOM.createPortal(
    <div
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 250,
        background: 'rgba(15, 12, 8, 0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'center',
        padding: 'clamp(0px, 2vw, 28px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1, minWidth: 0, maxWidth: 1180,
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 'clamp(0px, 1.4vw, 16px)',
          boxShadow: '0 24px 80px rgba(0,0,0,.40)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          background: 'var(--surface)', flex: 'none',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {title}
            </div>
            {subtitle != null && (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>{subtitle}</div>
            )}
          </div>
          {actions != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 'none' }}>{actions}</div>
          )}
          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{
              width: 32, height: 32, borderRadius: 8, flex: 'none',
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text-muted)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </header>

        {/* Body — scrolls internally */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 20px 22px' }}>
          {children}
        </div>

        {/* Optional sticky footer */}
        {footer != null && (
          <footer style={{
            flex: 'none', padding: '12px 20px',
            borderTop: '1px solid var(--border)', background: 'var(--surface-2)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
