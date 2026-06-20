# DashyDashboard — Add screenshot columns to production DB

Fixes the "An unexpected error occurred / Couldn't load your team" errors on the
Manager, Admin, and Access pages. Cause: the deployed app expects 9 columns that
were never added to the production database. This adds them.

**Safe to run:** only *adds* columns, never drops or changes data. Wrapped in a
transaction (auto-undo on any error). Safe to run more than once — it skips any
column that already exists.

Run in **SQL Server Management Studio** against the **`ClientsAppAttestation`** database
(New Query → paste → Execute / F5).

## 1. Add the columns

```sql
USE [ClientsAppAttestation];
GO
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.UsersToolAccess','ToolUserId') IS NULL
        ALTER TABLE dbo.UsersToolAccess ADD ToolUserId nvarchar(100) NULL;

    IF COL_LENGTH('dbo.ToolCycleAttestation','ScreenshotHash') IS NULL
        ALTER TABLE dbo.ToolCycleAttestation ADD ScreenshotHash nvarchar(64) NULL;
    IF COL_LENGTH('dbo.ToolCycleAttestation','ScreenshotPath') IS NULL
        ALTER TABLE dbo.ToolCycleAttestation ADD ScreenshotPath nvarchar(500) NULL;
    IF COL_LENGTH('dbo.ToolCycleAttestation','ScreenshotRejectReason') IS NULL
        ALTER TABLE dbo.ToolCycleAttestation ADD ScreenshotRejectReason nvarchar(500) NULL;
    IF COL_LENGTH('dbo.ToolCycleAttestation','ScreenshotReviewedAt') IS NULL
        ALTER TABLE dbo.ToolCycleAttestation ADD ScreenshotReviewedAt datetime2 NULL;
    IF COL_LENGTH('dbo.ToolCycleAttestation','ScreenshotReviewedBy') IS NULL
        ALTER TABLE dbo.ToolCycleAttestation ADD ScreenshotReviewedBy varchar(50) NULL;
    IF COL_LENGTH('dbo.ToolCycleAttestation','ScreenshotStatus') IS NULL
        ALTER TABLE dbo.ToolCycleAttestation ADD ScreenshotStatus nvarchar(20) NULL;
    IF COL_LENGTH('dbo.ToolCycleAttestation','ScreenshotUploadedAt') IS NULL
        ALTER TABLE dbo.ToolCycleAttestation ADD ScreenshotUploadedAt datetime2 NULL;

    IF COL_LENGTH('dbo.ClientTools','ScreenshotRequired') IS NULL
        ALTER TABLE dbo.ClientTools ADD ScreenshotRequired bit NOT NULL
            CONSTRAINT DF_ClientTools_ScreenshotRequired DEFAULT (0) WITH VALUES;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
```

Expected result: **Commands completed successfully.**

## 2. Verify (should return 9 rows)

```sql
SELECT TABLE_NAME, COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE (TABLE_NAME='ClientTools'          AND COLUMN_NAME='ScreenshotRequired')
   OR (TABLE_NAME='ToolCycleAttestation' AND COLUMN_NAME LIKE 'Screenshot%')
   OR (TABLE_NAME='UsersToolAccess'      AND COLUMN_NAME='ToolUserId')
ORDER BY TABLE_NAME, COLUMN_NAME;
```

## 3. Done

Refresh the website — Manager / Admin / Access pages should load. No app restart or
redeploy needed.
