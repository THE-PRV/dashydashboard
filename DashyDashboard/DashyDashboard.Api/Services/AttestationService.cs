using DashyDashboard.Api.Common;
using DashyDashboard.Api.Data;
using DashyDashboard.Api.Models.Domain;
using DashyDashboard.Api.Models.DTOs;
using Microsoft.EntityFrameworkCore;

namespace DashyDashboard.Api.Services;

public class AttestationService
{
    private readonly AppDbContext _db;
    private readonly ScreenshotStorageService _screenshots;
    public AttestationService(AppDbContext db, ScreenshotStorageService screenshots)
    {
        _db = db;
        _screenshots = screenshots;
    }

    // Screenshot statuses that satisfy submit gating (§7). Rejected / NULL block submission.
    private static readonly string[] SubmittableScreenshotStatuses = { "Pending", "Approved" };

    private async Task AssertToolAccessAsync(string associateId, string clientId, int toolId)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);
        var toolExists = await _db.ClientTools.AnyAsync(ct => ct.ToolID == toolId && ct.ClientID == clientId);
        if (!toolExists)
            throw new KeyNotFoundException("Tool not found for this client.");

        var hasAccess = await _db.UserToolAccess
            .AnyAsync(uta => uta.AssociateId == associateId
                          && uta.ClientID == clientId
                          && uta.ToolID == toolId
                          && uta.Access
                          && uta.GivenDate <= today
                          && (uta.ToDate == null || uta.ToDate >= today));
        if (!hasAccess)
            throw new UnauthorizedAccessException(
                "Access to this tool is not granted for the current user.");
    }

    private async Task AssertCycleExistsAsync(int cycleId)
    {
        var exists = await _db.Cycles.AnyAsync(c => c.CycleID == cycleId);
        if (!exists)
            throw new KeyNotFoundException($"Cycle {cycleId} not found.");
    }

    public async Task<CycleDto?> GetCurrentCycleAsync()
    {
        var today = DateOnly.FromDateTime(DateTime.Today);
        var cycle = await _db.Cycles.AsNoTracking()
            .Where(c => c.DueDate >= today)
            .OrderBy(c => c.DueDate)
            .FirstOrDefaultAsync();

        if (cycle is null) return null;

        var daysLeft = cycle.DueDate.DayNumber - today.DayNumber;
        return new CycleDto(cycle.CycleID, cycle.CycleName, cycle.StartDate,
                            cycle.EndDate, cycle.DueDate, daysLeft);
    }

    public async Task<List<CycleDto>> GetAllCyclesAsync()
    {
        var today = DateOnly.FromDateTime(DateTime.Today);
        var cycles = await _db.Cycles.AsNoTracking()
            .OrderByDescending(c => c.DueDate)
            .ToListAsync();

        return cycles
            .Select(c => new CycleDto(c.CycleID, c.CycleName, c.StartDate, c.EndDate,
                                      c.DueDate, c.DueDate.DayNumber - today.DayNumber))
            .ToList();
    }

    public async Task<List<ClientAttestationDto>> GetUserAttestationsAsync(string associateId, int cycleId)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);

        var accessWithTools = await _db.UserToolAccess.AsNoTracking()
            .Where(uta => uta.AssociateId == associateId
                       && uta.Access
                       && uta.GivenDate <= today
                       && (uta.ToDate == null || uta.ToDate >= today))
            .Include(uta => uta.ClientTool)
            .ToListAsync();

        var clientNames = await _db.Clients.AsNoTracking()
            .Where(c => accessWithTools.Select(a => a.ClientID).Distinct().Contains(c.ClientID))
            .ToDictionaryAsync(c => c.ClientID, c => c.ClientName ?? c.ClientID);

        var attestations = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(tca => tca.AssociateId == associateId && tca.CycleID == cycleId)
            .ToListAsync();

        var grouped = accessWithTools
            .GroupBy(a => a.ClientID)
            .Select(g =>
            {
                var tools = g.Select(a =>
                {
                    var att = attestations.FirstOrDefault(x =>
                        x.ClientID == a.ClientID && x.ToolID == a.ToolID);
                    return new ToolAttestationDto(
                        a.ToolID,
                        a.ClientTool?.ToolName ?? "",
                        att?.UsedThisCycle,
                        att?.HadAccess ?? true,
                        att?.AttestationStatus ?? "Pending",
                        att?.Remarks,
                        att?.ScreenshotStatus,
                        att?.ScreenshotRejectReason,
                        att?.ScreenshotUploadedAt
                    );
                }).ToList();

                // "Decided" = answered Did-you-use OR declared no access. Both are complete attestations.
                var attested = tools.Count(t => t.UsedThisCycle.HasValue || t.HadAccess == false);
                var used = tools.Count(t => t.UsedThisCycle == true);

                return new ClientAttestationDto(
                    g.Key,
                    clientNames.GetValueOrDefault(g.Key, g.Key),
                    tools.Count,
                    attested,
                    used,
                    tools);
            })
            .OrderBy(c => c.ClientName)
            .ToList();

        return grouped;
    }

    public async Task ToggleUsedAsync(string associateId, int cycleId, string clientId, int toolId, bool? used)
    {
        await AssertCycleExistsAsync(cycleId);
        await AssertToolAccessAsync(associateId, clientId, toolId);

        var att = await _db.ToolCycleAttestations
            .FirstOrDefaultAsync(a =>
                a.AssociateId == associateId && a.CycleID == cycleId
                && a.ClientID == clientId && a.ToolID == toolId);

        if (att is null)
        {
            att = new ToolCycleAttestation
            {
                CycleID = cycleId, AssociateId = associateId,
                ClientID = clientId, ToolID = toolId,
                AttestationStatus = "Pending"
            };
            _db.ToolCycleAttestations.Add(att);
        }

        if (att.AttestationStatus == "Submitted")
            throw new InvalidOperationException("Attestation already submitted for this cycle.");

        att.UsedThisCycle = used;
        await _db.SaveChangesAsync();
    }

    public async Task ToggleHadAccessAsync(string associateId, int cycleId, string clientId, int toolId, bool? hadAccess)
    {
        await AssertCycleExistsAsync(cycleId);
        await AssertToolAccessAsync(associateId, clientId, toolId);

        var att = await _db.ToolCycleAttestations
            .FirstOrDefaultAsync(a =>
                a.AssociateId == associateId && a.CycleID == cycleId
                && a.ClientID == clientId && a.ToolID == toolId);

        if (att is null)
        {
            att = new ToolCycleAttestation
            {
                CycleID = cycleId, AssociateId = associateId,
                ClientID = clientId, ToolID = toolId,
                AttestationStatus = "Pending"
            };
            _db.ToolCycleAttestations.Add(att);
        }

        if (att.AttestationStatus == "Submitted")
            throw new InvalidOperationException("Attestation already submitted for this cycle.");

        att.HadAccess = hadAccess ?? true;
        if (hadAccess == false)
            att.UsedThisCycle = null;

        await _db.SaveChangesAsync();
    }

    public async Task UpdateRemarkAsync(string associateId, int cycleId, string clientId, int toolId, string? text)
    {
        await AssertCycleExistsAsync(cycleId);
        await AssertToolAccessAsync(associateId, clientId, toolId);

        var att = await _db.ToolCycleAttestations
            .FirstOrDefaultAsync(a =>
                a.AssociateId == associateId && a.CycleID == cycleId
                && a.ClientID == clientId && a.ToolID == toolId);

        if (att is null)
        {
            att = new ToolCycleAttestation
            {
                CycleID = cycleId, AssociateId = associateId,
                ClientID = clientId, ToolID = toolId,
                AttestationStatus = "Pending"
            };
            _db.ToolCycleAttestations.Add(att);
        }

        if (att.AttestationStatus == "Submitted")
            throw new InvalidOperationException("Attestation already submitted for this cycle.");

        att.Remarks = string.IsNullOrWhiteSpace(text) ? null : text.Trim();
        await _db.SaveChangesAsync();
    }

    public async Task<string> SubmitAllAsync(string associateId, int cycleId, string? remarks)
    {
        await AssertCycleExistsAsync(cycleId);

        var today = DateOnly.FromDateTime(DateTime.Today);
        var accessKeys = await _db.UserToolAccess.AsNoTracking()
            .Where(uta => uta.AssociateId == associateId
                       && uta.Access
                       && uta.GivenDate <= today
                       && (uta.ToDate == null || uta.ToDate >= today))
            .Select(uta => new { ClientID = uta.ClientID!, uta.ToolID })
            .ToListAsync();

        var accessKeySet = accessKeys
            .Select(key => (key.ClientID, key.ToolID))
            .ToHashSet();

        var allRows = await _db.ToolCycleAttestations
            .Where(tca => tca.AssociateId == associateId && tca.CycleID == cycleId)
            .ToListAsync();

        var activeRows = allRows
            .Where(tca => accessKeySet.Contains((tca.ClientID, tca.ToolID)))
            .ToList();

        var activeRowsByKey = activeRows
            .ToDictionary(tca => (tca.ClientID, tca.ToolID));

        var unanswered = accessKeys
            .Where(key => !activeRowsByKey.TryGetValue((key.ClientID, key.ToolID), out var row)
                       || !ScreenshotCompletion.IsAnswered(row.HadAccess, row.UsedThisCycle))
            .ToList();
        if (unanswered.Count > 0)
            throw new InvalidOperationException(
                "Answer every currently active access tool before submitting.");

        if (accessKeys.Count > 0
            && activeRows.All(tca => tca.AttestationStatus == "Submitted"))
        {
            throw new InvalidOperationException("Attestation for this cycle has already been submitted.");
        }

        var missingNoAccessRemark = activeRows
            .Any(tca => !tca.HadAccess
                     && string.IsNullOrWhiteSpace(tca.Remarks));
        if (missingNoAccessRemark)
            throw new InvalidOperationException("Add a remark for each tool you marked as 'No access' before submitting.");

        // Not-used remark gate (WI-1): a row the associate marked "Not used"
        // (HadAccess == true && UsedThisCycle == false) must explain why — require a remark,
        // mirroring the no-access remark gate above.
        var missingNotUsedRemark = activeRows
            .Any(tca => tca.HadAccess
                     && tca.UsedThisCycle == false
                     && string.IsNullOrWhiteSpace(tca.Remarks));
        if (missingNotUsedRemark)
            throw new InvalidOperationException("Add a remark for each tool you marked as 'Not used' before submitting.");

        // Screenshot gate (§7, WI-1): only USED rows (HadAccess == true && UsedThisCycle == true)
        // require a screenshot in Pending or Approved state. Rejected or NULL blocks submission.
        // No-access rows (HadAccess == false) AND not-used rows (UsedThisCycle == false) are exempt.
        var screenshotBlocking = activeRows
            .Where(tca => tca.HadAccess
                       && tca.UsedThisCycle == true
                       && (tca.ScreenshotStatus == null
                           || !SubmittableScreenshotStatuses.Contains(tca.ScreenshotStatus)))
            .Select(tca => new ScreenshotGateRow(tca.ClientID, tca.ToolID))
            .ToList();
        if (screenshotBlocking.Count > 0)
            throw new ScreenshotGateException(screenshotBlocking);

        var now = DateTime.UtcNow;

        foreach (var att in activeRows)
        {
            att.AttestationStatus = "Submitted";
            att.SubmittedAt = now;
            if (remarks != null) att.Remarks = remarks;
        }

        var submittedRows = activeRows;

        var user = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.AssociateId == associateId);

        var byClient = submittedRows
            .GroupBy(a => a.ClientID)
            .Select(g => $"{g.Count()} of {g.Key}");

        var name = user is not null ? $"{user.FirstName} {user.LastName}" : $"Associate {associateId}";
        var summary = $"{name} submitted attestation for {submittedRows.Count} tool{(submittedRows.Count == 1 ? "" : "s")}: {string.Join(", ", byClient)}";

        _db.AttestationLogs.Add(new AttestationLog
        {
            CycleID = cycleId,
            AssociateId = associateId,
            SubmittedAt = now,
            ToolCount = submittedRows.Count,
            Summary = summary
        });

        await _db.SaveChangesAsync();
        return summary;
    }

    public async Task ReopenAsync(string actorAssociateId, bool isAdmin, string targetAssociateId, int cycleId)
    {
        if (!isAdmin)
        {
            var reports = await _db.Users.AnyAsync(u => u.AssociateId == targetAssociateId && u.ManagerId == actorAssociateId);
            if (!reports) throw new UnauthorizedAccessException("You can only reopen your own direct reports' attestations.");
        }

        var rows = await _db.ToolCycleAttestations
            .Where(a => a.AssociateId == targetAssociateId
                     && a.CycleID == cycleId
                     && a.AttestationStatus == "Submitted")
            .ToListAsync();

        // Soft reopen (WI-7): flip submitted rows back to editable ("Pending" — the only
        // editable status the rest of the codebase knows) and clear SubmittedAt. KEEP answers,
        // remarks and all screenshot fields / review states untouched.
        foreach (var row in rows)
        {
            row.AttestationStatus = "Pending";
            row.SubmittedAt = null;
        }

        if (rows.Count > 0)
        {
            var actor = await _db.Users.AsNoTracking()
                .FirstOrDefaultAsync(u => u.AssociateId == actorAssociateId);
            var actorName = actor is not null ? actor.FullName : actorAssociateId;
            var summary = $"Reopened {targetAssociateId}'s attestation ({rows.Count} rows) by {actorName}";
            _db.AttestationLogs.Add(new AttestationLog
            {
                CycleID = cycleId,
                AssociateId = actorAssociateId, // log against the ACTOR (reviewer), like review events
                SubmittedAt = DateTime.UtcNow,
                ToolCount = rows.Count,
                Summary = summary.Length > 100 ? summary[..100] : summary
            });
        }

        await _db.SaveChangesAsync();
    }

    // ── Screenshots (§4) ──────────────────────────────────────────────────────

    /// <summary>
    /// Uploads (or re-uploads) the single screenshot for one attestation row. Validates the row
    /// exists and the upload is allowed per §7, persists via the storage service, sets status to
    /// Pending and clears any prior review, then writes an upload log row.
    /// Last write wins on re-upload.
    /// </summary>
    public async Task UploadScreenshotAsync(string associateId, int cycleId, string clientId, int toolId, byte[] bytes)
    {
        var att = await PrepareScreenshotRowAsync(associateId, cycleId, clientId, toolId);
        ApplyUpload(att, associateId, cycleId, clientId, toolId, bytes);

        LogScreenshotEvent(cycleId, associateId, 1,
            $"Screenshot uploaded for {clientId}/{toolId} (Pending review).");

        await _db.SaveChangesAsync();
    }

    /// <summary>
    /// Loads (or creates) the attestation row for an upload, asserting access and the §7 upload rule.
    /// Throws KeyNotFoundException (tool/cycle missing) / UnauthorizedAccessException (no access) /
    /// InvalidOperationException (upload not allowed).
    /// </summary>
    private async Task<ToolCycleAttestation> PrepareScreenshotRowAsync(
        string associateId, int cycleId, string clientId, int toolId)
    {
        await AssertCycleExistsAsync(cycleId);
        await AssertToolAccessAsync(associateId, clientId, toolId);

        var att = await _db.ToolCycleAttestations
            .FirstOrDefaultAsync(a =>
                a.AssociateId == associateId && a.CycleID == cycleId
                && a.ClientID == clientId && a.ToolID == toolId);

        if (att is null)
        {
            att = new ToolCycleAttestation
            {
                CycleID = cycleId, AssociateId = associateId,
                ClientID = clientId, ToolID = toolId,
                AttestationStatus = "Pending"
            };
            _db.ToolCycleAttestations.Add(att);
        }

        EnsureUploadAllowed(att);
        return att;
    }

    /// <summary>
    /// §7 upload rule. Any row may carry a screenshot. For no-access rows (HadAccess == false) and
    /// not-used rows (HadAccess == true && UsedThisCycle == false) the screenshot is OPTIONAL — the
    /// written reason stays required and the optional image never gates submission or completion
    /// (WI-1 / Work Order Task 1). Used and undecided rows are unchanged.
    /// After the cycle due date the ONLY allowed upload is re-uploading a currently-Rejected screenshot.
    /// </summary>
    private void EnsureUploadAllowed(ToolCycleAttestation att)
    {
        var cycle = _db.Cycles.AsNoTracking().First(c => c.CycleID == att.CycleID);
        var pastDue = DateOnly.FromDateTime(DateTime.Today) > cycle.DueDate;
        if (pastDue && att.ScreenshotStatus != "Rejected")
            throw new InvalidOperationException(
                "The cycle due date has passed; only rejected screenshots may be re-uploaded.");
    }

    /// <summary>Saves the bytes, stamps the row Pending and clears any prior review.</summary>
    private void ApplyUpload(ToolCycleAttestation att, string associateId, int cycleId,
        string clientId, int toolId, byte[] bytes)
    {
        var save = _screenshots.Save(bytes, cycleId, associateId, clientId, toolId);

        att.ScreenshotPath = save.RelativePath;
        att.ScreenshotHash = save.Sha256Hash;
        att.ScreenshotUploadedAt = DateTime.UtcNow;
        att.ScreenshotStatus = "Pending";
        att.ScreenshotReviewedBy = null;
        att.ScreenshotReviewedAt = null;
        att.ScreenshotRejectReason = null;
    }

    /// <summary>Adds an AttestationLogs row for a screenshot event. Summary is truncated to fit (100).</summary>
    private void LogScreenshotEvent(int cycleId, string associateId, int count, string summary)
    {
        _db.AttestationLogs.Add(new AttestationLog
        {
            CycleID = cycleId,
            AssociateId = associateId,
            SubmittedAt = DateTime.UtcNow,
            ToolCount = count,
            Summary = summary.Length > 100 ? summary[..100] : summary
        });
    }
}
