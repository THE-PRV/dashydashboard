// Shared atoms — ported from the prototype's ui.jsx
import React, { useEffect, useRef, useState } from 'react';
import brandLogo from '../assets/broadridge-logo.svg';

const ICONS = {
  search:   <path d="M11 3a8 8 0 1 0 5.2 14.1l3.85 3.85 1.4-1.4-3.85-3.85A8 8 0 0 0 11 3Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z" />,
  check:    <path d="M5 12.5 9.5 17 19 7" />,
  x:        <path d="M5 5l14 14M19 5L5 19" />,
  chevdown: <path d="M5 8.5 12 15.5l7-7" />,
  chevright:<path d="M9 5l7 7-7 7" />,
  chevleft: <path d="M15 5l-7 7 7 7" />,
  filter:   <path d="M3 5h18l-7 9v5l-4 2v-7L3 5z" />,
  plus:     <path d="M12 5v14M5 12h14" />,
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
};

// Small hook: closes a popover when the user clicks outside it.
function useClickOutside(ref, onClose) {
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

export function Avatar({ initials, size = 28, accent }) {
  const hue = (initials.charCodeAt(0) + initials.charCodeAt(1 % initials.length)) * 17 % 360;
  const bg = accent ?? `oklch(0.62 0.13 ${hue})`;
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: bg, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 600, fontSize: size * 0.4, letterSpacing: '-0.02em',
      flex: 'none',
    }}>{initials}</div>
  );
}

export function Badge({ children, variant = 'neutral', size = 'md' }) {
  const PAD = size === 'sm' ? '1px 6px' : '2px 8px';
  const FS = size === 'sm' ? 10.5 : 11.5;
  const tones = {
    primary:   { fg: 'var(--badge-primary-fg)',   bg: 'var(--badge-primary-bg)',   dot: 'var(--badge-primary-dot)' },
    secondary: { fg: 'var(--badge-secondary-fg)', bg: 'var(--badge-secondary-bg)', dot: 'var(--badge-secondary-dot)' },
    used:      { fg: 'var(--badge-used-fg)',      bg: 'var(--badge-used-bg)',      dot: 'var(--badge-used-dot)' },
    notused:   { fg: 'var(--badge-notused-fg)',   bg: 'var(--badge-notused-bg)',   dot: 'var(--badge-notused-dot)' },
    pending:   { fg: 'var(--badge-pending-fg)',   bg: 'var(--badge-pending-bg)',   dot: 'var(--badge-pending-dot)' },
    danger:    { fg: 'var(--danger-fg)', bg: 'var(--danger-bg)', dot: 'var(--danger-fg)' },
    neutral:   { fg: 'var(--text-muted)', bg: 'var(--surface-2)', dot: 'var(--text-muted)' },
  }[variant] ?? { fg: 'var(--text-muted)', bg: 'var(--surface-2)', dot: 'var(--text-muted)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: PAD, borderRadius: 999, background: tones.bg, color: tones.fg,
      fontSize: FS, fontWeight: 500, lineHeight: 1.3, letterSpacing: '0.005em',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: tones.dot, flex: 'none' }} />
      {children}
    </span>
  );
}

