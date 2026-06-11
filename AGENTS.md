# DashyDashboard — Project Cache & Schema Mismatch Report
Generated: 2026-05-30

---

## Session Changes — 2026-06-03

### Production Deployment Facts (CRITICAL — read every deploy)

**Server:** CLIPVWBPOD02
**Database:** ClientsAppAttestation (SQL Server, SQL Auth — NOT Integrated Security)
**Connection string key:** Must be named `"Default"` exactly (see Program.cs line 11)
**IIS site:** DashyDashboard at `/dashydashboard` sub-path
**appsettings.Production.json:** Managed by user on server — NEVER push real credentials to GitHub.
GitHub version has placeholder: `Server=CLIPVWBPOD02;Database=ClientsAppAttestation;Integrated Security=True;Encrypt=True;TrustServerCertificate=True;`
User adds `User ID=...;Password=...;` and removes `Integrated Security=True;` on the server.

**GitHub remote = compiled artifacts (NOT source).** The remote `main` branch contains the output of `dotnet publish` — DLLs, `wwwroot/`, `web.config`, etc. Source lives at `Y:\dashythedashdashboard\dashythedashdashboard`. Compiled output is at `Y:\dashythedashdashboard\upload\app` (separate git repo pointing to same remote).

### Deployment Checklist (after every `dotnet publish`)

1. **Copy new `wwwroot/assets/` to server** — DELETE old contents of assets/ first. Vite content-hashes filenames (e.g. `index-mFC-4Qej.js`); stale files from prior builds remain and break the app.
2. **Restore web.config** — `dotnet publish` overwrites it. Must have WebDAV removal or all PUT requests return HTTP 405.
3. **Restore appsettings.Production.json** — `dotnet publish` overwrites it. Run `git checkout HEAD -- appsettings.Production.json` in upload/app to get GitHub's placeholder version, then user adds real credentials on server.
4. **Recycle app pool** — editing web.config triggers automatic recycle; otherwise recycle manually.

### web.config (production-correct version — MUST be restored after every publish)

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <location path="." inheritInChildApplications="false">
    <system.webServer>
      <modules>
        <remove name="WebDAVModule" />
      </modules>
      <handlers>
        <remove name="WebDAV" />
        <add name="aspNetCore" path="*" verb="*" modules="AspNetCoreModuleV2" resourceType="Unspecified" />
      </handlers>
      <aspNetCore processPath="dotnet" arguments=".\DashyDashboard.Api.dll" stdoutLogEnabled="false" stdoutLogFile=".\logs\stdout" hostingModel="inprocess" />
    </system.webServer>
  </location>
