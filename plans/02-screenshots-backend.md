# Feature 2 — Screenshots: Schema, Storage & Backend

**Branch:** `feature/screenshots` · **Stages:** S1 (§1–§3), S2 (§4–§8)

**Core rule:** exactly ONE screenshot per attestation row `(CycleID, AssociateId, ClientID, ToolID)`.
Attestations marked no-access are EXEMPT. All other attestations require a screenshot to submit.

---

## §1. Schema (S1)

Add nullable columns to `ToolCycleAttestation` (one EF migration for this branch):

| Column | Type | Meaning |
|---|---|---|
| `ScreenshotPath` | nvarchar(500) | path **relative to the configured root** |
| `ScreenshotHash` | nvarchar(64) | SHA-256 of stored bytes |
| `ScreenshotUploadedAt` | datetime | |
| `ScreenshotStatus` | nvarchar(20) | `NULL` (none) / `Pending` / `Approved` / `Rejected` |
| `ScreenshotReviewedBy` | int | AssociateId of reviewer |
| `ScreenshotReviewedAt` | datetime | |
| `ScreenshotRejectReason` | nvarchar(500) | required when rejecting |

## §2. Configuration (S1)

`appsettings.json` (placeholder values) — standard .NET hierarchy means env vars
(`Screenshots__RootPath`) override automatically; no extra code:

```json
"Screenshots": {
  "RootPath": "C:\\DashyData\\Screenshots",
  "RetainCycles": 6
}
```

- **No admin-UI path editor.** Config file / env var only.
- Root MUST be outside the deployed app folder (deploys wipe `C:\inetpub\wwwroot\DashyDashboard`).
- `RetainCycles` is stored config for a LATER retention sweep (monthly cycles, keep 6).
  Do not build the sweep in this pass.

## §3. ScreenshotStorageService (S1)

New service, registered in DI, sole owner of disk I/O:

- Layout: `{root}\{cycleId}\{associateId}\{clientId}\{toolId}.webp` and `{toolId}_thumb.webp`.
- `Directory.CreateDirectory` before every write (idempotent — auto-creates missing structure).
- Save: validate bytes decode as a real image (**SkiaSharp or Magick.NET** — NOT ImageSharp,
  NOT System.Drawing), compute SHA-256, write file, generate ~200px-wide WebP thumbnail.
  The server NEVER re-encodes the main image (browser already compressed it); decode is
  validation only.
- Read: resolve relative path against current root; return stream + content type.
- Delete: remove file + thumb (used on future retention sweep; expose the method now).
- **Path safety:** all path segments (cycleId/associateId/clientId/toolId) must come from
  validated DB values, never raw user text. Reject any segment containing path separators or
  `..`. Store only relative paths in DB.

## §4. Upload endpoints (S2)

| Endpoint | Behavior |
|---|---|
| `POST /api/attestations/{cycleId}/{clientId}/{toolId}/screenshot` | multipart, single file. Caller = the attestation owner. Validate the attestation row exists and upload is allowed (see §7 rules). Save via storage service → `ScreenshotStatus='Pending'`, set Path/Hash/UploadedAt, CLEAR ReviewedBy/At/RejectReason. Re-upload overwrites (last write wins). |
| `POST /api/attestations/{cycleId}/screenshots/batch` | multipart, many files. Filename convention `{clientId}_{toolId}.png/.jpg/.webp` — **split on FIRST underscore only** (toolIds contain hyphens, e.g. `DU-TRADE`). Match each pair against the caller's OWN attestation rows in this cycle BEFORE composing any disk path. Process matched files through the same single-upload pipeline. Response: per-file result list `{fileName, status: saved|unmatched|invalidImage|notAllowed, detail}`. Partial success is fine. |

- Request size backstop ~10 MB/file (sanity only; browser compression keeps real files ~100–200 KB).
- Accept png/jpg/webp input; stored artifact is whatever the browser sent (webp expected).

## §5. Serving endpoints (S2)

- `GET /api/attestations/{cycleId}/{associateId}/{clientId}/{toolId}/screenshot` and `…/thumb`.
- Auth scope: the owner; the owner's manager; GFH/GFHDelegate of the department; Admin.
  Reuse existing scoping logic patterns from ManagerService/AdminService. 404 if none/forbidden.
- Never serve from wwwroot; images are only reachable through these endpoints.
- Set long-lived cache headers keyed by hash (e.g. ETag = ScreenshotHash) so galleries don't
  re-download unchanged images.

## §6. Review endpoints (S2)

| Endpoint | Behavior |
|---|---|
| `PUT /api/manager/screenshots/{cycleId}/{associateId}/{clientId}/{toolId}/review` | body `{approve: bool, reason?: string}`. `reason` REQUIRED when rejecting (400 without it). Sets Status, ReviewedBy (caller), ReviewedAt. Single-approval model: any authorized reviewer's decision is THE decision; later reviewers may overwrite. |
| `PUT /api/manager/screenshots/{cycleId}/{associateId}/approve-all` | bulk: sets every `Pending` screenshot of that member in that cycle to `Approved` (same reviewer stamps). |
| `GET /api/manager/cycles/{cycleId}/screenshots.zip` | streamed `ZipArchive` directly to the response, `CompressionLevel.NoCompression` (WebP is already compressed). Entries: `{associateId}\{clientId}_{toolId}.webp`. Scope: caller's visibility (manager → team, GFH/GFHDelegate → department, Admin → all). Available to manager AND admin dashboards. |

Reviewer authorization for all of these: manager-of-the-associate, GFH, GFHDelegate, Admin
(`SuperUserRoles` constants).

## §7. Workflow rules (S2)

- **Submit gating:** `SubmitAll` fails unless every non-exempt attestation has
  `ScreenshotStatus IN (Pending, Approved)`. `Rejected` or `NULL` blocks. Error response lists
  the offending `(clientId, toolId)` pairs so the UI can highlight rows. No-access rows exempt.
- **Completion:** a member is **Complete only when ALL their screenshots are `Approved`**
  (and the attestation is submitted). Update every progress computation that currently means
  "submitted = done": ManagerService team progress, Admin/GFH department rollups, and the
  **Incomplete-submissions export** (`AdminController` non-submitted export) — it must now also
  count members who submitted but have Pending/Rejected screenshots, with a status column
  distinguishing "Not submitted" / "Awaiting approval" / "Has rejected screenshots".
- **Post-due-date:** after the cycle due date, the ONLY associate action allowed is
  re-uploading a currently-`Rejected` screenshot. Review (approve/reject, bulk approve) remains
  open after due date.
- **Mid-cycle access changes:** follow whatever the attestation rows do today; no special handling.

## §8. Logging (S2)

Write rows to the **existing `AttestationLogs` table** (no new tables) for: screenshot upload,
batch upload (one row, count in Summary), approve, bulk approve, reject (reason in Summary,
truncated to fit). Fit within the existing column shape of `AttestationLog`.
