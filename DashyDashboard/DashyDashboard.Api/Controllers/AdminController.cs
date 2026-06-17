using DashyDashboard.Api.Common;
using DashyDashboard.Api.Models.Domain;
using DashyDashboard.Api.Models.DTOs;
using DashyDashboard.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace DashyDashboard.Api.Controllers;

[ApiController]
[Route("api/admin")]
public class AdminController : ControllerBase
{
    private readonly AdminService _admin;
    private readonly ManagerService _manager;
    private SuperUser? CurrentSuperUser => HttpContext.Items["SuperUser"] as SuperUser;
    private User? CurrentUser => HttpContext.Items["CurrentUser"] as User;

    public AdminController(AdminService admin, ManagerService manager) { _admin = admin; _manager = manager; }

    [HttpGet("departments")]
    public async Task<IActionResult> GetDepartments([FromQuery] int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        var su = CurrentSuperUser;
        if (su is null) return Forbid();

        List<string>? scopeDepts = null;
        if (!SuperUserRoles.IsAny(su.RoleName, SuperUserRoles.Admin, SuperUserRoles.GFHDelegate))
        {
            var allSu = HttpContext.Items["SuperUsers"] as IList<SuperUser> ?? new List<SuperUser> { su };
            scopeDepts = allSu.Select(s => s.Department?.DepartmentName).Where(d => d != null).Select(d => d!).Distinct().ToList();
        }
        var result = await _admin.GetDepartmentsAsync(cycleId, scopeDepts);
        return Ok(result);
    }

    [HttpGet("departments/{deptName}/managers")]
    public async Task<IActionResult> GetDeptManagers(string deptName, [FromQuery] int cycleId, [FromQuery] string? clientId = null)
    {
        if (CurrentUser is null) return Unauthorized();
        var su = CurrentSuperUser;
        if (su is null) return Forbid();

        if (!SuperUserRoles.IsAny(su.RoleName, SuperUserRoles.Admin, SuperUserRoles.GFHDelegate))
        {
            var allSu = HttpContext.Items["SuperUsers"] as IList<SuperUser> ?? new List<SuperUser> { su };
            var depts = allSu.Select(s => s.Department?.DepartmentName).Where(d => d != null).ToHashSet();
            if (!depts.Contains(deptName)) return Forbid();
        }

        var result = await _admin.GetDepartmentManagersAsync(deptName, cycleId, clientId);
        return Ok(result);
    }

    [HttpGet("managers/{managerId}/team")]
    public async Task<IActionResult> GetManagerTeam(string managerId, [FromQuery] int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        var su = CurrentSuperUser;
        if (su is null) return Forbid();

        if (!await ManagerInScopeAsync(su, managerId)) return Forbid();

        var result = await _manager.GetTeamAsync(managerId, cycleId, includeEmpty: false);
        return Ok(result);
    }

    [HttpGet("managers/{managerId}/team/{memberId}")]
    public async Task<IActionResult> GetManagerMemberDetail(string managerId, string memberId, [FromQuery] int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        var su = CurrentSuperUser;
        if (su is null) return Forbid();

        if (!await ManagerInScopeAsync(su, managerId)) return Forbid();

        var result = await _manager.GetMemberDetailAsync(managerId, memberId, cycleId);
        if (result is null) return NotFound();
        return Ok(result);
    }

    // Admin/GFHDelegate see all managers; other roles only managers within their department scope.
    private async Task<bool> ManagerInScopeAsync(SuperUser su, string managerId)
    {
        if (SuperUserRoles.IsAny(su.RoleName, SuperUserRoles.Admin, SuperUserRoles.GFHDelegate)) return true;

        var mgrDept = await _admin.GetUserDepartmentAsync(managerId);
        if (mgrDept is null) return false;

        var allSu = HttpContext.Items["SuperUsers"] as IList<SuperUser> ?? new List<SuperUser> { su };
        var depts = allSu.Select(s => s.Department?.DepartmentName).Where(d => d != null).ToHashSet();
        return depts.Contains(mgrDept);
    }

    [HttpPost("tools")]
    public async Task<IActionResult> AddTool([FromBody] AddToolRequest req)
    {
        var su = CurrentSuperUser;
        if (su is null) return Forbid();

        if (!SuperUserRoles.IsAny(su.RoleName, SuperUserRoles.Admin, SuperUserRoles.GFH, SuperUserRoles.GFHDelegate)) return Forbid();

        if (!SuperUserRoles.IsAny(su.RoleName, SuperUserRoles.Admin, SuperUserRoles.GFHDelegate))
        {
            var allSu = HttpContext.Items["SuperUsers"] as IList<SuperUser> ?? new List<SuperUser> { su };
            if (!allSu.Any(s => s.DepartmentID == req.DepartmentId)) return Forbid();
        }

        var user = CurrentUser;
        if (user is null) return Unauthorized();

        var result = await _admin.AddToolAsync(req.ClientId, req.ToolName, req.DepartmentId, req.ScreenshotRequired, user.AssociateId);
        return CreatedAtAction(nameof(AddTool), result);
    }

