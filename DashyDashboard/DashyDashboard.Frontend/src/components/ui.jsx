// ─────────────────────────────────────────────────────────────────────────────
// "The Ledger" core primitives — see DESIGN.md (binding contract).
// Every export that existed before the redesign keeps its name + prop API;
// visuals are re-skinned to the paper/ink language. New primitives (Stamp,
// Toasts, Modal, Drawer, EmptyState, Skeleton, Tooltip, KpiCard,
// SegmentedControl, SortHeader, CycleRuler) live alongside.
// No hex literals here — colors come from CSS vars in index.css.
// ─────────────────────────────────────────────────────────────────────────────
import React, {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';

// ── Icons ────────────────────────────────────────────────────────────────────
// Inline 24×24 stroke paths. Extend this map rather than importing icon libs.
export const ICONS = {
  search:   <path d="M11 3a8 8 0 1 0 5.2 14.1l3.85 3.85 1.4-1.4-3.85-3.85A8 8 0 0 0 11 3Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z" />,
  check:    <path d="M5 12.5 9.5 17 19 7" />,
  x:        <path d="M5 5l14 14M19 5L5 19" />,
  chevdown: <path d="M5 8.5 12 15.5l7-7" />,
  chevup:   <path d="M5 15.5 12 8.5l7 7" />,
  chevright:<path d="M9 5l7 7-7 7" />,
  chevleft: <path d="M15 5l-7 7 7 7" />,
  filter:   <path d="M3 5h18l-7 9v5l-4 2v-7L3 5z" />,
  plus:     <path d="M12 5v14M5 12h14" />,
  minus:    <path d="M5 12h14" />,
  history:  <path d="M3 3v6h6M3.5 9a9 9 0 1 1-.2 6M12 7v5l3.5 2" />,
  edit:     <path d="M4 20h4l10-10-4-4L4 16v4z M14 6l4 4" />,
  user:     <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-7 2-7 5v1h14v-1c0-3-3-5-7-5Z" />,
  users:    <path d="M9 11a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 9 11Zm7 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-7 2c-3 0-6 1.5-6 4v2h12v-2c0-2.5-3-4-6-4Zm7 0c-.7 0-1.4.1-2 .3 1.2.9 2 2.2 2 3.7v2h5v-2c0-2.5-2.5-4-5-4Z" />,
  bell:     <path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4l2-2Zm4 3a2 2 0 0 0 4 0" />,
  moon:     <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5Z" />,
  sun:      <path d="M12 4v2M12 18v2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4 4.2 19.8M19.8 4.2l-1.4 1.4M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" />,
  briefcase:<path d="M3 8h18v11H3z M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />,
  app:      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  list:     <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.5M3.5 12h.5M3.5 18h.5" />,
  grid:     <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
  message:  <path d="M4 4h16v12H7l-3 3V4z" />,
  star:     <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" />,
  shield:   <path d="M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6l-8-3z" />,
  clock:    <path d="M12 4a8 8 0 1 0 8 8 8 8 0 0 0-8-8Zm0 4v4l3 2" />,
  link:     <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />,
  more:     <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  arrow_up_right: <path d="M7 17 17 7M9 7h8v8" />,
  logout:   <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h12" />,
  camera:   <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  upload:   <path d="M12 16V4M7 9l5-5 5 5M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />,
  download: <path d="M12 4v12M7 11l5 5 5-5M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />,
  image:    <path d="M4 4h16v16H4z M9 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M5 18l5-6 4 4 2-2 4 5" />,
  refresh:  <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8M21 3v5h-5 M21 12a9 9 0 0 1-15.3 6.4L3 16M3 21v-5h5" />,
  // ── Ledger additions ──
  circle:   <circle cx="12" cy="12" r="8" />,
  half:     <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" /></>,
  alert:    <path d="M12 3.5 2.7 19.5h18.6L12 3.5ZM12 10v4M12 16.8v.01" />,
  info:     <path d="M12 4a8 8 0 1 0 8 8 8 8 0 0 0-8-8Zm0 3.5v.01M12 11v5" />,
  calendar: <path d="M4 6h16v15H4zM4 10h16M8 3v4M16 3v4" />,
  key:      <path d="M14 4a6 6 0 0 0-5.8 7.5L3 16.7V21h4.3l1.2-1.2v-2h2l1.5-1.5A6 6 0 1 0 14 4Zm2 5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />,
  menu:     <path d="M4 6h16M4 12h16M4 18h16" />,
  panel:    <path d="M4 4h16v16H4zM9.5 4v16M13 10l-1.8 2 1.8 2" />,
  eye:      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  trash:    <path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13M10 11v5M14 11v5" />,
  sort:     <path d="M8 8 12 4l4 4M8 16l4 4 4-4" />,
};

// Spinner used by Button's loading state (open arc + .spin rotation).
function Spinner({ size = 13 }) {
  return (
    <svg className="spin" width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"
         style={{ flex: 'none' }}>
      <path d="M12 3a9 9 0 1 1-9 9" />
    </svg>
  );
}

// Small hook: closes a popover when the user clicks outside it.
export function useClickOutside(ref, onClose) {
  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, onClose]);
}

export function Icon({ name, size = 16, stroke = 1.6, fill, style, className }) {
  const path = ICONS[name];
  if (!path) return <span style={{ width: size, height: size }}>{`[${name}?]`}</span>;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={fill || 'none'}
         stroke={fill ? 'none' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
         style={{ flex: 'none', ...style }} aria-hidden="true">
      {path}
    </svg>
  );
}

