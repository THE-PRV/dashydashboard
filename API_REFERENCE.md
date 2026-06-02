# DashyDashboard — API Reference

Base URL (dev): `http://localhost:5000`

All endpoints except `POST /api/auth/login` require an authenticated user. In development, authentication is satisfied by the `X-User-Id` request header. In production, Windows/Negotiate identity is resolved automatically by IIS.

Rate limit: 120 requests/minute per IP. Excess requests receive `429 Too Many Requests`.

---

## Auth (`/api/auth`)

| Method | Path | Auth | Body | Returns | Notes |
|--------|------|------|------|---------|-------|
| POST | `/api/auth/login` | None | `LoginRequest` | `LoginResponse` | Dev only — returns 404 in Production. Password field is accepted but not verified. Returns `X-User-Id` response header. |
| GET | `/api/auth/me` | X-User-Id | — | `LoginResponse` | Refreshes a stale session; re-derives `IsManager` and `SuperUserRole` from the database. |

---

## Cycles (`/api/cycles`)

| Method | Path | Auth | Body | Returns | Notes |
|--------|------|------|------|---------|-------|
| GET | `/api/cycles/current` | X-User-Id | — | `CycleDto` | Returns the active cycle (most recent by start date). Returns 404 if no cycle exists. |
| GET | `/api/cycles` | X-User-Id | — | `CycleDto[]` | Returns all cycles ordered by start date descending. |

---

## Attestations (`/api/attestations`)

All endpoints require `CurrentUser` to be resolved (HTTP 401 otherwise).

| Method | Path | Auth | Body | Returns | Notes |
|--------|------|------|------|---------|-------|
| GET | `/api/attestations?cycleId={id}` | X-User-Id | — | `ClientAttestationDto[]` | All clients and tools the calling user must attest for the given cycle. |
| PUT | `/api/attestations/{cycleId}/{clientId}/{toolId}/used` | X-User-Id | `ToggleUsedRequest` | 204 No Content | Sets or clears the `UsedThisCycle` flag for one tool record. |
| PUT | `/api/attestations/{cycleId}/{clientId}/{toolId}/remark` | X-User-Id | `UpdateRemarkRequest` | 204 No Content | Saves a free-text remark (max 500 chars) on one tool record. |
| POST | `/api/attestations/{cycleId}/submit-all` | X-User-Id | `SubmitAllRequest` | `{ summary: string }` | Marks all pending tool records for the cycle as `Submitted`. Optional top-level remark is applied to every record that does not already have one. Returns a plain-text summary string. |

---

## Manager (`/api/manager`)

All endpoints require `CurrentUser`. Authorization is checked per-action (only managers can meaningfully use most endpoints; non-managers receive empty or error responses depending on the action).

| Method | Path | Auth | Body | Returns | Notes |
|--------|------|------|------|---------|-------|
| GET | `/api/manager/team?cycleId={id}` | X-User-Id | — | `TeamDto` | Attestation progress summary for the calling user's direct reports in the given cycle. |
| GET | `/api/manager/team/{memberId}?cycleId={id}` | X-User-Id | — | `MemberDetailDto` | Per-client tool breakdown for one team member. Returns 404 if `memberId` is not a direct report of the caller. |
| GET | `/api/manager/users` | X-User-Id | — | `UserListItem[]` | Full user list (all departments). Used to populate dropdowns when managing access. |
| GET | `/api/manager/team/{memberId}/access` | X-User-Id | — | `MemberAccessDto[]` | All tool-access records currently granted to a team member, grouped by client. |
| POST | `/api/manager/team/{memberId}/access` | X-User-Id | `GrantAccessRequest` | 204 No Content | Grants a tool-access record to a team member. |
| PUT | `/api/manager/team/{memberId}/access/{clientId}/{toolId}/revoke` | X-User-Id | — | 204 No Content | Removes a tool-access record for a team member. |
| PUT | `/api/manager/team/{memberId}/access/{clientId}/{toolId}/end-date` | X-User-Id | `UpdateAccessEndDateRequest` | 204 No Content | Updates the `AccessTo` date on an existing access record. Pass `null` to clear the end date. |
| GET | `/api/manager/clients-tools` | X-User-Id | — | `{ clients: [...], tools: [...] }` | Client and tool lists for the access-grant form dropdowns. |
| POST | `/api/manager/cycles/generate-next` | X-User-Id | — | `CycleDto` (201) | Generates the next review cycle based on the most recent cycle's end date. |

---

## Admin (`/api/admin`)

All endpoints require `CurrentSuperUser` (HTTP 403 if the caller has no active `SuperUsers` record). Additional role restrictions apply per endpoint.

| Method | Path | Auth | Body | Returns | Notes |
|--------|------|------|------|---------|-------|
| GET | `/api/admin/departments?cycleId={id}` | SuperUser | — | `DeptSummaryDto[]` | Admin sees all departments. GFH/IFH see only their own department. |
| GET | `/api/admin/departments/{deptName}/managers?cycleId={id}&clientId={id}` | SuperUser | — | `DeptManagersDto` | Manager breakdown within a department. Non-admin SuperUsers are forbidden from querying a department other than their own. `clientId` is optional; omit to see totals across all clients. |
| POST | `/api/admin/tools` | SuperUser (GFH only) | `AddToolRequest` | `AddToolResponse` (201) | Adds a new tool to an existing client. Restricted to `RoleName = "GFH"` only; Admin and IFH receive 403. |

---

## Response Types

### `LoginResponse`

Returned by `POST /api/auth/login` and `GET /api/auth/me`.

