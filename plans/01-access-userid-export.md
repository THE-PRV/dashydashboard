# Feature 1 — Access UserID + Export Accesses (.xlsx)

**Branch:** `feature/access-userid-export` · **Stage:** S0 (one full-stack sub-agent)
**Purpose:** record the login each associate uses *inside* a client's tool, and export all of a
person's/team's accesses for offboarding ("person leaves the company — what did they have?").

## 1. Schema

- Add nullable column to `UsersToolAccess`: `ToolUserId` nvarchar(100) NULL.
  Display name everywhere in the UI: **"User ID"**.
- One EF migration on this branch. Apply to local dev DB only.

## 2. Backend

- Grant-access and edit-access endpoints/DTOs (`ManagerController` / `ManagerService` /
  `ManagerDtos`) accept optional `toolUserId`. Persist on create and update.
- New endpoint: `GET /api/manager/access/export` → .xlsx via the **existing**
  `Common/XlsxExporter.Build(title, headers, rows)` helper (do NOT add any library).
  - Columns: Associate Name, Associate ID, Client (use the established `clientName (clientId)`
    format), Tool ID, Tool Name, Tier, Access From, Access To, User ID.
  - Accepts the same filter query params the Access page uses (member, client, etc.) so the
    export matches what is on screen. Scope: caller's visibility (manager → their reports,
    GFH/GFHDelegate → department, Admin → all), enforced server-side like existing endpoints.

## 3. Frontend (`AccessManagementView.jsx`, `api/manager.js`)

- Grant-access form: optional **User ID** text input.
- Access table: **User ID** column (blank if not set); editable wherever access rows are
  already editable.
- **"Export accesses"** button → existing `downloadFile()` util, filename
  `accesses-cycle{cycleId}.xlsx`, passing the current on-screen filters as query params.

## 4. Acceptance

- Grant access with and without a User ID; both persist and display.
- Export with a member filter applied → file contains only that member's rows, User ID column
  populated where set.
- Existing grant/revoke flows unchanged when User ID is omitted.

Build → verify → merge to `main` BEFORE starting Feature 2.