// ── Avatar — initials on a warm paper tint (DESIGN §8) ──────────────────────
export function Avatar({ initials, size = 28, accent }) {
  const safe = (initials || '??').slice(0, 2);
  const n = ((safe.charCodeAt(0) + safe.charCodeAt(safe.length - 1)) % 6) + 1;
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: accent ?? `var(--avatar-${n}-bg)`,
      color: accent ? 'var(--accent-fg)' : `var(--avatar-${n}-fg)`,
      boxShadow: accent ? 'none' : 'inset 0 0 0 1px var(--border-subtle)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 600, fontSize: Math.round(size * 0.38), letterSpacing: '0.01em',
      fontFamily: 'var(--font-sans)',
      flex: 'none', userSelect: 'none',
    }}>{safe}</div>
  );
}

// ── Badge — legacy API, rendered as a soft chip (DESIGN §8) ─────────────────
export function Badge({ children, variant = 'neutral', size = 'md' }) {
  const PAD = size === 'sm' ? '1px 7px' : '2px 8px';
  const FS = size === 'sm' ? 10.5 : 11.5;
  const tones = {
    primary:   { fg: 'var(--badge-primary-fg)',   bg: 'var(--badge-primary-bg)',   dot: 'var(--badge-primary-dot)' },
    secondary: { fg: 'var(--badge-secondary-fg)', bg: 'var(--badge-secondary-bg)', dot: 'var(--badge-secondary-dot)' },
    used:      { fg: 'var(--badge-used-fg)',      bg: 'var(--badge-used-bg)',      dot: 'var(--badge-used-dot)' },
    notused:   { fg: 'var(--badge-notused-fg)',   bg: 'var(--badge-notused-bg)',   dot: 'var(--badge-notused-dot)' },
    pending:   { fg: 'var(--badge-pending-fg)',   bg: 'var(--badge-pending-bg)',   dot: 'var(--badge-pending-dot)' },
    danger:    { fg: 'var(--danger)',  bg: 'var(--danger-bg)',  dot: 'var(--danger)' },
    success:   { fg: 'var(--success)', bg: 'var(--success-bg)', dot: 'var(--success)' },
    warning:   { fg: 'var(--warning)', bg: 'var(--warning-bg)', dot: 'var(--warning)' },
    info:      { fg: 'var(--accent)',  bg: 'var(--accent-glow)', dot: 'var(--accent)' },
    neutral:   { fg: 'var(--text-muted)', bg: 'var(--surface-2)', dot: 'var(--text-faint)' },
  }[variant] ?? { fg: 'var(--text-muted)', bg: 'var(--surface-2)', dot: 'var(--text-faint)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: PAD, borderRadius: 999, background: tones.bg, color: tones.fg,
      fontSize: FS, fontWeight: 500, lineHeight: 1.35, letterSpacing: '0.01em',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: tones.dot, flex: 'none' }} />
      {children}
    </span>
  );
}

// ── WI-6 status taxonomy (server-computed enum) ─────────────────────────────
// The string keys are the verbatim values the API emits on team/detail/admin
// DTOs; the frontend only maps state → chip, never re-derives the logic.
// `variant` is the legacy Badge tone (kept for compat); `tone`/`icon` are the
// ledger mapping per DESIGN §3 (status is never color alone — always icon too).
export const STATUS_META = {
  NotStarted:       { label: 'Not started',       variant: 'neutral', tone: 'neutral', icon: 'circle' },
  InProgress:       { label: 'In progress',       variant: 'info',    tone: 'info',    icon: 'half'   },
  AwaitingApproval: { label: 'Awaiting approval', variant: 'pending', tone: 'warning', icon: 'clock'  },
  ActionNeeded:     { label: 'Action needed',     variant: 'danger',  tone: 'danger',  icon: 'alert'  },
  Complete:         { label: 'Complete',          variant: 'used',    tone: 'success', icon: 'check'  },
};

// Resolve a raw status string to its meta. Unknown → NotStarted tone, raw value
// as label (a new server state degrades gracefully instead of vanishing).
export function statusMeta(status) {
  const meta = STATUS_META[status];
  if (meta) return meta;
  return { ...STATUS_META.NotStarted, label: status || STATUS_META.NotStarted.label };
}

const CHIP_TONES = {
  neutral: { fg: 'var(--text-muted)', bg: 'var(--surface-2)' },
  info:    { fg: 'var(--accent)',     bg: 'var(--accent-glow)' },
  warning: { fg: 'var(--warning)',    bg: 'var(--warning-bg)' },
  danger:  { fg: 'var(--danger)',     bg: 'var(--danger-bg)' },
  success: { fg: 'var(--success)',    bg: 'var(--success-bg)' },
};

// Five-state member status as a soft chip: icon + label, tinted bg, no heavy
// border (stamps stay special for review verdicts — DESIGN §5).
export function StatusChip({ status, size = 'md' }) {
  const { label, tone, icon } = statusMeta(status);
  const t = CHIP_TONES[tone] ?? CHIP_TONES.neutral;
  const sm = size === 'sm';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: sm ? '1px 7px' : '2px 9px', borderRadius: 999,
      background: t.bg, color: t.fg,
      fontSize: sm ? 10.5 : 11.5, fontWeight: 500, lineHeight: 1.4,
      whiteSpace: 'nowrap',
    }}>
      <Icon name={icon} size={sm ? 10 : 12} stroke={2} />
      {label}
    </span>
  );
}

