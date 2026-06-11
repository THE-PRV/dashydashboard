# Build Plan — Screenshot Evidence + Access UserID/Export

**Status:** approved spec, ready to build. All decisions in these files are FINAL — do not re-litigate them.
**Read first:** `CLAUDE.md` (environment rules: this tree is DEV, session is non-elevated, never touch IIS/inetpub/machine env vars; verify under Kestrel only).

## What is being built

1. **Feature 1 — Access UserID + Export** (small): optional `ToolUserId` on access grants + an
   "Export accesses" .xlsx button. Spec: `plans/01-access-userid-export.md`.
2. **Feature 2 — Attestation Screenshots** (epic): one screenshot per attestation, uploaded by the
   associate (browser-compressed), approved/rejected by manager/GFH/GFHDelegate/Admin, with
   completion gating, zip export, and event-triggered email. Specs: `plans/02-…` through `plans/04-…`.
3. **Verification + documentation**: `plans/05-verify-and-docs.md`.

## Branch strategy (no GitHub, no PRs — local branches only)

| Order | Branch | Content |
|---|---|---|
| 1 | `feature/access-userid-export` | Feature 1. Build → verify → merge to `main`. |
| 2 | `feature/screenshots` | Feature 2 (all stages). Build → verify → merge to `main`. |

Feature 1 merges FIRST so each branch's EF migration lands in clean order.

## Sub-agent orchestration

All implementation goes through sub-agents — never inline. Stages run **sequentially** (shared
working tree). Use a stronger model (Opus-class) for S1/S2, standard (Sonnet-class) for S3–S5.

| Stage | Branch | Scope | Spec file |
|---|---|---|---|
| S0 | feature/access-userid-export | Feature 1, full stack | 01 |
| S1 | feature/screenshots | Schema + migration + config + ScreenshotStorageService | 02 (§1–§3) |
| S2 | feature/screenshots | All backend endpoints, gating, review, zip, logging | 02 (§4–§8) |
| S3 | feature/screenshots | Associate-side frontend | 03 (§A) |
| S4 | feature/screenshots | Reviewer-side frontend (manager + admin/GFH) | 03 (§B) |
| S5 | feature/screenshots | Email service + two event mails | 04 |
| S6 | feature/screenshots | End-to-end verification under Kestrel | 05 (§Verify) |
| S7 | feature/screenshots | CLAUDE.md update + Setup Guide PDF | 05 (§Docs) |

Each sub-agent's prompt must include: the spec file(s) to read, the branch to be on, and the
instruction to read `CLAUDE.md` environment rules first.

## Global constraints

- ASP.NET 7 API + EF Core 7 + SQL Server; React (Vite) frontend. Match existing code style and
  the design system in `src/components/ui.jsx`.
- Apply EF migrations to the LOCAL dev DB (`.\BANANALECLERC` / `DashyDashboardDev`) only. Never
  touch production or push to GitHub.
- No new NuGet/npm libraries except: MailKit (email) and SkiaSharp or Magick.NET (image
  decode/thumbnail). Explicitly forbidden: ImageSharp (licensing), System.Drawing (unsupported
  server-side), any Excel library (reuse `Common/XlsxExporter`).
- Roles: use existing `Common/SuperUserRoles.cs` constants (`Admin`, `GFH`, `GFHDelegate`, `IFH`).
- Logging: existing `AttestationLogs` table only. No new log tables, no ActivityLog.
