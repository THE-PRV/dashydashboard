using DashyDashboard.Api.Common;
using DashyDashboard.Api.Data;
using DashyDashboard.Api.Models.Domain;
using DashyDashboard.Api.Models.DTOs;
using DashyDashboard.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DashyDashboard.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AuthService _authService;
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    public AuthController(AuthService authService, AppDbContext db, IConfiguration config)
    {
        _authService = authService;
        _db = db;
        _config = config;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var env = HttpContext.RequestServices.GetRequiredService<IWebHostEnvironment>();
        var allowFormLogin = env.IsDevelopment() && _config.GetValue<bool>("DeveloperMode:EnableFormLogin");
        if (!allowFormLogin)
            return NotFound();

        var (response, status) = await _authService.LoginAsync(request.Username, request.Password);

        if (status == "UserNotFound" || response is null)
            return Unauthorized(new { title = "Invalid credentials." });

        Response.Headers.Append("X-User-Id", response.AssociateId);
        return Ok(response);
    }

    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var user = HttpContext.Items["CurrentUser"] as User;
        if (user is null)
        {
            var windowsId = HttpContext.User.Identity?.Name;
            if (!string.IsNullOrWhiteSpace(windowsId))
            {
                _db.LoginLogs.Add(new LoginLog
                {
                    AssociateId = null,
                    LoginTime = DateTime.UtcNow,
                    Status = "UserNotFound"
                });
                await _db.SaveChangesAsync();
            }

            return Unauthorized();
        }

        _db.LoginLogs.Add(new LoginLog
        {
            AssociateId = user.AssociateId,
            LoginTime = DateTime.UtcNow,
            Status = "Success"
        });
        await _db.SaveChangesAsync();

        var isManager = await _db.Users.AnyAsync(u => u.ManagerId == user.AssociateId);

        var allSu = await _db.SuperUsers.AsNoTracking()
            .Include(s => s.Department)
            .Where(s => s.AssociateId == user.AssociateId && s.IsActive)
            .OrderBy(s => s.RoleName == "Admin" ? 0 : s.RoleName == "GFH" ? 1 : s.RoleName == "IFH" ? 2 : 3)
            .ThenBy(s => s.AccessLevel == "Full" ? 0 : 1)
            .ThenBy(s => s.Department!.DepartmentName)
            .ToListAsync();

        var su = allSu.FirstOrDefault();
        var superRole = SuperUserRoles.Canonical(su?.RoleName);
        var superDept = SuperUserRoles.Is(su?.RoleName, SuperUserRoles.Admin) ? null : su?.Department?.DepartmentName;
        var superDepts = SuperUserRoles.IsAny(su?.RoleName, SuperUserRoles.Admin, SuperUserRoles.GFHDelegate)
            ? new List<string>()
            : allSu.Select(s => s.Department?.DepartmentName).Where(d => d != null).Select(d => d!).Distinct().ToList();

        return Ok(new LoginResponse(user.AssociateId, user.FirstName, user.LastName, isManager, superRole, superDept, superDepts));
    }
}