// ── Stamp — the signature status element (DESIGN §5) ────────────────────────
// <Stamp tone="success|danger|warning|info|neutral" label="APPROVED" icon animate />
// Uppercase mono, 1.5px solid border in the tone color, tone-bg fill. Pass
// `animate` when the status just changed in-session to play the stamp settle.
const STAMP_TONES = {
  success: { fg: 'var(--success)',    bg: 'var(--success-bg)', icon: 'check' },
  danger:  { fg: 'var(--danger)',     bg: 'var(--danger-bg)',  icon: 'x' },
  warning: { fg: 'var(--warning)',    bg: 'var(--warning-bg)', icon: 'clock' },
  info:    { fg: 'var(--accent)',     bg: 'var(--accent-glow)', icon: 'info' },
  neutral: { fg: 'var(--text-muted)', bg: 'var(--surface-2)',  icon: 'minus' },
};
export function Stamp({ tone = 'neutral', label, icon = true, animate = false, title, style }) {
  const t = STAMP_TONES[tone] ?? STAMP_TONES.neutral;
  const iconName = typeof icon === 'string' ? icon : (icon ? t.icon : null);
  return (
    <span className={animate ? 'stamp-in' : undefined} title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 4,
      border: `1.5px solid ${t.fg}`, background: t.bg, color: t.fg,
      fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 500,
      letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1.5,
      whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
      ...style,
    }}>
      {iconName && <Icon name={iconName} size={11} stroke={2.4} />}
      {label}
    </span>
  );
}

// ── SectionHeader — the 11px uppercase ledger label row ─────────────────────
// Optional `right` slot renders inline at the end of the row (counts, actions).
// Optional `rule` adds the 1px ledger underline (DESIGN §4).
export function SectionHeader({ children, right, rule = false, style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 10,
      ...(rule ? { borderBottom: '1px solid var(--rule)', paddingBottom: 6 } : null),
      ...style,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-muted)',
      }}>
        {children}
      </div>
      {right != null && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{right}</div>}
    </div>
  );
}

