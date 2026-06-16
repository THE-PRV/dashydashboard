using DashyDashboard.Api.Common;
using DashyDashboard.Api.Data;
using DashyDashboard.Api.Models.Domain;
using DashyDashboard.Api.Models.DTOs;
using Microsoft.EntityFrameworkCore;

namespace DashyDashboard.Api.Services;

public class AdminService
{
    private readonly AppDbContext _db;
    public AdminService(AppDbContext db) { _db = db; }

    public Task<string?> GetUserDepartmentAsync(string associateId) =>
        _db.Users.AsNoTracking()
            .Where(u => u.AssociateId == associateId)
            .Select(u => u.Department)
            .FirstOrDefaultAsync();

    public async Task<List<DeptSummaryDto>> GetDepartmentsAsync(int cycleId, List<string>? scopeDepts)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);

        var users = await _db.Users.AsNoTracking()
            .Where(u => scopeDepts == null || scopeDepts.Contains(u.Department))
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

        // §7 completion (WI-1): a tool counts as done when exempt (no access OR not used) OR it was
        // used AND its screenshot is Approved. Pending/Rejected/missing screenshots are NOT done.
        var attestCounts = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(tca => allUserIds.Contains(tca.AssociateId)
                       && tca.CycleID == cycleId
                       && (tca.HadAccess == false
                           || tca.UsedThisCycle == false
                           || (tca.UsedThisCycle == true && tca.ScreenshotStatus == "Approved")))
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
                       && (tca.HadAccess == false
                           || tca.UsedThisCycle == false
                           || (tca.UsedThisCycle == true && tca.ScreenshotStatus == "Approved")))
            .Select(tca => new { tca.AssociateId, tca.ClientID })
            .ToListAsync();

        var allClientIds = clientAccessRows.Select(r => r.ClientID).Distinct().ToList();
        var clientNameMap = await _db.Clients.AsNoTracking()
            .Where(c => allClientIds.Contains(c.ClientID))
            .ToDictionaryAsync(c => c.ClientID, c => c.ClientName ?? c.ClientID);

        var deptIdMap = await _db.Departments.AsNoTracking().ToDictionaryAsync(d => d.DepartmentName, d => d.DepartmentID);

        var toolCountMap = toolCounts.ToDictionary(t => t.AssociateId, t => t.Count);

        var result = depts.Select(d =>
        {
            var total = d.UserIds.Sum(id => toolCountMap.GetValueOrDefault(id, 0));
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

            return new DeptSummaryDto(deptIdMap.GetValueOrDefault(d.Dept ?? "", 0), d.Dept ?? "", gfhName, gfhEmail, "HQ", d.UserIds.Count(id => toolCountMap.ContainsKey(id)), total, submitted, clientBreakdown);
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
            .Where(uta => deptUserIds.Contains(uta.AssociateId)
                       && uta.Access
                       && uta.GivenDate <= today
                       && (uta.ToDate == null || uta.ToDate >= today))
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
                       && (tca.HadAccess == false
                           || tca.UsedThisCycle == false
                           || (tca.UsedThisCycle == true && tca.ScreenshotStatus == "Approved"))
                       && (clientId == null || tca.ClientID == clientId))
            .GroupBy(tca => tca.AssociateId)
            .Select(g => new { AssociateId = g.Key, Count = g.Count() })
            .ToListAsync();

        var submittedCountMap = submittedCountsByReport.ToDictionary(x => x.AssociateId, x => x.Count);

        var managerSummaries = managers.Select(mgr =>
        {
            var reportIds = (reportsByMgr.GetValueOrDefault(mgr.AssociateId) ?? new List<string>())
                .Where(id => toolCountMap.ContainsKey(id))
                .ToList();
            var totalTools     = reportIds.Sum(id => toolCountMap.GetValueOrDefault(id, 0));
            var submittedTools = reportIds.Sum(id => submittedCountMap.GetValueOrDefault(id, 0));
            var email = mgr.EmailAddr ?? "";
            return new ManagerSummaryDto(
                mgr.AssociateId,
                $"{mgr.FirstName} {mgr.LastName}".Trim(),
                email,
                reportIds.Count,
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
                           && (tca.HadAccess == false
                               || tca.UsedThisCycle == false
                           || (tca.UsedThisCycle == true && tca.ScreenshotStatus == "Approved"))
                           && (clientId == null || tca.ClientID == clientId));

        var gfhRow = await _db.SuperUsers.AsNoTracking()
            .Include(s => s.Department)
            .FirstOrDefaultAsync(s => s.RoleName == "GFH" && s.IsActive && s.Department != null && s.Department!.DepartmentName == deptName);
        var gfhUser = gfhRow != null
            ? await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.AssociateId == gfhRow.AssociateId)
            : null;
        var gfhName = gfhUser != null ? $"{gfhUser.FirstName} {gfhUser.LastName}".Trim() : "—";

        var incompleteCount = (await GetNonSubmittedAsync(deptName, cycleId)).Count;
        var disputeCount    = (await GetDisputesAsync(deptName, cycleId)).Count;

        var deptUsersWithTools = await _db.UserToolAccess.AsNoTracking()
            .Where(uta => deptUserIds.Contains(uta.AssociateId)
                       && uta.Access
                       && uta.GivenDate <= today
                       && (uta.ToDate == null || uta.ToDate >= today)
                       && (clientId == null || uta.ClientID == clientId))
            .Select(uta => uta.AssociateId)
            .Distinct()
            .CountAsync();

        return new DeptManagersDto(deptName, gfhName, deptUsersWithTools, deptToolTotal, deptSubmitted, managerSummaries, availableClients, incompleteCount, disputeCount);
    }

    public async Task<AddToolResponse> AddToolAsync(string clientId, string toolName, int departmentId, string actorId)
    {
        var client = await _db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.ClientID == clientId);
        if (client is null)
            throw new KeyNotFoundException($"Client '{clientId}' not found.");

        var tool = new ClientTool
        {
            ClientID = clientId,
            ToolName = toolName,
            DepartmentID = departmentId,
        };
        _db.ClientTools.Add(tool);
        await _db.SaveChangesAsync();

        return new AddToolResponse(clientId, tool.ToolID, toolName);
    }

    public async Task<AddClientResponse> AddClientAsync(string clientId, string clientName, string actorId)
    {
        clientId = (clientId ?? "").Trim();
        clientName = (clientName ?? "").Trim();
        if (string.IsNullOrWhiteSpace(clientId))
            throw new InvalidOperationException("Client ID is required.");
        if (string.IsNullOrWhiteSpace(clientName))
            throw new InvalidOperationException("Client name is required.");

        var exists = await _db.Clients.AsNoTracking().AnyAsync(c => c.ClientID == clientId);
        if (exists)
            throw new InvalidOperationException($"Client '{clientId}' already exists.");

        var client = new Client
        {
            ClientID = clientId,
            ClientName = clientName,
            IsActive = true,
            CurrentState = "Active",
        };
        _db.Clients.Add(client);
        await _db.SaveChangesAsync();

        return new AddClientResponse(clientId, clientName);
    }

    public async Task UpdateUserAsync(string associateId, UpdateUserRequest req)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.AssociateId == associateId);
        if (user is null)
            throw new KeyNotFoundException("User not found.");

        if (req.FirstName  != null) user.FirstName  = req.FirstName;
        if (req.LastName   != null) user.LastName    = req.LastName;
        if (req.UserName   != null) user.UserName    = req.UserName;
        if (req.Department != null) user.Department  = req.Department;
        if (req.ManagerId  != null) user.ManagerId   = req.ManagerId;
        if (req.Email      != null) user.EmailAddr   = req.Email;

        await _db.SaveChangesAsync();
    }

    public async Task<List<DisputeExportDto>> GetDisputesAsync(string deptName, int cycleId)
    {
        var users = await _db.Users.AsNoTracking()
            .Where(u => u.Department == deptName)
            .ToListAsync();

        var userIds = users.Select(u => u.AssociateId).ToList();

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

        var userMap = users.ToDictionary(u => u.AssociateId);

        var managerIds = users.Where(u => u.ManagerId != null).Select(u => u.ManagerId!).Distinct().ToList();
        var managers = await _db.Users.AsNoTracking()
            .Where(u => managerIds.Contains(u.AssociateId))
            .ToDictionaryAsync(u => u.AssociateId, u => $"{u.FirstName} {u.LastName}".Trim());

        return disputes
            .Select(tca =>
            {
                var user = userMap.GetValueOrDefault(tca.AssociateId);
                var toolKey = $"{tca.ClientID}|{tca.ToolID}";
                var toolName = toolNameMap.GetValueOrDefault(toolKey, tca.ToolID.ToString());
                var clientName = clientNameMap.GetValueOrDefault(tca.ClientID, tca.ClientID);
                var mgrName = user?.ManagerId != null ? managers.GetValueOrDefault(user.ManagerId, "—") : "—";
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

    public async Task<List<NonSubmittedDto>> GetNonSubmittedAsync(string deptName, int cycleId)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);

        var users = await _db.Users.AsNoTracking()
            .Where(u => u.Department == deptName)
            .ToListAsync();

        var userIds = users.Select(u => u.AssociateId).ToList();

        var activeAccess = await _db.UserToolAccess.AsNoTracking()
            .Where(uta => uta.AssociateId != null
                       && userIds.Contains(uta.AssociateId)
                       && uta.Access
                       && uta.GivenDate <= today && (uta.ToDate == null || uta.ToDate >= today))
            .Select(uta => new { AssociateId = uta.AssociateId!, ClientID = uta.ClientID!, uta.ToolID })
            .ToListAsync();

        var toolCounts = activeAccess
            .GroupBy(uta => uta.AssociateId)
            .Select(g => new { AssociateId = g.Key, Count = g.Count() })
            .ToList();

        var activeAccessKeySet = activeAccess
            .Select(uta => (uta.AssociateId, uta.ClientID, uta.ToolID))
            .ToHashSet();

        // All attestation rows for these members this cycle — needed both for the answered ratio
        // (CompletionPct) and the five-state status column (WI-6).
        var attestRows = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(tca => userIds.Contains(tca.AssociateId) && tca.CycleID == cycleId)
            .Select(tca => new
            {
                tca.AssociateId,
                tca.ClientID,
                tca.ToolID,
                tca.HadAccess,
                tca.UsedThisCycle,
                tca.ScreenshotStatus,
                tca.AttestationStatus
            })
            .ToListAsync();

        var activeAttestRows = attestRows
            .Where(r => activeAccessKeySet.Contains((r.AssociateId, r.ClientID, r.ToolID)))
            .ToList();

        // "Answered" = decided usage or declared no access (the existing completion proxy).
        var answeredCountMap = activeAttestRows
            .Where(r => ScreenshotCompletion.IsAnswered(r.HadAccess, r.UsedThisCycle))
            .GroupBy(r => r.AssociateId)
            .ToDictionary(g => g.Key, g => g.Count());

        // Five-state status per member (WI-6) from the same shared helper used by the manager view.
        var statusByMember = activeAttestRows
            .GroupBy(r => r.AssociateId)
            .ToDictionary(g => g.Key,
                g => ScreenshotCompletion.ComputeMemberStatus(
                    toolCounts.FirstOrDefault(t => t.AssociateId == g.Key)?.Count ?? 0,
                    g.Select(r => (r.HadAccess, r.UsedThisCycle, r.ScreenshotStatus, r.AttestationStatus))));

        var toolCountMap = toolCounts.ToDictionary(x => x.AssociateId, x => x.Count);

        var managerIds = users.Where(u => u.ManagerId != null).Select(u => u.ManagerId!).Distinct().ToList();
        var managers = await _db.Users.AsNoTracking()
            .Where(u => managerIds.Contains(u.AssociateId))
            .ToDictionaryAsync(u => u.AssociateId, u => $"{u.FirstName} {u.LastName}".Trim());

        return users
            .Where(u => toolCountMap.ContainsKey(u.AssociateId))
            .Select(u =>
            {
                var total = toolCountMap.GetValueOrDefault(u.AssociateId, 0);
                var answered = answeredCountMap.GetValueOrDefault(u.AssociateId, 0);
                var pct = total > 0 ? (int)Math.Round(answered * 100.0 / total) : 0;
                var mgrName = u.ManagerId != null ? managers.GetValueOrDefault(u.ManagerId, "—") : "—";

                // WI-6: the five-state status drives both the export label and the "is this member
                // done?" filter. Complete members are excluded from the incomplete-submissions list.
                var state = statusByMember.GetValueOrDefault(u.AssociateId, ScreenshotCompletion.MemberNotStarted);
                return new { Dto = new NonSubmittedDto(
                    u.AssociateId, $"{u.FirstName} {u.LastName}".Trim(), pct, u.EmailAddr ?? "", mgrName,
                    ScreenshotCompletion.MemberStatusLabel(state)),
                    Complete = state == ScreenshotCompletion.MemberComplete };
            })
            .Where(r => !r.Complete)
            .Select(r => r.Dto)
            .OrderBy(r => r.CompletionPct)
            .ThenBy(r => r.Status)
            .ToList();
    }
}
