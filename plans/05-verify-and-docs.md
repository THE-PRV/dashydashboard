# Verification & Documentation

**Branch:** `feature/screenshots` · **Stages:** S6 (verify), S7 (docs)

## §Verify (S6)

Per CLAUDE.md: build and verify under Kestrel only — never IIS. Recipe:
`dotnet publish DashyDashboard\DashyDashboard.Api\DashyDashboard.Api.csproj -c Release -o publish-dev`,
then run with process env `ASPNETCORE_ENVIRONMENT=Development`,
`ASPNETCORE_URLS=http://127.0.0.1:5099`, `ConnectionStrings__Default=<local .\BANANALECLERC>`,
plus `Screenshots__RootPath=<a temp folder>`. Authenticate with the `X-User-Id` header
(dev fallback). Query SQL directly with `System.Data.SqlClient` to assert DB state.
If `MSB3030` (StaticWebAssets) appears after frontend changes: delete the API project's
`obj` + `bin`, re-publish.

End-to-end checklist (all via HTTP against Kestrel; fix failures before S7):

1. **Feature 1:** grant access with/without User ID; export .xlsx honors filters; User ID column populated.
2. Upload single screenshot → file + thumb exist under the configured root (folders auto-created),
   DB row has Path/Hash/UploadedAt, Status=Pending.
3. Clipboard-paste path uses the same endpoint (verify endpoint-level: re-upload overwrites,
   review fields cleared).
4. Batch upload: one valid file, one unmatched filename, one non-image → per-file results
   saved/unmatched/invalidImage; valid one stored.
5. Submit blocked while a non-exempt row lacks a screenshot; offending pairs returned; no-access
   row exempt; submit succeeds once all rows are Pending/Approved.
6. Reject without reason → 400. Reject with reason → Status=Rejected, reason stored, associate
   sees it; ScreenshotRejected mail fires when Email:Enabled (test with Enabled=false: no errors).
7. Re-upload of Rejected → back to Pending, review fields cleared. Post-due-date: re-upload of
   Rejected allowed; fresh upload on a NULL-status row blocked; review still allowed.
8. Approve-all → all Pending→Approved; member flips to Complete in team progress AND admin
   rollups; AllApproved fires exactly once; Incomplete-submissions export shows the right
   status per member.
9. Serving endpoints: owner OK, their manager OK, unrelated associate forbidden; thumb endpoint
   returns the small image; ETag set.
10. Zip download: streams, contains `{associateId}\{clientId}_{toolId}.webp` entries, scoped to
    caller.
11. AttestationLogs rows written for upload/approve/reject/bulk.

## §Docs (S7)

1. **Update `CLAUDE.md`** — session-changes section: new config keys, new endpoints, the
   completion-semantics change, new columns, the "restore appsettings after publish" checklist
   addition.
2. **Setup Guide PDF** — use the existing LaTeX pipeline in `docs/` (see
   `docs/production-deployment-guide.tex` as the template/style reference; compile the same way).
   Output: `docs/screenshots-setup-guide.pdf`. Contents:
   - New `appsettings.Production.json` keys (`Screenshots:*`, `Email:*`) and that publish
     OVERWRITES this file — keys must be re-added after every publish (extends the existing
     restore checklist).
   - Screenshot root folder: create it OUTSIDE the app folder (e.g. `D:\DashyData\Screenshots`),
     grant the IIS app-pool identity Modify ACL (elevated, one-time, per server). Include the
     exact `icacls` command.
   - Machine env-var alternative (`Screenshots__RootPath`) and when to prefer it.
   - EF migration application on dev and prod databases (the two migrations from the two
     branches, in merge order).
   - IT request template: internal SMTP relay host/port + approved sending mailbox for the
     `Email:From` address.
   - Retention policy statement: monthly cycles, keep 6 (`Screenshots:RetainCycles`); sweep is a
     future scheduled job; until then, purging = deleting `{root}\{cycleId}` folders older than
     6 cycles. Note the root folder should be added to server backup coverage (ops decision).
   - `deploy-dev.ps1` additions needed for the local box (set `Screenshots__RootPath`, create
     folder + ACL) — describe; do not run elevated steps.
3. **Follow-up phase note** (one section in the PDF or CLAUDE.md): scheduled `BackgroundService`
   for 7-day due-date reminder mails, manager pending-approvals digest, and the retention sweep.
