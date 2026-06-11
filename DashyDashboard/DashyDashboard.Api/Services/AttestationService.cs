using DashyDashboard.Api.Data;
using DashyDashboard.Api.Models.Domain;
using DashyDashboard.Api.Models.DTOs;
using Microsoft.EntityFrameworkCore;

namespace DashyDashboard.Api.Services;

public class AttestationService
{
    private readonly AppDbContext _db;
    public AttestationService(AppDbContext db) { _db = db; }

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
}
