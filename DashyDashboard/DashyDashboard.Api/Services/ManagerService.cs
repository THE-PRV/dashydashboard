using DashyDashboard.Api.Data;
using DashyDashboard.Api.Models.Domain;
using DashyDashboard.Api.Models.DTOs;
using Microsoft.EntityFrameworkCore;

namespace DashyDashboard.Api.Services;

public class ManagerService
{
    private readonly AppDbContext _db;
    public ManagerService(AppDbContext db) { _db = db; }

    public async Task<TeamDto> GetTeamAsync(string managerId, int cycleId, bool includeEmpty = false)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);

        var reports = await _db.Users.AsNoTracking()
            .Where(u => u.ManagerId == managerId)
            .ToListAsync();

        var userIds = reports.Select(u => u.AssociateId).ToList();

        var toolCounts = await _db.UserToolAccess.AsNoTracking()
            .Where(uta => userIds.Contains(uta.AssociateId)
                       && uta.Access
                       && uta.GivenDate <= today
                       && (uta.ToDate == null || uta.ToDate >= today))
            .GroupBy(uta => uta.AssociateId)
            .Select(g => new { AssociateId = g.Key, Count = g.Count() })
            .ToListAsync();

        var attestCounts = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(tca => userIds.Contains(tca.AssociateId)
                       && tca.CycleID == cycleId
                       && (tca.UsedThisCycle.HasValue || tca.HadAccess == false))
            .GroupBy(tca => tca.AssociateId)
            .Select(g => new { AssociateId = g.Key, Count = g.Count() })
            .ToListAsync();

        var allMembers = reports.Select(u =>
        {
            var total = toolCounts.FirstOrDefault(t => t.AssociateId == u.AssociateId)?.Count ?? 0;
            var attested = attestCounts.FirstOrDefault(a => a.AssociateId == u.AssociateId)?.Count ?? 0;
            var pct = total > 0 ? (double)attested / total : 0;
            var status = pct >= 1 ? "Submitted" : attested == 0 ? "NotStarted" : "InProgress";
            return new TeamMemberDto(u.AssociateId, $"{u.FirstName} {u.LastName}", u.EmailAddr ?? "", status, total, attested, Math.Round(pct, 4));
        }).ToList();

        var members = includeEmpty ? allMembers : allMembers.Where(m => m.TotalTools > 0).ToList();

        var mismatchMembers = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(tca => userIds.Contains(tca.AssociateId) && tca.CycleID == cycleId && !tca.HadAccess)
            .Select(tca => tca.AssociateId)
            .Distinct()
            .CountAsync();

        return new TeamDto(
            members.Count,
            members.Sum(m => m.TotalTools),
            members.Sum(m => m.AttestedTools),
            members.Count(m => m.AttestationStatus == "Submitted"),
            members.Count(m => m.AttestationStatus == "InProgress"),
            members.Count(m => m.AttestationStatus == "NotStarted"),
            mismatchMembers,
            members);
    }

    public async Task<MemberDetailDto?> GetMemberDetailAsync(string managerId, string memberId, int cycleId)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);

        var member = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.AssociateId == memberId && u.ManagerId == managerId);

        if (member is null) return null;

        var accessKeys = await _db.UserToolAccess.AsNoTracking()
            .Where(uta => uta.AssociateId == memberId
                       && uta.Access
                       && uta.GivenDate <= today
                       && (uta.ToDate == null || uta.ToDate >= today))
            .Select(uta => new { uta.ClientID, uta.ToolID })
            .ToListAsync();

        var clientNames = await _db.Clients.AsNoTracking()
            .Where(c => accessKeys.Select(a => a.ClientID).Distinct().Contains(c.ClientID))
            .ToDictionaryAsync(c => c.ClientID, c => c.ClientName ?? c.ClientID);

        var attestations = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(tca => tca.AssociateId == memberId && tca.CycleID == cycleId
                       && (tca.UsedThisCycle.HasValue || tca.HadAccess == false))
            .ToListAsync();

        var answeredKeys = attestations
            .Select(a => (a.ClientID, a.ToolID))
            .ToHashSet();

        var byClient = accessKeys
            .GroupBy(a => a.ClientID)
            .Select(g =>
            {
                var total = g.Count();
                var attested = g.Count(ak => answeredKeys.Contains((ak.ClientID, ak.ToolID)));
                return new ClientProgressDto(g.Key, clientNames.GetValueOrDefault(g.Key, g.Key), total, attested);
            })
            .OrderBy(c => c.ClientName)
            .ToList();

        var mismatches = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(tca => tca.AssociateId == memberId && tca.CycleID == cycleId && !tca.HadAccess)
            .Include(tca => tca.Cycle)
            .ToListAsync();

        var clientToolNames = await _db.ClientTools.AsNoTracking()
            .Where(ct => mismatches.Select(m => m.ToolID).Contains(ct.ToolID))
            .ToDictionaryAsync(ct => ct.ToolID, ct => new { ct.ToolName, ct.ClientID });

        var mismatchClientNames = await _db.Clients.AsNoTracking()
            .Where(c => mismatches.Select(m => m.ClientID).Contains(c.ClientID))
            .ToDictionaryAsync(c => c.ClientID, c => c.ClientName ?? c.ClientID);

        var mismatchDtos = mismatches.Select(m => {
            var toolInfo = clientToolNames.GetValueOrDefault(m.ToolID);
            var clientName = mismatchClientNames.GetValueOrDefault(m.ClientID, m.ClientID);
            return new MismatchDto(clientName, toolInfo?.ToolName ?? m.ToolID.ToString(), m.Remarks);
        }).ToList();

        var totalTools = byClient.Sum(c => c.TotalTools);
        var totalAttested = byClient.Sum(c => c.AttestedTools);
        var pct = totalTools > 0 ? (double)totalAttested / totalTools : 0;
        var status = pct >= 1 ? "Submitted" : totalAttested == 0 ? "NotStarted" : "InProgress";

        return new MemberDetailDto(member.AssociateId, $"{member.FirstName} {member.LastName}",
                                   status, totalTools, totalAttested, Math.Round(pct, 4), byClient, mismatchDtos);
    }

    public async Task<List<DisputeExportDto>> GetDisputesAsync(string managerId, int cycleId)
    {
        var reports = await _db.Users.AsNoTracking()
            .Where(u => u.ManagerId == managerId)
            .ToListAsync();

        var userIds = reports.Select(u => u.AssociateId).ToList();

        var disputes = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(tca => userIds.Contains(tca.AssociateId) && tca.CycleID == cycleId && !tca.HadAccess)
            .ToListAsync();

        if (!disputes.Any()) return new List<DisputeExportDto>();

        var disputedToolIds = disputes.Select(d => d.ToolID).Distinct().ToList();
        var disputedClientIds = disputes.Select(d => d.ClientID).Distinct().ToList();

        var clientTools = await _db.ClientTools.AsNoTracking()
            .Where(ct => disputedToolIds.Contains(ct.ToolID))
            .ToListAsync();
        var toolNameMap = clientTools
            .ToDictionary(ct => $"{ct.ClientID}|{ct.ToolID}", ct => ct.ToolName ?? ct.ToolID.ToString());

        var clientNameMap = await _db.Clients.AsNoTracking()
            .Where(c => disputedClientIds.Contains(c.ClientID))
            .ToDictionaryAsync(c => c.ClientID, c => c.ClientName ?? c.ClientID);

        var userMap = reports.ToDictionary(u => u.AssociateId);

        var manager = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.AssociateId == managerId);
        var mgrName = manager != null ? $"{manager.FirstName} {manager.LastName}".Trim() : "—";

        return disputes
            .Select(tca =>
            {
                var user = userMap.GetValueOrDefault(tca.AssociateId);
                var toolKey = $"{tca.ClientID}|{tca.ToolID}";
                var toolName = toolNameMap.GetValueOrDefault(toolKey, tca.ToolID.ToString());
                var clientName = clientNameMap.GetValueOrDefault(tca.ClientID, tca.ClientID);
                return new DisputeExportDto(
                    tca.AssociateId,
                    user != null ? $"{user.FirstName} {user.LastName}".Trim() : tca.AssociateId,
                    toolName,
                    clientName,
                    tca.ClientID,
                    tca.Remarks ?? "",
                    user?.EmailAddr ?? "",
                    mgrName
                );
            })
            .OrderBy(r => r.Name)
            .ThenBy(r => r.ToolName)
            .ToList();
    }

    public async Task<List<UserListItem>> GetAllUsersAsync()
    {
        var users = await _db.Users.AsNoTracking()
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .ToListAsync();

        var managerIds = users.Where(u => u.ManagerId != null).Select(u => u.ManagerId!).Distinct().ToList();
        var managerNames = await _db.Users.AsNoTracking()
            .Where(u => managerIds.Contains(u.AssociateId))
            .ToDictionaryAsync(u => u.AssociateId, u => $"{u.FirstName} {u.LastName}".Trim());

        return users.Select(u => new UserListItem(
            u.AssociateId,
            u.FirstName,
            u.LastName,
            $"{u.FirstName} {u.LastName}".Trim(),
            u.UserName,
            u.Department,
            u.ManagerId,
            u.ManagerId != null && managerNames.TryGetValue(u.ManagerId, out var mgrName) ? mgrName : null,
            u.EmailAddr
        )).ToList();
    }

    private async Task AssertReportsToAsync(string managerId, string memberId)
    {
        var reports = await _db.Users.AnyAsync(u => u.AssociateId == memberId && u.ManagerId == managerId);
        if (!reports)
            throw new UnauthorizedAccessException("This associate does not report to you.");
    }

    public async Task GrantAccessAsync(string managerId, string memberId, GrantAccessRequest req)
    {
        await AssertReportsToAsync(managerId, memberId);

        var tool = await _db.ClientTools
            .FirstOrDefaultAsync(ct => ct.ClientID == req.ClientID && ct.ToolID == req.ToolID);
        if (tool is null)
            throw new KeyNotFoundException($"Tool {req.ToolID} for client {req.ClientID} not found.");

        var manager = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.AssociateId == managerId);
        int? mgrDeptId = await _db.Departments
            .Where(d => d.DepartmentName == manager!.Department)
            .Select(d => (int?)d.DepartmentID)
            .FirstOrDefaultAsync();
        if (tool.DepartmentID != mgrDeptId)
            throw new InvalidOperationException("This tool belongs to another department and cannot be granted.");

        var today = DateOnly.FromDateTime(DateTime.Today);
        var givenDate = req.GivenDate ?? today;

        if (req.AccessTo is not null && req.AccessTo < givenDate)
            throw new InvalidOperationException("End date cannot be before the start date.");

        var existing = await _db.UserToolAccess
            .FirstOrDefaultAsync(uta => uta.AssociateId == memberId
                                     && uta.ClientID == req.ClientID
                                     && uta.ToolID == req.ToolID);

        var toolUserId = string.IsNullOrWhiteSpace(req.ToolUserId) ? null : req.ToolUserId.Trim();

        if (existing is null)
        {
            _db.UserToolAccess.Add(new UserToolAccess
            {
                AssociateId = memberId,
                ClientID = req.ClientID,
                ToolID = req.ToolID,
                Access = !req.Open,
                GivenDate = givenDate,
                ToDate = req.AccessTo,
                DepartmentID = tool.DepartmentID,
                ToolUserId = toolUserId,
            });
        }
        else
        {
            existing.Access = !req.Open;
            existing.GivenDate = givenDate;
            existing.ToDate = req.AccessTo;
            existing.ToolUserId = toolUserId;
        }

        await _db.SaveChangesAsync();
    }

    public async Task UpdateToolUserIdAsync(string managerId, string memberId, string clientId, int toolId, string? toolUserId)
    {
        await AssertReportsToAsync(managerId, memberId);

        var row = await _db.UserToolAccess
            .FirstOrDefaultAsync(uta => uta.AssociateId == memberId
                                     && uta.ClientID == clientId
                                     && uta.ToolID == toolId);

        if (row is null)
            throw new KeyNotFoundException("Access row not found.");

        row.ToolUserId = string.IsNullOrWhiteSpace(toolUserId) ? null : toolUserId.Trim();
        await _db.SaveChangesAsync();
    }

    /// <summary>
    /// Builds the rows for the "Export accesses" .xlsx. Scope mirrors the Access page:
    /// when <paramref name="allMembers"/> is false (manager view) only the caller's direct
    /// reports are included; when true (Admin) every associate is included. Optional
    /// <paramref name="memberId"/> / <paramref name="clientId"/> match the on-screen filters.
    /// </summary>
    public async Task<List<AccessExportRowDto>> GetAccessExportAsync(
        string callerId, bool allMembers, string? memberId = null, string? clientId = null)
    {
        // Determine the visible associate set.
        List<User> users;
        if (allMembers)
        {
            users = await _db.Users.AsNoTracking().ToListAsync();
        }
        else
        {
            users = await _db.Users.AsNoTracking()
                .Where(u => u.ManagerId == callerId)
                .ToListAsync();
        }

        // Apply the optional member filter (and enforce it stays within visible scope).
        if (!string.IsNullOrWhiteSpace(memberId))
        {
            users = users.Where(u => u.AssociateId == memberId).ToList();
            if (users.Count == 0) return new List<AccessExportRowDto>();
        }

        var userIds = users.Select(u => u.AssociateId).ToList();
        var userMap = users.ToDictionary(u => u.AssociateId);

        var accessQuery = _db.UserToolAccess.AsNoTracking()
            .Where(uta => userIds.Contains(uta.AssociateId));

        if (!string.IsNullOrWhiteSpace(clientId))
            accessQuery = accessQuery.Where(uta => uta.ClientID == clientId);

        var access = await accessQuery
            .Include(uta => uta.ClientTool)
            .ToListAsync();

        if (access.Count == 0) return new List<AccessExportRowDto>();

        var clientNames = await _db.Clients.AsNoTracking()
            .Where(c => access.Select(a => a.ClientID).Distinct().Contains(c.ClientID))
            .ToDictionaryAsync(c => c.ClientID, c => c.ClientName ?? c.ClientID);

        return access
            .Select(a =>
            {
                var u = userMap.GetValueOrDefault(a.AssociateId!);
                var name = u != null ? $"{u.FirstName} {u.LastName}".Trim() : a.AssociateId ?? "";
                var clientName = clientNames.GetValueOrDefault(a.ClientID!, a.ClientID ?? "");
                // No per-access Tier column exists; the access flag distinguishes a fully
                // granted access ("Full") from an in-process / open access ("Open").
                var tier = a.Access ? "Full" : "Open";
                return new AccessExportRowDto(
                    name,
                    a.AssociateId ?? "",
                    clientName,
                    a.ClientID ?? "",
                    a.ToolID,
                    a.ClientTool?.ToolName ?? a.ToolID.ToString(),
                    tier,
                    a.GivenDate,
                    a.ToDate,
                    a.ToolUserId);
            })
            .OrderBy(r => r.AssociateName)
            .ThenBy(r => r.ClientName)
            .ThenBy(r => r.ToolName)
            .ToList();
    }

    public async Task UpdateAccessEndDateAsync(string managerId, string memberId, string clientId, int toolId, DateOnly? accessTo)
    {
        await AssertReportsToAsync(managerId, memberId);

        var access = await _db.UserToolAccess
            .Where(uta => uta.AssociateId == memberId
                       && uta.ClientID == clientId
                       && uta.ToolID == toolId
                       && uta.Access)
            .OrderByDescending(uta => uta.GivenDate)
            .FirstOrDefaultAsync();

        if (access is null)
            throw new KeyNotFoundException("No active access found for this tool.");

        if (accessTo is not null && accessTo.Value < access.GivenDate)
            throw new InvalidOperationException("End date cannot be before the start date.");

        access.ToDate = accessTo;
        await _db.SaveChangesAsync();
    }

    public async Task RevokeAccessAsync(string managerId, string memberId, string clientId, int toolId)
    {
        await AssertReportsToAsync(managerId, memberId);

        var today = DateOnly.FromDateTime(DateTime.Today);
        var access = await _db.UserToolAccess
            .Where(uta => uta.AssociateId == memberId
                       && uta.ClientID == clientId
                       && uta.ToolID == toolId
                       && uta.Access)
            .OrderByDescending(uta => uta.GivenDate)
            .FirstOrDefaultAsync();

        if (access is null)
            throw new KeyNotFoundException("No active access found for this tool.");

        access.ToDate = today < access.GivenDate ? access.GivenDate : today;
        access.Access = false;
        await _db.SaveChangesAsync();
    }

    public async Task<List<MemberAccessDto>> GetMemberAccessAsync(string managerId, string memberId)
    {
        await AssertReportsToAsync(managerId, memberId);

        var accessWithTools = await _db.UserToolAccess.AsNoTracking()
            .Where(uta => uta.AssociateId == memberId)
            .Include(uta => uta.ClientTool)
            .ToListAsync();

        var clientNames = await _db.Clients.AsNoTracking()
            .Where(c => accessWithTools.Select(a => a.ClientID).Distinct().Contains(c.ClientID))
            .ToDictionaryAsync(c => c.ClientID, c => c.ClientName ?? c.ClientID);

        return accessWithTools
            .GroupBy(a => a.ClientID)
            .Select(g => new MemberAccessDto(
                g.Key,
                clientNames.GetValueOrDefault(g.Key, g.Key),
                g.OrderBy(a => a.ClientTool?.ToolName)
                 .Select(a => new AccessRowDto(a.ToolID, a.ClientTool?.ToolName ?? "", a.GivenDate, a.ToDate, !a.Access, a.ToolUserId))
                 .ToList()))
            .OrderBy(c => c.ClientName)
            .ToList();
    }

    public async Task SetOpenAccessAsync(string managerId, string memberId, string clientId, int toolId, bool open)
    {
        await AssertReportsToAsync(managerId, memberId);

        var row = await _db.UserToolAccess
            .FirstOrDefaultAsync(uta => uta.AssociateId == memberId
                                     && uta.ClientID == clientId
                                     && uta.ToolID == toolId);

        if (row is null)
            throw new KeyNotFoundException("Access row not found.");

        row.Access = !open;
        if (!open) row.ToDate = null;   // promoting open -> full grants clean open-ended access
        await _db.SaveChangesAsync();
    }

    public async Task<List<ClientAttestationDto>> GetClientsAndToolsAsync()
    {
        var clients = await _db.Clients.AsNoTracking()
            .Include(c => c.Tools)
            .OrderBy(c => c.ClientName)
            .ToListAsync();

        return clients.Select(c => new ClientAttestationDto(
            c.ClientID, c.ClientName ?? c.ClientID,
            c.Tools.Count, 0, 0,
            c.Tools.Select(t => new ToolAttestationDto(t.ToolID, t.ToolName ?? "", null, true, "N/A", null)).ToList()
        )).ToList();
    }

    public async Task<List<ClientAttestationDto>> GetGrantableClientsAndToolsAsync(string managerId)
    {
        var manager = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.AssociateId == managerId);

        int? mgrDeptId = await _db.Departments
            .Where(d => d.DepartmentName == manager!.Department)
            .Select(d => (int?)d.DepartmentID)
            .FirstOrDefaultAsync();

        var clients = await _db.Clients.AsNoTracking()
            .Include(c => c.Tools)
            .OrderBy(c => c.ClientName)
            .ToListAsync();

        return clients
            .Select(c =>
            {
                var matchingTools = c.Tools.Where(t => t.DepartmentID == mgrDeptId).ToList();
                return new ClientAttestationDto(
                    c.ClientID, c.ClientName ?? c.ClientID,
                    matchingTools.Count, 0, 0,
                    matchingTools.Select(t => new ToolAttestationDto(t.ToolID, t.ToolName ?? "", null, true, "N/A", null)).ToList()
                );
            })
            .Where(c => c.TotalTools > 0)
            .ToList();
    }

    public async Task<CycleDto> GenerateNextCycleAsync(string actorAssociateId)
    {
        var latest = await _db.Cycles.AsNoTracking()
            .OrderByDescending(c => c.EndDate)
            .FirstOrDefaultAsync();

        DateOnly nextStart;
        if (latest is null)
        {
            var now = DateTime.Today;
            nextStart = new DateOnly(now.Year, now.Month, 1);
        }
        else
        {
            nextStart = latest.EndDate.AddDays(1);
        }

        var daysInMonth = DateTime.DaysInMonth(nextStart.Year, nextStart.Month);
        var nextEnd = new DateOnly(nextStart.Year, nextStart.Month, daysInMonth);
        var cycleName = nextStart.ToString("MMMM yyyy");

        if (await _db.Cycles.AnyAsync(c => c.StartDate == nextStart))
            throw new InvalidOperationException($"Cycle for {cycleName} already exists.");

        var cycle = new Cycle
        {
            CycleName = cycleName,
            StartDate = nextStart,
            EndDate = nextEnd,
            DueDate = nextEnd
        };
        _db.Cycles.Add(cycle);
        await _db.SaveChangesAsync();

        var today = DateOnly.FromDateTime(DateTime.Today);
        return new CycleDto(cycle.CycleID, cycle.CycleName, cycle.StartDate,
                            cycle.EndDate, cycle.DueDate,
                            cycle.DueDate.DayNumber - today.DayNumber);
    }
}
