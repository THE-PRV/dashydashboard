using System.Security.Cryptography;
using DashyDashboard.Api.Common;
using DashyDashboard.Api.Models.Domain;
using DashyDashboard.Api.Services;
using Microsoft.EntityFrameworkCore;
using SkiaSharp;

namespace DashyDashboard.Api.Data;

/// <summary>
/// Development-only, idempotent demo seeder for UI-overhaul WI-10.
///
/// The demo cohort is attached to the same active cycle selected by AttestationService:
/// the cycle with the earliest DueDate on or after today.
///
/// Demo members:
///   DEMO01 Nadia Huang   - NotStarted; active access, no cycle rows.
///   DEMO02 Marcus Bell   - InProgress; used row plus not-used row with a remark.
///   DEMO03 Sofia Reyes   - AwaitingApproval; submitted with Pending screenshots.
///   DEMO04 Liam O'Brien  - ActionNeeded; Rejected screenshot, Approved screenshot, dispute.
///   DEMO05 Priya Nair    - Complete; all used screenshots Approved plus a submitted dispute.
///   DEMO06 Carlos Mendez - InProgress; not-used remarks, Pending screenshot, and a not-used row
///                          retaining an old Approved screenshot.
///
/// Admin dashboard distribution:
///   DTC Settlements      - Completed (about 92%).
///   Government Settlement - On track (about 82%).
///   International        - Below target (about 62%).
///   Reorg                - At risk (about 38%).
///
/// Safety and repeatability:
///   - Program.cs calls this only in Development when EnableDemoSeedData is true.
///   - The connected database must match DeveloperMode:DemoSeedDatabaseName, which defaults to
///     DashyDashboardDev.
///   - DEMO-prefixed users provide detailed status and screenshot fixtures.
///   - The dashboard distribution pass only promotes otherwise-empty/incomplete current-cycle
///     rows in the guarded development database. It never touches screenshot rows, rows with
///     remarks, production configuration, access grants, users, or historical cycles.
///   - DEMO01..DEMO06 access is reconciled to the assignment manifest on every run. Attestation
///     cleanup is limited to the selected cycle; historical rows in other cycles are preserved.
///   - Dates and timestamps are derived from the selected cycle, never from the run time.
///   - Fixtures default to Y:\checksum and can be overridden through
///     DeveloperMode:SeedFixturesPath (including DeveloperMode__SeedFixturesPath in the environment).
///     Assignments are fixed. JPEG fixtures are converted to WebP before they are passed to
///     ScreenshotStorageService so the stored extension, bytes, hash, and response type agree.
///   - Missing fixtures do not fail startup. The affected DEMO screenshot is cleared, preventing
///     stale metadata from a previous successful run from falsely satisfying status coverage.
/// </summary>
public static class SeedData
{
    private const string DefaultDemoDatabaseName = "DashyDashboardDev";
    private const string DefaultFixturesPath = @"Y:\checksum";
    private const string ManagerId = "PRV001";
    private const string Department = "DTC Settlements";
    private const string Reviewer = "PRV001";
    private const string ClientUs = "DTC-US";
    private const string ClientUk = "DTC-UK";
    private const string DashboardFixtureRemark =
        "Development dashboard fixture: tool was not used during this cycle.";

    private static readonly IReadOnlyDictionary<string, DashboardTarget> DashboardTargets =
        new Dictionary<string, DashboardTarget>(StringComparer.OrdinalIgnoreCase)
        {
            ["DTC Settlements"] = new(92, "Completed"),
            ["Government Settlement"] = new(82, "On track"),
            ["International"] = new(62, "Below target"),
            ["Reorg"] = new(38, "At risk")
        };

