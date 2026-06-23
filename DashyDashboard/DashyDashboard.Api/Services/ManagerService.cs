using System.IO.Compression;
using DashyDashboard.Api.Common;
using DashyDashboard.Api.Data;
using DashyDashboard.Api.Models.Domain;
using DashyDashboard.Api.Models.DTOs;
using Microsoft.EntityFrameworkCore;

namespace DashyDashboard.Api.Services;

public class ManagerService
{
    private readonly AppDbContext _db;
    private readonly ScreenshotStorageService _screenshots;
    private readonly EmailService _email;
    public ManagerService(AppDbContext db, ScreenshotStorageService screenshots, EmailService email)
    {
        _db = db;
        _screenshots = screenshots;
        _email = email;
    }

    public async Task<TeamDto> GetTeamAsync(string managerId, int cycleId, bool includeEmpty = false)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);

        var reports = await _db.Users.AsNoTracking()
            .Where(u => u.ManagerId == managerId)
            .ToListAsync();

        var userIds = reports.Select(u => u.AssociateId).ToList();

        var activeAccess = await _db.UserToolAccess.AsNoTracking()
            .Where(uta => uta.AssociateId != null
                       && userIds.Contains(uta.AssociateId)
                       && uta.Access
                       && uta.GivenDate <= today
                       && (uta.ToDate == null || uta.ToDate >= today))
            .Select(uta => new { AssociateId = uta.AssociateId!, ClientID = uta.ClientID!, uta.ToolID })
            .ToListAsync();

        var toolCounts = activeAccess
            .GroupBy(uta => uta.AssociateId)
            .Select(g => new { AssociateId = g.Key, Count = g.Count() })
            .ToList();

        var activeAccessKeySet = activeAccess
            .Select(uta => (uta.AssociateId, uta.ClientID, uta.ToolID))
            .ToHashSet();

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

        // Per-tool "screenshot required" flag (toolId is the global PK of ClientTools). Missing => optional.
        var requiredToolIds = activeAttestRows.Select(r => r.ToolID).Distinct().ToList();
        var screenshotRequiredByToolId = await _db.ClientTools.AsNoTracking()
            .Where(ct => requiredToolIds.Contains(ct.ToolID))
            .Select(ct => new { ct.ToolID, ct.ScreenshotRequired })
            .ToDictionaryAsync(x => x.ToolID, x => x.ScreenshotRequired);
        bool ReqShot(int toolId) => screenshotRequiredByToolId.GetValueOrDefault(toolId, false);

        var attestCounts = activeAttestRows
            .Where(r => ScreenshotCompletion.IsAnswered(r.HadAccess, r.UsedThisCycle))
            .GroupBy(r => r.AssociateId)
            .ToDictionary(g => g.Key, g => g.Count());

        // Per-member five-state status (WI-6): computed in the one shared place from this member's
        // rows (reads AttestationStatus, usage answers and screenshot states).
        var statusByMember = activeAttestRows
            .GroupBy(r => r.AssociateId)
            .ToDictionary(g => g.Key, g => ScreenshotCompletion.ComputeMemberStatus(
                toolCounts.FirstOrDefault(t => t.AssociateId == g.Key)?.Count ?? 0,
                g.Select(r => (r.HadAccess, r.UsedThisCycle, ReqShot(r.ToolID), r.ScreenshotStatus, r.AttestationStatus))));

        var pendingCounts = activeAttestRows
            .Where(r => ScreenshotCompletion.RequiresScreenshot(r.HadAccess, r.UsedThisCycle, ReqShot(r.ToolID))
                     && r.ScreenshotStatus != ScreenshotCompletion.StatusApproved
                     && r.ScreenshotStatus != ScreenshotCompletion.StatusRejected)
            .GroupBy(r => r.AssociateId)
            .ToDictionary(g => g.Key, g => g.Count());

        var rejectedCounts = activeAttestRows
            .Where(r => ScreenshotCompletion.RequiresScreenshot(r.HadAccess, r.UsedThisCycle, ReqShot(r.ToolID))
                     && r.ScreenshotStatus == ScreenshotCompletion.StatusRejected)
            .GroupBy(r => r.AssociateId)
            .ToDictionary(g => g.Key, g => g.Count());

        var allMembers = reports.Select(u =>
        {
            var total = toolCounts.FirstOrDefault(t => t.AssociateId == u.AssociateId)?.Count ?? 0;
            var attested = attestCounts.GetValueOrDefault(u.AssociateId, 0);
            var pct = total > 0 ? (double)attested / total : 0;
            var status = statusByMember.GetValueOrDefault(u.AssociateId, ScreenshotCompletion.MemberNotStarted);
            var pendingScreenshots = pendingCounts.GetValueOrDefault(u.AssociateId, 0);
            var rejectedScreenshots = rejectedCounts.GetValueOrDefault(u.AssociateId, 0);
            return new TeamMemberDto(u.AssociateId, $"{u.FirstName} {u.LastName}", u.EmailAddr ?? "", status, total, attested, Math.Round(pct, 4), pendingScreenshots, rejectedScreenshots);
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
            members.Count(m => m.AttestationStatus == ScreenshotCompletion.MemberNotStarted),
            members.Count(m => m.AttestationStatus == ScreenshotCompletion.MemberInProgress),
            members.Count(m => m.AttestationStatus == ScreenshotCompletion.MemberAwaitingApproval),
            members.Count(m => m.AttestationStatus == ScreenshotCompletion.MemberActionNeeded),
            members.Count(m => m.AttestationStatus == ScreenshotCompletion.MemberComplete),
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
            .Include(uta => uta.ClientTool)
            .Select(uta => new { ClientID = uta.ClientID!, uta.ToolID, ToolName = uta.ClientTool!.ToolName, ScreenshotRequired = uta.ClientTool!.ScreenshotRequired })
            .ToListAsync();

        // Per-tool "screenshot required" flag (toolId is the global PK). Missing => optional.
        var screenshotRequiredByToolId = accessKeys
            .GroupBy(a => a.ToolID)
            .ToDictionary(g => g.Key, g => g.First().ScreenshotRequired);
        bool ReqShot(int toolId) => screenshotRequiredByToolId.GetValueOrDefault(toolId, false);

        var clientNames = await _db.Clients.AsNoTracking()
            .Where(c => accessKeys.Select(a => a.ClientID).Distinct().Contains(c.ClientID))
            .ToDictionaryAsync(c => c.ClientID, c => c.ClientName ?? c.ClientID);

        var allAttestations = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(tca => tca.AssociateId == memberId && tca.CycleID == cycleId)
            .ToListAsync();

        var activeKeySet = accessKeys
            .Select(key => (key.ClientID, key.ToolID))
            .ToHashSet();

        var activeAttestations = allAttestations
            .Where(tca => activeKeySet.Contains((tca.ClientID, tca.ToolID)))
            .ToList();

        var attestations = activeAttestations
            .Where(tca => ScreenshotCompletion.IsAnswered(tca.HadAccess, tca.UsedThisCycle))
            .ToList();

        var answeredKeys = attestations
            .Select(a => (a.ClientID, a.ToolID))
            .ToHashSet();

        var attestationsByKey = activeAttestations
            .ToDictionary(a => (a.ClientID, a.ToolID));

        // §B1: surface raw pending/rejected screenshot counts for the member's status chip.
        // The overall five-state status is computed from current active accesses below.
        var pendingScreenshots = activeAttestations.Count(a =>
            ScreenshotCompletion.RequiresScreenshot(a.HadAccess, a.UsedThisCycle, ReqShot(a.ToolID))
            && a.ScreenshotStatus != ScreenshotCompletion.StatusApproved
            && a.ScreenshotStatus != ScreenshotCompletion.StatusRejected);

        var rejectedScreenshots = activeAttestations.Count(a =>
            ScreenshotCompletion.RequiresScreenshot(a.HadAccess, a.UsedThisCycle, ReqShot(a.ToolID))
            && a.ScreenshotStatus == ScreenshotCompletion.StatusRejected);

        var byClient = accessKeys
            .GroupBy(a => a.ClientID)
            .Select(g =>
            {
                var total = g.Count();
                var attested = g.Count(ak => answeredKeys.Contains((ak.ClientID, ak.ToolID)));

                // §B2: per-tool rows for the reviewer gallery, in this client's group.
                var tools = g.Select(ak =>
                {
                    var att = attestationsByKey.GetValueOrDefault((ak.ClientID, ak.ToolID));
                    return new MemberToolDto(
                        ak.ToolID,
                        ak.ToolName ?? ak.ToolID.ToString(),
                        att?.UsedThisCycle,
                        att?.HadAccess ?? true,
                        att?.ScreenshotStatus,
                        att?.ScreenshotRejectReason,
                        att?.ScreenshotUploadedAt,
                        ak.ScreenshotRequired
                    );
                })
                .OrderBy(t => t.ToolName)
                .ToList();

                return new ClientProgressDto(g.Key, clientNames.GetValueOrDefault(g.Key, g.Key), total, attested, tools);
            })
            .OrderBy(c => c.ClientName)
            .ToList();

        var mismatches = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(tca => tca.AssociateId == memberId && tca.CycleID == cycleId && !tca.HadAccess)
            .Include(tca => tca.Cycle)
            .ToListAsync();

        var mismatchToolIds = mismatches.Select(m => m.ToolID).Distinct().ToList();
        var mismatchClientIds = mismatches.Select(m => m.ClientID).Distinct().ToList();
        var clientToolNames = await _db.ClientTools.AsNoTracking()
            .Where(ct => ct.ClientID != null
                      && mismatchToolIds.Contains(ct.ToolID)
                      && mismatchClientIds.Contains(ct.ClientID))
            .ToDictionaryAsync(
                ct => (ct.ClientID!, ct.ToolID),
                ct => ct.ToolName ?? ct.ToolID.ToString());

        var mismatchClientNames = await _db.Clients.AsNoTracking()
            .Where(c => mismatchClientIds.Contains(c.ClientID))
            .ToDictionaryAsync(c => c.ClientID, c => c.ClientName ?? c.ClientID);

        var mismatchDtos = mismatches.Select(m => {
            var toolName = clientToolNames.GetValueOrDefault(
                (m.ClientID, m.ToolID),
                m.ToolID.ToString());
            var clientName = mismatchClientNames.GetValueOrDefault(m.ClientID, m.ClientID);
            return new MismatchDto(m.ClientID, clientName, toolName, m.Remarks, m.SubmittedAt);
        }).ToList();

        var totalTools = byClient.Sum(c => c.TotalTools);
        var totalAttested = byClient.Sum(c => c.AttestedTools);
        var pct = totalTools > 0 ? (double)totalAttested / totalTools : 0;
        // WI-6: same shared five-state computation as the team list.
        var status = ScreenshotCompletion.ComputeMemberStatus(
            totalTools,
            activeAttestations.Select(a => (a.HadAccess, a.UsedThisCycle, ReqShot(a.ToolID), a.ScreenshotStatus, a.AttestationStatus)));

        return new MemberDetailDto(member.AssociateId, $"{member.FirstName} {member.LastName}",
                                   status, totalTools, totalAttested, Math.Round(pct, 4), byClient, mismatchDtos,
                                   pendingScreenshots, rejectedScreenshots);
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
            c.Tools.Select(t => new ToolAttestationDto(t.ToolID, t.ToolName ?? "", null, true, "N/A", null, null, null, null, false)).ToList()
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
                    matchingTools.Select(t => new ToolAttestationDto(t.ToolID, t.ToolName ?? "", null, true, "N/A", null, null, null, null, false)).ToList()
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

    // ── Screenshot authorization, serving & review (§5, §6) ───────────────────

    /// <summary>
    /// True if <paramref name="callerId"/> may view/review screenshots for the associate
    /// <paramref name="ownerId"/>. Rule: the owner (when <paramref name="includeSelf"/>),
    /// the owner's manager, a GFH of the owner's department, any GFHDelegate, or any Admin.
    /// <paramref name="callerSuperUsers"/> is the caller's active SuperUser rows (from middleware).
    /// </summary>
    public async Task<bool> CanAccessMemberScreenshotsAsync(
        string callerId, IReadOnlyList<SuperUser> callerSuperUsers, string ownerId, bool includeSelf)
    {
        if (includeSelf && string.Equals(callerId, ownerId, StringComparison.OrdinalIgnoreCase))
            return true;

        // Admin and GFHDelegate have global visibility.
        if (callerSuperUsers.Any(s => SuperUserRoles.IsAny(s.RoleName, SuperUserRoles.Admin, SuperUserRoles.GFHDelegate)))
            return true;

        var owner = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.AssociateId == ownerId);
        if (owner is null) return false;

        // Direct manager of the owner.
        if (!string.IsNullOrEmpty(owner.ManagerId)
            && string.Equals(owner.ManagerId, callerId, StringComparison.OrdinalIgnoreCase))
            return true;

        // GFH scoped to the owner's department.
        if (owner.Department != null && callerSuperUsers.Any(s =>
                SuperUserRoles.Is(s.RoleName, SuperUserRoles.GFH)
                && s.Department?.DepartmentName == owner.Department))
            return true;

        return false;
    }

    /// <summary>
    /// Resolves the on-disk screenshot (or thumbnail) for one attestation row, gated by
    /// <see cref="CanAccessMemberScreenshotsAsync"/>. Returns the file plus its hash (for ETag),
    /// or null if the caller is not authorized, the row has no screenshot, or the file is missing.
    /// Callers 404 on null — no 403 leak.
    /// </summary>
    public async Task<(ScreenshotFile File, string? Hash)?> GetScreenshotForServingAsync(
        string callerId, IReadOnlyList<SuperUser> callerSuperUsers,
        int cycleId, string ownerId, string clientId, int toolId, bool thumb)
    {
        if (!await CanAccessMemberScreenshotsAsync(callerId, callerSuperUsers, ownerId, includeSelf: true))
            return null;

        var att = await _db.ToolCycleAttestations.AsNoTracking()
            .FirstOrDefaultAsync(a => a.CycleID == cycleId && a.AssociateId == ownerId
                                   && a.ClientID == clientId && a.ToolID == toolId);
        if (att?.ScreenshotPath is null) return null;

        var path = thumb ? ThumbPathFor(att.ScreenshotPath) : att.ScreenshotPath;
        var file = _screenshots.Read(path);
        if (file is null) return null;

        return (file, att.ScreenshotHash);
    }

    /// <summary>Derives the thumbnail path while preserving the stored image extension.</summary>
    private static string ThumbPathFor(string mainRelativePath)
    {
        var dir = Path.GetDirectoryName(mainRelativePath) ?? "";
        var stem = Path.GetFileNameWithoutExtension(mainRelativePath);
        var extension = Path.GetExtension(mainRelativePath);
        return Path.Combine(dir, $"{stem}_thumb{extension}");
    }

    /// <summary>
    /// Reviews a single screenshot (approve / reject). <paramref name="reason"/> is REQUIRED when
    /// rejecting. The caller's authorization is checked first. Single-approval model: a later
    /// authorized reviewer may overwrite an earlier decision.
    /// </summary>
    public async Task ReviewScreenshotAsync(
        string callerId, IReadOnlyList<SuperUser> callerSuperUsers,
        int cycleId, string ownerId, string clientId, int toolId, bool approve, string? reason)
    {
        if (!await CanAccessMemberScreenshotsAsync(callerId, callerSuperUsers, ownerId, includeSelf: false))
            throw new UnauthorizedAccessException("You are not authorized to review this screenshot.");

        if (!approve && string.IsNullOrWhiteSpace(reason))
            throw new InvalidOperationException("A reason is required when rejecting a screenshot.");

        // Load every attestation row for this member+cycle (tracked) so we can evaluate the
        // five-state completion transition once, before and after the change, in this request.
        var rows = await _db.ToolCycleAttestations
            .Where(a => a.CycleID == cycleId && a.AssociateId == ownerId)
            .ToListAsync();

        var activeRows = await GetActiveAttestationRowsAsync(ownerId, rows);

        var att = rows.FirstOrDefault(a => a.ClientID == clientId && a.ToolID == toolId);
        if (att?.ScreenshotPath is null)
            throw new KeyNotFoundException("No screenshot found for this attestation.");

        // Reviewability is keyed solely on a screenshot EXISTING — any uploaded shot is
        // approvable/rejectable regardless of the row's access/used status or the tool's
        // ScreenshotRequired flag (that flag governs gating/completion, not review). Existence is
        // already validated just above (KeyNotFound when ScreenshotPath is null), so this guard is
        // a defensive restatement of that fact.
        if (!ScreenshotCompletion.ReviewableUpload(att.ScreenshotStatus))
            throw new InvalidOperationException("This screenshot is not eligible for review.");

        var wasComplete = ScreenshotCompletion.ComputeMemberStatus(
            activeRows.ActiveToolCount,
            activeRows.Rows.Select(r => (r.HadAccess, r.UsedThisCycle, activeRows.ScreenshotRequiredByToolId.GetValueOrDefault(r.ToolID, false), r.ScreenshotStatus, r.AttestationStatus)))
            == ScreenshotCompletion.MemberComplete;

        StampReview(att, callerId, approve, reason);

        var verb = approve ? "approved" : "rejected";
        var summary = approve
            ? $"Screenshot approved for {ownerId} {clientId}/{toolId}."
            : $"Screenshot rejected for {ownerId} {clientId}/{toolId}: {reason}";
        LogReviewEvent(cycleId, callerId, 1, summary);

        await _db.SaveChangesAsync();

        if (!approve)
            await EnqueueScreenshotRejectedAsync(cycleId, ownerId, clientId, toolId, callerId, reason);

        var isComplete = ScreenshotCompletion.ComputeMemberStatus(
            activeRows.ActiveToolCount,
            activeRows.Rows.Select(r => (r.HadAccess, r.UsedThisCycle, activeRows.ScreenshotRequiredByToolId.GetValueOrDefault(r.ToolID, false), r.ScreenshotStatus, r.AttestationStatus)))
            == ScreenshotCompletion.MemberComplete;

        if (!wasComplete && isComplete)
            await EnqueueAllApprovedAsync(cycleId, ownerId);
    }

    /// <summary>
    /// Bulk-approves every Pending screenshot of <paramref name="ownerId"/> in the cycle. Authorization
    /// is checked first. No-op (still authorized) when there is nothing pending.
    /// </summary>
    public async Task<int> ApproveAllScreenshotsAsync(
        string callerId, IReadOnlyList<SuperUser> callerSuperUsers, int cycleId, string ownerId)
    {
        if (!await CanAccessMemberScreenshotsAsync(callerId, callerSuperUsers, ownerId, includeSelf: false))
            throw new UnauthorizedAccessException("You are not authorized to review these screenshots.");

        // Load every attestation row for this member+cycle (tracked) so we can evaluate the
        // five-state completion transition once, before and after the bulk change, in this
        // request — this is what prevents a double-send when many rows flip to Approved at once.
        var rows = await _db.ToolCycleAttestations
            .Where(a => a.CycleID == cycleId && a.AssociateId == ownerId)
            .ToListAsync();

        var activeRows = await GetActiveAttestationRowsAsync(ownerId, rows);
        var wasComplete = ScreenshotCompletion.ComputeMemberStatus(
            activeRows.ActiveToolCount,
            activeRows.Rows.Select(r => (r.HadAccess, r.UsedThisCycle, activeRows.ScreenshotRequiredByToolId.GetValueOrDefault(r.ToolID, false), r.ScreenshotStatus, r.AttestationStatus)))
            == ScreenshotCompletion.MemberComplete;

        // Approve every Pending shot. Reviewability is keyed on a screenshot existing (a Pending
        // status implies one was uploaded), so optional shots on no-access / not-used rows are
        // approvable too — the tool's ScreenshotRequired flag governs gating/completion, not review.
        var pending = rows.Where(a => a.ScreenshotStatus == "Pending").ToList();

        foreach (var att in pending)
            StampReview(att, callerId, approve: true, reason: null);

        if (pending.Count > 0)
            LogReviewEvent(cycleId, callerId, pending.Count,
                $"Bulk approved {pending.Count} screenshot(s) for {ownerId}.");

        await _db.SaveChangesAsync();

        var isComplete = ScreenshotCompletion.ComputeMemberStatus(
            activeRows.ActiveToolCount,
            activeRows.Rows.Select(r => (r.HadAccess, r.UsedThisCycle, activeRows.ScreenshotRequiredByToolId.GetValueOrDefault(r.ToolID, false), r.ScreenshotStatus, r.AttestationStatus)))
            == ScreenshotCompletion.MemberComplete;

        if (!wasComplete && isComplete)
            await EnqueueAllApprovedAsync(cycleId, ownerId);

        return pending.Count;
    }

    private async Task<(int ActiveToolCount, List<ToolCycleAttestation> Rows, Dictionary<int, bool> ScreenshotRequiredByToolId)> GetActiveAttestationRowsAsync(
        string associateId,
        List<ToolCycleAttestation> rows)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);
        var activeKeys = await _db.UserToolAccess.AsNoTracking()
            .Where(uta => uta.AssociateId == associateId
                       && uta.Access
                       && uta.GivenDate <= today
                       && (uta.ToDate == null || uta.ToDate >= today))
            .Select(uta => new { ClientID = uta.ClientID!, uta.ToolID })
            .ToListAsync();

        var activeKeySet = activeKeys
            .Select(key => (key.ClientID, key.ToolID))
            .ToHashSet();

        // Per-tool "screenshot required" flag (toolId is the global PK). Missing => optional.
        var activeToolIds = activeKeys.Select(k => k.ToolID).Distinct().ToList();
        var screenshotRequiredByToolId = await _db.ClientTools.AsNoTracking()
            .Where(ct => activeToolIds.Contains(ct.ToolID))
            .Select(ct => new { ct.ToolID, ct.ScreenshotRequired })
            .ToDictionaryAsync(x => x.ToolID, x => x.ScreenshotRequired);

        return (
            activeKeys.Count,
            rows.Where(row => activeKeySet.Contains((row.ClientID, row.ToolID))).ToList(),
            screenshotRequiredByToolId);
    }

    /// <summary>
    /// SINGLE CHOKE POINT for a screenshot state change after review. Both review paths
    /// (<see cref="ReviewScreenshotAsync"/> and <see cref="ApproveAllScreenshotsAsync"/>) call this
    /// for each row, then evaluate the email hooks ONCE per request after <c>SaveChangesAsync</c>
    /// (see <see cref="EnqueueScreenshotRejectedAsync"/> / <see cref="EnqueueAllApprovedAsync"/>).
    /// </summary>
    private static void StampReview(ToolCycleAttestation att, string reviewerId, bool approve, string? reason)
    {
        att.ScreenshotStatus = approve ? "Approved" : "Rejected";
        att.ScreenshotReviewedBy = reviewerId;
        att.ScreenshotReviewedAt = DateTime.UtcNow;
        att.ScreenshotRejectReason = approve ? null : reason?.Trim();
    }

    /// <summary>
    /// Composes and queues the ScreenshotRejected mail (§04-email) for one rejected row. Looks up
    /// the owner's email, the cycle/client/tool display names and the reviewer's display name.
    /// All gating (Enabled, event toggle, missing EMailAddr) happens inside <see cref="EmailService"/>.
    /// </summary>
    private async Task EnqueueScreenshotRejectedAsync(
        int cycleId, string ownerId, string clientId, int toolId, string reviewerId, string? reason)
    {
        var owner = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.AssociateId == ownerId);
        if (string.IsNullOrWhiteSpace(owner?.EmailAddr))
            return;

        var cycle = await _db.Cycles.AsNoTracking()
            .FirstOrDefaultAsync(c => c.CycleID == cycleId);

        var client = await _db.Clients.AsNoTracking()
            .FirstOrDefaultAsync(c => c.ClientID == clientId);

        var tool = await _db.ClientTools.AsNoTracking()
            .FirstOrDefaultAsync(t => t.ClientID == clientId && t.ToolID == toolId);

        var reviewer = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.AssociateId == reviewerId);

        _email.EnqueueScreenshotRejected(
            owner.EmailAddr,
            cycle?.CycleName ?? $"Cycle {cycleId}",
            client?.ClientName ?? clientId,
            tool?.ToolName ?? toolId.ToString(),
            reviewer != null ? reviewer.FullName : reviewerId,
            reason);
    }

    /// <summary>
    /// Composes and queues the AllApproved "you're complete" mail (§04-email) for the owner.
    /// Callers must have already established the not-complete -&gt; complete transition for this
    /// request (see the <c>wasComplete</c>/<c>isComplete</c> checks in the two review paths).
    /// </summary>
    private async Task EnqueueAllApprovedAsync(int cycleId, string ownerId)
    {
        var owner = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.AssociateId == ownerId);
        if (string.IsNullOrWhiteSpace(owner?.EmailAddr))
            return;

        var cycle = await _db.Cycles.AsNoTracking()
            .FirstOrDefaultAsync(c => c.CycleID == cycleId);

        _email.EnqueueAllApproved(owner.EmailAddr, cycle?.CycleName ?? $"Cycle {cycleId}");
    }

    private void LogReviewEvent(int cycleId, string reviewerId, int count, string summary)
    {
        _db.AttestationLogs.Add(new AttestationLog
        {
            CycleID = cycleId,
            AssociateId = reviewerId,
            SubmittedAt = DateTime.UtcNow,
            ToolCount = count,
            Summary = summary.Length > 100 ? summary[..100] : summary
        });
    }

    /// <summary>
    /// Streams a ZIP of every screenshot the caller may see in the cycle directly into
    /// <paramref name="output"/> (no buffering, NoCompression). Entries are
    /// <c>{associateId}\{clientId}_{toolId}.{stored extension}</c>. Scope: manager → team, GFH → department,
    /// GFHDelegate/Admin → all.
    /// </summary>
    public async Task WriteScreenshotsZipAsync(
        string callerId, IReadOnlyList<SuperUser> callerSuperUsers, int cycleId, Stream output)
    {
        var ownerIds = await ResolveScreenshotScopeOwnerIdsAsync(callerId, callerSuperUsers);

        var rows = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(a => a.CycleID == cycleId
                     && a.ScreenshotPath != null
                     && ownerIds.Contains(a.AssociateId))
            .Select(a => new { a.AssociateId, a.ClientID, a.ToolID, a.ScreenshotPath })
            .ToListAsync();

        using var zip = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true);
        foreach (var r in rows)
        {
            var file = _screenshots.Read(r.ScreenshotPath);
            if (file is null) continue;
            using (file.Content)
            {
                var extension = Path.GetExtension(r.ScreenshotPath) ?? "";
                var entryName = $"{r.AssociateId}/{r.ClientID}_{r.ToolID}{extension}";
                var entry = zip.CreateEntry(entryName, CompressionLevel.NoCompression);
                using var entryStream = entry.Open();
                await file.Content.CopyToAsync(entryStream);
            }
        }
    }

    /// <summary>
    /// WI-9: lists every screenshot the caller may see in the cycle (metadata only — no image
    /// bytes), scoped EXACTLY like <see cref="WriteScreenshotsZipAsync"/>. Backs the in-app cycle
    /// gallery so its contents always match the zip export for the same caller.
    /// </summary>
    public async Task<List<CycleScreenshotItemDto>> GetCycleScreenshotsAsync(
        string callerId, IReadOnlyList<SuperUser> callerSuperUsers, int cycleId)
    {
        var ownerIds = await ResolveScreenshotScopeOwnerIdsAsync(callerId, callerSuperUsers);

        var rows = await _db.ToolCycleAttestations.AsNoTracking()
            .Where(a => a.CycleID == cycleId
                     && a.ScreenshotPath != null
                     && ownerIds.Contains(a.AssociateId))
            .Select(a => new
            {
                a.AssociateId,
                a.ClientID,
                a.ToolID,
                a.ScreenshotPath,
                a.ScreenshotStatus,
                a.ScreenshotUploadedAt,
                a.ScreenshotRejectReason,
                a.HadAccess,
                a.UsedThisCycle
            })
            .ToListAsync();

        // The zip writer skips missing or unreadable files. Apply the same rule here so the
        // gallery and zip expose the same screenshot set rather than stale database metadata.
        rows = rows.Where(r =>
        {
            var file = _screenshots.Read(r.ScreenshotPath);
            if (file is null) return false;
            file.Content.Dispose();
            return true;
        }).ToList();

        if (rows.Count == 0) return new List<CycleScreenshotItemDto>();

        var associateIds = rows.Select(r => r.AssociateId).Distinct().ToList();
        var clientIds = rows.Select(r => r.ClientID).Distinct().ToList();
        var toolIds = rows.Select(r => r.ToolID).Distinct().ToList();

        var users = await _db.Users.AsNoTracking()
            .Where(u => associateIds.Contains(u.AssociateId))
            .ToDictionaryAsync(u => u.AssociateId, u => u.FullName);

        var clients = await _db.Clients.AsNoTracking()
            .Where(c => clientIds.Contains(c.ClientID))
            .ToDictionaryAsync(c => c.ClientID, c => c.ClientName ?? c.ClientID);

        var toolRows = await _db.ClientTools.AsNoTracking()
            .Where(t => toolIds.Contains(t.ToolID) && t.ClientID != null && clientIds.Contains(t.ClientID))
            .Select(t => new { t.ClientID, t.ToolID, t.ToolName, t.ScreenshotRequired })
            .ToListAsync();
        var tools = toolRows.ToDictionary(t => (t.ClientID!, t.ToolID), t => t.ToolName ?? t.ToolID.ToString());

        var items = rows.Select(r => new CycleScreenshotItemDto(
            r.AssociateId,
            users.TryGetValue(r.AssociateId, out var name) ? name : r.AssociateId,
            r.ClientID,
            clients.TryGetValue(r.ClientID, out var clientName) ? clientName : r.ClientID,
            r.ToolID,
            tools.TryGetValue((r.ClientID, r.ToolID), out var toolName) ? toolName : r.ToolID.ToString(),
            r.ScreenshotStatus,
            r.ScreenshotUploadedAt,
            r.ScreenshotRejectReason,
            // Reviewable whenever a screenshot exists — any uploaded shot is approvable/rejectable
            // regardless of the row's access/used status or the tool's ScreenshotRequired flag
            // (that flag governs gating/completion, not review).
            ScreenshotCompletion.ReviewableUpload(r.ScreenshotStatus)))
            .OrderBy(i => i.AssociateName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(i => i.ClientName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(i => i.ToolName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return items;
    }

    /// <summary>
    /// The associate ids whose screenshots the caller may see: Admin/GFHDelegate → everyone;
    /// otherwise the union of the caller's direct reports and (for a GFH) their department members.
    /// </summary>
    private async Task<HashSet<string>> ResolveScreenshotScopeOwnerIdsAsync(
        string callerId, IReadOnlyList<SuperUser> callerSuperUsers)
    {
        if (callerSuperUsers.Any(s => SuperUserRoles.IsAny(s.RoleName, SuperUserRoles.Admin, SuperUserRoles.GFHDelegate)))
            return (await _db.Users.AsNoTracking().Select(u => u.AssociateId).ToListAsync()).ToHashSet();

        var ids = (await _db.Users.AsNoTracking()
            .Where(u => u.ManagerId == callerId)
            .Select(u => u.AssociateId)
            .ToListAsync()).ToHashSet();

        var gfhDepts = callerSuperUsers
            .Where(s => SuperUserRoles.Is(s.RoleName, SuperUserRoles.GFH) && s.Department != null)
            .Select(s => s.Department!.DepartmentName)
            .Distinct()
            .ToList();

        if (gfhDepts.Count > 0)
        {
            var deptMembers = await _db.Users.AsNoTracking()
                .Where(u => u.Department != null && gfhDepts.Contains(u.Department))
                .Select(u => u.AssociateId)
                .ToListAsync();
            foreach (var id in deptMembers) ids.Add(id);
        }

        return ids;
    }
}
