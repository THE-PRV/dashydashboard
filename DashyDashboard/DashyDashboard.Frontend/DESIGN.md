# DashyDashboard Design System — "The Ledger"

This is the binding design contract for the `feature/ui-revamp` redesign. Every view and
component MUST follow it. When in doubt, match the tokens and primitives in
`src/index.css` + `src/components/ui.jsx` — never invent ad-hoc colors, fonts, or spacing.

## 1. Concept

Attestation is the act of signing a record. The interface is a **modern ledger**: warm
paper surfaces, ink-navy text, hairline rules, tabular numerals, and statuses rendered as
**ink stamps** — bordered, uppercase, monospaced — not pastel pills. Calm, precise,
trustworthy. Density stays high (this is a daily-use compliance tool), but hierarchy is
carried by typography and rules, not boxes inside boxes.

Tone: refined editorial-financial. Restraint everywhere, with two signature moments:
the serif display numerals on KPIs, and the stamp "settle" animation on approve/reject.

## 2. Typography

Loaded in `index.html` from Google Fonts (replaces Geist):

| Role | Font | Usage |
|------|------|-------|
| Display | **Fraunces** (wght 450–640, opsz auto) | Page titles, hero KPI numerals, empty-state headings, login title. NEVER for body/UI text. |
| UI / body | **Schibsted Grotesk** (400/500/600/700) | Everything else. |
| Data | **Spline Sans Mono** (400/500) | IDs, dates, counts, table numerics, stamps, cycle names. Always `font-variant-numeric: tabular-nums`. |

CSS vars: `--font-display`, `--font-sans`, `--font-mono`.

Scale (px): 10.5 (stamp/overline), 11 (label — uppercase, 600, letter-spacing .06em),
12 (secondary), 13 (body default), 14 (emphasis), 16 (card title), 22 (section title,
display), 28 (page title, display), 34/40 (hero numerals, display, weight 560).
Line-height: 1.45 body, 1.1 display.

## 3. Color

All via CSS custom properties in `src/index.css`, themed with `:root` (light) and
`:root[data-theme="dark"]`. Components read vars only — no hex literals in JSX
(exception: chart/donut series may use the defined accent ramp vars).

### Light — "paper"
```
--bg:            #F6F5F1   (warm paper)
--surface:       #FFFFFF
--surface-2:     #EFEDE6   (warm raised/hover)
--text:          #161D2E   (ink)
--text-muted:    #5D6473
--text-faint:    #8B909B
--border:        #E2DFD6   (warm hairline)
--rule:          #D6D2C6   (stronger ledger rule, e.g. table header underline)
--accent:        #24418F   (ink blue — primary actions, links, focus)
--accent-2:      #1A3170   (hover)
--accent-fg:     #FFFFFF
--accent-glow:   rgba(36,65,143,.12)
--success:       #1E7B4D   --success-bg: #E4F2E9   --success-border: #BFE0CC
--warning:       #95661D   --warning-bg: #FAF0DC   --warning-border: #EAD9B4
--danger:        #A02C3B   --danger-bg:  #FAEAEC   --danger-border:  #EFC4CA  (oxblood — sealing wax)
--info:          var(--accent)  --info-bg: var(--accent-glow)
```

### Dark — "night ledger"
```
--bg: #13161D   --surface: #1B1F28   --surface-2: #242936
--text: #E8E6DF (paper-toned)  --text-muted: #9CA1AC  --text-faint: #6E7480
--border: #2B3140   --rule: #353C4D
--accent: #8FA7EE  --accent-2: #A9BCF4  --accent-fg: #10131A  --accent-glow: rgba(143,167,238,.16)
--success: #5CC58C  --success-bg: rgba(92,197,140,.13)  --success-border: rgba(92,197,140,.35)
--warning: #D9A84E  --warning-bg: rgba(217,168,78,.13)  --warning-border: rgba(217,168,78,.35)
--danger:  #E27684  --danger-bg:  rgba(226,118,132,.13) --danger-border: rgba(226,118,132,.35)
```

### Status mapping (5-state member status + 3-state screenshot)
Statuses ALWAYS pair an icon with color (never color alone):

| State | Color base | Icon |
|-------|-----------|------|
| Not started | neutral (muted) | circle outline |
| In progress | accent/info | half-circle |
| Awaiting approval | warning | clock |
| Action needed / Rejected | danger | alert-triangle |
| Complete / Approved | success | check |
| Screenshot Pending | warning | clock |

## 4. Surfaces, spacing, depth

- Radius: `--radius: 6px` (controls), `--radius-card: 10px` (cards/modals), `999px` pills.
  Squarer than before — print-like.
- Spacing grid of 4: use 4/8/12/16/20/24/32. Page gutter 24 (16 below 900px).
- Cards: `--surface`, 1px `--border`, `--shadow-sm: 0 1px 2px rgba(22,29,46,.05)`.
  Elevation only for overlays: `--shadow-pop: 0 8px 28px rgba(22,29,46,.14), 0 2px 8px rgba(22,29,46,.08)`.
- Ledger rules: section/table headers get a 1px `--rule` underline; prefer rules over
  boxed-in containers for sub-grouping.
- Tables: header row = 11px uppercase label style + rule underline; rows separated by
  `--border-subtle: color-mix(in oklab, var(--border), transparent 45%)`; row hover =
  `--surface-2`. Numeric/ID columns in `--font-mono`. Lead rows with a faint mono row
  index where it aids scanning (agent tool table).
- Background atmosphere: `body` gets an EXTREMELY subtle paper grain via a tiny inline
  SVG `feTurbulence` data-URI at ~3% opacity (light) / 2% (dark). No gradients-on-white.

## 5. Stamps (signature status element)

