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
                        att?.Remarks
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

        var alreadySubmitted = await _db.ToolCycleAttestations.AsNoTracking()
            .AnyAsync(tca => tca.AssociateId == associateId
                          && tca.CycleID == cycleId
                          && tca.AttestationStatus == "Submitted");
        if (alreadySubmitted)
            throw new InvalidOperationException("Attestation for this cycle has already been submitted.");

        var missingRemark = await _db.ToolCycleAttestations.AsNoTracking()
            .AnyAsync(tca => tca.CycleID == cycleId
                          && tca.AssociateId == associateId
                          && tca.HadAccess == false
                          && (tca.Remarks == null || tca.Remarks.Trim() == ""));
        if (missingRemark)
            throw new InvalidOperationException("Add a remark for each tool you marked as 'No access' before submitting.");

        // Screenshot gate (§7): every non-exempt row (HadAccess != false) that is being submitted
        // must have a screenshot in Pending or Approved state. Rejected or NULL blocks submission.
        // No-access rows (HadAccess == false) are exempt.
        var screenshotBlocking = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(tca => tca.CycleID == cycleId
                       && tca.AssociateId == associateId
                       && tca.HadAccess
                       && tca.UsedThisCycle.HasValue
                       && (tca.ScreenshotStatus == null
                           || !SubmittableScreenshotStatuses.Contains(tca.ScreenshotStatus)))
            .Select(tca => new ScreenshotGateRow(tca.ClientID, tca.ToolID))
            .ToListAsync();
        if (screenshotBlocking.Count > 0)
            throw new ScreenshotGateException(screenshotBlocking);

        var today = DateOnly.FromDateTime(DateTime.Today);
        var accessKeys = await _db.UserToolAccess.AsNoTracking()
            .Where(uta => uta.AssociateId == associateId
                       && uta.Access
                       && uta.GivenDate <= today
                       && (uta.ToDate == null || uta.ToDate >= today))
            .Select(uta => new { uta.ClientID, uta.ToolID })
            .ToListAsync();

        var now = DateTime.UtcNow;

        foreach (var key in accessKeys)
        {
            var att = await _db.ToolCycleAttestations
                .FirstOrDefaultAsync(a =>
                    a.AssociateId == associateId && a.CycleID == cycleId
                    && a.ClientID == key.ClientID && a.ToolID == key.ToolID);

            if (att is null)
            {
                att = new ToolCycleAttestation
                {
                    CycleID = cycleId, AssociateId = associateId,
                    ClientID = key.ClientID, ToolID = key.ToolID
                };
                _db.ToolCycleAttestations.Add(att);
            }

            // Submit tools the user actually decided on: either answered usage, or declared no access.
            if (att.UsedThisCycle.HasValue || att.HadAccess == false)
            {
                att.AttestationStatus = "Submitted";
                att.SubmittedAt = now;
                if (remarks != null) att.Remarks = remarks;
            }
        }

        var submittedRows = _db.ToolCycleAttestations.Local
            .Where(a => a.AssociateId == associateId && a.CycleID == cycleId
                     && a.AttestationStatus == "Submitted")
            .ToList();

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

        foreach (var row in rows)
        {
            row.AttestationStatus = "InProgress";
            row.SubmittedAt = null;
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
    /// Batch upload. Each file is named <c>{clientId}_{toolId}.ext</c> (split on the FIRST underscore;
    /// clientIds never contain '_'). The tool part is matched against the caller's OWN attestation
    /// rows in this cycle (by int ToolID string-form, then ToolName) BEFORE any disk path is composed.
    /// Matched files flow through the same single-upload pipeline. Unmatched / disallowed / invalid
    /// files are reported per-file; partial success is fine. Writes ONE log row with the saved count.
    /// </summary>
    public async Task<BatchScreenshotResult> UploadBatchAsync(
        string associateId, int cycleId, IReadOnlyList<(string FileName, byte[] Bytes)> files)
    {
        await AssertCycleExistsAsync(cycleId);

        // The caller's attestation rows for this cycle: the only legitimate upload targets.
        var rows = await _db.ToolCycleAttestations
            .Where(a => a.AssociateId == associateId && a.CycleID == cycleId)
            .ToListAsync();

        // Tool names for matching the filename's tool part against a human-readable name.
        var toolNames = await _db.ClientTools.AsNoTracking()
            .Where(ct => rows.Select(r => r.ToolID).Distinct().Contains(ct.ToolID))
            .ToDictionaryAsync(ct => ct.ToolID, ct => ct.ToolName ?? "");

        var results = new List<BatchScreenshotItemResult>();
        var saved = 0;

        foreach (var (fileName, bytes) in files)
        {
            var (clientId, toolPart) = SplitBatchFileName(fileName);
            if (clientId is null)
            {
                results.Add(new BatchScreenshotItemResult(fileName, "unmatched",
                    "Name must be {clientId}_{toolId}.ext"));
                continue;
            }

            // Match against the caller's own rows: clientId exact, tool part = ToolID (string form)
            // or the tool's name (case-insensitive). This binds to a validated DB row before any
            // disk path is built.
            var match = rows.FirstOrDefault(r =>
                string.Equals(r.ClientID, clientId, StringComparison.OrdinalIgnoreCase)
                && (string.Equals(r.ToolID.ToString(), toolPart, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(toolNames.GetValueOrDefault(r.ToolID, ""), toolPart, StringComparison.OrdinalIgnoreCase)));

            if (match is null)
            {
                results.Add(new BatchScreenshotItemResult(fileName, "unmatched",
                    "No matching tool access for this cycle."));
                continue;
            }

            try
            {
                EnsureUploadAllowed(match);
            }
            catch (InvalidOperationException ex)
            {
                results.Add(new BatchScreenshotItemResult(fileName, "notAllowed", ex.Message));
                continue;
            }

            try
            {
                ApplyUpload(match, associateId, cycleId, match.ClientID, match.ToolID, bytes);
                saved++;
                results.Add(new BatchScreenshotItemResult(fileName, "saved", null));
            }
            catch (ArgumentException)
            {
                results.Add(new BatchScreenshotItemResult(fileName, "invalidImage",
                    "File is not a valid image."));
            }
        }

        if (saved > 0)
        {
            LogScreenshotEvent(cycleId, associateId, saved,
                $"Batch screenshot upload: {saved} of {files.Count} saved (Pending review).");
        }

        await _db.SaveChangesAsync();
        return new BatchScreenshotResult(results);
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
    /// §7 upload rules: no-access rows (HadAccess == false) are exempt and never carry a screenshot.
    /// After the cycle due date the ONLY allowed upload is re-uploading a currently-Rejected screenshot.
    /// </summary>
    private void EnsureUploadAllowed(ToolCycleAttestation att)
    {
        if (!att.HadAccess)
            throw new InvalidOperationException("This tool is marked as no access and does not require a screenshot.");

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

    /// <summary>Splits a batch filename on the FIRST underscore into (clientId, toolPart).</summary>
    private static (string? ClientId, string ToolPart) SplitBatchFileName(string fileName)
    {
        var name = Path.GetFileNameWithoutExtension(fileName ?? "");
        var us = name.IndexOf('_');
        if (us <= 0 || us == name.Length - 1) return (null, "");
        return (name[..us], name[(us + 1)..]);
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
