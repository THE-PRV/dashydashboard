# UI Overhaul & Workflow-Semantics Spec — DashyDashboard

Generated 2026-06-12 from a review session with the product owner (PRV). This document is the
**problem statement**: what is wrong, what the required behavior is, and what "done" means for each
item. The companion document `ui-overhaul-execution.md` says HOW to execute (branch, phases,
sub-agents, models, verification). Read both fully before writing any code.

**Decisions in this spec are final.** They were confirmed interactively with the owner. Do not
re-litigate them; if you hit a genuine contradiction with the code, note it in your final report and
pick the interpretation closest to the spec.

Owner's overall verdict on the current UI: *"duct-taped together."* The features work; the look,
the information architecture, and several workflow rules do not.

---

## Context you must internalize first

- Read `CLAUDE.md` (repo root) — especially the LOCAL IIS DEPLOY section (you are NOT elevated; never
  touch IIS/machine env vars) and the 2026-06-11 session notes (screenshot attestation feature,
  endpoints, completion semantics).
- Key code: `DashyDashboard/DashyDashboard.Frontend/src/views/{AgentView,ManagerView,AdminView}.jsx`
  (716 / 591 / 2290 lines), `src/components/{ScreenshotCell,ScreenshotGallery,RemarksModal,ui}.jsx`,
  `DashyDashboard/DashyDashboard.Api/Services/{AttestationService,ManagerService,AdminService,ScreenshotCompletion,ScreenshotStorageService}.cs`,
  `Controllers/{AttestationsController,ManagerController,AdminController}.cs`.
- **Uncommitted change exists**: `git status` shows `M ManagerView.jsx` — the owner attempted a
  dispute-display fix yesterday. Diff it first; salvage anything correct into WI-4, then make the
  branch state deliberate (commit or revert — no accidental carry-along).
- Terminology: a **dispute** (UI label "Access disputes") = a `ToolCycleAttestation` row with
  `HadAccess == false` ("I don't have access to this tool"). A **not-used** row =
  `HadAccess == true && UsedThisCycle == false`. A **used** row = `UsedThisCycle == true`.

---

## WI-1 — "Not used" rows: remark becomes mandatory, screenshot becomes exempt

**Problem.** Today the rules are backwards. `AttestationService.SubmitAllAsync`
(~line 232–253): the mandatory-remark check fires only for `HadAccess == false` rows, and the
screenshot gate requires a Pending/Approved screenshot for **every** answered `HadAccess == true`
row — including not-used ones. So an associate who says "I did not use this tool" is forced to
upload a screenshot (of what?) and is NOT forced to explain why they didn't use it.

**Required behavior.**
1. **Remark required for not-used** — enforced in BOTH places (owner chose "inline + submit gate"):
   - *Inline:* the moment the associate marks a row "Not used" in `AgentView`, a remark input
     appears for that row and is visibly required (highlight/asterisk/helper text). Reuse the
     existing remark plumbing (`RemarksModal` / `PUT .../remark`) — inline-first UX, not a buried
     menu item.
   - *Server gate:* `SubmitAllAsync` blocks submission if any `UsedThisCycle == false` row has an
     empty remark, with an error message naming the rule (same pattern as the existing no-access
     remark gate). Keep the existing no-access remark gate too.
2. **Screenshot NOT required for not-used** — the screenshot gate only applies to
   `UsedThisCycle == true` rows. Not-used rows join no-access rows as exempt. Update the
   `EnsureUploadAllowed` §7 rules and the gate comment accordingly.
3. **Completion semantics follow**: `ScreenshotCompletion` (and the Manager/Admin rollups + the
   incomplete-submissions export that use it) must treat not-used rows as screenshot-exempt, exactly
   like no-access rows. A member with all screenshots approved on *used* rows is Complete even if
   not-used rows have no screenshot.

**Acceptance.** Submitting with a not-used row lacking a remark → 400 with clear message. Submitting
with not-used rows that have remarks and no screenshots → succeeds (given used rows are covered).
Inline remark UI appears immediately on marking not-used.

## WI-2 — "Not used" rows: hide the screenshot strip; corner button opens existing screenshot

**Problem.** (Owner's screenshot: a not-used row showing a broken thumbnail + "Pending" +
"Re-upload" + "Attach".) When a row is marked not-used, the associate still sees the full
`ScreenshotCell` upload strip. It's noise and it implies an obligation that (after WI-1) no longer
exists.

