using DashyDashboard.Api.Data;
using DashyDashboard.Api.Models.Domain;
using Microsoft.EntityFrameworkCore;

namespace DashyDashboard.Api.Middleware;

public class UserIdentityMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IWebHostEnvironment _env;
    private readonly IConfiguration _config;
    public UserIdentityMiddleware(RequestDelegate next, IWebHostEnvironment env, IConfiguration config)
    {
        _next = next;
        _env = env;
        _config = config;
    }

    public async Task InvokeAsync(HttpContext ctx, AppDbContext db)
    {
        User? user = null;

        var windowsId = ctx.User.Identity?.Name;
        if (!string.IsNullOrEmpty(windowsId))
        {
            var matches = await db.Users.AsNoTracking()
                .Where(u => u.UserName == windowsId)
                .Take(2)
                .ToListAsync();

            if (matches.Count > 1)
                throw new InvalidOperationException($"Duplicate UserName mapping found for '{windowsId}'.");

            user = matches.SingleOrDefault();
        }

        var enableUserHeaderAuth = _env.IsDevelopment()
            && _config.GetValue<bool>("DeveloperMode:EnableUserHeaderAuth");

        if (user is null && enableUserHeaderAuth
            && ctx.Request.Headers.TryGetValue("X-User-Id", out var raw)
            && !string.IsNullOrWhiteSpace(raw))
        {
            var associateId = raw.ToString();
            user = await db.Users.AsNoTracking()
                .FirstOrDefaultAsync(u => u.AssociateId == associateId);
        }

        if (user is not null)
        {
            ctx.Items["CurrentUser"] = user;

            var su = await db.SuperUsers.AsNoTracking()
                .Include(s => s.Department)
                .Where(s => s.AssociateId == user.AssociateId && s.IsActive)
                .OrderBy(s => s.RoleName == "Admin" ? 0 : s.RoleName == "GFH" ? 1 : s.RoleName == "IFH" ? 2 : 3)
                .ThenBy(s => s.AccessLevel == "Full" ? 0 : 1)
                .ThenBy(s => s.Department!.DepartmentName)
                .FirstOrDefaultAsync();
            if (su is not null)
                ctx.Items["SuperUser"] = su;
        }

        await _next(ctx);
    }
}
