/* ============================================================================
   DashyDashboard — incremental schema upgrade  (DB: ClientsAppAttestation)
   Safe to run repeatedly: every change is guarded by IF NOT EXISTS, so columns
   that already exist are skipped. Run against the target DB in one batch.
   Covers feature migrations:
     20260611112843  ToolUserId
     20260611115259  Screenshot columns
     20260617160904  ScreenshotRequired
     20260625202430  AccessStatus / WorkingState / TicketId  (+ backfill)
   ============================================================================ */

/* ---- UsersToolAccess : per-tool login --------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.UsersToolAccess') AND name = 'ToolUserId')
    ALTER TABLE dbo.UsersToolAccess ADD ToolUserId nvarchar(100) NULL;
GO

/* ---- ClientTools : per-tool "screenshot required" toggle -------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ClientTools') AND name = 'ScreenshotRequired')
    ALTER TABLE dbo.ClientTools ADD ScreenshotRequired bit NOT NULL CONSTRAINT DF_ClientTools_ScreenshotRequired DEFAULT (0);
GO

/* ---- ToolCycleAttestation : screenshot evidence ---------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ToolCycleAttestation') AND name = 'ScreenshotPath')
    ALTER TABLE dbo.ToolCycleAttestation ADD ScreenshotPath nvarchar(500) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ToolCycleAttestation') AND name = 'ScreenshotHash')
    ALTER TABLE dbo.ToolCycleAttestation ADD ScreenshotHash nvarchar(64) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ToolCycleAttestation') AND name = 'ScreenshotUploadedAt')
    ALTER TABLE dbo.ToolCycleAttestation ADD ScreenshotUploadedAt datetime2 NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ToolCycleAttestation') AND name = 'ScreenshotStatus')
    ALTER TABLE dbo.ToolCycleAttestation ADD ScreenshotStatus nvarchar(20) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ToolCycleAttestation') AND name = 'ScreenshotReviewedBy')
    ALTER TABLE dbo.ToolCycleAttestation ADD ScreenshotReviewedBy varchar(50) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ToolCycleAttestation') AND name = 'ScreenshotReviewedAt')
    ALTER TABLE dbo.ToolCycleAttestation ADD ScreenshotReviewedAt datetime2 NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ToolCycleAttestation') AND name = 'ScreenshotRejectReason')
    ALTER TABLE dbo.ToolCycleAttestation ADD ScreenshotRejectReason nvarchar(500) NULL;
GO

/* ---- ToolCycleAttestation : access-status / working-state / ticket ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ToolCycleAttestation') AND name = 'AccessStatus')
    ALTER TABLE dbo.ToolCycleAttestation ADD AccessStatus varchar(20) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ToolCycleAttestation') AND name = 'WorkingState')
    ALTER TABLE dbo.ToolCycleAttestation ADD WorkingState varchar(20) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ToolCycleAttestation') AND name = 'TicketId')
    ALTER TABLE dbo.ToolCycleAttestation ADD TicketId varchar(100) NULL;
GO

/* ---- Backfill legacy rows onto the new enum-string model --------------------
   Only touches rows where AccessStatus is still NULL. Harmless on a fresh DB.   */
UPDATE dbo.ToolCycleAttestation SET AccessStatus = 'NotRequired'
    WHERE AccessStatus IS NULL AND HadAccess = 0;
UPDATE dbo.ToolCycleAttestation SET AccessStatus = 'Complete', WorkingState = 'Working'
    WHERE AccessStatus IS NULL AND HadAccess = 1 AND UsedThisCycle = 1;
UPDATE dbo.ToolCycleAttestation SET AccessStatus = 'Complete', WorkingState = 'Blocked'
    WHERE AccessStatus IS NULL AND HadAccess = 1 AND UsedThisCycle = 0;
GO