export function TriToggle({ value, onChange, size = 'md', labels, disabled = false, style }) {
  const opts = [
    { v: true,  label: labels?.[0] ?? 'Used',     icon: 'check' },
    { v: false, label: labels?.[1] ?? 'Not used', icon: 'x' },
  ];
  const H = size === 'sm' ? 24 : 28;
  return (
    <div style={{
      display: 'inline-flex', gap: 2, padding: 2,
      background: 'var(--surface-2)', borderRadius: 8,
      border: '1px solid var(--border)',
      ...style,
    }}>
      {opts.map(({ v, label, icon }) => {
        const active = value === v;
        return (
          <button key={String(v)} disabled={disabled} onClick={() => { if (!disabled) onChange(active ? null : v); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              height: H, padding: `0 ${size === 'sm' ? 8 : 10}px`,
              border: 0, cursor: disabled ? 'not-allowed' : 'pointer',
              background: active ? (v ? 'var(--toggle-used-bg)' : 'var(--toggle-notused-bg)') : 'transparent',
              color: active ? (v ? 'var(--toggle-used-fg)' : 'var(--toggle-notused-fg)') : 'var(--text-muted)',
              fontWeight: active ? 600 : 500, fontSize: 12,
              borderRadius: 6, transition: 'background .12s, color .12s',
              fontFamily: 'inherit',
            }}>
            <Icon name={icon} size={12} stroke={2.2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Progress({ value, max = 1, color, height = 4 }) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div style={{ width: '100%', height, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color || 'var(--accent)', transition: 'width .25s' }} />
    </div>
  );
}

export function Button({ variant = 'outline', size = 'md', icon, children, onClick, style, type = 'button', disabled }) {
  const [hovered, setHovered] = React.useState(false);
  const H = size === 'sm' ? 26 : 32;
  const variants = {
    primary: {
      bg: hovered ? 'var(--accent-2)' : 'var(--accent)',
      fg: 'var(--accent-fg)',
      border: hovered ? 'var(--accent-2)' : 'var(--accent)',
    },
    outline: {
      bg: hovered ? 'var(--surface-2)' : 'var(--surface)',
      fg: 'var(--text)',
      border: 'var(--border)',
    },
    ghost: {
      bg: hovered ? 'var(--surface-2)' : 'transparent',
      fg: 'var(--text-muted)',
      border: 'transparent',
    },
  };
  const v = variants[variant] ?? variants.outline;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: H, padding: `0 ${size === 'sm' ? 10 : 12}px`,
        background: v.bg, color: v.fg, border: `1px solid ${v.border}`,
        borderRadius: 8, fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background .12s, border-color .12s',
        whiteSpace: 'nowrap', ...style,
      }}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

export function SearchBar({ value, onChange, placeholder = 'Search tools…', width }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, width: width ?? 'auto',
      height: 32, padding: '0 10px', borderRadius: 8,
      background: 'var(--surface)', border: '1px solid var(--border)',
      color: 'var(--text-muted)',
    }}>
      <Icon name="search" size={14} />
      <input value={value || ''} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder}
        style={{
          flex: 1, minWidth: 0, height: '100%', border: 0, background: 'transparent',
          outline: 'none', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
        }} />
    </div>
  );
}

