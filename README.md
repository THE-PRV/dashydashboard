# Broadridge Access Review — DashyDashboard

## Overview

DashyDashboard is a web application for managing periodic tool-access attestations at Broadridge. Every review cycle, associates must confirm which client-facing tools they actively use. Managers review their team's progress, and functional heads (GFH/IFH) get a department-level view. The application replaces a manual spreadsheet process by automating cycle generation, submission tracking, and access management.

Primary users: associates (agents), line managers, Global/India Functional Heads, and administrators.

Production runbook: [docs/production-deployment-guide.pdf](docs/production-deployment-guide.pdf)

---

## Tech Stack

- **Backend:** ASP.NET 7 Web API, Entity Framework Core 7, SQL Server
- **Frontend:** React 18 (Vite 5), inline CSS with CSS variables — no UI framework
- **Auth:** Windows/Negotiate (production IIS); `X-User-Id` header (dev only)
- **Rate limiting:** Fixed-window, 120 requests/minute per IP
- **Build output:** `vite build` emits to `DashyDashboard.Api/wwwroot`; the API serves the SPA as static files

---

## User Roles

| Role | Who | What they see |
|------|-----|---------------|
| Agent | Regular associate | Their own tool list per cycle; toggle used/unused; submit with remarks |
| Manager | Any associate who has direct reports (`ManagerId` set on another user) | Team attestation dashboard — per-member progress, access grant/revoke |
| GFH (Global Functional Head) | SuperUser with `RoleName = "GFH"` | Department-level summary across all managers; can add new tools to a client |
| IFH (India Functional Head) | SuperUser with `RoleName = "IFH"` | Same department dashboard scoped to their own department only |
| Admin | SuperUser with `RoleName = "Admin"` | Full overview across all departments; read-only drill-down |

Manager status is derived at runtime (any user who has at least one direct report). SuperUser roles are stored in the `SuperUsers` table and resolved by `UserIdentityMiddleware` on every request.

---

## Getting Started

### Prerequisites

- .NET SDK 7.0.x or later for local build and publish (SDK 8.x also works)
- Node.js 18+
- SQL Server (local or remote). The app targets database `ClientsAppAttestation` on server `clipvwbpod02` in production. For local development any SQL Server instance works.

### Running Locally

**1. Configure the connection string**

Edit `DashyDashboard/DashyDashboard.Api/appsettings.Development.json` and set the `Default` connection string to your local SQL Server:

```json
{
  "ConnectionStrings": {
    "Default": "Server=localhost,1433;Database=DashyDashboard;Integrated Security=True;Encrypt=False;TrustServerCertificate=True;"
  }
}
```

**2. Start the API**

```bash
cd DashyDashboard/DashyDashboard.Api
dotnet run
```

On first run in Development mode, EF Core migrations are applied automatically and `SeedData.RunAsync` populates demo data. The API listens on `http://localhost:5000`.

**3. Start the frontend**

```bash
cd DashyDashboard/DashyDashboard.Frontend
npm install
npm run dev
```

The Vite dev server starts on `http://localhost:5173` and proxies all `/api` requests to `http://localhost:5000`.

Open `http://localhost:5173` in your browser.

### Dev Login

The form-based login endpoint (`POST /api/auth/login`) is only enabled in Development mode. **The password field is accepted but not verified** — enter any non-empty value. Production authentication is handled entirely by Windows/Negotiate via IIS.

For API testing (curl, Postman, etc.) pass the `X-User-Id` header with the string AssociateId of a seeded user:

```
X-User-Id: 1001
```

**Demo users loaded by seed data:**

| AssociateId | Name | Role(s) |
|-------------|------|---------|
| 1001 | Diana Prince | Manager + Admin SuperUser |
| 1002 | Bruce Banner | Manager + GFH SuperUser (Government Settlement) |
| 1003 | Selina Kyle | IFH SuperUser (Reorg) |
| 2001–2010 | Various analysts | Regular agent (no SuperUser) |

---

## Database

- **Target instance:** `clipvwbpod02`
- **Database name:** `ClientsAppAttestation`
- **Migrations:** Applied automatically on startup in Development (`SeedData.RunAsync` calls `db.Database.MigrateAsync()`). In Production, run migrations explicitly with `dotnet ef database update`.
- **Seed data (Development only):** ~625 users, 5 clients, 17 tools across those clients, 3 review cycles, 3 SuperUsers. Seed is idempotent — re-running does not create duplicates.

---

## Architecture

```
Browser
  |
  | HTTP :5173 (dev) / :443 (prod)
  v
Vite Dev Server  ──/api proxy──>  ASP.NET 7 API (:5000 dev / IIS prod)
  |                                    |
  | static build (prod)                | EF Core
  v                                    v
wwwroot/index.html              SQL Server
                                ClientsAppAttestation
                                @clipvwbpod02
```

In production the React SPA is built into `DashyDashboard.Api/wwwroot` and served as static files by the API itself. There is no separate Vite process. IIS handles HTTPS termination and passes the Windows identity via the `Negotiate` header.

Middleware pipeline order (API):

1. Exception handler
2. HSTS / HTTPS redirect
3. Security response headers
4. Swagger (dev only)
5. CORS (dev only)
6. Rate limiter
7. Static files
8. Authentication / Authorization
9. `UserIdentityMiddleware` — resolves `CurrentUser` and `SuperUser` into `HttpContext.Items`
10. Controller routing

---

## Known Limitations

1. **Form-based login does not verify the password** — this is a deliberate dev convenience. Any password is accepted when `POST /api/auth/login` is called in Development mode. Production traffic never reaches this endpoint (IIS handles auth before the request arrives).

2. **No responsive layout** — the frontend is designed for desktop viewports (1280 px and wider). It will not render correctly on mobile or tablet.

3. **UserName column must match IIS Windows identity exactly** — `UserIdentityMiddleware` looks up users by `UserName == ctx.User.Identity.Name`. IIS typically passes `DOMAIN\loginname` (e.g., `BROADRIDGE\KalapurayilP`). The `UserName` column in `dbo.Users` must be populated with the exact same string that IIS sends. If users reach the app but see an empty dashboard, this is almost always the reason. See the troubleshooting guide.

4. **Initial production data must be imported manually** — EF Core migrations create the table structure but insert no data. Users, clients, and tool-access records must be imported from the authoritative Excel files (see `ClientsAppAttestation_Table_Structure_Documentation.pdf`, Appendix A for the SQL import pattern).
