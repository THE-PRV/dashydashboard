# UI Overhaul — Execution Plan (orchestration, sub-agents, verification)

Companion to `ui-overhaul-spec.md` (the WHAT). This document is the HOW. You are the
**orchestrator**: you do recon, sequencing, integration, and verification yourself; **all
implementation is done by sub-agents** (owner's standing rule — never implement inline). Match each
sub-agent's model to task difficulty as specified below.

---

## 0. Ground rules for the orchestrator

- Work on a new branch `feature/ui-overhaul` off `main`.
- **First action**: `git diff` the uncommitted `ManagerView.jsx` change (owner's abandoned dispute
  fix). Decide salvage-vs-revert, record the decision, and start the branch from a clean, deliberate
  state.
- Sub-agents that edit **disjoint file sets** may run in parallel. Sub-agents that would touch the
  same file run sequentially — do NOT rely on luck. The shared-components file
  (`components/ui.jsx`, `ScreenshotGallery.jsx`) is frozen after Phase 1: later agents consume, never
  edit, the shared primitives (if a later agent needs a primitive change, it reports back and YOU
  route a small follow-up to one agent).
- Give every sub-agent: the spec path, this file's relevant phase section, the exact WI numbers it
  owns, the list of files it may touch, and the instruction to report deviations instead of
  improvising around blockers.
- Commit per phase (small, reviewable commits; message states which WIs). `git commit -F <file>`
  for multi-line messages.
- After every phase: `dotnet build` + `npm run build` (in `DashyDashboard.Frontend`) must be green
  before the next phase starts.

## 1. Phases and sub-agents

Nine implementation sub-agents + one review sub-agent, across five phases. Models: **Opus 4.8**
(`claude-opus-4-8`) for hard/cross-cutting work, **Sonnet 4.6** (`claude-sonnet-4-6`) for
well-scoped mechanical work.

### Phase 0 — Recon (orchestrator, inline; no sub-agents)
Read spec + CLAUDE.md; diff the dirty `ManagerView.jsx`; read the six key frontend files and the
four key backend services; confirm the spec's line anchors still hold. Produce a short internal
file-ownership map for the phases below. (~15 min)

### Phase 1 — Foundations (2 agents, PARALLEL — disjoint: backend vs frontend)

| Agent | Model | Owns | Scope |
|---|---|---|---|
| **A — Backend semantics** | Opus 4.8 | WI-1 (gates), WI-6 (status enum, server side), WI-7 (reopen endpoint), WI-4 (backend root-cause) | `AttestationService.cs`, `ScreenshotCompletion.cs`, `ManagerService.cs`, `AdminService.cs`, controllers, DTOs. Adds the five-state status to team/detail/admin DTOs + exports; fixes/equips dispute DTOs; reopen endpoint + AttestationLogs row; unit-style verification via direct service calls if a test harness exists, else via HTTP in Phase 4. |
| **B — Shared UI kit** | Opus 4.8 | WI-5 (lightbox), WI-11 (primitives), WI-3's `FullScreenOverlay` shell | `components/ui.jsx`, `ScreenshotGallery.jsx` (upgrade `Lightbox`/`ReviewLightbox` to true full-screen + keyboard nav + in-lightbox approve/reject), new `FullScreenOverlay.jsx`, shared StatusChip with the five WI-6 states. Touches NO view files. |

Barrier: both must finish + builds green. Commit.

### Phase 2 — Views (3 agents, PARALLEL — one view file each)

| Agent | Model | Owns | Scope |
|---|---|---|---|
| **C — Manager view** | Opus 4.8 | WI-3, WI-4 (frontend), WI-6/7 (manager UI) | `ManagerView.jsx` + `api/manager.js`. Compact card, full-screen overlay, disputes render, status chips, reopen button. |
| **D — Admin view** | Opus 4.8 | WI-8, WI-6/7 (admin UI) | `AdminView.jsx` (2290 lines — the hardest frontend file) + `api/admin.js`. Overlay drill-down, lightbox review, status chips incl. donut/chip contradiction, reopen. |
| **E — Agent (associate) view** | Sonnet 4.6 | WI-1 (inline remark UX), WI-2 | `AgentView.jsx`, `ScreenshotCell.jsx`, `RemarksModal.jsx` if needed, `api/attestations.js`. Inline-required remark on not-used; hide strip; corner view button → shared lightbox. |

Barrier: all three + builds green. Commit.

### Phase 3 — New surfaces & data (2 agents, PARALLEL — disjoint)

| Agent | Model | Owns | Scope |
|---|---|---|---|
| **F — Cycle gallery** | Sonnet 4.6 | WI-9 | New `CycleGallery.jsx` (consumes Phase-1 overlay/lightbox), new backend listing endpoint reusing zip scoping, top-bar buttons in Manager/Admin (small, well-marked insertions — coordinate: C and D each leave a `{/* WI-9 mount point */}` comment). |
| **G — Seed data** | Sonnet 4.6 | WI-10 | `SeedData.cs` (+ fixture ingestion via `ScreenshotStorageService`). Configurable fixture source defaulting to `Y:\checksum`. Must cover every WI-6 state, disputes, the not-used-with-old-screenshot case. |

Barrier: builds green, re-seed runs clean twice (idempotency). Commit.

### Phase 4 — Verification (orchestrator + 1 agent)

1. **Orchestrator smoke run**: Kestrel per spec constraint 3, seeded DB, then verify over HTTP with
   `X-User-Id` for three personas (an associate, their manager, the admin PRV001):
   - WI-1: submit blocked w/o not-used remark; succeeds w/o not-used screenshot.
   - WI-6: each of the five states appears for the designated seeded member in team + admin + export.
   - WI-7: reopen → edit → resubmit round-trip; log row present (query local SQL).
   - WI-4: disputes listed for seeded disputers; counts agree everywhere.
   - WI-9: gallery listing matches zip manifest for the same caller.
2. **UI verification**: if a browser-driving path exists (the repo has `userguide/capture.cjs` as
   precedent), capture the redesigned screens — manager compact card, overlay, lightbox, admin
   drill-down, gallery, agent not-used row — and include the images in the final report. If
   browser automation is unavailable, say so explicitly; do not claim visual verification you
   didn't do.
3. **Agent H — Code review** | Opus 4.8 | Reviews the full branch diff for: gate-logic mistakes
   (the WI-1 exemption interacting with post-due-date rules and `ScreenshotCompletion`),
   authorization holes in reopen + gallery listing (must not leak beyond review scope — mirror the
   404-not-403 convention), state-precedence bugs in WI-6, and frontend regressions in untouched
   views. Findings fixed by a follow-up sub-agent (not inline), then re-verify the affected items.

### Phase 5 — Close-out (orchestrator)
Final commit; summary report: WIs done, deviations, review findings + resolutions, screenshots,
what was NOT verified. Then hand the owner the elevated step: run `deploy-dev.ps1` in an admin
PowerShell, and open `http://localhost/dashydashboard/` (trailing slash matters). Do not merge to
`main` — the owner merges after eyeballing the deployed result.

## 2. Workflow tooling

If the executing harness has the multi-agent `Workflow` tool and the owner has opted in, Phases 1–3
map naturally onto it (one `phase()` each, `parallel()` within a phase, barriers between). Otherwise
plain `Agent`-tool spawns with explicit waits at the barriers are fine — the phase structure above
is the contract, not the tooling.

## 3. Estimates

| Metric | Estimate |
|---|---|
| Sub-agents | 9–11 (A–H + up to 2 fix-up agents) |
| Wall clock | 3–5 h (Phase 2 dominated by Admin view; Phase 4 ~45 min) |
| New/changed files | ~18–22 (3 views, 5–6 components, 4 services, 3 controllers, 3 api/*.js, DTOs, SeedData) |
| Schema migrations | 0 expected |
| New endpoints | 2 (reopen, gallery listing) |

If anything forces a schema migration or a third new endpoint, pause and tell the owner before
proceeding.

## 4. Definition of success

1. All 11 WI acceptance criteria in the spec pass and are demonstrated in the final report
   (HTTP evidence for behavior, screenshots for UI where possible).
2. `dotnet build`, `npm run build` (production mode), and `dotnet publish … -o publish-dev` all green.
3. Code-review agent's blocking findings: zero open.
4. No diffs to prod-targeted config files; no credentials; no IIS/elevated operations attempted.
5. Seeded dev DB demonstrates every status, disputes, and real screenshot images end-to-end.
6. The owner can run `deploy-dev.ps1` and see the new UI at `http://localhost/dashydashboard/`.
