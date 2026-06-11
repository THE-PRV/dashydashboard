using DashyDashboard.Api.Common;
using DashyDashboard.Api.Data;
using DashyDashboard.Api.Models.Domain;
using DashyDashboard.Api.Models.DTOs;
using Microsoft.EntityFrameworkCore;

namespace DashyDashboard.Api.Services;

public class AuthService
{
    private readonly AppDbContext _db;
    public AuthService(AppDbContext db) { _db = db; }

    public async Task<(LoginResponse? Response, string Status)> LoginAsync(string username, string password)
    {
        var trimmed = username.Trim();
        var user = await _db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u =>
                (u.FirstName + " " + u.LastName) == trimmed
                || u.UserName == trimmed);

        var isManager = user != null && await _db.Users
            .AnyAsync(u => u.ManagerId == user.AssociateId);

        var status = user is null ? "UserNotFound" : "Success";

        _db.LoginLogs.Add(new LoginLog
        {
            AssociateId = user?.AssociateId,
            LoginTime   = DateTime.UtcNow,
            Status      = status
        });
        await _db.SaveChangesAsync();

        if (user is null) return (null, status);

        var allSu = await _db.SuperUsers
            .AsNoTracking()
            .Include(s => s.Department)
            .Where(s => s.AssociateId == user.AssociateId && s.IsActive)
            .OrderBy(s => s.RoleName == "Admin" ? 0 : s.RoleName == "GFH" ? 1 : s.RoleName == "GFHDelegate" ? 2 : s.RoleName == "IFH" ? 3 : 4)
            .ThenBy(s => s.AccessLevel == "Full" ? 0 : 1)
            .ThenBy(s => s.Department!.DepartmentName)
            .ToListAsync();

        var su = allSu.FirstOrDefault();
        var superRole = SuperUserRoles.Canonical(su?.RoleName);
        var superDept = SuperUserRoles.Is(su?.RoleName, SuperUserRoles.Admin) ? null : su?.Department?.DepartmentName;
        var superDepts = SuperUserRoles.IsAny(su?.RoleName, SuperUserRoles.Admin, SuperUserRoles.GFHDelegate)
            ? new List<string>()
            : allSu.Select(s => s.Department?.DepartmentName).Where(d => d != null).Select(d => d!).Distinct().ToList();

        return (new LoginResponse(user.AssociateId, user.FirstName, user.LastName, isManager, superRole, superDept, superDepts), status);
    }
}