| Field | Type | Notes |
|-------|------|-------|
| `associateId` | `int` | Numeric associate ID. Note: spec requires `varchar(50)` — alphanumeric IDs are not currently supported. |
| `firstName` | `string` | |
| `lastName` | `string` | |
| `isManager` | `bool` | `true` if any user in the database has this user's `AssociateId` set as their `ManagerId`. |
| `superUserRole` | `string?` | One of `"Admin"`, `"GFH"`, `"IFH"`, `"Manager"`, or `null` if not a SuperUser. |
| `superUserDepartment` | `string?` | The SuperUser's scoped department. `null` for Admin (all departments). |

---

### `CycleDto`

| Field | Type | Notes |
|-------|------|-------|
| `cycleId` | `int` | |
| `cycleName` | `string` | e.g. `"Q2 2026"` |
| `startDate` | `DateOnly` | |
| `endDate` | `DateOnly` | |
| `dueDate` | `DateOnly` | Submission deadline, may differ from end date. |

---

### `ClientAttestationDto` and `ToolAttestationDto`

`GET /api/attestations` returns `ClientAttestationDto[]`.

**`ClientAttestationDto`**

| Field | Type | Notes |
|-------|------|-------|
| `clientID` | `string` | |
| `clientName` | `string` | |
| `clientRegion` | `string` | Non-spec field — not in the PDF schema. |
| `totalTools` | `int` | Count of tools the user must attest for this client. |
| `attestedTools` | `int` | Tools with status `Submitted`. |
| `usedTools` | `int` | Tools marked `UsedThisCycle = true`. |
| `tools` | `ToolAttestationDto[]` | Per-tool detail. |

**`ToolAttestationDto`**

| Field | Type | Notes |
|-------|------|-------|
| `toolID` | `string` | String identifier (e.g. `"DU-TRADE"`). Note: spec requires `int`. |
| `toolName` | `string` | |
| `tier` | `string` | `"Primary"` or `"Secondary"`. |
| `usedThisCycle` | `bool?` | `null` = not yet answered; `true`/`false` = answered. |
| `attestationStatus` | `string` | `"Pending"` or `"Submitted"`. |
| `remarks` | `string?` | Free-text, max 500 characters. |

---

### `TeamDto` and `TeamMemberDto`

`GET /api/manager/team` returns `TeamDto`.

**`TeamDto`**

| Field | Type |
|-------|------|
| `totalMembers` | `int` |
| `totalTools` | `int` |
| `totalAttested` | `int` |
| `submitted` | `int` |
| `inProgress` | `int` |
| `notStarted` | `int` |
| `members` | `TeamMemberDto[]` |

**`TeamMemberDto`**

| Field | Type | Notes |
|-------|------|-------|
| `associateId` | `int` | |
| `fullName` | `string` | |
| `attestationStatus` | `string` | `"Not Started"`, `"In Progress"`, or `"Submitted"`. |
| `totalTools` | `int` | |
| `attestedTools` | `int` | |
| `progressPct` | `double` | 0–100. |

---

### `DeptSummaryDto` and `ClientSummaryDto`

`GET /api/admin/departments` returns `DeptSummaryDto[]`.

**`DeptSummaryDto`**

| Field | Type |
|-------|------|
| `deptName` | `string` |
| `gfhName` | `string` |
| `gfhEmail` | `string` |
| `office` | `string` |
| `totalAssociates` | `int` |
| `submittedCount` | `int` |
| `clientBreakdown` | `ClientSummaryDto[]` |

**`ClientSummaryDto`**

| Field | Type |
|-------|------|
| `clientId` | `string` |
| `clientName` | `string` |
| `total` | `int` |
| `submitted` | `int` |

---

### `DeptManagersDto` and `ManagerSummaryDto`

`GET /api/admin/departments/{deptName}/managers` returns `DeptManagersDto`.

**`DeptManagersDto`**

| Field | Type |
|-------|------|
| `deptName` | `string` |
| `gfhName` | `string` |
| `totalAssociates` | `int` |
| `submittedCount` | `int` |
| `managers` | `ManagerSummaryDto[]` |
| `availableClients` | `ClientOptionDto[]` |

**`ManagerSummaryDto`**

| Field | Type |
|-------|------|
| `associateId` | `int` |
| `fullName` | `string` |
| `email` | `string` |
| `totalAssociates` | `int` |
| `submittedCount` | `int` |

---

## Dev Auth

In Development mode all API calls must include the `X-User-Id` header. `UserIdentityMiddleware` reads this header, parses it as an integer, and looks up the matching `User` row. The resolved user is stored in `HttpContext.Items["CurrentUser"]`; the matching `SuperUser` row (if any) is stored in `HttpContext.Items["SuperUser"]`.

The header is not required in Production — the Windows identity from the `Negotiate` scheme is used instead.

**Test AssociateIds (from seed data):**

| AssociateId | Name | Notes |
|-------------|------|-------|
| `1001` | Diana Prince | Admin SuperUser + Manager (has direct reports) |
| `1002` | Bruce Banner | GFH SuperUser (Government Settlement dept) + Manager |
| `1003` | Selina Kyle | IFH SuperUser (Reorg dept) |
| `2001` | Regular analyst | Agent only — no SuperUser, no direct reports |
| `2002`–`2010` | Various analysts | Agent only |

Example curl (dev):

```bash
# Get current cycle as Diana Prince (Admin)
curl -H "X-User-Id: 1001" http://localhost:5000/api/cycles/current

# Get team attestation progress for cycle 1
curl -H "X-User-Id: 1001" "http://localhost:5000/api/manager/team?cycleId=1"

# Get department summary (Admin sees all departments)
curl -H "X-User-Id: 1001" "http://localhost:5000/api/admin/departments?cycleId=1"

# Get department summary (GFH Bruce Banner sees Government Settlement only)
curl -H "X-User-Id: 1002" "http://localhost:5000/api/admin/departments?cycleId=1"
```