function CycleMenu({ cycle, cycles, onCycle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  const hasMenu = Array.isArray(cycles) && cycles.length > 0 && typeof onCycle === 'function';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => hasMenu && setOpen((v) => !v)}
        disabled={!hasMenu}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          height: 28, padding: '0 10px', borderRadius: 999,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', fontSize: 11.5, fontWeight: 500,
          cursor: hasMenu ? 'pointer' : 'default', fontFamily: 'inherit',
        }}
      >
        <Icon name="clock" size={12} />
        <span style={{ color: 'var(--text)' }}>{cycle.cycleName}</span>
        <span style={{ width: 1, height: 12, background: 'var(--border)' }} />
        <span>Due {cycle.dueDate}</span>
        <span style={{
          padding: '1px 6px', borderRadius: 999, fontSize: 10.5, fontWeight: 600,
          background: 'var(--warning-bg)', color: 'var(--warning-fg)',
        }}>{cycle.daysLeft}d left</span>
        {hasMenu && <Icon name="chevdown" size={11} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {open && hasMenu && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
          minWidth: 280,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 12px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--text-muted)',
            background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
          }}>Switch cycle</div>
          {cycles.map((c) => {
            const active = c.cycleID === cycle.cycleID;
            return (
              <button key={c.cycleID}
                onClick={() => { onCycle(c); setOpen(false); }}
                style={{
                  display: 'flex', width: '100%', textAlign: 'left',
                  padding: '10px 12px', gap: 10, alignItems: 'center',
                  background: active ? 'color-mix(in oklab, var(--accent), transparent 92%)' : 'transparent',
                  border: 0, borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.cycleName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {c.startDate} → {c.endDate} · Due {c.dueDate}
                  </div>
                </div>
                <span style={{
                  fontSize: 10.5, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
                  background: c.daysLeft < 0 ? 'var(--surface-2)' : 'var(--warning-bg)',
                  color:      c.daysLeft < 0 ? 'var(--text-muted)' : 'var(--warning-fg)',
                  whiteSpace: 'nowrap',
                }}>
                  {c.daysLeft < 0 ? `${-c.daysLeft}d ago` : `${c.daysLeft}d left`}
                </span>
                {active && <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ user, isManager, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'User';
  const initials = fullName.slice(0, 2).toUpperCase();

  return (
    <div ref={ref} style={{ position: 'relative', flex: 'none' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px 4px 4px',
          borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <Avatar initials={initials} size={24} />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, textAlign: 'left' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fullName}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>ID · {user.associateId}</span>
        </div>
        <Icon name="chevdown" size={12}
          style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .12s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
          minWidth: 260,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 14px 12px', display: 'flex', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            <Avatar initials={initials} size={40} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{fullName}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>Associate ID · {user.associateId}</div>
              <div style={{ marginTop: 6 }}>
                <Badge variant={isManager ? 'primary' : 'secondary'} size="sm">
                  {isManager ? 'Manager' : 'Analyst'}
                </Badge>
              </div>
            </div>
          </div>
          <button
            onClick={() => { setOpen(false); onLogout?.(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '11px 14px',
              background: 'transparent', border: 0, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
              color: 'var(--danger-fg)', textAlign: 'left',
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

export function TopBar({ user, cycle, cycles, onCycle, onLogout, search, onSearch, isManager, isSuperAdmin = false, role, onRole, dark, onDark }) {
  const canOpenUserDirectory = user?.superUserRole === 'Admin';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '14px 24px',
      borderBottom: '1px solid var(--side-border)', background: 'var(--side-bg)',
      flex: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
        <img src={brandLogo} alt="Broadridge" style={{ height: 19, display: 'block', filter: 'brightness(0) invert(1)' }} />
        <span style={{ width: 1, height: 20, background: 'var(--side-border)' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--side-faint)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Access Review</span>
      </div>

      {cycle && <CycleMenu cycle={cycle} cycles={cycles} onCycle={onCycle} />}

      {/* View toggle — only shown to managers */}
      {isManager && onRole && (
        <div style={{
          display: 'inline-flex', padding: 2,
          background: 'var(--side-pill-bg)', border: '1px solid var(--side-pill-border)', borderRadius: 8,
          gap: 2,
        }}>
          {[
            ...(isSuperAdmin ? [{ id: 'superadmin', label: 'Admin Dashboard' }] : []),
            { id: 'agent',   label: 'Associate view' },
            { id: 'manager', label: 'Manager view' },
            { id: 'access',  label: 'Access' },
            ...(canOpenUserDirectory ? [{ id: 'admin', label: 'Users' }] : []),
          ].map((opt) => {
            const active = role === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => onRole(opt.id)}
                style={{
                  height: 28, padding: '0 12px',
                  border: 0, borderRadius: 6, cursor: 'pointer',
                  background: active ? 'var(--side-pill-active-bg)' : 'transparent',
                  color: active ? 'var(--side-pill-active-fg)' : 'var(--side-pill-fg)',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: active ? 600 : 500,
                  letterSpacing: '-0.01em',
                  transition: 'background .12s, color .12s',
                  whiteSpace: 'nowrap',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {onSearch && <SearchBar value={search} onChange={onSearch} width={260} />}

      {/* Dark mode toggle */}
      {onDark && (
        <button
          onClick={() => onDark(!dark)}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            width: 32, height: 32, borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text-muted)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flex: 'none', transition: 'background .12s, border-color .12s',
          }}
        >
          <Icon name={dark ? 'sun' : 'moon'} size={14} />
        </button>
      )}

      {user && <ProfileMenu user={user} isManager={isManager} onLogout={onLogout} />}
    </div>
  );
}