`<Stamp tone="success|danger|warning|info|neutral" label="APPROVED" icon />`:
uppercase, `--font-mono` 10.5px weight 500, letter-spacing .08em, 1.5px solid border in
the tone color, tone-bg fill, 4px radius, padding 2px 8px. Tones use the status vars.
When a status CHANGES to Approved/Rejected in-session, play `stamp-in`:
`scale(1.18) rotate(-3deg) → scale(1) rotate(0)`, 260ms cubic-bezier(.2,1.4,.5,1).
StatusChip (5-state) keeps a softer chip look (icon + label, tinted bg, no heavy border)
so stamps stay special for review verdicts.

## 6. Motion

150–200ms ease-out for hovers/toggles; 260ms for overlays (fade + 8px translateY).
Page mount: cards/sections stagger in (opacity 0→1, translateY 6px→0, 50ms steps, max 6
steps). Progress bars animate width 400ms ease-out. Respect
`@media (prefers-reduced-motion: reduce)` — disable all transforms/animations.

## 7. App shell (all roles — replaces per-view TopBars)

`<AppShell>` owns chrome; views render content only.

- **Left rail** (230px, `--surface`, 1px right border; NOT navy): logo block (Fraunces
  "Attest" wordmark + Broadridge sub-label), role-aware nav (icon + label; active =
  accent-tinted bg + 3px accent left bar), bottom: theme toggle + profile.
  Collapsible to 56px icon rail (state in localStorage `dashy.rail`). Below 900px:
  off-canvas overlay with hamburger.
- **Header bar** (content top): breadcrumb trail (e.g. `Admin / Equities / J. Smith`)
  set in mono 12px; right side: cycle picker + search (where the view supports it).
- **Cycle ruler**: under the header, a full-width 3px track showing time elapsed
  start→due with a marker at today; label `CYCLE 2026-Q2 · DUE JUN 30 · 17 DAYS LEFT`
  in mono 11px. Track color shifts: accent (>50% time left) → warning (≤50%) → danger
  (overdue). Present in every role view.
- Theme: persists to localStorage `dashy.theme`; defaults to light, and
  respects a saved preference.

## 8. Core primitives (ui.jsx — keep existing export names working)

Button (primary/outline/ghost/danger; sm/md; loading state with inline spinner),
SearchBar, Card, Badge (legacy API → render as soft chip), StatusChip (5-state, icon+label),
Stamp, TriToggle (restyled as segmented control with explicit labels), Progress (animated,
tone-aware), Avatar (initials, warm tints), Toast system (`useToasts`: stacked top-right,
tone icon, 6s for errors/blockers, 3.5s success, dismiss button, aria-live="polite"),
Modal (focus-trapped, Esc closes, returns focus, backdrop rgba(16,19,26,.5), max-height
90vh scroll body), EmptyState (Fraunces heading + muted line + optional action),
Skeleton (shimmer block for loading lists/thumbs), Tooltip (delay 350ms), KpiCard
(label overline + Fraunces numeral + optional delta/sub), SegmentedControl, Drawer
(right-side panel for detail views), DataTable helpers (SortHeader with aria-sort).

## 9. Accessibility (non-negotiable)

- Visible focus: `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` globally.
- Every icon-only control gets `aria-label`. Toggles use `role="radiogroup"`/`aria-pressed`.
- Modals/drawers: focus trap + `aria-modal` + labelled by their title; Esc closes.
- Blocking/validation rows: `aria-invalid`, and the blockers panel is `aria-live="polite"`.
- All text ≥ 4.5:1 contrast on its surface (the palette above is chosen for this — keep it).
- Tables: real `<table>` semantics or correct ARIA grid roles; sort buttons announce state.

## 10. Per-view UX mandates (the redesign's reason to exist)

**Agent**: hero = "what's left + due date" with Fraunces numerals; a **Blockers panel**
above the table listing every submission gate (missing screenshots, missing not-used
remarks, unanswered rows) with per-item "jump" that scrolls to + flash-highlights the row;
Submit button disabled-with-reason (tooltip) until clear. Row flow reads left→right as
questions: Access? → Used? → Proof/Reason. Inline remark input for not-used rows (no
modal hop); remark modal stays for long text. Screenshot cell: skeleton while thumb
loads, retry affordance on failure, paste/drag hints. After submit: lock edits visually.

**Manager**: top = **Action queue** card (pending screenshots oldest-first, rejected,
disputes) with one-click jump into a focused review flow (keyboard: A approve / R reject
/ arrows next-prev); team table sortable (name/progress/status); bulk approve per member
with confirm modal (not window.confirm); member detail in a Drawer, not page swap.

**Admin**: breadcrumb-driven drill-down (Overview → Dept → Manager → Member) with a real
Back affordance at each level; "at-risk" surfaces individuals, not just departments;
KPI band uses KpiCard; donuts/status lights re-skinned to ledger palette; rail is the
shared AppShell one (no bespoke navy sidebar). Add Tool/Client modals get "add another".

**Access/User mgmt**: same shell; tables get sort + mono data columns; grant flow as
Drawer with stepper (member → client → tools → dates); destructive actions (revoke) use
danger Modal with explicit consequence text.

## 11. Hard rules

- No new npm dependencies. React 18 + what exists. Icons = inline SVG (extend the ICONS map).
- Don't change any `src/api/*` call signatures or App.jsx ↔ view prop contracts unless
  the change is purely additive.
- Never hardcode hex in JSX; use the CSS vars.
- Keep `vite.config.js` base `./` and build output path untouched. Keep `.env.production` untouched.
- Light AND dark must both look finished — test both before calling work done.
- Density: this tool is used by people attesting 30+ tools; don't trade density for whitespace theater.