// ── Card — flat paper panel, hairline border, soft shadow ───────────────────
export function Card({ children, pad = 16, radius, interactive = false, onClick, style }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={interactive ? () => setHovered(true) : undefined}
      onMouseLeave={interactive ? () => setHovered(false) : undefined}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${interactive && hovered ? 'var(--border-hover)' : 'var(--border)'}`,
        borderRadius: radius ?? 'var(--radius-card)',
        boxShadow: 'var(--shadow-sm)',
        padding: pad,
        cursor: interactive ? 'pointer' : undefined,
        transition: 'border-color .15s ease-out',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── TriToggle — Used / Not used as an explicit segmented control ────────────
// Same API as before: value true|false|null, onChange(next|null).
export function TriToggle({ value, onChange, size = 'md', labels, disabled = false, style }) {
  const opts = [
    { v: true,  label: labels?.[0] ?? 'Used',     icon: 'check', bg: 'var(--toggle-used-bg)',    fg: 'var(--toggle-used-fg)' },
    { v: false, label: labels?.[1] ?? 'Not used', icon: 'x',     bg: 'var(--toggle-notused-bg)', fg: 'var(--toggle-notused-fg)' },
  ];
  const H = size === 'sm' ? 24 : 28;
  return (
    <div role="group" aria-label="Usage attestation" style={{
      display: 'inline-flex', gap: 2, padding: 2,
      background: 'var(--surface)', borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
      opacity: disabled ? 0.6 : 1,
      ...style,
    }}>
      {opts.map(({ v, label, icon, bg, fg }) => {
        const active = value === v;
        return (
          <button key={String(v)} type="button" disabled={disabled} aria-pressed={active}
            onClick={() => { if (!disabled) onChange(active ? null : v); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              height: H, padding: `0 ${size === 'sm' ? 8 : 10}px`,
              border: 0, cursor: disabled ? 'not-allowed' : 'pointer',
              background: active ? bg : 'transparent',
              color: active ? fg : 'var(--text-muted)',
              boxShadow: active ? `inset 0 0 0 1px color-mix(in oklab, ${fg}, transparent 60%)` : 'none',
              fontWeight: active ? 600 : 500, fontSize: 12,
              borderRadius: 'calc(var(--radius) - 2px)',
              transition: 'background .15s ease-out, color .15s ease-out',
              fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}>
            <Icon name={icon} size={12} stroke={2.2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Progress — animated, tone-aware ─────────────────────────────────────────
// `color` (legacy) wins over `tone` ('accent'|'success'|'warning'|'danger').
export function Progress({ value, max = 1, color, tone = 'accent', height = 4 }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const toneColor = {
    accent: 'var(--accent)', success: 'var(--success)',
    warning: 'var(--warning)', danger: 'var(--danger)',
  }[tone] ?? 'var(--accent)';
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}
      style={{ width: '100%', height, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{
        width: `${pct * 100}%`, height: '100%', borderRadius: 999,
        background: color || toneColor, transition: 'width .4s ease-out',
      }} />
    </div>
  );
}

// ── Button — primary / outline / ghost / danger · sm / md · loading ─────────
export function Button({
  variant = 'outline', size = 'md', icon, children, onClick, style,
  type = 'button', disabled, loading = false, title, className, 'aria-label': ariaLabel,
}) {
  const [hovered, setHovered] = useState(false);
  const H = size === 'sm' ? 26 : 32;
  const variants = {
    primary: {
      bg: hovered ? 'var(--accent-2)' : 'var(--accent)',
      fg: 'var(--accent-fg)',
      border: hovered ? 'var(--accent-2)' : 'var(--accent)',
      weight: 600,
    },
    outline: {
      bg: hovered ? 'var(--surface-2)' : 'var(--surface)',
      fg: 'var(--text)',
      border: hovered ? 'var(--border-hover)' : 'var(--border)',
      weight: 500,
    },
    ghost: {
      bg: hovered ? 'var(--surface-2)' : 'transparent',
      fg: 'var(--text-muted)',
      border: 'transparent',
      weight: 500,
    },
    danger: {
      bg: hovered ? 'color-mix(in oklab, var(--danger-bg), var(--danger) 8%)' : 'var(--danger-bg)',
      fg: 'var(--danger)',
      border: 'var(--danger-border)',
      weight: 600,
    },
  };
  const v = variants[variant] ?? variants.outline;
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: H, padding: `0 ${size === 'sm' ? 10 : 12}px`,
        background: v.bg, color: v.fg, border: `1px solid ${v.border}`,
        borderRadius: 'var(--radius)', fontFamily: 'inherit',
        fontSize: size === 'sm' ? 12 : 13, fontWeight: v.weight,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: disabled && !loading ? 0.55 : 1,
        transition: 'background .15s ease-out, border-color .15s ease-out',
        whiteSpace: 'nowrap', ...style,
      }}
    >
      {loading ? <Spinner size={size === 'sm' ? 11 : 13} /> : (icon && <Icon name={icon} size={size === 'sm' ? 13 : 14} />)}
      {children}
    </button>
  );
}

// ── SearchBar ────────────────────────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder = 'Search tools…', width, style }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, width: width ?? 'auto',
      height: 32, padding: '0 10px', borderRadius: 'var(--radius)',
      background: 'var(--surface)',
      border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
      boxShadow: focused ? '0 0 0 3px var(--accent-glow)' : 'none',
      color: 'var(--text-muted)',
      transition: 'border-color .15s ease-out, box-shadow .15s ease-out',
      ...style,
    }}>
      <Icon name="search" size={14} />
      <input value={value || ''} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        aria-label={placeholder}
        style={{
          flex: 1, minWidth: 0, height: '100%', border: 0, background: 'transparent',
          outline: 'none', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
        }} />
    </div>
  );
}

// ── Combobox — searchable / typeahead select (DESIGN §8) ────────────────────
// Drop-in replacement for a native <select> when the option list is long enough
// that scrolling is painful (managers ~1000, clients, tools). Looks like the
// app's inputStyle trigger; clicking opens a portal'd popover with an
// auto-focused filter input + a scrollable, keyboard-navigable listbox.
//
// Props:
//   value       — currently-selected option value (string|number); '' / null = empty
//   onChange(v) — called with the picked option's `value` (the empty option's
//                 value when the empty row is chosen)
//   options     — [{ value, label, hint? }]  hint = muted secondary text (e.g. an ID)
//   placeholder — shown on the trigger when nothing is selected
//   disabled    — render non-interactive
//   emptyOption — { value, label } first row representing the null/empty choice
//                 (e.g. { value: '', label: '— No manager —' }). Omit for none.
//   emptyMessage— text for the "no matches" row (default 'No matches')
//   ariaLabel   — accessible name for the trigger
//   style       — extra style merged onto the trigger
//
// In-modal safety: the popover is portal'd to <body> and absolutely positioned
// under the trigger from a measured rect, so the Modal's `overflow:auto` body
// never clips it and its z-index (1300) layers above the dialog (1100). The
// rect is re-measured on scroll/resize while open.
const COMBOBOX_INPUT = {
  width: '100%', boxSizing: 'border-box', height: 34, padding: '0 12px',
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none',
};

export function Combobox({
  value, onChange, options = [], placeholder = 'Select…', disabled = false,
  emptyOption, emptyMessage = 'No matches', ariaLabel, style,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const baseId = useId();

  // The full option set, with the empty/clear row (if any) prepended.
  const allOptions = useMemo(() => (
    emptyOption ? [{ ...emptyOption, _empty: true }, ...options] : options
  ), [emptyOption, options]);

  const selected = useMemo(
    () => allOptions.find((o) => String(o.value) === String(value ?? '')),
    [allOptions, value],
  );

  // Case-insensitive substring match over label AND hint.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter((o) => {
      const label = String(o.label ?? '').toLowerCase();
      const hint = String(o.hint ?? '').toLowerCase();
      return label.includes(q) || hint.includes(q);
    });
  }, [allOptions, query]);

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, []);

  const close = useCallback(() => { setOpen(false); setQuery(''); }, []);

  // Close on outside click (trigger AND portal'd popover both count as inside).
  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (triggerRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      close();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  // Escape must close ONLY the popover, never the enclosing Modal. Both the
  // popover's filter input and the Modal's focus-trap listen for Escape; the
  // Modal traps it on `document` (capture). Listening on `window` (capture)
  // fires first in the capture descent, so we swallow Escape before it reaches
  // the Modal whenever the popover is open.
  useEffect(() => {
    if (!open) return undefined;
    function onKeyCapture(e) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      close();
      triggerRef.current?.focus();
    }
    window.addEventListener('keydown', onKeyCapture, true);
    return () => window.removeEventListener('keydown', onKeyCapture, true);
  }, [open, close]);

  // Keep the popover glued under the trigger on scroll/resize.
  useEffect(() => {
    if (!open) return undefined;
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  // The popover is not mounted until the trigger has been measured. Wait for
  // both states before focusing so typing works immediately on the first open.
  const popoverReady = open && rect != null;
  useEffect(() => {
    if (!popoverReady) return;
    inputRef.current?.focus();
    const idx = filtered.findIndex((o) => String(o.value) === String(value ?? ''));
    setActive(idx >= 0 ? idx : 0);
  }, [popoverReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new search starts at its first match; arrow keys can move from there.
  useEffect(() => {
    if (query) setActive(0);
  }, [query]);

  // Clamp + keep the highlighted row in view as the result count changes.
  useEffect(() => {
    setActive((a) => Math.min(Math.max(a, 0), Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const node = listRef.current.querySelector(`[data-idx="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function choose(opt) {
    onChange?.(opt.value);
    close();
    triggerRef.current?.focus();
  }

  function openMenu(initialQuery = '') {
    if (disabled) return;
    setQuery(initialQuery);
    setOpen(true);
  }

  function onTriggerKey(e) {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu();
    } else if (e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      openMenu(e.key);
    }
  }

  function onInputKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) choose(opt);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      triggerRef.current?.focus();
    } else if (e.key === 'Tab') {
      close();
    }
  }

  const listboxId = `${baseId}-listbox`;
  const triggerLabel = selected ? selected.label : placeholder;
  const showPlaceholder = !selected || selected._empty;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKey}
        style={{
          ...COMBOBOX_INPUT,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          borderColor: open ? 'var(--accent)' : 'var(--border)',
          boxShadow: open ? '0 0 0 3px var(--accent-glow)' : 'none',
          transition: 'border-color .15s ease-out, box-shadow .15s ease-out',
          ...style,
        }}
      >
        <span style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: showPlaceholder ? 'var(--text-faint)' : 'var(--text)',
        }}>
          {triggerLabel}
        </span>
        <Icon name="chevdown" size={14} stroke={2}
          style={{ color: 'var(--text-muted)', flex: 'none', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease-out' }} />
      </button>

      {open && rect && createPortal(
        <div
          ref={popRef}
          className="pop-in"
          style={{
            position: 'fixed', zIndex: 1300,
            top: rect.bottom + 4, left: rect.left, width: rect.width,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{ padding: 6, borderBottom: '1px solid var(--border-subtle)', flex: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 9px',
              borderRadius: 'var(--radius)', background: 'var(--surface-2)',
              color: 'var(--text-muted)',
            }}>
              <Icon name="search" size={13} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Type to filter…"
                aria-label="Filter options"
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-activedescendant={filtered[active] ? `${baseId}-opt-${active}` : undefined}
                style={{
                  flex: 1, minWidth: 0, height: '100%', border: 0, background: 'transparent',
                  outline: 'none', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-sans)',
                }}
              />
            </div>
          </div>
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            style={{ listStyle: 'none', margin: 0, padding: 4, maxHeight: 260, overflowY: 'auto' }}
          >
            {filtered.length === 0 && (
              <li role="presentation" style={{
                padding: '10px 10px', fontSize: 12.5, color: 'var(--text-faint)', textAlign: 'center',
              }}>{emptyMessage}</li>
            )}
            {filtered.map((opt, i) => {
              const isSel = String(opt.value) === String(value ?? '');
              const isActive = i === active;
              return (
                <li
                  key={`${opt.value}-${i}`}
                  id={`${baseId}-opt-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); choose(opt); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 9px', borderRadius: 'var(--radius)', cursor: 'pointer',
                    background: isActive ? 'var(--surface-2)' : 'transparent',
                  }}
                >
                  <span style={{
                    flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontSize: 13, fontWeight: isSel ? 600 : 500,
                    color: opt._empty ? 'var(--text-muted)' : 'var(--text)',
                    fontStyle: opt._empty ? 'italic' : 'normal',
                  }}>{opt.label}</span>
                  {opt.hint != null && opt.hint !== '' && (
                    <span style={{
                      flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 11,
                      color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                    }}>{opt.hint}</span>
                  )}
                  {isSel && <Icon name="check" size={14} stroke={2.4} style={{ color: 'var(--accent)', flex: 'none' }} />}
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── SegmentedControl — exclusive option picker (DESIGN §8) ──────────────────
// options: [{ id, label, icon? }] · value: active id · onChange(id)
export function SegmentedControl({ options = [], value, onChange, size = 'md', ariaLabel, style }) {
  const H = size === 'sm' ? 24 : 28;
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{
      display: 'inline-flex', gap: 2, padding: 2,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', ...style,
    }}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button key={opt.id} type="button" role="radio" aria-checked={active}
            onClick={() => onChange?.(opt.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              height: H, padding: `0 ${size === 'sm' ? 8 : 11}px`,
              border: 0, borderRadius: 'calc(var(--radius) - 2px)',
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: active ? 'var(--shadow-sm), inset 0 0 0 1px var(--border)' : 'none',
              fontFamily: 'inherit', fontSize: size === 'sm' ? 11.5 : 12,
              fontWeight: active ? 600 : 500, cursor: 'pointer',
              transition: 'background .15s ease-out, color .15s ease-out',
              whiteSpace: 'nowrap',
            }}>
            {opt.icon && <Icon name={opt.icon} size={12} stroke={2} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── KpiCard — overline label + Fraunces numeral + optional sub/delta ────────
// <KpiCard label="Tools left" value={7} sub="of 31 total" delta={{ text:'-3 today', tone:'success' }} />
export function KpiCard({ label, value, sub, delta, tone, style }) {
  const toneColor = CHIP_TONES[tone]?.fg;
  return (
    <Card pad={18} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, ...style }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 500, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--text-faint)', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 540,
          lineHeight: 1, color: toneColor ?? 'var(--text)',
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
        }}>{value}</span>
        {delta && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
            color: CHIP_TONES[delta.tone]?.fg ?? 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
          }}>{delta.text ?? delta}</span>
        )}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{sub}</div>}
    </Card>
  );
}

// ── Skeleton — shimmer placeholder block ────────────────────────────────────
export function Skeleton({ width = '100%', height = 14, radius, style }) {
  return <div className="skeleton" aria-hidden="true"
    style={{ width, height, borderRadius: radius ?? 'var(--radius)', flex: 'none', ...style }} />;
}

// ── EmptyState — Fraunces heading + muted line + optional action ────────────
export function EmptyState({ icon = 'search', title, message, action, style }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      gap: 8, padding: '48px 24px', ...style,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 999, marginBottom: 6,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-faint)',
      }}>
        <Icon name={icon} size={19} />
      </div>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 560,
        lineHeight: 1.1, color: 'var(--text)',
      }}>{title}</div>
      {message && <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 380, lineHeight: 1.5 }}>{message}</div>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

// ── Tooltip — 350ms delay, ink panel ────────────────────────────────────────
// Wraps its child in an inline-flex span; shows on hover/focus.
export function Tooltip({ label, children, side = 'top', delay = 350, style }) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const show = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), delay); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  useEffect(() => () => clearTimeout(timer.current), []);
  const pos = {
    top:    { bottom: 'calc(100% + 7px)', left: '50%', transform: 'translateX(-50%)' },
    bottom: { top: 'calc(100% + 7px)', left: '50%', transform: 'translateX(-50%)' },
    left:   { right: 'calc(100% + 7px)', top: '50%', transform: 'translateY(-50%)' },
    right:  { left: 'calc(100% + 7px)', top: '50%', transform: 'translateY(-50%)' },
  }[side] ?? {};
  return (
    <span onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      style={{ position: 'relative', display: 'inline-flex', ...style }}>
      {children}
      {open && label && (
        <span role="tooltip" className="pop-in" style={{
          position: 'absolute', zIndex: 1200, ...pos,
          background: 'var(--text)', color: 'var(--bg)',
          fontSize: 11, fontWeight: 500, lineHeight: 1.4, fontFamily: 'var(--font-sans)',
          padding: '4px 8px', borderRadius: 4, whiteSpace: 'nowrap',
          boxShadow: 'var(--shadow-pop)', pointerEvents: 'none',
        }}>{label}</span>
      )}
    </span>
  );
}

// ── Focus trap shared by Modal + Drawer ─────────────────────────────────────
const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
function useFocusTrap(active, panelRef, onClose) {
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.activeElement;
    const panel = panelRef.current;
    const els = panel?.querySelectorAll(FOCUSABLE);
    (els && els.length ? els[0] : panel)?.focus?.();
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
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
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}

function OverlayHeader({ id, title, onClose }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '14px 16px', borderBottom: '1px solid var(--border)', flex: 'none',
    }}>
      <div id={id} style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', minWidth: 0 }}>{title}</div>
      <Button variant="ghost" size="sm" icon="x" onClick={onClose} aria-label="Close dialog"
        style={{ padding: '0 6px' }} />
    </div>
  );
}

// ── Modal — focus-trapped dialog (DESIGN §8) ────────────────────────────────
// <Modal open onClose title footer width> children scroll inside (max 90vh).
export function Modal({ open, onClose, title, children, footer, width = 520, bodyPad = 16 }) {
  const panelRef = useRef(null);
  const titleId = useId();
  useFocusTrap(open, panelRef, onClose);
  if (!open) return null;
  return createPortal(
    <div className="overlay-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(16,19,26,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="overlay-pop"
        style={{
          width: '100%', maxWidth: width, maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)',
          outline: 'none',
        }}>
        <OverlayHeader id={titleId} title={title} onClose={onClose} />
        <div style={{ padding: bodyPad, overflowY: 'auto', minHeight: 0 }}>{children}</div>
        {footer && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 8, flex: 'none',
            padding: '12px 16px', borderTop: '1px solid var(--border)',
          }}>{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Drawer — right-side detail panel (DESIGN §8) ────────────────────────────
export function Drawer({ open, onClose, title, children, footer, width = 460 }) {
  const panelRef = useRef(null);
  const titleId = useId();
  useFocusTrap(open, panelRef, onClose);
  if (!open) return null;
  return createPortal(
    <div className="overlay-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(16,19,26,.5)',
        display: 'flex', justifyContent: 'flex-end',
      }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="drawer-pop"
        style={{
          width: `min(${width}px, 94vw)`, height: '100%',
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow-pop)', outline: 'none',
        }}>
        <OverlayHeader id={titleId} title={title} onClose={onClose} />
        <div style={{ padding: 16, overflowY: 'auto', minHeight: 0, flex: 1 }}>{children}</div>
        {footer && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 8, flex: 'none',
            padding: '12px 16px', borderTop: '1px solid var(--border)',
          }}>{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Toasts — stacked top-right, aria-live polite (DESIGN §8) ────────────────
// Wrap the app in <ToastProvider>. Components call:
//   const toasts = useToasts();
//   toasts.success('Saved'); toasts.error('Failed', { title: 'Upload' });
//   toasts.push({ tone, message, title?, duration? }) → id; toasts.dismiss(id)
// Errors/blockers stay 6s, the rest 3.5s. Safe no-op outside a provider.
const ToastContext = createContext(null);
const NOOP_TOASTS = {
  push: () => 0, dismiss: () => {},
  success: () => 0, error: () => 0, warning: () => 0, info: () => 0,
};

const TOAST_ICON = { success: 'check', danger: 'alert', warning: 'clock', info: 'info', neutral: 'info' };

export function ToastHost({ toasts, onDismiss }) {
  return createPortal(
    <div aria-live="polite" style={{
      position: 'fixed', top: 16, right: 16, zIndex: 1400,
      display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380, width: 'calc(100vw - 32px)',
      pointerEvents: 'none',
    }}>
      {toasts.map((t) => {
        const tone = CHIP_TONES[t.tone] ?? CHIP_TONES.neutral;
        return (
          <div key={t.id} role="status" className="toast" style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderLeft: `3px solid ${tone.fg}`,
            borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)',
            padding: '10px 10px 10px 12px', pointerEvents: 'auto',
          }}>
            <span style={{ color: tone.fg, marginTop: 1, flex: 'none' }}>
              <Icon name={TOAST_ICON[t.tone] ?? 'info'} size={15} stroke={2} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {t.title && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.title}</div>}
              <div style={{ fontSize: 12.5, color: t.title ? 'var(--text-muted)' : 'var(--text)', lineHeight: 1.45, overflowWrap: 'break-word' }}>
                {t.message}
              </div>
            </div>
            <button type="button" onClick={() => onDismiss(t.id)} aria-label="Dismiss notification"
              style={{
                border: 0, background: 'transparent', color: 'var(--text-faint)',
                cursor: 'pointer', padding: 2, display: 'inline-flex', flex: 'none', borderRadius: 4,
              }}>
              <Icon name="x" size={13} stroke={2} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const push = useCallback(({ tone = 'info', message, title, duration }) => {
    const id = ++seq.current;
    const ms = duration ?? (tone === 'danger' ? 6000 : 3500);
    setToasts((list) => [...list.slice(-4), { id, tone, message, title }]);
    timers.current.set(id, setTimeout(() => dismiss(id), ms));
    return id;
  }, [dismiss]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);

  const api = useMemo(() => ({
    push,
    dismiss,
    success: (message, opts) => push({ tone: 'success', message, ...opts }),
    error:   (message, opts) => push({ tone: 'danger', message, ...opts }),
    warning: (message, opts) => push({ tone: 'warning', message, ...opts }),
    info:    (message, opts) => push({ tone: 'info', message, ...opts }),
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToasts() {
  return useContext(ToastContext) ?? NOOP_TOASTS;
}

// ── SortHeader — <th> with aria-sort + direction affordance (DESIGN §8) ─────
// <SortHeader label="Name" active={sortKey==='name'} dir={sortDir} onSort={...} />
export function SortHeader({ label, children, active = false, dir = 'asc', onSort, align = 'left', width, style, band = false }) {
  const ariaSort = active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none';
  // `band` opts into the flat header-strip look (mono caps on a --surface-2 band
  // with a hairline rule) so the header reads as a deliberate band, matching the
  // associate tool table.
  const thBand = band ? { background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' } : null;
  return (
    <th aria-sort={ariaSort} style={{ padding: 0, textAlign: align, width, ...thBand, ...style }}>
      <button type="button" onClick={onSort}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: band ? '9px 0' : '6px 0', border: 0, background: 'transparent', cursor: 'pointer',
          fontFamily: band ? 'var(--font-mono)' : 'inherit',
          fontSize: band ? 10.5 : 11, fontWeight: 600,
          letterSpacing: band ? '0.08em' : '0.06em', textTransform: 'uppercase',
          color: active ? 'var(--text)' : (band ? 'var(--text-faint)' : 'var(--text-muted)'),
        }}>
        {label ?? children}
        {active
          ? <Icon name={dir === 'desc' ? 'chevdown' : 'chevup'} size={11} stroke={2.4} />
          : <Icon name="sort" size={11} stroke={2} style={{ opacity: 0.4 }} />}
      </button>
    </th>
  );
}

// ── CycleRuler — time elapsed start→due with a tick at "today" (DESIGN §7) ──
// Feed it the CycleDto App already loads: { cycleName, startDate, endDate,
// dueDate, daysLeft }. Track shifts accent → warning (≤50% time left) → danger
// (overdue). Dates are ISO yyyy-mm-dd strings.
function parseIsoDate(s) {
  if (!s) return null;
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmtShort(d) {
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase() : '';
}

export function CycleRuler({ cycle, style }) {
  if (!cycle) return null;
  const start = parseIsoDate(cycle.startDate);
  const due = parseIsoDate(cycle.dueDate);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  let pct = null;
  if (start && due && due > start) {
    pct = Math.max(0, Math.min(1, (today - start) / (due - start)));
  }
  const daysLeft = cycle.daysLeft ?? (due ? Math.round((due - today) / 86400000) : 0);
  const overdue = daysLeft < 0;
  const leftFrac = pct == null ? 1 : 1 - pct;
  const toneColor = overdue ? 'var(--danger)' : (leftFrac > 0.5 ? 'var(--accent)' : 'var(--warning)');
  const fillPct = overdue ? 100 : (pct == null ? 0 : pct * 100);

  const label = overdue
    ? `OVERDUE BY ${Math.abs(daysLeft)} DAY${Math.abs(daysLeft) === 1 ? '' : 'S'}`
    : `${daysLeft} DAY${daysLeft === 1 ? '' : 'S'} LEFT`;

  return (
    <div style={{ ...style }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6,
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap', overflow: 'hidden',
      }}>
        <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          CYCLE {cycle.cycleName}
        </span>
        {due && <><span aria-hidden="true">·</span><span>DUE {fmtShort(due)}</span></>}
        <span aria-hidden="true">·</span>
        <span style={{ color: toneColor, fontWeight: 500 }}>{label}</span>
      </div>
      <div aria-hidden="true" style={{
        position: 'relative', height: 3, borderRadius: 999,
        background: 'var(--border)',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${fillPct}%`, borderRadius: 999,
          background: toneColor, transition: 'width .4s ease-out',
        }} />
        {pct != null && !overdue && (
          <span title="Today" style={{
            position: 'absolute', top: -3, height: 9, width: 2, borderRadius: 1,
            left: `calc(${pct * 100}% - 1px)`,
            background: toneColor,
            boxShadow: '0 0 0 2px var(--bg)',
          }} />
        )}
      </div>
    </div>
  );
}

// ── CycleMenu — cycle picker popover (used by AppShell's header) ────────────
export function CycleMenu({ cycle, cycles, onCycle, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  const hasMenu = Array.isArray(cycles) && cycles.length > 0 && typeof onCycle === 'function';
  if (!cycle) return null;

  return (
    <div ref={ref} style={{ position: 'relative', flex: 'none' }}>
      <button
        type="button"
        onClick={() => hasMenu && setOpen((v) => !v)}
        disabled={!hasMenu}
        aria-haspopup={hasMenu ? 'listbox' : undefined}
        aria-expanded={hasMenu ? open : undefined}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          height: 28, padding: '0 10px', borderRadius: 'var(--radius)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', cursor: hasMenu ? 'pointer' : 'default',
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
          letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        }}
      >
        <Icon name="calendar" size={12} />
        <span style={{ color: 'var(--text)' }}>{cycle.cycleName}</span>
        <span style={{ width: 1, height: 12, background: 'var(--border)' }} />
        <span>DUE {fmtShort(parseIsoDate(cycle.dueDate)) || cycle.dueDate}</span>
        <span style={{
          padding: '0 6px', borderRadius: 4, fontSize: 10.5, fontWeight: 500,
          border: `1px solid ${cycle.daysLeft < 0 ? 'var(--danger-border)' : 'var(--warning-border)'}`,
          background: cycle.daysLeft < 0 ? 'var(--danger-bg)' : 'var(--warning-bg)',
          color: cycle.daysLeft < 0 ? 'var(--danger)' : 'var(--warning)',
        }}>{cycle.daysLeft < 0 ? `${-cycle.daysLeft}D OVER` : `${cycle.daysLeft}D LEFT`}</span>
        {hasMenu && <Icon name="chevdown" size={11} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {open && hasMenu && (
        <div className="pop-in" style={{
          position: 'absolute', top: 'calc(100% + 6px)', [align]: 0, zIndex: 60,
          minWidth: 300,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 12px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--text-muted)',
            background: 'var(--surface-2)', borderBottom: '1px solid var(--rule)',
          }}>Switch cycle</div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {cycles.map((c) => {
              const active = c.cycleID === cycle.cycleID;
              return (
                <button key={c.cycleID} type="button"
                  onClick={() => { onCycle(c); setOpen(false); }}
                  style={{
                    display: 'flex', width: '100%', textAlign: 'left',
                    padding: '10px 12px', gap: 10, alignItems: 'center',
                    background: active ? 'var(--accent-glow)' : 'transparent',
                    border: 0, borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
                      fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
                    }}>{c.cycleName}</div>
                    <div style={{
                      fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2,
                      fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
                    }}>
                      {c.startDate} → {c.endDate} · DUE {c.dueDate}
                    </div>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 500,
                    padding: '0 6px', borderRadius: 4, whiteSpace: 'nowrap',
                    border: `1px solid ${c.daysLeft < 0 ? 'var(--border)' : 'var(--warning-border)'}`,
                    background: c.daysLeft < 0 ? 'var(--surface-2)' : 'var(--warning-bg)',
                    color: c.daysLeft < 0 ? 'var(--text-muted)' : 'var(--warning)',
                  }}>
                    {c.daysLeft < 0 ? `${-c.daysLeft}D AGO` : `${c.daysLeft}D LEFT`}
                  </span>
                  {active && <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ProfileMenu — identity + sign-out popover ───────────────────────────────
// `direction="up"` pops the menu above the trigger (rail bottom usage);
// `compact` renders an avatar-only trigger (collapsed rail).
export function ProfileMenu({ user, isManager, onLogout, direction = 'down', compact = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'User';
  const initials = fullName.slice(0, 2).toUpperCase();
  const vert = direction === 'up' ? { bottom: 'calc(100% + 8px)' } : { top: 'calc(100% + 6px)' };

  return (
    <div ref={ref} style={{ position: 'relative', flex: 'none' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={compact ? `Account · ${fullName}` : undefined}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: compact ? 3 : '4px 10px 4px 4px',
          width: compact ? undefined : '100%',
          borderRadius: compact ? 999 : 'var(--radius)',
          border: '1px solid var(--border)', background: 'var(--surface)',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <Avatar initials={initials} size={24} />
        {!compact && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, textAlign: 'left', minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName}</span>
              <span style={{
                fontSize: 9.5, color: 'var(--text-faint)', whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums',
              }}>ID {user.associateId}</span>
            </div>
            <Icon name={direction === 'up' ? 'chevup' : 'chevdown'} size={12}
              style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease-out' }} />
          </>
        )}
      </button>

      {open && (
        <div role="menu" className="pop-in" style={{
          // Rail menus (direction 'up', incl. collapsed/compact) sit against the LEFT
          // screen edge, so anchor left:0 and grow rightward. A header menu (direction
          // 'down') anchors right:0. Anchoring right:0 in the rail overflowed the
          // viewport's left edge and clipped the popover (the avatar got cut off).
          position: 'absolute', ...vert,
          ...((direction === 'up' || compact) ? { left: 0 } : { right: 0 }),
          zIndex: 60,
          minWidth: 260,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 14px 12px', display: 'flex', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            <Avatar initials={initials} size={40} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{fullName}</div>
              <div style={{
                fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2,
                fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums',
              }}>ASSOCIATE ID {user.associateId}</div>
              <div style={{ marginTop: 7 }}>
                <Stamp tone={isManager ? 'info' : 'neutral'} icon={false}
                  label={user.superUserRole ? String(user.superUserRole) : (isManager ? 'Manager' : 'Analyst')} />
              </div>
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onLogout?.(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '11px 14px',
              background: 'transparent', border: 0, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
              color: 'var(--danger)', textAlign: 'left',
            }}
          >
            <Icon name="logout" size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ── TopBar — Phase 1 COMPAT SHIM ────────────────────────────────────────────
// The app chrome (logo, role nav, cycle picker, theme toggle, profile) moved
// into <AppShell>. The old views still mount <TopBar> as their first child, so
// this now renders only the piece the shell can't own — the view's search box —
// and renders nothing at all when the view doesn't search. Phase 2 view agents:
// delete your <TopBar> usage (and this shim once no view imports it).
export function TopBar({ search, onSearch }) {
  if (typeof onSearch !== 'function') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 24px 0', flex: 'none' }}>
      <SearchBar value={search} onChange={onSearch} width={280} />
    </div>
  );
}
