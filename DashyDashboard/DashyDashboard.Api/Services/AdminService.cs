using DashyDashboard.Api.Data;
using DashyDashboard.Api.Models.Domain;
using DashyDashboard.Api.Models.DTOs;
using Microsoft.EntityFrameworkCore;

namespace DashyDashboard.Api.Services;

public class AdminService
{
    private readonly AppDbContext _db;
    public AdminService(AppDbContext db) { _db = db; }

    public async Task<List<DeptSummaryDto>> GetDepartmentsAsync(int cycleId, string? scopeDept)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);

        var users = await _db.Users.AsNoTracking()
            .Where(u => scopeDept == null || u.Department == scopeDept)
            .ToListAsync();

        var depts = users
            .GroupBy(u => u.Department)
            .Select(g => new { Dept = g.Key, UserIds = g.Select(u => u.AssociateId).ToList() })
            .ToList();

        if (!depts.Any()) return new List<DeptSummaryDto>();

        var allUserIds = depts.SelectMany(d => d.UserIds).Distinct().ToList();

        var toolCounts = await _db.UserToolAccess.AsNoTracking()
            .Where(uta => allUserIds.Contains(uta.AssociateId)
                       && uta.Access
                       && uta.GivenDate <= today
                       && (uta.ToDate == null || uta.ToDate >= today))
            .GroupBy(uta => uta.AssociateId)
            .Select(g => new { AssociateId = g.Key, Count = g.Count() })
            .ToListAsync();

        var attestCounts = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(tca => allUserIds.Contains(tca.AssociateId)
                       && tca.CycleID == cycleId
                       && tca.UsedThisCycle.HasValue)
            .GroupBy(tca => tca.AssociateId)
            .Select(g => new { AssociateId = g.Key, Count = g.Count() })
            .ToListAsync();

        var deptNames = depts.Select(d => d.Dept).ToList();
        var gfhRows = await _db.SuperUsers.AsNoTracking()
            .Include(s => s.Department)
            .Where(s => s.RoleName == "GFH" && s.IsActive && s.Department != null && deptNames.Contains(s.Department!.DepartmentName))
            .ToListAsync();

        var gfhUserIds = gfhRows.Select(s => s.AssociateId).Distinct().ToList();
        var gfhUsers = await _db.Users.AsNoTracking()
            .Where(u => gfhUserIds.Contains(u.AssociateId))
            .ToListAsync();

        var clientAccessRows = await _db.UserToolAccess.AsNoTracking()
            .Where(uta => allUserIds.Contains(uta.AssociateId)
                       && uta.Access
                       && uta.GivenDate <= today
                       && (uta.ToDate == null || uta.ToDate >= today))
            .Select(uta => new { uta.AssociateId, uta.ClientID })
            .ToListAsync();

        var clientAttestedRows = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(tca => allUserIds.Contains(tca.AssociateId)
                       && tca.CycleID == cycleId
                       && tca.UsedThisCycle.HasValue)
            .Select(tca => new { tca.AssociateId, tca.ClientID })
            .ToListAsync();

        var allClientIds = clientAccessRows.Select(r => r.ClientID).Distinct().ToList();
        var clientNameMap = await _db.Clients.AsNoTracking()
            .Where(c => allClientIds.Contains(c.ClientID))
            .ToDictionaryAsync(c => c.ClientID, c => c.ClientName ?? c.ClientID);

        var deptIdMap = await _db.Departments.AsNoTracking().ToDictionaryAsync(d => d.DepartmentName, d => d.DepartmentID);

        var result = depts.Select(d =>
        {
            var total = d.UserIds.Sum(id => toolCounts.FirstOrDefault(t => t.AssociateId == id)?.Count ?? 0);
            var submitted = d.UserIds.Sum(id => attestCounts.FirstOrDefault(a => a.AssociateId == id)?.Count ?? 0);

            var gfhRow = gfhRows.FirstOrDefault(g => g.Department?.DepartmentName == d.Dept);
            var gfhUser = gfhRow != null ? gfhUsers.FirstOrDefault(u => u.AssociateId == gfhRow.AssociateId) : null;

            var gfhName = gfhUser != null ? $"{gfhUser.FirstName} {gfhUser.LastName}".Trim() : "—";
            var gfhEmail = gfhUser?.EmailAddr ?? "";

            var deptClientTotals = clientAccessRows
                .Where(r => d.UserIds.Contains(r.AssociateId))
                .GroupBy(r => r.ClientID)
                .ToDictionary(g => g.Key, g => g.Count());

            var deptClientSubmitted = clientAttestedRows
                .Where(r => d.UserIds.Contains(r.AssociateId))
                .GroupBy(r => r.ClientID)
                .ToDictionary(g => g.Key, g => g.Count());

            var clientBreakdown = deptClientTotals
                .Select(kvp => new ClientSummaryDto(
                    kvp.Key,
                    clientNameMap.GetValueOrDefault(kvp.Key, kvp.Key),
                    kvp.Value,
                    deptClientSubmitted.GetValueOrDefault(kvp.Key, 0)
                ))
                .OrderBy(c => c.ClientName)
                .ToList();

            return new DeptSummaryDto(deptIdMap.GetValueOrDefault(d.Dept ?? "", 0), d.Dept ?? "", gfhName, gfhEmail, "HQ", total, submitted, clientBreakdown);
        }).OrderBy(d => d.DepartmentName).ToList();

        return result;
    }

    public async Task<DeptManagersDto> GetDepartmentManagersAsync(string deptName, int cycleId, string? clientId = null)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);

        var allInDept = await _db.Users.AsNoTracking()
            .Where(u => u.Department == deptName)
            .ToListAsync();

        var deptUserIds = allInDept.Select(u => u.AssociateId).ToList();

        var clientsInDept = await _db.UserToolAccess.AsNoTracking()
            .Where(uta => deptUserIds.Contains(uta.AssociateId))
            .Select(uta => new { uta.ClientID })
            .Distinct()
            .ToListAsync();

        var clientIds = clientsInDept.Select(c => c.ClientID).ToList();
        var clientEntities = await _db.Clients.AsNoTracking()
            .Where(c => clientIds.Contains(c.ClientID))
            .OrderBy(c => c.ClientName)
            .ToListAsync();

        var availableClients = clientEntities
            .Select(c => new ClientOptionDto(c.ClientID, c.ClientName ?? c.ClientID))
            .ToList();

        var managerIds = allInDept
            .Select(u => u.AssociateId)
            .Where(id => allInDept.Any(u => u.ManagerId == id))
            .Distinct()
            .ToList();

        var managers = allInDept.Where(u => managerIds.Contains(u.AssociateId)).ToList();
        var managerIdList = managers.Select(m => m.AssociateId).ToList();

        var allReports = allInDept
            .Where(u => u.ManagerId != null && managerIdList.Contains(u.ManagerId))
            .Select(u => new { u.AssociateId, u.ManagerId })
            .ToList();

        var reportsByMgr = allReports
            .GroupBy(r => r.ManagerId)
            .ToDictionary(g => g.Key!, g => g.Select(r => r.AssociateId).ToList());

        var allReportIds = allReports.Select(r => r.AssociateId).Distinct().ToList();

        var toolCountsByReport = await _db.UserToolAccess.AsNoTracking()
            .Where(uta => allReportIds.Contains(uta.AssociateId)
                       && uta.Access
                       && uta.GivenDate <= today
                       && (uta.ToDate == null || uta.ToDate >= today)
                       && (clientId == null || uta.ClientID == clientId))
            .GroupBy(uta => uta.AssociateId)
            .Select(g => new { AssociateId = g.Key, Count = g.Count() })
            .ToListAsync();

        var toolCountMap = toolCountsByReport.ToDictionary(x => x.AssociateId, x => x.Count);

        var submittedCountsByReport = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(tca => allReportIds.Contains(tca.AssociateId)
                       && tca.CycleID == cycleId
                       && tca.UsedThisCycle.HasValue
                       && (clientId == null || tca.ClientID == clientId))
            .GroupBy(tca => tca.AssociateId)
            .Select(g => new { AssociateId = g.Key, Count = g.Count() })
            .ToListAsync();

        var submittedCountMap = submittedCountsByReport.ToDictionary(x => x.AssociateId, x => x.Count);

        var managerSummaries = managers.Select(mgr =>
        {
            var reportIds = reportsByMgr.GetValueOrDefault(mgr.AssociateId) ?? new List<string>();
            var totalTools     = reportIds.Sum(id => toolCountMap.GetValueOrDefault(id, 0));
            var submittedTools = reportIds.Sum(id => submittedCountMap.GetValueOrDefault(id, 0));
            var email = mgr.EmailAddr ?? "";
            return new ManagerSummaryDto(
                mgr.AssociateId,
                $"{mgr.FirstName} {mgr.LastName}".Trim(),
                email,
                totalTools,
                submittedTools
            );
        }).ToList();

        var deptToolTotal = await _db.UserToolAccess.AsNoTracking()
            .CountAsync(uta => deptUserIds.Contains(uta.AssociateId)
                           && uta.Access
                           && uta.GivenDate <= today
                           && (uta.ToDate == null || uta.ToDate >= today)
                           && (clientId == null || uta.ClientID == clientId));

        var deptSubmitted = await _db.ToolCycleAttestations.AsNoTracking()
            .CountAsync(tca => deptUserIds.Contains(tca.AssociateId)
                           && tca.CycleID == cycleId
                           && tca.UsedThisCycle.HasValue
                           && (clientId == null || tca.ClientID == clientId));

        var gfhRow = await _db.SuperUsers.AsNoTracking()
            .Include(s => s.Department)
            .FirstOrDefaultAsync(s => s.RoleName == "GFH" && s.IsActive && s.Department != null && s.Department!.DepartmentName == deptName);
        var gfhUser = gfhRow != null
            ? await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.AssociateId == gfhRow.AssociateId)
            : null;
        var gfhName = gfhUser != null ? $"{gfhUser.FirstName} {gfhUser.LastName}".Trim() : "—";

        return new DeptManagersDto(deptName, gfhName, deptToolTotal, deptSubmitted, managerSummaries, availableClients);
    }

    public async Task<AddToolResponse> AddToolAsync(string clientId, string toolName, string actorId)
    {
        var client = await _db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.ClientID == clientId);
        if (client is null)
            throw new KeyNotFoundException($"Client '{clientId}' not found.");

        var tool = new ClientTool
        {
            ClientID = clientId,
            ToolName = toolName,
            DepartmentID = client.DepartmentID
        };
        _db.ClientTools.Add(tool);
        await _db.SaveChangesAsync();

        return new AddToolResponse(clientId, tool.ToolID, toolName);
    }
}