**Required behavior.** In `AgentView`, for a not-used row:
- No upload/attach/re-upload affordances, no status chip, no thumbnail strip.
- If a screenshot was previously uploaded (e.g. uploaded while "Used", then flipped to not-used):
  show ONLY a small, unobtrusive icon button in the corner of the row that opens the screenshot
  in the full-screen lightbox (WI-5). No screenshot → nothing at all.
- Flipping back to "Used" restores the normal `ScreenshotCell`. Existing screenshot + its review
  state are kept (do not delete on flip).
- No-access rows keep their current "Not required" treatment.

**Acceptance.** Not-used row renders no upload UI; with a prior upload it renders exactly one small
view button that opens the full-screen viewer.

## WI-3 — Manager view: compact member panel + full-screen detail overlay

**Problem.** (Owner's screenshots: "Selected member" side panel.) The right-hand member panel is an
endless scroll — giant COMPLETION/STATUS cards, then per-client thumbnail grids, with ACCESS
DISPUTES somewhere below the fold. Owner: *"this side panel being extremely long and bad is
horrible … I hate it."*

**Required behavior.**
- The in-page panel becomes a **compact summary card** showing exactly:
  member name + associate ID, overall status chip (WI-6 taxonomy), per-client completion
  (client name + n/m + small progress bar), access-disputes count, screenshots-awaiting-approval
  count (and rejected count if > 0). No thumbnail grids in the panel. It should fit without
  scrolling for a typical member.
- Clicking the card (or an explicit "Open details" affordance) opens a **full-screen in-app
  overlay** — same page, no route change, covers the viewport (think modal takeover, dismiss with
  ✕ / Esc). The overlay contains the full experience: per-client progress, the screenshot review
  grid (approve/reject/approve-all, thumbnails → WI-5 lightbox), access disputes detail (WI-4),
  remarks, and the Reopen action (WI-7).
- Build the overlay as a reusable component (e.g. `FullScreenOverlay` in `components/`) because
  Admin (WI-8) and the gallery (WI-9) use the same pattern.

**Acceptance.** Panel fits on screen un-scrolled for a member with ~5 clients; overlay opens/closes
cleanly (Esc + ✕), no scroll-bleed to the page behind, and contains everything the old long panel had.

## WI-4 — Access disputes: actually show them (bug)

**Problem.** Owner: *"Access disputes is not showing the access disputes."* The section header
renders with a count, but the dispute contents the manager needs (who, which client/tool, their
remark) are missing/empty. There is a yesterday's uncommitted attempt in `ManagerView.jsx` — diff it.

**Required behavior.** Root-cause first — candidates: `ManagerService.GetMemberDetailAsync`'s
mismatch DTO mapping, the frontend `detail.mismatches` render (~line 588), or simply no
`HadAccess == false` rows in dev data (seed fix is WI-10; the code must still be proven correct).
Then: in the WI-3 overlay, disputes render as a proper list — tool name, client `name (id)`, the
associate's remark, and the date answered. The team-level dispute banner/count and the dispute
export must agree with what the detail shows.

**Acceptance.** With seeded disputes (WI-10), the manager overlay lists each dispute with
tool/client/remark; counts match between banner, panel card, overlay, and export.

## WI-5 — Full-screen screenshot lightbox everywhere

**Problem.** (Owner, re admin approval: *"I can't see even how big it is, two thumbs big maybe
three."*) `ScreenshotGallery.jsx` already has `Lightbox`/`ReviewLightbox` but they present small;
review thumbnails are ~200px and the decision UI doesn't let you actually inspect the evidence.

**Required behavior.** One shared lightbox component used by manager review, admin review, the
agent-side corner button (WI-2), and the gallery (WI-9):
- True full-screen (full viewport, dark backdrop), image fit-to-screen with the FULL image endpoint
  (`/screenshot`, not `/thumb`).
- Reviewer contexts get Approve / Reject (reason required) directly in the lightbox, plus
  prev/next navigation across the current set and filename/tool/client/status caption.
- Esc and backdrop-click close. Keyboard ←/→ navigate.

**Acceptance.** Clicking any thumbnail in any review surface opens the image at full viewport size;
approve/reject works from inside; arrows navigate.

## WI-6 — Five-state status taxonomy (kills "100% but In progress")

**Problem.** (Owner's screenshots: Prakhar 100% / "In progress"; admin Nadia "100% done" ring next
to an "In Progress" chip.) The completion-semantics change of 2026-06-11 made "Complete" require
approved screenshots, but the UI still collapses everything before that into "In progress" — so a
person who finished everything and is merely waiting on their manager looks identical to someone
half-done. The owner read this as a bug. It is a labeling failure.

**Required behavior.** ONE server-computed status enum, used by Manager view, Admin view, and all
exports (owner chose "five explicit states"):

| State | Definition (per associate, per cycle) | Suggested label / tone |
|---|---|---|
| `NotStarted` | no rows answered | "Not started" / neutral |
| `InProgress` | some answers, not submitted (incl. after reopen) | "In progress" / blue |
| `AwaitingApproval` | submitted; every used row has a screenshot; ≥1 Pending, none Rejected | "Awaiting approval" / amber |
| `ActionNeeded` | submitted; ≥1 Rejected screenshot | "Action needed" / red |
| `Complete` | submitted; all used-row screenshots Approved | "Complete" / green |

Precedence on mixed states: Rejected beats Pending (`ActionNeeded` > `AwaitingApproval`).
Compute it in one backend place (extend `ScreenshotCompletion` or a sibling helper) and expose it on
the team/detail/admin DTOs; the frontend maps state → chip, never re-derives logic. Update the
incomplete-submissions export's status column to the same taxonomy. Keep the donut/percent as a
separate visual — percent answers "how much", the chip answers "what's blocking".

**Acceptance.** A submitted member with pending screenshots shows "Awaiting approval" (not
"In progress") in manager list, member card, overlay, admin rollup, and exports. All five states
reachable with WI-10 seed data, each visually distinct.

## WI-7 — Reopen attestation (new capability)

**Problem.** Owner: *"When everything is done … I don't have any option to open access for them —
reopen attestation."* Submission is one-way; `SubmitAllAsync` hard-rejects a resubmit and nothing
can unlock a member.

**Required behavior** (owner chose "Manager + Admin, soft reopen"):
- New endpoint, e.g. `PUT /api/manager/team/{associateId}/reopen?cycleId=…` — authorized for the
  member's manager and for Admin (follow the existing review-scope authorization pattern; admin may
  need a sibling route — match existing controller conventions).
- Soft semantics: flip the member's Submitted rows for that cycle back to editable
  (`AttestationStatus` → "Pending", clear `SubmittedAt`). **Keep** all answers, remarks,
  screenshots, and screenshot review states (Approved stays Approved). Member's status becomes
  `InProgress` (WI-6). The associate can edit and resubmit; existing post-due-date upload rules
  still apply to screenshots.
- Write an `AttestationLogs` row ("Reopened by {reviewer}").
- UI: a "Reopen attestation" button (with confirm dialog) in the WI-3 manager overlay and the WI-8
  admin drill-down, visible only when the member is submitted (states `AwaitingApproval` /
  `ActionNeeded` / `Complete`).
- No email for this event (out of scope).

**Acceptance.** Manager reopens a Complete member → member shows In progress, associate can change
answers and resubmit, approved screenshots still approved, log row written. Non-manager/non-admin
caller → 403/404 per existing convention.

## WI-8 — Admin associate drill-down: same overlay + lightbox treatment

**Problem.** (Owner's screenshot: Nadia Huang page.) The admin per-associate screen is a long
in-page scroll with tiny thumbnails; approving evidence you can't see. Owner wants the same
interaction model as the manager side.

**Required behavior.** In `AdminView`'s associate drill-down: reuse the WI-3 overlay pattern and the
WI-5 lightbox for screenshot inspection/approval, the WI-6 status chip (fix the "100% done ring +
In Progress chip" contradiction), and the WI-7 reopen button. Keep the existing admin scoping rules
(admin sees all).

**Acceptance.** Admin can open any associate, see status per WI-6, inspect screenshots full-screen,
approve/reject from the lightbox, and reopen a submitted associate.

## WI-9 — In-app screenshot gallery for the cycle (zip button stays)

**Problem.** Owner on "Download all screenshots (cycle 2)": *"what do I do with it? How do I see
stuff like this?"* The only bulk view of evidence is a zip file.

**Required behavior** (owner chose "keep zip + add gallery"):
- Keep the zip button (relabel/tooltip it so its purpose is obvious, e.g. "Export screenshots (.zip)").
- Add a "View screenshots" action next to it (manager top bar; admin equivalent) opening a
  full-screen overlay gallery for the cycle, scoped exactly like the zip endpoint (manager →
  reports, admin → all): thumbnails grouped by member → client, filter chips
  All / Pending / Approved / Rejected, counts per filter, click → WI-5 lightbox with approve/reject
  and prev/next across the filtered set.
- Backend: prefer one new listing endpoint (e.g. `GET /api/manager/cycles/{cycleId}/screenshots`)
  returning the scoped metadata list, rather than N member-detail calls. Reuse the zip endpoint's
  scoping logic.

**Acceptance.** Manager opens gallery, filters to Pending, approves from the lightbox, counts
update; gallery contents match zip contents for the same caller.

## WI-10 — Seed data: every field, every state, real screenshot images

**Problem.** Owner: *"If I'm trying to test features, I need to see every single field populated."*
Dev data exercises almost nothing: no disputes, few screenshot states, statuses unreachable, so
bugs like WI-4 hide.

**Required behavior.** Extend `SeedData` (dev-only, idempotent — safe on every startup against
`DashyDashboardDev`):
- **Fixture images**: `Y:\checksum` holds `photo_1.jpg` … `photo_100.jpg` (~30–100 KB). Copy the
  repo-relevant subset into a checked-in or path-configured fixtures location the seeder reads
  (do NOT depend on `Y:\checksum` at runtime on other machines; make the source path configurable
  with `Y:\checksum` as the dev default). Ingest through `ScreenshotStorageService` (or equivalent
  logic) so disk layout `{root}\{cycle}\{associate}\{client}\{tool}.webp`, hashes, and thumbnails
  are real and the serving endpoints work.
- **State coverage**: for the active cycle, at least one member in each WI-6 state; disputes with
  remarks on ≥2 members; not-used rows with remarks (and one not-used row that still has an old
  screenshot, for WI-2); rejected screenshots with reasons; a fully-Complete member; one untouched
  member. Every nullable display field populated somewhere (emails, remarks, reviewer fields,
  ToolUserId, etc.).
- Document in the seed file header which seeded member demonstrates which state.

**Acceptance.** Fresh seed → every WI-6 status visible in manager+admin lists, disputes visible
(WI-4), gallery (WI-9) shows real images in all three review states, agent view shows a not-used
row with a corner view button.

## WI-11 — Light global visual polish (shared design language)

**Problem.** The "duct-taped" feel: every screen styles chips, buttons, cards, and spacing slightly
differently.

**Required behavior** (owner chose "targeted + light global polish"):
- Extract/define shared primitives in `components/ui.jsx` (or a sibling): status chip, button
  variants, card, section header, progress bar, overlay/lightbox chrome — consistent spacing,
  radii, type scale. The WI-3/5/8/9 work builds ON these primitives.
- Then a light sweep over the remaining views (Agent, Access Management, User Management, Admin
  main grid): swap ad-hoc styles to the shared primitives WITHOUT restructuring layouts. Screens
  the owner called fine (Users) must not change structurally — only consistency-level polish.
- No new CSS framework; stay with the existing styling approach.

**Acceptance.** Same chip/button/card rendering across all views; targeted screens look designed,
untouched screens look consistent; no layout regressions in views not named by this spec.

---

## Global constraints (apply to every work item)

1. **No schema migration unless unavoidable.** WI-1..9 are achievable with existing columns
   (statuses are computed; reopen flips `AttestationStatus`/`SubmittedAt`). If you genuinely need a
   migration, follow the existing EF pattern and apply to the local dev DB only.
2. **Never touch committed prod-targeted config** (`appsettings*.json`, `web.config`,
   `.env.production`) with local values; no credentials in the repo. (CLAUDE.md banner.)
3. **No IIS / machine-env / elevated operations.** Verify under Kestrel
   (`ASPNETCORE_ENVIRONMENT=Development`, `ASPNETCORE_URLS=http://127.0.0.1:5099`,
   `ConnectionStrings__Default` → local SQL, `X-User-Id` header auth). Final IIS deploy is the
   OWNER running `deploy-dev.ps1` — end your run by telling them so.
4. **Don't break existing contracts**: submit/upload/review/zip endpoints keep their routes and
   existing behavior except where this spec changes it; email gating (`Email:Enabled=false`)
   untouched; post-due-date rules untouched except not-used exemption.
5. **Frontend**: Vite build must remain `--mode production`-clean (`npm run build` green). Respect
   `VITE_API_URL` / `base: './'` sub-path setup. No new heavyweight UI dependencies.
6. **Windows/PowerShell footguns** (from prior sessions): `Remove-Item` on project paths is
   hook-blocked — use `git rm`/`git checkout`; multi-line commit messages via `git commit -F <file>`;
   don't strip UTF-8 BOM from `.ps1` files.