    [HttpPost("clients")]
    public async Task<IActionResult> AddClient([FromBody] AddClientRequest req)
    {
        var su = CurrentSuperUser;
        if (su is null) return Forbid();
        if (!SuperUserRoles.IsAny(su.RoleName, SuperUserRoles.Admin, SuperUserRoles.GFH, SuperUserRoles.GFHDelegate)) return Forbid();

        var user = CurrentUser;
        if (user is null) return Unauthorized();

        try
        {
            var result = await _admin.AddClientAsync(req.ClientId, req.ClientName, user.AssociateId);
            return CreatedAtAction(nameof(AddClient), result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { status = 400, title = ex.Message });
        }
    }

    [HttpPut("users/{associateId}")]
    public async Task<IActionResult> UpdateUser(string associateId, [FromBody] UpdateUserRequest req)
    {
        var user = CurrentUser;
        if (user is null) return Unauthorized();
        var su = CurrentSuperUser;
        if (su is null || !SuperUserRoles.Is(su.RoleName, SuperUserRoles.Admin)) return Forbid();

        try
        {
            await _admin.UpdateUserAsync(associateId, req);
            return Ok();
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { status = 404, title = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { status = 400, title = ex.Message });
        }
    }

    [HttpGet("departments/{deptName}/non-submitted")]
    public async Task<IActionResult> GetNonSubmitted(string deptName, [FromQuery] int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        var su = CurrentSuperUser;
        if (su is null) return Forbid();

        if (!SuperUserRoles.IsAny(su.RoleName, SuperUserRoles.Admin, SuperUserRoles.GFHDelegate))
        {
            var allSu = HttpContext.Items["SuperUsers"] as IList<SuperUser> ?? new List<SuperUser> { su };
            var depts = allSu.Select(s => s.Department?.DepartmentName).Where(d => d != null).ToHashSet();
            if (!depts.Contains(deptName)) return Forbid();
        }

        var result = await _admin.GetNonSubmittedAsync(deptName, cycleId);
        return Ok(result);
    }

    [HttpGet("departments/{deptName}/disputes")]
    public async Task<IActionResult> GetDisputes(string deptName, [FromQuery] int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        var su = CurrentSuperUser;
        if (su is null) return Forbid();

        if (!SuperUserRoles.IsAny(su.RoleName, SuperUserRoles.Admin, SuperUserRoles.GFHDelegate))
        {
            var allSu = HttpContext.Items["SuperUsers"] as IList<SuperUser> ?? new List<SuperUser> { su };
            var depts = allSu.Select(s => s.Department?.DepartmentName).Where(d => d != null).ToHashSet();
            if (!depts.Contains(deptName)) return Forbid();
        }

        var result = await _admin.GetDisputesAsync(deptName, cycleId);
        return Ok(result);
    }

    private const string XlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    [HttpGet("departments/{deptName}/non-submitted/export")]
    public async Task<IActionResult> GetNonSubmittedExport(string deptName, [FromQuery] int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        var su = CurrentSuperUser;
        if (su is null) return Forbid();

        if (!SuperUserRoles.IsAny(su.RoleName, SuperUserRoles.Admin, SuperUserRoles.GFHDelegate))
        {
            var allSu = HttpContext.Items["SuperUsers"] as IList<SuperUser> ?? new List<SuperUser> { su };
            var depts = allSu.Select(s => s.Department?.DepartmentName).Where(d => d != null).ToHashSet();
            if (!depts.Contains(deptName)) return Forbid();
        }

        var rows = await _admin.GetNonSubmittedAsync(deptName, cycleId);
        var headers = new[] { "Associate ID", "Name", "Completion %", "Status", "Email", "Reports To" };
        var bytes = XlsxExporter.Build("Not Fully Submitted", headers,
            rows.Select(d => new object?[] { d.AssociateId, d.Name, d.CompletionPct, d.Status, d.Email, d.ManagerName }));
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(bytes, XlsxMime, $"not-fully-submitted-{deptName}-cycle{cycleId}.xlsx");
    }

    [HttpGet("departments/{deptName}/disputes/export")]
    public async Task<IActionResult> GetDisputesExport(string deptName, [FromQuery] int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        var su = CurrentSuperUser;
        if (su is null) return Forbid();

        if (!SuperUserRoles.IsAny(su.RoleName, SuperUserRoles.Admin, SuperUserRoles.GFHDelegate))
        {
            var allSu = HttpContext.Items["SuperUsers"] as IList<SuperUser> ?? new List<SuperUser> { su };
            var depts = allSu.Select(s => s.Department?.DepartmentName).Where(d => d != null).ToHashSet();
            if (!depts.Contains(deptName)) return Forbid();
        }

        var rows = await _admin.GetDisputesAsync(deptName, cycleId);
        var headers = new[] { "Associate ID", "Name", "Tool", "Client Name", "Client ID", "Reason", "Email", "Reports To" };
        var bytes = XlsxExporter.Build("Access Disputes", headers,
            rows.Select(d => new object?[] { d.AssociateId, d.Name, d.ToolName, d.ClientName, d.ClientId, d.Reason, d.Email, d.ManagerName }));
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(bytes, XlsxMime, $"access-disputes-{deptName}-cycle{cycleId}.xlsx");
    }
}
