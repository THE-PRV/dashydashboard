import React, { useEffect, useId, useRef } from 'react';
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
 * Restyled to "The Ledger" (DESIGN §6/§7): paper surface, hairline rules, a focus
 * trap with focus-return on close, and aria-modal semantics. External prop contract
 * is unchanged (title/subtitle/actions/onClose/children/footer/closeOnBackdrop).
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
const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export default function FullScreenOverlay({
  title,
  subtitle,
  actions,
  onClose,
  children,
  footer,
  closeOnBackdrop = true,
}) {
  const panelRef = useRef(null);
  const titleId = useId();

  // Focus trap + Esc + focus-return + body-scroll lock, mirroring ui.jsx's
  // useFocusTrap so the overlay behaves like the Modal/Drawer primitives.
  useEffect(() => {
    const previous = document.activeElement;
    const panel = panelRef.current;
    const initial = panel?.querySelectorAll(FOCUSABLE);
    (initial && initial.length ? initial[0] : panel)?.focus?.();

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(panelRef.current.querySelectorAll(FOCUSABLE));
      if (!focusables.length) { e.preventDefault(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      className="overlay-backdrop"
      onMouseDown={closeOnBackdrop ? (e) => { if (e.target === e.currentTarget) onClose?.(); } : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 250,
        background: 'rgba(16, 19, 26, 0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'center',
        padding: 'clamp(0px, 2vw, 28px)',
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="overlay-pop"
        style={{
          flex: 1, minWidth: 0, maxWidth: 1180,
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 'clamp(0px, 1.2vw, var(--radius-card))',
          boxShadow: 'var(--shadow-pop)',
          overflow: 'hidden', outline: 'none',
        }}
      >
        {/* Header */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 20px', borderBottom: '1px solid var(--rule)',
          background: 'var(--surface)', flex: 'none',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id={titleId} style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {title}
            </div>
            {subtitle != null && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{subtitle}</div>
            )}
          </div>
          {actions != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 'none' }}>{actions}</div>
          )}
          <button
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: 'var(--radius)', flex: 'none',
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
            borderTop: '1px solid var(--rule)', background: 'var(--surface-2)',
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