    private static readonly IReadOnlyDictionary<string, string> ExpectedStates =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["DEMO01"] = ScreenshotCompletion.MemberNotStarted,
            ["DEMO02"] = ScreenshotCompletion.MemberInProgress,
            ["DEMO03"] = ScreenshotCompletion.MemberAwaitingApproval,
            ["DEMO04"] = ScreenshotCompletion.MemberActionNeeded,
            ["DEMO05"] = ScreenshotCompletion.MemberComplete,
            ["DEMO06"] = ScreenshotCompletion.MemberInProgress
        };

    public static async Task EnsureSeededAsync(
        AppDbContext db,
        ScreenshotStorageService screenshots,
        IConfiguration config,
        ILogger logger)
    {
        var expectedDatabase = config["DeveloperMode:DemoSeedDatabaseName"];
        if (string.IsNullOrWhiteSpace(expectedDatabase))
            expectedDatabase = DefaultDemoDatabaseName;

        var actualDatabase = db.Database.GetDbConnection().Database;
        if (!string.Equals(actualDatabase, expectedDatabase, StringComparison.OrdinalIgnoreCase))
        {
            logger.LogError(
                "Demo seed skipped: connected database '{ActualDatabase}' does not match the allowed database '{ExpectedDatabase}'.",
                actualDatabase,
                expectedDatabase);
            return;
        }

        var today = DateOnly.FromDateTime(DateTime.Today);
        var cycle = await db.Cycles.AsNoTracking()
            .Where(c => c.DueDate >= today)
            .OrderBy(c => c.DueDate)
            .ThenBy(c => c.CycleID)
            .FirstOrDefaultAsync();

        if (cycle is null)
        {
            logger.LogWarning("Demo seed skipped: no active cycle was found.");
            return;
        }

        var manager = await db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.AssociateId == ManagerId && u.IsActive);
        if (manager is null)
        {
            logger.LogWarning("Demo seed skipped: active manager {ManagerId} was not found.", ManagerId);
            return;
        }

        if (!string.Equals(manager.Department, Department, StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning(
                "Demo seed skipped: manager {ManagerId} belongs to '{ActualDepartment}', expected '{ExpectedDepartment}'.",
                ManagerId,
                manager.Department,
                Department);
            return;
        }

        var departmentId = await db.Departments.AsNoTracking()
            .Where(d => d.DepartmentName == Department)
            .Select(d => (int?)d.DepartmentID)
            .FirstOrDefaultAsync();
        if (departmentId is null)
        {
            logger.LogWarning("Demo seed skipped: department '{Department}' was not found.", Department);
            return;
        }

        var usTools = await ToolMapAsync(db, ClientUs);
        var ukTools = await ToolMapAsync(db, ClientUk);
        var missingTools = RequiredTools(usTools, ukTools);
        if (missingTools.Count > 0)
        {
            logger.LogWarning(
                "Demo seed skipped: required client tools are missing: {MissingTools}.",
                string.Join(", ", missingTools));
            return;
        }

        // Per-tool "screenshot required" flag: most tools are OPTIONAL (the DB default), but the
        // demo's screenshot-bearing tools are flagged REQUIRED so the demo exercises BOTH the
        // gating/review path (required) and the viewable-only path (optional). The demo's
        // ExpectedStates were authored under "used tool needs an approved screenshot", which only
        // holds when these tools are required.
        var requiredToolIds = new[]
        {
            Tool(usTools, "Trade Capture"),
            Tool(usTools, "Settlement Gateway"),
            Tool(usTools, "Reconciliation Hub"),
            Tool(usTools, "Reporting Suite"),
            Tool(ukTools, "Compliance Portal"),
        };
        var toolsToFlag = await db.ClientTools
            .Where(ct => requiredToolIds.Contains(ct.ToolID))
            .ToListAsync();
        foreach (var ct in toolsToFlag)
            ct.ScreenshotRequired = true;
        await db.SaveChangesAsync();

        var fixturesPath = config["DeveloperMode:SeedFixturesPath"];
        if (string.IsNullOrWhiteSpace(fixturesPath))
            fixturesPath = DefaultFixturesPath;

        var fixturesDirectoryAvailable =
            Directory.Exists(fixturesPath);
        if (!fixturesDirectoryAvailable)
        {
            logger.LogWarning(
                "Demo seed: fixture directory '{Path}' was not found. Demo rows will be seeded without screenshots.",
                fixturesPath);
        }

        await UpsertUserAsync(db, "DEMO01", "Nadia", "Huang", "nadia.huang@demo.dashy");
        await UpsertUserAsync(db, "DEMO02", "Marcus", "Bell", "marcus.bell@demo.dashy");
        await UpsertUserAsync(db, "DEMO03", "Sofia", "Reyes", "sofia.reyes@demo.dashy");
        await UpsertUserAsync(db, "DEMO04", "Liam", "O'Brien", "liam.obrien@demo.dashy");
        await UpsertUserAsync(db, "DEMO05", "Priya", "Nair", "priya.nair@demo.dashy");
        await UpsertUserAsync(db, "DEMO06", "Carlos", "Mendez", "carlos.mendez@demo.dashy");
        await db.SaveChangesAsync();

        var granted = cycle.StartDate.AddDays(-30);
        var accessTo = cycle.DueDate.AddDays(120);
        var cycleId = cycle.CycleID;
        var assignments = BuildAssignmentManifest(usTools, ukTools);

        await PruneUnplannedDemoDataAsync(db, screenshots, cycleId, assignments, logger);
        await db.SaveChangesAsync();

        foreach (var assignment in assignments)
        {
            await GrantAsync(
                db,
                assignment.AssociateId,
                assignment.ClientId,
                assignment.ToolId,
                assignment.ToolUserId,
                granted,
                accessTo,
                departmentId.Value);
        }
        await db.SaveChangesAsync();

        var uploadedAt = CycleTimestamp(cycle.StartDate, dayOffset: 7, hour: 14);
        var submittedAt = CycleTimestamp(cycle.StartDate, dayOffset: 8, hour: 10);
        var reviewedAt = CycleTimestamp(cycle.StartDate, dayOffset: 9, hour: 11);

        await ResetNotStartedMemberAsync(db, screenshots, cycleId, "DEMO01");
        await db.SaveChangesAsync();

        void ClearSeededScreenshot(ToolCycleAttestation row)
        {
            screenshots.Delete(row.CycleID, row.AssociateId, row.ClientID, row.ToolID);
            ClearScreenshot(row);
        }

        await UpsertRowAsync(db, cycleId, "DEMO02", ClientUs, Tool(usTools, "Trade Capture"), row =>
        {
            row.HadAccess = true;
            row.UsedThisCycle = true;
            row.Remarks = null;
            row.AttestationStatus = "Pending";
            row.SubmittedAt = null;
        });
        await UpsertRowAsync(db, cycleId, "DEMO02", ClientUs, Tool(usTools, "Reconciliation Hub"), row =>
        {
            row.HadAccess = true;
            row.UsedThisCycle = false;
            row.Remarks = "Did not need the Reconciliation Hub this cycle; all recon handled in Trade Capture.";
            row.AttestationStatus = "Pending";
            row.SubmittedAt = null;
            ClearSeededScreenshot(row);
        });

        await UpsertRowAsync(db, cycleId, "DEMO03", ClientUs, Tool(usTools, "Trade Capture"), row =>
        {
            row.HadAccess = true;
            row.UsedThisCycle = true;
            row.Remarks = null;
            row.AttestationStatus = "Submitted";
            row.SubmittedAt = submittedAt;
        });
        await UpsertRowAsync(db, cycleId, "DEMO03", ClientUs, Tool(usTools, "Settlement Gateway"), row =>
        {
            row.HadAccess = true;
            row.UsedThisCycle = true;
            row.Remarks = null;
            row.AttestationStatus = "Submitted";
            row.SubmittedAt = submittedAt;
        });

        await UpsertRowAsync(db, cycleId, "DEMO04", ClientUs, Tool(usTools, "Trade Capture"), row =>
        {
            row.HadAccess = true;
            row.UsedThisCycle = true;
            row.Remarks = null;
            row.AttestationStatus = "Submitted";
            row.SubmittedAt = submittedAt;
        });
        await UpsertRowAsync(db, cycleId, "DEMO04", ClientUs, Tool(usTools, "Settlement Gateway"), row =>
        {
            row.HadAccess = true;
            row.UsedThisCycle = true;
            row.Remarks = null;
            row.AttestationStatus = "Submitted";
            row.SubmittedAt = submittedAt;
        });
        await UpsertRowAsync(db, cycleId, "DEMO04", ClientUk, Tool(ukTools, "Compliance Portal"), row =>
        {
            row.HadAccess = false;
            row.UsedThisCycle = null;
            row.Remarks = "I do not have access to the DTC-UK Compliance Portal; please remove this grant.";
            row.AttestationStatus = "Submitted";
            row.SubmittedAt = submittedAt;
            ClearSeededScreenshot(row);
        });

        await UpsertRowAsync(db, cycleId, "DEMO05", ClientUs, Tool(usTools, "Trade Capture"), row =>
        {
            row.HadAccess = true;
            row.UsedThisCycle = true;
            row.Remarks = null;
            row.AttestationStatus = "Submitted";
            row.SubmittedAt = submittedAt;
        });
        await UpsertRowAsync(db, cycleId, "DEMO05", ClientUs, Tool(usTools, "Reporting Suite"), row =>
        {
            row.HadAccess = true;
            row.UsedThisCycle = true;
            row.Remarks = null;
            row.AttestationStatus = "Submitted";
            row.SubmittedAt = submittedAt;
        });
        await UpsertRowAsync(db, cycleId, "DEMO05", ClientUk, Tool(ukTools, "Compliance Portal"), row =>
        {
            row.HadAccess = false;
            row.UsedThisCycle = null;
            row.Remarks = "I do not have access to the DTC-UK Compliance Portal; please remove this grant.";
            row.AttestationStatus = "Submitted";
            row.SubmittedAt = submittedAt;
            ClearSeededScreenshot(row);
        });

        await UpsertRowAsync(db, cycleId, "DEMO06", ClientUs, Tool(usTools, "Trade Capture"), row =>
        {
            row.HadAccess = true;
            row.UsedThisCycle = true;
            row.Remarks = null;
            row.AttestationStatus = "Pending";
            row.SubmittedAt = null;
        });
        await UpsertRowAsync(db, cycleId, "DEMO06", ClientUs, Tool(usTools, "Reconciliation Hub"), row =>
        {
            row.HadAccess = true;
            row.UsedThisCycle = false;
            row.Remarks = "Used this earlier in the quarter but not in the current cycle window.";
            row.AttestationStatus = "Pending";
            row.SubmittedAt = null;
        });
        await UpsertRowAsync(db, cycleId, "DEMO06", ClientUs, Tool(usTools, "Reporting Suite"), row =>
        {
            row.HadAccess = true;
            row.UsedThisCycle = false;
            row.Remarks = "Reporting Suite access is for a covered colleague; I did not use it this cycle.";
            row.AttestationStatus = "Pending";
            row.SubmittedAt = null;
            ClearSeededScreenshot(row);
        });
        await db.SaveChangesAsync();

        var screenshotCoverage = fixturesDirectoryAvailable;
        screenshotCoverage &= await IngestAsync(
            db, screenshots, fixturesPath, logger, cycleId, uploadedAt,
            "DEMO02", ClientUs, Tool(usTools, "Trade Capture"), 11, "Pending", null, null, null);

        screenshotCoverage &= await IngestAsync(
            db, screenshots, fixturesPath, logger, cycleId, uploadedAt,
            "DEMO03", ClientUs, Tool(usTools, "Trade Capture"), 12, "Pending", null, null, null);
        screenshotCoverage &= await IngestAsync(
            db, screenshots, fixturesPath, logger, cycleId, uploadedAt,
            "DEMO03", ClientUs, Tool(usTools, "Settlement Gateway"), 13, "Pending", null, null, null);

        screenshotCoverage &= await IngestAsync(
            db, screenshots, fixturesPath, logger, cycleId, uploadedAt,
            "DEMO04", ClientUs, Tool(usTools, "Trade Capture"), 14, "Rejected",
            "Screenshot is blurry and the tool header is cut off; please re-capture the full window.",
            Reviewer, reviewedAt);
        screenshotCoverage &= await IngestAsync(
            db, screenshots, fixturesPath, logger, cycleId, uploadedAt,
            "DEMO04", ClientUs, Tool(usTools, "Settlement Gateway"), 15, "Approved",
            null, Reviewer, reviewedAt);

        screenshotCoverage &= await IngestAsync(
            db, screenshots, fixturesPath, logger, cycleId, uploadedAt,
            "DEMO05", ClientUs, Tool(usTools, "Trade Capture"), 16, "Approved",
            null, Reviewer, reviewedAt);
        screenshotCoverage &= await IngestAsync(
            db, screenshots, fixturesPath, logger, cycleId, uploadedAt,
            "DEMO05", ClientUs, Tool(usTools, "Reporting Suite"), 17, "Approved",
            null, Reviewer, reviewedAt);

        screenshotCoverage &= await IngestAsync(
            db, screenshots, fixturesPath, logger, cycleId, uploadedAt,
            "DEMO06", ClientUs, Tool(usTools, "Trade Capture"), 18, "Pending",
            null, null, null);
        screenshotCoverage &= await IngestAsync(
            db, screenshots, fixturesPath, logger, cycleId, uploadedAt,
            "DEMO06", ClientUs, Tool(usTools, "Reconciliation Hub"), 19, "Approved",
            null, Reviewer, reviewedAt);
        await db.SaveChangesAsync();

        await UpsertSubmitLogAsync(db, cycleId, "DEMO03", "Sofia Reyes", 2, submittedAt);
        await UpsertSubmitLogAsync(db, cycleId, "DEMO04", "Liam O'Brien", 3, submittedAt);
        await UpsertSubmitLogAsync(db, cycleId, "DEMO05", "Priya Nair", 3, submittedAt);
        await db.SaveChangesAsync();

        await ReconcileDashboardDistributionAsync(db, cycle, submittedAt, logger);
        await db.SaveChangesAsync();

        await ValidateCoverageAsync(db, cycleId, assignments, screenshotCoverage, logger);
        await ValidateDashboardDistributionAsync(db, cycleId, logger);

        logger.LogInformation(
            "Demo seed complete: 6 demo members upserted for active cycle {CycleId} ({CycleName}).",
            cycleId,
            cycle.CycleName);
    }

    private static async Task<Dictionary<string, int>> ToolMapAsync(AppDbContext db, string clientId)
    {
        var tools = await db.ClientTools.AsNoTracking()
            .Where(tool => tool.ClientID == clientId && tool.ToolName != null)
            .Select(tool => new { tool.ToolID, tool.ToolName })
            .ToListAsync();

        return tools
            .OrderBy(tool => tool.ToolID)
            .GroupBy(tool => tool.ToolName!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First().ToolID, StringComparer.OrdinalIgnoreCase);
    }

    private static List<string> RequiredTools(
        IReadOnlyDictionary<string, int> usTools,
        IReadOnlyDictionary<string, int> ukTools)
    {
        var missing = new List<string>();
        foreach (var name in new[] { "Trade Capture", "Settlement Gateway", "Reconciliation Hub", "Reporting Suite" })
        {
            if (!usTools.ContainsKey(name))
                missing.Add($"{ClientUs}/{name}");
        }

        if (!ukTools.ContainsKey("Compliance Portal"))
            missing.Add($"{ClientUk}/Compliance Portal");

        return missing;
    }

    private static int Tool(IReadOnlyDictionary<string, int> map, string toolName)
        => map[toolName];

    private static IReadOnlyList<DemoAssignment> BuildAssignmentManifest(
        IReadOnlyDictionary<string, int> usTools,
        IReadOnlyDictionary<string, int> ukTools)
        =>
        new List<DemoAssignment>
        {
            new("DEMO01", ClientUs, Tool(usTools, "Trade Capture"), null, HasCycleRow: false),
            new("DEMO01", ClientUs, Tool(usTools, "Settlement Gateway"), null, HasCycleRow: false),

            new("DEMO02", ClientUs, Tool(usTools, "Trade Capture"), null, HasCycleRow: true),
            new("DEMO02", ClientUs, Tool(usTools, "Reconciliation Hub"), null, HasCycleRow: true),

            new("DEMO03", ClientUs, Tool(usTools, "Trade Capture"), "sreyes-tc", HasCycleRow: true),
            new("DEMO03", ClientUs, Tool(usTools, "Settlement Gateway"), null, HasCycleRow: true),

            new("DEMO04", ClientUs, Tool(usTools, "Trade Capture"), null, HasCycleRow: true),
            new("DEMO04", ClientUs, Tool(usTools, "Settlement Gateway"), null, HasCycleRow: true),
            new("DEMO04", ClientUk, Tool(ukTools, "Compliance Portal"), null, HasCycleRow: true),

            new("DEMO05", ClientUs, Tool(usTools, "Trade Capture"), "pnair01", HasCycleRow: true),
            new("DEMO05", ClientUs, Tool(usTools, "Reporting Suite"), "pnair02", HasCycleRow: true),
            new("DEMO05", ClientUk, Tool(ukTools, "Compliance Portal"), null, HasCycleRow: true),

            new("DEMO06", ClientUs, Tool(usTools, "Trade Capture"), "cmendez", HasCycleRow: true),
            new("DEMO06", ClientUs, Tool(usTools, "Reconciliation Hub"), null, HasCycleRow: true),
            new("DEMO06", ClientUs, Tool(usTools, "Reporting Suite"), null, HasCycleRow: true)
        };

    private static DateTime CycleTimestamp(DateOnly cycleStart, int dayOffset, int hour)
        => DateTime.SpecifyKind(
            cycleStart.AddDays(dayOffset).ToDateTime(new TimeOnly(hour, 0)),
            DateTimeKind.Utc);

    private static async Task PruneUnplannedDemoDataAsync(
        AppDbContext db,
        ScreenshotStorageService screenshots,
        int cycleId,
        IReadOnlyCollection<DemoAssignment> assignments,
        ILogger logger)
    {
        var demoIds = ExpectedStates.Keys.ToArray();
        var expectedAccessKeys = assignments
            .Select(assignment => DemoToolKey.Create(
                assignment.AssociateId,
                assignment.ClientId,
                assignment.ToolId))
            .ToHashSet();
        var expectedCycleRowKeys = assignments
            .Where(assignment => assignment.HasCycleRow)
            .Select(assignment => DemoToolKey.Create(
                assignment.AssociateId,
                assignment.ClientId,
                assignment.ToolId))
            .ToHashSet();

        var accessRows = await db.UserToolAccess
            .Where(access =>
                access.AssociateId != null
                && demoIds.Contains(access.AssociateId))
            .ToListAsync();
        var unplannedAccessRows = accessRows
            .Where(access =>
                access.ClientID is null
                || !expectedAccessKeys.Contains(DemoToolKey.Create(
                    access.AssociateId!,
                    access.ClientID,
                    access.ToolID)))
            .ToList();
        db.UserToolAccess.RemoveRange(unplannedAccessRows);

        var cycleRows = await db.ToolCycleAttestations
            .Where(row =>
                row.CycleID == cycleId
                && demoIds.Contains(row.AssociateId))
            .ToListAsync();
        var unplannedCycleRows = cycleRows
            .Where(row => !expectedCycleRowKeys.Contains(DemoToolKey.Create(
                row.AssociateId,
                row.ClientID,
                row.ToolID)))
            .ToList();
        foreach (var row in unplannedCycleRows)
            screenshots.Delete(row.CycleID, row.AssociateId, row.ClientID, row.ToolID);
        db.ToolCycleAttestations.RemoveRange(unplannedCycleRows);

        logger.LogInformation(
            "Demo seed cleanup for cycle {CycleId}: pruned {AccessCount} unplanned access rows and {CycleRowCount} unplanned cycle rows.",
            cycleId,
            unplannedAccessRows.Count,
            unplannedCycleRows.Count);
    }

    private static async Task UpsertUserAsync(
        AppDbContext db,
        string id,
        string first,
        string last,
        string email)
    {
        var user = await db.Users.FirstOrDefaultAsync(item => item.AssociateId == id);
        if (user is null)
        {
            user = new User { AssociateId = id };
            db.Users.Add(user);
        }

        user.FirstName = first;
        user.LastName = last;
        user.EmailAddr = email;
        user.Department = Department;
        user.ManagerId = ManagerId;
        user.UserName = $"DEMO\\{id}";
        user.PrimaryLocationId = "NYC";
        user.IsActive = true;
    }

    private static async Task GrantAsync(
        AppDbContext db,
        string associateId,
        string clientId,
        int toolId,
        string? toolUserId,
        DateOnly given,
        DateOnly to,
        int departmentId)
    {
        var grant = await db.UserToolAccess.FirstOrDefaultAsync(access =>
            access.AssociateId == associateId
            && access.ClientID == clientId
            && access.ToolID == toolId);

        if (grant is null)
        {
            grant = new UserToolAccess
            {
                AssociateId = associateId,
                ClientID = clientId,
                ToolID = toolId
            };
            db.UserToolAccess.Add(grant);
        }

        grant.Access = true;
        grant.GivenDate = given;
        grant.ToDate = to;
        grant.ToolUserId = toolUserId;
        grant.DepartmentID = departmentId;
    }

    private static async Task UpsertRowAsync(
        AppDbContext db,
        int cycleId,
        string associateId,
        string clientId,
        int toolId,
        Action<ToolCycleAttestation> mutate)
    {
        var row = await db.ToolCycleAttestations.FirstOrDefaultAsync(item =>
            item.CycleID == cycleId
            && item.AssociateId == associateId
            && item.ClientID == clientId
            && item.ToolID == toolId);

        if (row is null)
        {
            row = new ToolCycleAttestation
            {
                CycleID = cycleId,
                AssociateId = associateId,
                ClientID = clientId,
                ToolID = toolId
            };
            db.ToolCycleAttestations.Add(row);
        }

        mutate(row);
    }

    private static async Task ResetNotStartedMemberAsync(
        AppDbContext db,
        ScreenshotStorageService screenshots,
        int cycleId,
        string associateId)
    {
        var rows = await db.ToolCycleAttestations
            .Where(row => row.CycleID == cycleId && row.AssociateId == associateId)
            .ToListAsync();
        foreach (var row in rows)
            screenshots.Delete(row.CycleID, row.AssociateId, row.ClientID, row.ToolID);
        db.ToolCycleAttestations.RemoveRange(rows);

        var logs = await db.AttestationLogs
            .Where(log => log.CycleID == cycleId && log.AssociateId == associateId)
            .ToListAsync();
        db.AttestationLogs.RemoveRange(logs);
    }

    private static void ClearScreenshot(ToolCycleAttestation row)
    {
        row.ScreenshotPath = null;
        row.ScreenshotHash = null;
        row.ScreenshotUploadedAt = null;
        row.ScreenshotStatus = null;
        row.ScreenshotReviewedBy = null;
        row.ScreenshotReviewedAt = null;
        row.ScreenshotRejectReason = null;
    }

    private static async Task<bool> IngestAsync(
        AppDbContext db,
        ScreenshotStorageService screenshots,
        string? fixturesPath,
        ILogger logger,
        int cycleId,
        DateTime uploadedAt,
        string associateId,
        string clientId,
        int toolId,
        int photoNumber,
        string status,
        string? rejectReason,
        string? reviewedBy,
        DateTime? reviewedAt)
    {
        var row = await db.ToolCycleAttestations.FirstOrDefaultAsync(item =>
            item.CycleID == cycleId
            && item.AssociateId == associateId
            && item.ClientID == clientId
            && item.ToolID == toolId);
        if (row is null)
            return false;

        if (string.IsNullOrWhiteSpace(fixturesPath) || !Directory.Exists(fixturesPath))
        {
            ClearStoredScreenshot(screenshots, row);
            return false;
        }

        var fixture = Path.Combine(fixturesPath, $"photo_{photoNumber}.jpg");
        if (!File.Exists(fixture))
        {
            logger.LogWarning(
                "Demo seed: fixture '{Fixture}' is missing; screenshot for {AssociateId}/{ClientId}/{ToolId} was cleared.",
                fixture,
                associateId,
                clientId,
                toolId);
            ClearStoredScreenshot(screenshots, row);
            return false;
        }

        byte[] webpBytes;
        try
        {
            var sourceBytes = await File.ReadAllBytesAsync(fixture);
            webpBytes = EncodeWebp(sourceBytes);
        }
        catch (Exception ex)
        {
            logger.LogWarning(
                ex,
                "Demo seed: fixture '{Fixture}' could not be read or converted; screenshot for {AssociateId}/{ClientId}/{ToolId} was cleared.",
                fixture,
                associateId,
                clientId,
                toolId);
            ClearStoredScreenshot(screenshots, row);
            return false;
        }

        var expectedHash = Sha256Hex(webpBytes);
        var expectedPath = Path.Combine(
            cycleId.ToString(),
            associateId,
            clientId,
            $"{toolId}.webp");
        var expectedThumbPath = Path.Combine(
            cycleId.ToString(),
            associateId,
            clientId,
            $"{toolId}_thumb.webp");

        if (!StoredScreenshotMatches(
                screenshots,
                row,
                expectedPath,
                expectedThumbPath,
                expectedHash))
        {
            try
            {
                var saved = screenshots.Save(webpBytes, cycleId, associateId, clientId, toolId);
                row.ScreenshotPath = saved.RelativePath;
                row.ScreenshotHash = saved.Sha256Hash;
            }
            catch (Exception ex)
            {
                logger.LogWarning(
                    ex,
                    "Demo seed: screenshot storage failed for {AssociateId}/{ClientId}/{ToolId}; stale screenshot state was cleared.",
                    associateId,
                    clientId,
                    toolId);
                ClearStoredScreenshot(screenshots, row);
                return false;
            }
        }
        else
        {
            row.ScreenshotPath = expectedPath;
            row.ScreenshotHash = expectedHash;
        }

        row.ScreenshotUploadedAt = uploadedAt;
        row.ScreenshotStatus = status;
        if (status == ScreenshotCompletion.StatusRejected)
        {
            row.ScreenshotRejectReason = rejectReason;
            row.ScreenshotReviewedBy = reviewedBy;
            row.ScreenshotReviewedAt = reviewedAt;
        }
        else if (status == ScreenshotCompletion.StatusApproved)
        {
            row.ScreenshotRejectReason = null;
            row.ScreenshotReviewedBy = reviewedBy;
            row.ScreenshotReviewedAt = reviewedAt;
        }
        else
        {
            row.ScreenshotRejectReason = null;
            row.ScreenshotReviewedBy = null;
            row.ScreenshotReviewedAt = null;
        }

        return true;
    }

    private static byte[] EncodeWebp(byte[] sourceBytes)
    {
        using var bitmap = SKBitmap.Decode(sourceBytes)
            ?? throw new InvalidOperationException("Fixture is not a decodable image.");
        using var image = SKImage.FromBitmap(bitmap);
        using var encoded = image.Encode(SKEncodedImageFormat.Webp, quality: 90)
            ?? throw new InvalidOperationException("Fixture could not be encoded as WebP.");
        return encoded.ToArray();
    }

    private static bool StoredScreenshotMatches(
        ScreenshotStorageService screenshots,
        ToolCycleAttestation row,
        string expectedPath,
        string expectedThumbPath,
        string expectedHash)
    {
        if (!string.Equals(row.ScreenshotPath, expectedPath, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(row.ScreenshotHash, expectedHash, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var mainFile = screenshots.Read(expectedPath);
        var thumbFile = screenshots.Read(expectedThumbPath);
        if (mainFile is null || thumbFile is null)
        {
            mainFile?.Content.Dispose();
            thumbFile?.Content.Dispose();
            return false;
        }

        using (mainFile.Content)
        using (thumbFile.Content)
        {
            return string.Equals(
                Sha256Hex(mainFile.Content),
                expectedHash,
                StringComparison.OrdinalIgnoreCase);
        }
    }

    private static void ClearStoredScreenshot(
        ScreenshotStorageService screenshots,
        ToolCycleAttestation row)
    {
        screenshots.Delete(row.CycleID, row.AssociateId, row.ClientID, row.ToolID);
        ClearScreenshot(row);
    }

    private static string Sha256Hex(byte[] bytes)
        => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    private static string Sha256Hex(Stream stream)
        => Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();

    private static async Task UpsertSubmitLogAsync(
        AppDbContext db,
        int cycleId,
        string associateId,
        string name,
        int toolCount,
        DateTime submittedAt)
    {
        var summary = $"{name} submitted attestation for {toolCount} tools (demo seed).";
        var matchingLogs = await db.AttestationLogs
            .Where(log =>
                log.CycleID == cycleId
                && log.AssociateId == associateId
                && log.Summary != null
                && log.Summary.EndsWith("(demo seed)."))
            .OrderBy(log => log.LogID)
            .ToListAsync();

        var log = matchingLogs.FirstOrDefault();
        if (log is null)
        {
            log = new AttestationLog
            {
                CycleID = cycleId,
                AssociateId = associateId,
                Summary = summary
            };
            db.AttestationLogs.Add(log);
        }

        log.SubmittedAt = submittedAt;
        log.ToolCount = toolCount;
        log.Summary = summary;

        if (matchingLogs.Count > 1)
            db.AttestationLogs.RemoveRange(matchingLogs.Skip(1));
    }

    private static async Task ReconcileDashboardDistributionAsync(
        AppDbContext db,
        Cycle cycle,
        DateTime submittedAt,
        ILogger logger)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);
        var targetDepartments = DashboardTargets.Keys.ToArray();

        var activeAccessRows = await (
            from access in db.UserToolAccess.AsNoTracking()
            join user in db.Users.AsNoTracking()
                on access.AssociateId equals user.AssociateId
            where access.AssociateId != null
                  && access.ClientID != null
                  && access.Access
                  && access.GivenDate <= today
                  && (access.ToDate == null || access.ToDate >= today)
                  && user.Department != null
                  && targetDepartments.Contains(user.Department)
            select new
            {
                user.Department,
                AssociateId = access.AssociateId!,
                ClientId = access.ClientID!,
                access.ToolID
            })
            .ToListAsync();

        var activeAccess = activeAccessRows
            .Select(row => new DashboardAccess(
                row.Department!,
                row.AssociateId,
                row.ClientId,
                row.ToolID))
            .ToList();

        var associateIds = activeAccess
            .Select(row => row.AssociateId)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var cycleRows = await db.ToolCycleAttestations
            .Where(row =>
                row.CycleID == cycle.CycleID
                && associateIds.Contains(row.AssociateId))
            .ToListAsync();
        var rowsByKey = cycleRows.ToDictionary(
            row => DemoToolKey.Create(row.AssociateId, row.ClientID, row.ToolID));

        foreach (var (department, target) in DashboardTargets)
        {
            var departmentAccess = activeAccess
                .Where(row => string.Equals(
                    row.Department,
                    department,
                    StringComparison.OrdinalIgnoreCase))
                .OrderBy(row => row.AssociateId, StringComparer.OrdinalIgnoreCase)
                .ThenBy(row => row.ClientId, StringComparer.OrdinalIgnoreCase)
                .ThenBy(row => row.ToolId)
                .ToList();

            if (departmentAccess.Count == 0)
            {
                throw new InvalidOperationException(
                    $"Development dashboard fixture cannot seed '{department}': no active tool access was found.");
            }

            var currentDone = departmentAccess.Count(access =>
                rowsByKey.TryGetValue(access.Key, out var row)
                && CountsAsDashboardDone(row));
            var desiredDone = (int)Math.Ceiling(departmentAccess.Count * target.Percent / 100d);
            var promotionsNeeded = Math.Max(0, desiredDone - currentDone);

            var candidates = departmentAccess
                .Where(access =>
                    !access.AssociateId.StartsWith("DEMO", StringComparison.OrdinalIgnoreCase)
                    && (!rowsByKey.TryGetValue(access.Key, out var row)
                        || IsSafeDashboardCandidate(row)))
                .OrderBy(access => rowsByKey.ContainsKey(access.Key) ? 1 : 0)
                .ThenBy(access => access.AssociateId, StringComparer.OrdinalIgnoreCase)
                .ThenBy(access => access.ClientId, StringComparer.OrdinalIgnoreCase)
                .ThenBy(access => access.ToolId)
                .Take(promotionsNeeded)
                .ToList();

            if (candidates.Count != promotionsNeeded)
            {
                throw new InvalidOperationException(
                    $"Development dashboard fixture cannot reach {target.Percent}% for '{department}' "
                    + $"without overwriting screenshot or remark data. Needed {promotionsNeeded} safe rows, "
                    + $"found {candidates.Count}.");
            }

            foreach (var access in candidates)
            {
                if (!rowsByKey.TryGetValue(access.Key, out var row))
                {
                    row = new ToolCycleAttestation
                    {
                        CycleID = cycle.CycleID,
                        AssociateId = access.AssociateId,
                        ClientID = access.ClientId,
                        ToolID = access.ToolId
                    };
                    db.ToolCycleAttestations.Add(row);
                    rowsByKey.Add(access.Key, row);
                }

                row.HadAccess = true;
                row.UsedThisCycle = false;
                row.AttestationStatus = "Submitted";
                row.SubmittedAt = submittedAt;
                row.Remarks = DashboardFixtureRemark;
                ClearScreenshot(row);
            }

            logger.LogInformation(
                "Development dashboard fixture: {Department} promoted {PromotedCount} rows toward {TargetPercent}% ({ExpectedBand}).",
                department,
                candidates.Count,
                target.Percent,
                target.ExpectedBand);
        }
    }

    private static bool IsSafeDashboardCandidate(ToolCycleAttestation row)
        => !CountsAsDashboardDone(row)
           && row.ScreenshotPath is null
           && row.ScreenshotHash is null
           && row.ScreenshotStatus is null
           && string.IsNullOrWhiteSpace(row.Remarks);

    private static bool CountsAsDashboardDone(ToolCycleAttestation row)
        => !row.HadAccess
           || row.UsedThisCycle == false
           || (row.UsedThisCycle == true
               && row.ScreenshotStatus == ScreenshotCompletion.StatusApproved);

    private static async Task ValidateDashboardDistributionAsync(
        AppDbContext db,
        int cycleId,
        ILogger logger)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);
        var targetDepartments = DashboardTargets.Keys.ToArray();
        var activeAccess = await (
            from access in db.UserToolAccess.AsNoTracking()
            join user in db.Users.AsNoTracking()
                on access.AssociateId equals user.AssociateId
            where access.AssociateId != null
                  && access.ClientID != null
                  && access.Access
                  && access.GivenDate <= today
                  && (access.ToDate == null || access.ToDate >= today)
                  && user.Department != null
                  && targetDepartments.Contains(user.Department)
            select new
            {
                user.Department,
                AssociateId = access.AssociateId!,
                ClientId = access.ClientID!,
                access.ToolID
            })
            .ToListAsync();

        var associateIds = activeAccess
            .Select(row => row.AssociateId)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var cycleRows = await db.ToolCycleAttestations.AsNoTracking()
            .Where(row =>
                row.CycleID == cycleId
                && associateIds.Contains(row.AssociateId))
            .ToListAsync();
        var rowsByKey = cycleRows.ToDictionary(
            row => DemoToolKey.Create(row.AssociateId, row.ClientID, row.ToolID));

        var results = activeAccess
            .GroupBy(row => row.Department!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group =>
                {
                    var total = group.Count();
                    var done = group.Count(access =>
                        rowsByKey.TryGetValue(
                            DemoToolKey.Create(access.AssociateId, access.ClientId, access.ToolID),
                            out var row)
                        && CountsAsDashboardDone(row));
                    var percent = total == 0 ? 0 : done * 100d / total;
                    return new DashboardResult(total, done, percent, DashboardBand(percent));
                },
                StringComparer.OrdinalIgnoreCase);

        var mismatches = DashboardTargets
            .Where(target =>
                !results.TryGetValue(target.Key, out var result)
                || !string.Equals(
                    result.Band,
                    target.Value.ExpectedBand,
                    StringComparison.OrdinalIgnoreCase))
            .Select(target =>
            {
                if (!results.TryGetValue(target.Key, out var result))
                    return $"{target.Key}: no active access";

                return $"{target.Key}: expected {target.Value.ExpectedBand}, "
                       + $"actual {result.Band} ({result.Percent:F1}%)";
            })
            .ToList();

        if (mismatches.Count > 0)
        {
            throw new InvalidOperationException(
                $"Development dashboard distribution validation failed: {string.Join("; ", mismatches)}.");
        }

        logger.LogInformation(
            "Development dashboard distribution verified for cycle {CycleId}: {Distribution}.",
            cycleId,
            string.Join(
                ", ",
                results.OrderBy(result => result.Key).Select(result =>
                    $"{result.Key}={result.Value.Percent:F1}% ({result.Value.Band})")));
    }

    private static string DashboardBand(double percent)
        => percent >= 90 ? "Completed"
            : percent >= 75 ? "On track"
            : percent >= 50 ? "Below target"
            : "At risk";

    private static async Task ValidateCoverageAsync(
        AppDbContext db,
        int cycleId,
        IReadOnlyCollection<DemoAssignment> assignments,
        bool screenshotCoverage,
        ILogger logger)
    {
        await ValidateManifestAsync(db, cycleId, assignments);

        var rows = await db.ToolCycleAttestations.AsNoTracking()
            .Where(row =>
                row.CycleID == cycleId
                && ExpectedStates.Keys.Contains(row.AssociateId))
            .ToListAsync();

        // Per-tool "screenshot required" flag (toolId is the global PK). Missing => optional.
        var screenshotRequiredByToolId = await db.ClientTools.AsNoTracking()
            .Select(ct => new { ct.ToolID, ct.ScreenshotRequired })
            .ToDictionaryAsync(x => x.ToolID, x => x.ScreenshotRequired);

        var actualStates = ExpectedStates.Keys.ToDictionary(
            associateId => associateId,
            associateId => ScreenshotCompletion.ComputeMemberStatus(
                rows.Where(row => row.AssociateId == associateId)
                    .Select(row => (
                        row.HadAccess,
                        row.UsedThisCycle,
                        screenshotRequiredByToolId.GetValueOrDefault(row.ToolID, false),
                        row.ScreenshotStatus,
                        row.AttestationStatus))),
            StringComparer.OrdinalIgnoreCase);

        var stateMismatches = ExpectedStates
            .Where(expected => actualStates[expected.Key] != expected.Value)
            .Select(expected =>
                $"{expected.Key}: expected {expected.Value}, actual {actualStates[expected.Key]}")
            .ToList();

        if (stateMismatches.Count > 0)
        {
            var message = string.Join("; ", stateMismatches);
            if (screenshotCoverage)
                throw new InvalidOperationException($"Demo status coverage validation failed: {message}");

            logger.LogWarning(
                "Demo status coverage is degraded because screenshot fixtures were unavailable: {Mismatches}.",
                message);
        }

        var disputes = rows
            .Where(row => !row.HadAccess && !string.IsNullOrWhiteSpace(row.Remarks))
            .ToList();
        var disputeMembers = disputes
            .Select(row => row.AssociateId)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();
        if (disputeMembers < 2)
            throw new InvalidOperationException("Demo coverage validation failed: disputes require at least two members.");
        if (disputes.Any(row => row.SubmittedAt is null))
            throw new InvalidOperationException(
                "Demo coverage validation failed: each dispute must have a date available to the manager overlay.");

        var notUsedWithRemark = rows.Any(row =>
            row.HadAccess
            && row.UsedThisCycle == false
            && !string.IsNullOrWhiteSpace(row.Remarks));
        if (!notUsedWithRemark)
            throw new InvalidOperationException("Demo coverage validation failed: no not-used row has a remark.");

        if (screenshotCoverage)
        {
            var reviewStates = rows
                .Where(row => row.ScreenshotStatus != null)
                .Select(row => row.ScreenshotStatus!)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var required in new[]
                     {
                         ScreenshotCompletion.StatusPending,
                         ScreenshotCompletion.StatusApproved,
                         ScreenshotCompletion.StatusRejected
                     })
            {
                if (!reviewStates.Contains(required))
                    throw new InvalidOperationException(
                        $"Demo coverage validation failed: screenshot status '{required}' is missing.");
            }

            var oldScreenshot = rows.Any(row =>
                row.AssociateId == "DEMO06"
                && row.HadAccess
                && row.UsedThisCycle == false
                && row.ScreenshotStatus == ScreenshotCompletion.StatusApproved
                && row.ScreenshotPath != null);
            if (!oldScreenshot)
                throw new InvalidOperationException(
                    "Demo coverage validation failed: the not-used row with an old screenshot is missing.");
        }

        logger.LogInformation(
            "Demo coverage verified for cycle {CycleId}: {States}. Screenshot fixtures complete: {ScreenshotCoverage}.",
            cycleId,
            string.Join(", ", actualStates.OrderBy(item => item.Key).Select(item => $"{item.Key}={item.Value}")),
            screenshotCoverage);
    }

    private static async Task ValidateManifestAsync(
        AppDbContext db,
        int cycleId,
        IReadOnlyCollection<DemoAssignment> assignments)
    {
        var demoIds = ExpectedStates.Keys.ToArray();
        var expectedAccessKeys = assignments
            .Select(assignment => DemoToolKey.Create(
                assignment.AssociateId,
                assignment.ClientId,
                assignment.ToolId))
            .ToHashSet();
        var expectedCycleRowKeys = assignments
            .Where(assignment => assignment.HasCycleRow)
            .Select(assignment => DemoToolKey.Create(
                assignment.AssociateId,
                assignment.ClientId,
                assignment.ToolId))
            .ToHashSet();

        var accessRows = await db.UserToolAccess.AsNoTracking()
            .Where(access =>
                access.AssociateId != null
                && demoIds.Contains(access.AssociateId))
            .Select(access => new { access.AssociateId, access.ClientID, access.ToolID })
            .ToListAsync();
        var actualAccessKeys = accessRows
            .Select(access => DemoToolKey.Create(
                access.AssociateId!,
                access.ClientID ?? "",
                access.ToolID))
            .ToHashSet();

        var cycleRows = await db.ToolCycleAttestations.AsNoTracking()
            .Where(row =>
                row.CycleID == cycleId
                && demoIds.Contains(row.AssociateId))
            .Select(row => new { row.AssociateId, row.ClientID, row.ToolID })
            .ToListAsync();
        var actualCycleRowKeys = cycleRows
            .Select(row => DemoToolKey.Create(row.AssociateId, row.ClientID, row.ToolID))
            .ToHashSet();

        ValidateExactKeys("access", expectedAccessKeys, actualAccessKeys);
        ValidateExactKeys("cycle attestation", expectedCycleRowKeys, actualCycleRowKeys);
    }

    private static void ValidateExactKeys(
        string rowType,
        IReadOnlySet<DemoToolKey> expected,
        IReadOnlySet<DemoToolKey> actual)
    {
        var missing = expected.Except(actual).OrderBy(FormatKey).ToList();
        var unexpected = actual.Except(expected).OrderBy(FormatKey).ToList();
        if (missing.Count == 0 && unexpected.Count == 0)
            return;

        throw new InvalidOperationException(
            $"Demo manifest validation failed for {rowType} rows. "
            + $"Missing: {FormatKeys(missing)}. Unexpected: {FormatKeys(unexpected)}.");
    }

    private static string FormatKeys(IReadOnlyCollection<DemoToolKey> keys)
        => keys.Count == 0 ? "none" : string.Join(", ", keys.Select(FormatKey));

    private static string FormatKey(DemoToolKey key)
        => $"{key.AssociateId}/{key.ClientId}/{key.ToolId}";

    private sealed record DemoAssignment(
        string AssociateId,
        string ClientId,
        int ToolId,
        string? ToolUserId,
        bool HasCycleRow);

    private sealed record DashboardTarget(int Percent, string ExpectedBand);

    private sealed record DashboardAccess(
        string Department,
        string AssociateId,
        string ClientId,
        int ToolId)
    {
        public DemoToolKey Key => DemoToolKey.Create(AssociateId, ClientId, ToolId);
    }

    private sealed record DashboardResult(
        int Total,
        int Done,
        double Percent,
        string Band);

    private readonly record struct DemoToolKey(string AssociateId, string ClientId, int ToolId)
    {
        public static DemoToolKey Create(string associateId, string clientId, int toolId)
            => new(associateId.ToUpperInvariant(), clientId.ToUpperInvariant(), toolId);
    }
}
