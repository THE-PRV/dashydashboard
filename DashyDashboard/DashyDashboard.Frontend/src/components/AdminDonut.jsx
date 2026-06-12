import React from 'react';

/**
 * statusOf(pct) — maps a completion percentage to a status descriptor.
 * Thresholds match the mockup: <50 risk · 50–74 below · 75–89 ontrack · 90+ completed
 *
 * @param {number} pct - Percentage value (0–100)
 * @returns {{ key: string, label: string, varName: string }}
 */
export function statusOf(pct) {
  if (pct >= 90) return { key: 'completed', label: 'Completed',    varName: '--st-completed' };
  if (pct >= 75) return { key: 'ontrack',   label: 'On Track',     varName: '--st-ontrack'   };
  if (pct >= 50) return { key: 'below',     label: 'Below Target', varName: '--st-below'     };
  return               { key: 'risk',      label: 'At Risk',      varName: '--st-risk'      };
}

/**
 * AdminDonut — animated SVG donut chart component.
 *
 * Props:
 *   pct         {number}  Completion percentage (0–100)
 *   size        {number}  SVG width/height in px (default 96)
 *   strokeWidth {number}  Ring thickness in px (default 10)
 *   dark        {any}     Changing this prop re-reads CSS variables (for theme switches)
 */
export default function AdminDonut({ pct, size = 96, strokeWidth = 10, dark }) {
  // Geometry — matches the mockup's formula: r = (size - stroke) / 2 - 1.5
  const radius       = (size - strokeWidth) / 2 - 1.5;
  const circumference = 2 * Math.PI * radius;
  const arcLength    = circumference * (pct / 100);

  // Colors resolved from CSS custom properties so they respond to theme changes
  const [arcColor,   setArcColor]   = React.useState('#10b981');
  const [trackColor, setTrackColor] = React.useState('transparent');

  React.useLayoutEffect(() => {
    const style  = getComputedStyle(document.documentElement);
    const status = statusOf(pct);
    setArcColor(style.getPropertyValue(status.varName).trim()   || '#10b981');
    setTrackColor(style.getPropertyValue('--surface-2').trim()  || '#1a2130');
  }, [pct, dark]);

  // Ref on the arc circle for the stroke-dasharray animation
  const arcRef = React.useRef(null);

  React.useEffect(() => {
    if (!arcRef.current) return;

    // Reset to zero so the transition fires from the start on every pct change
    arcRef.current.setAttribute('stroke-dasharray', `0 ${circumference}`);

    // Double rAF ensures the browser has committed the reset before animating
    let raf2;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (arcRef.current) {
          arcRef.current.setAttribute(
            'stroke-dasharray',
            `${arcLength.toFixed(2)} ${(circumference - arcLength).toFixed(2)}`
          );
        }
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [pct, dark, arcLength, circumference]);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {/* SVG donut */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: 'block' }}
      >
        {/* Track circle — full ring, background color */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />

        {/* Arc circle — progress, starts at 12 o'clock via rotate(-90) */}
        <circle
          ref={arcRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={arcColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`0 ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: 'stroke-dasharray 0.9s cubic-bezier(.34,1.1,.4,1)',
          }}
        />
      </svg>

      {/* Centered text overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            fontSize: size * 0.18,
            fontWeight: 600,
            color: arcColor,
            lineHeight: 1,
          }}
        >
          {Math.round(pct)}%
        </span>
        <span
          style={{
            fontSize: size * 0.11,
            color: 'var(--text-muted)',
            marginTop: 2,
          }}
        >
          answered
        </span>
      </div>
    </div>
  );
}