</configuration>
```

### Schema / Code Changes Made (2026-06-03)

| Change | Files | Notes |
|--------|-------|-------|
| Removed `Client.DepartmentID` FK | `Client.cs`, `Department.cs`, `AppDbContext.cs` | Had to also remove `Department.Clients` inverse nav for EF to stop re-inferring the FK |
| Removed `User.ManagerId` self-referential FK | `User.cs`, `AppDbContext.cs` | ManagerService uses two-query approach instead |
| Migration added | `20260603081041_RemoveClientDeptFK_RemoveUserManagerFK` | Clean migration, snapshot updated |
| Frontend sub-path routing | `vite.config.js` (`base: './'`), `.env.production` (`VITE_API_URL=/dashydashboard`) | Baked into bundle at build time |
| WebDAV fix in web.config | `upload/app/web.config` | Removes WebDAVModule and WebDAV handler — fixes HTTP 405 on all PUT requests (Used/HadAccess toggles, Remarks) |
| Access Management client display | `AccessManagementView.jsx` lines ~223, ~329 | Format: `{clientID} - {clientName}` (e.g. `1234 - DTC`) |

### Current JS Bundle (as of last build)
- JS: `index-mFC-4Qej.js`
- CSS: `index-CXcUq1vl.css`

### Auth / Identity Notes

- **Windows Auth:** IIS handles Negotiate/NTLM. `UserIdentityMiddleware` resolves user from `ctx.User.Identity?.Name` matched against `Users.UserName`.
- **X-User-Id bypass:** Only active when `IsDevelopment() && EnableUserHeaderAuth:true` (both false in production). Do not remove this gate.
- **SuperUsers:** `UserIdentityMiddleware` loads the highest-priority active SuperUser row into `ctx.Items["SuperUser"]` on every request. Ordering: Admin > GFH > IFH, then Full access before others, then department name.

### Diagnostics

- **Startup crash (500 everywhere):** Check appsettings.Production.json — wrong server name or missing credentials → EF can't connect → kernelbase.dll crash (Event Viewer, Source: .NET Runtime).
- **Edit web.config to force recycle** when appsettings change on disk doesn't take effect (toggling `stdoutLogEnabled` is a safe no-op change).
- **stdout logs:** `.\logs\stdout_YYYYMMDD_HHMMSS_PID.log` in the app folder. Enable with `stdoutLogEnabled="true"` temporarily; disable after debugging.

---

## Project Overview
ASP.NET 7 API + React SPA for tool attestation management at Broadridge.
Target database: ClientsAppAttestation on SQL Server CLIPVWBPOD02.
PDF spec (ClientsAppAttestation_Table_Structure_Documentation.pdf) is the authoritative schema reference.

## Tech Stack
- Backend: ASP.NET 7 Web API, Entity Framework Core 7, SQL Server
- Frontend: React (Vite), JSX components
- Auth: Windows Authentication (IIS) + UserIdentityMiddleware; user identity resolved from Windows login name matched against Users.UserName
- Project root: DashyDashboard/DashyDashboard.Api/

## Target Schema (10 tables from PDF)
| Table | PK | Key Notes |
|---|---|---|
| dbo.Users | AssociateID VARCHAR(50) | Separate ID IDENTITY column. AssociateID is business PK |
| dbo.Clients | ClientID VARCHAR(50) | VARCHAR mandatory — preserve leading zeros 0039, 0010 |
| dbo.ClientTools | Normalized: (ClientID,ToolID) composite | ToolName nvarchar(200). Import-based had UserID surrogate + Application Name |
| dbo.UsersToolAccess | Normalized: (AssociateId,ClientID,ToolID) composite | Tier=Primary/Secondary, AccessFrom/AccessTo DATE, GrantedBy FK->Users |
| dbo.Cycles | CycleID INT IDENTITY | CycleName, StartDate, EndDate, DueDate |
| dbo.ToolCycleAttestation | (CycleID,AssociateID,ClientID,ToolID) composite | ToolID INT NOT NULL. AttestationStatus default Pending. UsedThisCycle BIT |
| dbo.AttestationLogs | LogID INT IDENTITY | CycleID FK, AssociateID, SubmittedAt, ToolCount INT, Summary NVARCHAR(100) |
| dbo.LoginLogs | LoginLogID INT IDENTITY | AssociateID NULLABLE, LoginTime, Status (Success/UserNotFound) |
| dbo.SuperUsers | SuperUserID INT IDENTITY | RoleName(Admin/VP/Manager/Reviewer), Department, AccessLevel, IsActive, UNIQUE(AssociateID,RoleName,Dept) |
| dbo.IFHGFHMapping | ID INT IDENTITY | Area, IFH, GFH (~23 department rows) |

## MISMATCH ANALYSIS (Opus 4.8 Audit — 2026-05-30)

The pasted files reflect the current working tree (SQL Server, ActivityLog, normalized design). I have enough to produce the report. The pasted code IS the current state. Let me confirm the ManagerView frontend uses toolId in URLs (it does, via manager.js) — already visible. I have everything needed.

---

# SCHEMA MISMATCH AUDIT — ClientsAppAttestation / DashyDashboard

**Scope note:** The codebase has been *partially* migrated from the literal PDF SQL spec toward the PDF's page-14 "normalized design." The result is an inconsistent hybrid: it follows the normalized target in some places, the literal flat spec in none, and invents its own model (`ActivityLog`, integer `AssociateId`) in others. Findings below are organized by area (A–M) as requested.

---

## A) MISSING TABLES — SuperUsers, IFHGFHMapping

| # | Entity | Layer | What is wrong | Severity | Fix |
|---|--------|-------|---------------|----------|-----|
| A1 | **SuperUsers** | Domain / DbContext / Migration | No `SuperUser.cs` domain model exists. No `DbSet<SuperUser>`. No table in migration. The entire role-based access mechanism (Admin/VP/Manager/Reviewer with department scoping and AccessLevel Full/ReadOnly/Approver) is absent. | **BLOCKING** (feature wholly missing) | Add `SuperUser` entity: `SuperUserID int identity PK`, `AssociateID varchar(50)`, `RoleName varchar(50)`, `Department varchar(150)`, `AccessLevel varchar(50)`, `IsActive varchar(10) default 'TRUE'`, `CreatedOn datetime default GETDATE()`, `CreatedBy varchar(50)`, unique index `(AssociateID, RoleName, Department)`. Register `DbSet`, add migration. |
| A2 | **IFHGFHMapping** | Domain / DbContext / Migration | No `IFHGFHMapping.cs`. No `DbSet`. No table. No partial implementation anywhere. | **BLOCKING** (feature wholly missing) | Add entity: `ID int identity PK`, `Area varchar(150)`, `IFH varchar(150)`, `GFH varchar(150)`. Register `DbSet`, add migration. |

**Role handling consequence:** Because `SuperUsers` is missing, the app derives "manager" status purely from `AuthService` (`Users.Any(u => u.ManagerId == user.AssociateId)`) — see `AuthService.LoginAsync`. There is no Admin/VP/Reviewer concept and no AccessLevel enforcement, even though the frontend `App.jsx` routes four roles (`agent`, `manager`, `access`, `admin`). Roles `access`/`admin` are client-side-only with no backing authorization.

---

## B) LoginLogs / LoginLog

| # | Entity | Layer | What is wrong | Severity | Fix |
|---|--------|-------|---------------|----------|-----|
| B1 | LoginLogs | Domain | `Models/Domain/LoginLog.cs` was **deleted** (git status: `D`). The committed version had `LoginLogID int identity`, **`UserID int` (NOT the spec's nullable `AssociateID varchar`)**, `LoginTime datetime`, `Status string`. So even before deletion it was non-conformant: spec requires `AssociateID VARCHAR(50) NULLABLE` to capture failed logins (UserNotFound where no user matches). | **BLOCKING** | Re-add a `LoginLog` entity matching spec: `LoginLogID int identity PK`, `AssociateID varchar(50) NULL`, `LoginTime datetime NOT NULL`, `Status nvarchar(50) NOT NULL`. |
| B2 | LoginLogs | DbContext / Migration | No `DbSet<LoginLog>`, no `LoginLogs` table in the migration/snapshot. | **BLOCKING** | Register DbSet + migration. |
| B3 | LoginLogs | Service | `AuthService.LoginAsync` **explicitly does not log logins** (comment: "Logins are intentionally not logged"). The spec's whole point of a nullable `AssociateID` is to capture failed attempts (`Status = 'UserNotFound'`). The status string `"UserNotFound"`/`"Success"` is computed and returned but never persisted. | **SIGNIFICANT** | Write a `LoginLogs` row on every login attempt: `AssociateID = user?.AssociateId` (null on failure), `Status`, `LoginTime`. |
| B4 | LoginLogs vs ActivityLog | Domain design | The codebase replaced LoginLogs (and AttestationLogs) with a single unified `ActivityLog` table (`Models/Domain/ActivityLog.cs`). This is a deliberate divergence from the spec's two separate tables (`AttestationLogs`, `LoginLogs`). `ActivityLog` does *not* log logins at all. | **SIGNIFICANT** (semantic divergence from spec) | Either (a) restore separate `LoginLogs`/`AttestationLogs` per spec, or (b) formally document `ActivityLog` as an approved replacement AND make it actually capture logins. Currently it captures neither logins. |

---

## C) AttestationRemark (deleted) + RemarksController (deleted)

| # | Entity | Layer | What is wrong | Severity | Fix |
|---|--------|-------|---------------|----------|-----|
| C1 | AttestationRemark | Domain | `Models/Domain/AttestationRemark.cs` **deleted**. Committed version was a *separate normalized remarks table* (`RemarkID, CycleID, UserID, ClientID, ToolID, AuthorName, Text, CreatedAt`) — one-to-many remarks per attestation. | INFO / **SIGNIFICANT** | Decide intentional. |
| C2 | Remarks | Domain / Service | Remarks were **collapsed into a single `Remarks nvarchar(500)` scalar column on `ToolCycleAttestation`** (`ToolCycleAttestation.Remarks`, written by `AttestationService.UpdateRemarkAsync`/`SubmitAllAsync`). This actually **matches the PDF spec** (`ToolCycleAttestation.Remarks NVARCHAR(500)`) and the page-14 design, and is *more* spec-conformant than the deleted multi-row `AttestationRemark` table. | **MINOR** (improvement, but lossy: no AuthorName/CreatedAt/history) | If audit history of remarks is required, keep both. Otherwise current single-column approach is correct per spec. |
| C3 | RemarksController | Controller / Frontend | `Controllers/RemarksController.cs` **deleted**. Remark editing now lives at `PUT /api/attestations/{cycleId}/{clientId}/{toolId}/remark` (`AttestationsController.UpdateRemark` → `addRemark` in `api/attestations.js`). Frontend `RemarksModal.jsx` calls `addRemark`, which is wired correctly. | **MINOR** (no dangling references found) | Verify no other frontend code calls a removed `/api/remarks` endpoint. None found in the provided files. |

---

## D) ClientTools naming — "Application Name" vs ToolName / ToolID

| # | Entity | Layer | What is wrong | Severity | Fix |
|---|--------|-------|---------------|----------|-----|
| D1 | ClientTools | Domain / Migration | Code uses `ClientTool { ClientID, ToolID, ToolName }` with **composite PK `(ClientID, ToolID)`** (`AppDbContext`: `HasKey(ct => new { ct.ClientID, ct.ToolID })`). The literal PDF spec uses a flat denormalized table with `UserID int identity PK`, `[Application Name]` (with a space), and **NO ToolID**. | **SIGNIFICANT** (intentional divergence — code follows page-14 *normalized* design, not the literal table) | Confirm normalized design is the chosen target. If so, code is correct. The literal "Application Name" / no-ToolID flat import table is NOT implemented and may still be needed for the Excel import path. |
| D2 | ClientTools.ToolID type | Domain | Code's `ToolID` is **`string` (`varchar 50`)**, e.g. seeded values `"DU-TRADE"`, `"NX-RISK"`. The PDF normalized design and `ToolCycleAttestation` spec both call for **`ToolID INT`**. | **BLOCKING** (type mismatch vs spec) | If spec's `ToolID INT` is authoritative, change `ToolID` to `int` everywhere (ClientTool, UserToolAccess, ToolCycleAttestation, ActivityLog, all DTOs, all route params, all frontend URLs). This is a large cross-cutting change. Currently code is internally consistent on `string ToolID` but contradicts the spec. |
| D3 | ClientTools surrogate id | Domain | Spec's flat table has `UserID int identity` surrogate. Code has none (uses composite PK). | **MINOR** | N/A if normalized design accepted. |

---

## E) UserToolAccess — varchar dates + TRUE/FALSE vs normalized date + Tier + GrantedBy

| # | Entity | Layer | What is wrong | Severity | Fix |
|---|--------|-------|---------------|----------|-----|
| E1 | UserToolAccess | Domain | Code implements the **page-14 normalized design**, NOT the literal flat spec: `UserToolAccess { AssociateId int, ClientID, ToolID, Tier, AccessFrom DateOnly, AccessTo DateOnly?, GrantedBy int? }` with composite PK `(AssociateId, ClientID, ToolID)`. The literal PDF spec table `UsersToolAccess` has `UserID int identity`, `AssociateID varchar`, `Access varchar (TRUE/FALSE)`, `FromDate varchar`, `ToDate varchar`, no Tier, no GrantedBy. | **SIGNIFICANT** (two competing specs; code picks normalized) | Accept normalized design as target → code largely conforms. The literal flat `UsersToolAccess` import table is unimplemented. |
| E2 | UserToolAccess dates | Domain / DbContext | Code uses `DateOnly`/`DateOnly?` mapped to SQL `date` via value converters (`AppDbContext` `dateOnlyConverter`). PDF *literal* spec stores dates as `VARCHAR(50)` to preserve Excel formatting. PDF *normalized* design uses `date NOT NULL`/`date null`. | **SIGNIFICANT** vs literal; **conformant** vs normalized | Use `date` (current) for the operational table; reserve varchar dates only for any raw Excel-import staging table. |
| E3 | UserToolAccess.Access (TRUE/FALSE) | Domain | The literal spec column `Access VARCHAR(50)` (TRUE/FALSE) **does not exist in code at all**. The normalized design has no such column (presence of a row = access). | **MINOR** (intentional in normalized model) | None if normalized accepted. |
| E4 | UserToolAccess.Tier | Domain | Spec normalized: `Tier nvarchar(50) NOT NULL (Primary/Secondary)`. Code: `Tier string` (required via `IsRequired` in snapshot), seeded `"Primary"`/`"Secondary"`. **Conformant.** | OK | — |
| E5 | UserToolAccess.GrantedBy | Domain | Spec normalized: `GrantedBy int null FK->Users`. Code: `GrantedBy int?` FK to `User` (`HasOne(GrantedByUser)...IsRequired(false)`). **Conformant.** | OK | — |
| E6 | UserToolAccess.AssociateId type | Domain | Code FK is `int AssociateId` referencing `Users.AssociateId int`. Spec (both variants) defines `AssociateID VARCHAR(50)`. See F1 — this is the root type mismatch. | **BLOCKING** | See F1. |

---

## F) User model — PK and identity

| # | Entity | Layer | What is wrong | Severity | Fix |
|---|--------|-------|---------------|----------|-----|
| F1 | Users.AssociateID type | Domain / DbContext / Migration | **Code makes `AssociateId` an `int` PK** (`User.AssociateId int`, `[Key][DatabaseGenerated(None)]`). Spec mandates **`AssociateID VARCHAR(50) NOT NULL` as PK**, plus a *separate* `ID INT IDENTITY(1,1) UNIQUE` surrogate. AssociateIDs in real data are often non-numeric / zero-padded; storing as int silently corrupts leading zeros and rejects alphanumeric IDs. | **BLOCKING** | Change `AssociateId` to `string`/`varchar(50)` across `User`, `UserToolAccess`, `ToolCycleAttestation`, `ActivityLog`, all DTOs, all service params, all controller route params (`{memberId:int}`), middleware, and frontend. Add separate `ID int identity unique`. Massive cross-cutting change. Seed data uses `1001`, `2001` etc. as ints. |
| F2 | Users missing columns | Domain / Migration | Spec `Users` columns absent in code: **`EMailAddr varchar(255)`, `PrimaryLocationId varchar(100)`, `UserName varchar(100)`**. Spec `ManagerId VARCHAR(50)` — code has `ManagerId int?`. | **SIGNIFICANT** | Add `EMailAddr`, `PrimaryLocationId`, `UserName`. Change `ManagerId` to `varchar(50)` (depends on F1). |
| F3 | Users.WindowsID | Domain | Code has `WindowsID varchar(200)` — **not in spec**. Spec's closest is `UserName varchar(100)`. Used by `UserIdentityMiddleware` and `AuthService` to resolve Windows identity. | **MINOR** (extra field; possibly maps to spec `UserName`) | Reconcile `WindowsID` with spec `UserName`, or document as an approved addition. |
| F4 | Users.Department length | Domain | Code: `Department varchar(100)`. Spec: `Department VARCHAR(150)`. | **MINOR** | Widen to 150. |

---

## G) Client model — ClientID VARCHAR (leading zeros)

| # | Entity | Layer | What is wrong | Severity | Fix |
|---|--------|-------|---------------|----------|-----|
| G1 | Clients.ClientID | Domain | Code: `ClientID string` PK, mapped `nvarchar(50)`. **Conformant** with the "VARCHAR to preserve leading zeros" requirement (type-wise). `nvarchar` vs `varchar` is a minor storage nuance only. | OK / **MINOR** | Optionally force `varchar` via `HasColumnType("varchar(50)")` to match spec exactly. |
| G2 | Clients missing columns | Domain / Migration | Spec `Clients` columns absent: **`ID int identity unique`, `ClientDesc varchar(255)`, `CurrentState varchar(100)`, `Tier varchar(50)`**. Code instead has a non-spec **`ClientRegion varchar(50)`**. `ClientName` is `varchar(200)` vs spec `255`. | **SIGNIFICANT** | Add `ID identity`, `ClientDesc`, `CurrentState`, `Tier`. Decide fate of `ClientRegion` (not in spec — used heavily in DTOs/frontend, see J). Widen `ClientName` to 255. |
| G3 | Clients leading-zero seed | SeedData | Seeded ClientIDs are `"DTC-US"`, `"NATIXIS"` etc. — none exercise the leading-zero case (spec examples `0039`, `0010`). | **MINOR** | Add seed rows with zero-padded IDs to validate preservation. |

---

## H) ToolCycleAttestation — ToolID INT in composite PK

| # | Entity | Layer | What is wrong | Severity | Fix |
|---|--------|-------|---------------|----------|-----|
| H1 | ToolCycleAttestation PK | Domain / DbContext | Spec composite PK: `(CycleID int, AssociateID varchar(50), ClientID varchar(50), ToolID int)`. Code PK: `(CycleID int, AssociateId **int**, ClientID string, ToolID **string**)` (`AppDbContext` `HasKey`). Two type mismatches: `AssociateId` int (should be varchar — F1) and `ToolID` string (spec says **int** — D2). | **BLOCKING** | Align types: AssociateID→varchar, ToolID→int (per spec). |
| H2 | ToolCycleAttestation columns | Domain | `UsedThisCycle bit` (code `bool?`) ✓, `AttestationStatus nvarchar(50) default 'Pending'` ✓ (code default `"Pending"`), `Remarks nvarchar(500)` ✓, `SubmittedAt datetime` ✓ (code `DateTime?`). Columns otherwise conformant. | OK | — |
| H3 | Default constraint | Migration | Spec wants `AttestationStatus DEFAULT 'Pending'` as a DB default; code sets it only as a CLR default (`= "Pending"`), no SQL `DEFAULT` constraint in migration. | **MINOR** | Add `.HasDefaultValue("Pending")` if DB-level default required. |

---

## I) Cycles — DueDate

| # | Entity | Layer | What is wrong | Severity | Fix |
|---|--------|-------|---------------|----------|-----|
| I1 | Cycles | Domain / Migration | Code has `CycleID int identity`, `CycleName`, `StartDate`, `EndDate`, **`DueDate`** (all present). `DueDate` ✓ exists (`Cycle.DueDate`, mapped `date`). Spec `CycleName NVARCHAR(100) NOT NULL` ✓. **Fully conformant.** | OK | — |
| I2 | Cycles date type | Domain | Spec uses `DATE`; code uses `DateOnly`→`date` converter. Conformant. | OK | — |

---

## J) Frontend — fields that won't exist under the new/spec schema

| # | Where | Layer | What is wrong | Severity | Fix |
|---|-------|-------|---------------|----------|-----|
| J1 | `ClientRegion` everywhere | Frontend / DTO | `ClientRegion` is pervasive in DTOs (`ClientAttestationDto`, `ClientProgressDto`, `MemberAccessDto`, `UserListItem`-area) and consumed in `AgentView.jsx`, `ManagerView.jsx`, `AccessManagementView.jsx`. The **spec `Clients` table has no Region column** (it has `ClientDesc`, `CurrentState`, `Tier`). If schema is aligned to spec, `ClientRegion` disappears and all these reads break. | **SIGNIFICANT** | Either add `ClientRegion` to spec officially, or replace frontend/DTO usage with spec fields (`Tier`/`CurrentState`/`ClientDesc`). |
| J2 | `toolId` in URLs | Frontend | `api/attestations.js` and `api/manager.js` build routes like `/${cycleId}/${clientId}/${toolId}/used` and `/access/${clientId}/${toolId}/revoke` using string toolIds (`"DU-TRADE"`). If `ToolID` becomes `int` per spec (D2), these still work as path segments but semantics change; also string toolIds embedding hyphens are fine in URLs but int IDs would change the data contract. | **SIGNIFICANT** (coupled to D2) | When ToolID→int, update all frontend calls and any display logic that shows the alphanumeric tool code. |
| J3 | `isManager` only | Frontend | `LoginResponse`/`api/auth.js` returns only `{ associateId, firstName, lastName, isManager }`. Frontend `App.jsx` exposes `access` and `admin` roles with no backend role/AccessLevel data (no SuperUsers). | **SIGNIFICANT** | Once SuperUsers (A1) exists, return RoleName/AccessLevel and gate `access`/`admin` views server-side. |
| J4 | `associateId` numeric | Frontend | `localStorage.setItem('userId', String(response.associateId))` and `X-User-Id` header assume numeric-ish id; if AssociateID→varchar (F1) the middleware's `int.TryParse` (M1) breaks. | **BLOCKING** (coupled to F1) | Change header parsing + frontend to treat id as string. |

---

## K) SeedData conformance

| # | Where | Layer | What is wrong | Severity | Fix |
|---|-------|-------|---------------|----------|-----|
| K1 | `SeedData.cs` | Service/seed | Seeds match the **current (non-spec) model**, not the spec: integer `AssociateId` (1001…3003), string `ToolID` (`"DU-TRADE"`), `ClientRegion` set, no `EMailAddr/UserName/PrimaryLocationId`, no `ClientDesc/CurrentState/Tier`, no `SuperUsers`, no `IFHGFHMapping`, no `LoginLogs`. | **BLOCKING** (will not compile once spec types applied) | Rewrite seed once entities are aligned: varchar AssociateIDs (incl. zero-padded), int ToolIDs, spec client columns, SuperUsers rows, IFH/GFH rows. |
| K2 | `ManagerId` ints | seed | `ManagerId = 1001` (int). Spec wants `ManagerId varchar(50)`. | **BLOCKING** (coupled to F1/F2) | Adjust after F2. |
| K3 | ActivityLog seed | seed | Comment says ActivityLog intentionally empty; fine for the invented table, but means no LoginLogs/AttestationLogs seed data exists for spec tables. | **MINOR** | N/A unless spec tables restored. |

---

## L) DbContext / Migration

| # | Where | Layer | What is wrong | Severity | Fix |
|---|-------|-------|---------------|----------|-----|
| L1 | `AppDbContext` | DbContext | Missing `DbSet`s: `SuperUsers`, `IFHGFHMapping`, `LoginLogs`, `AttestationLogs`. Present `ActivityLogs` is not in spec. | **BLOCKING** | Add missing DbSets; decide on ActivityLogs. |
| L2 | Table name `ToolCycleAttestation` | DbContext / Migration | Mapped table name is singular `ToolCycleAttestation` (`[Table]` default from class + migration `CreateTable("ToolCycleAttestation")`). Spec table is `dbo.ToolCycleAttestation` (singular) — **matches**. But all other tables are plural. Just confirm intentional. | **MINOR** | OK; matches spec. |
| L3 | Column types | DbContext | `ClientID`, `ToolID`, `Tier`, etc. mapped as `nvarchar` not `varchar`. Spec uniformly specifies `VARCHAR`. `nvarchar` doubles storage and changes collation/length semantics; for zero-padded `ClientID` it's functionally fine but not type-accurate. | **MINOR** | Use `HasColumnType("varchar(n)")` to match spec where ASCII is guaranteed. |
| L4 | Identity surrogates | DbContext / Migration | Spec wants extra `ID int identity unique` on `Users` and `Clients` (alongside their varchar PKs). Code has neither. | **SIGNIFICANT** | Add identity surrogate columns + unique indexes. |
| L5 | FK `GrantedBy` | DbContext | When AssociateID→varchar (F1), the `GrantedBy int?` FK and `Users.AssociateId` PK must both become varchar; current int FK config will break. | **BLOCKING** (coupled to F1) | Update FK types. |
| L6 | Migration drift | Migration | Two `InitialCreate` migrations exist: deleted `20260525155638_*` (committed) and new untracked `20260529191509_*`. Snapshot `AppDbContextModelSnapshot.cs` reflects the current `ActivityLog`/normalized model, so it is internally consistent with the entities — but neither migration contains any spec-only tables (SuperUsers, IFHGFHMapping, LoginLogs, AttestationLogs). | **SIGNIFICANT** | After entity fixes, drop and regenerate a single clean migration; ensure snapshot includes all spec tables. |

---

## M) Middleware — UserIdentityMiddleware AssociateID usage

| # | Where | Layer | What is wrong | Severity | Fix |
|---|-------|-------|---------------|----------|-----|
| M1 | `UserIdentityMiddleware` | Middleware | Dev path parses `X-User-Id` with `int.TryParse(raw, out var associateId)` and queries `u.AssociateId == associateId`. This **hard-codes AssociateID as int**, directly contradicting spec's `varchar(50)`. Will silently fail for any non-numeric or zero-padded AssociateID. | **BLOCKING** (coupled to F1) | Treat `X-User-Id` as string; query `u.AssociateId == raw.ToString()` once AssociateID is varchar. |
| M2 | `UserIdentityMiddleware` | Middleware | Windows path matches `u.WindowsID == windowsId`. Spec has no `WindowsID` — closest is `UserName`. If F3 reconciles WindowsID→UserName, this lookup must change. | **MINOR** (coupled to F3) | Match against spec `UserName` if WindowsID is removed. |
| M3 | Login not logged | Middleware/Service | Neither middleware nor `AuthService` writes a `LoginLogs` row (see B3). The middleware is the natural choke point for capturing Windows-auth logins (failed and successful). | **SIGNIFICANT** | Persist login events here or in AuthService. |

---

## CROSS-CUTTING SUMMARY (root causes, ranked)

1. **AssociateID modeled as `int` instead of `varchar(50)`** (F1) — the single most pervasive BLOCKING defect. Ripples through `User`, `UserToolAccess`, `ToolCycleAttestation`, `ActivityLog`, every DTO with `AssociateId`, every `{memberId:int}` route, `UserIdentityMiddleware` (M1), `SeedData` (K1/K2), and the frontend `X-User-Id` flow (J4). Corrupts/blocks any alphanumeric or zero-padded associate id.
2. **ToolID modeled as `string` instead of `int`** (D2/H1) — BLOCKING vs the normalized spec; ripples through `ClientTool`, `UserToolAccess`, `ToolCycleAttestation`, `ActivityLog`, DTOs, routes, frontend URLs.
3. **Three spec tables entirely missing** (A1 SuperUsers, A2 IFHGFHMapping, B1/B2 LoginLogs) plus **AttestationLogs** folded into a non-spec `ActivityLog` — BLOCKING feature gaps; role-based access (Admin/VP/Reviewer + AccessLevel + department scoping) and IFH/GFH mapping do not exist.
4. **Login attempts never persisted** (B3/M3) — defeats the spec's deliberately nullable `LoginLogs.AssociateID`.
5. **Missing spec columns** on `Users` (EMailAddr, PrimaryLocationId, UserName) and `Clients` (ID, ClientDesc, CurrentState, Tier), plus non-spec `ClientRegion` used everywhere (G2/F2/J1).
6. **Design ambiguity:** the code follows the page-14 *normalized* design for ClientTools/UserToolAccess (which is reasonable and largely correct there), but the literal flat import tables (`ClientTools` with `[Application Name]`, `UsersToolAccess` with varchar dates + TRUE/FALSE) are unimplemented. If both the import-staging and normalized models are required, the staging tables are missing.

**Areas fully conformant:** Cycles incl. DueDate (I), Client PK varchar type (G1, type only), ToolCycleAttestation non-key columns (H2), UserToolAccess Tier/GrantedBy/date design (E4/E5/E2 vs normalized target), Remarks-as-scalar (C2, matches spec).

Key file paths: `DashyDashboard/DashyDashboard.Api/Models/Domain/{User,Client,ClientTool,UserToolAccess,ToolCycleAttestation,Cycle,ActivityLog}.cs`; `Data/AppDbContext.cs`; `Data/SeedData.cs`; `Middleware/UserIdentityMiddleware.cs`; `Services/{AuthService,AttestationService,ManagerService}.cs`; `Models/DTOs/{AuthDtos,AttestationDtos,ManagerDtos}.cs`; `Migrations/20260529191509_InitialCreate.cs` + `AppDbContextModelSnapshot.cs`; deleted `Models/Domain/{LoginLog,AttestationRemark}.cs` and `Controllers/RemarksController.cs`; frontend `src/api/{auth,client,attestations,manager}.js`, `src/App.jsx`, `src/views/{AgentView,ManagerView,AccessManagementView,UserManagementView}.jsx`.
