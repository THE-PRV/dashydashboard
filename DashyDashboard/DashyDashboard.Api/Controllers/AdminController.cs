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
    private SuperUser? CurrentSuperUser => HttpContext.Items["SuperUser"] as SuperUser;
    private User? CurrentUser => HttpContext.Items["CurrentUser"] as User;

    public AdminController(AdminService admin) { _admin = admin; }

    [HttpGet("departments")]
    public async Task<IActionResult> GetDepartments([FromQuery] int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        var su = CurrentSuperUser;
        if (su is null) return Forbid();

        var scopeDept = su.RoleName == "Admin" ? null : su.Department?.DepartmentName;
        var result = await _admin.GetDepartmentsAsync(cycleId, scopeDept);
        return Ok(result);
    }

    [HttpGet("departments/{deptName}/managers")]
    public async Task<IActionResult> GetDeptManagers(string deptName, [FromQuery] int cycleId, [FromQuery] string? clientId = null)
    {
        if (CurrentUser is null) return Unauthorized();
        var su = CurrentSuperUser;
        if (su is null) return Forbid();

        if (su.RoleName != "Admin" && su.Department?.DepartmentName != deptName)
            return Forbid();

        var result = await _admin.GetDepartmentManagersAsync(deptName, cycleId, clientId);
        return Ok(result);
    }

    [HttpPost("tools")]
    public async Task<IActionResult> AddTool([FromBody] AddToolRequest req)
    {
        var su = CurrentSuperUser;
        if (su is null) return Forbid();

        if (su.RoleName != "Admin")
            return Forbid();

        var user = CurrentUser;
        if (user is null) return Unauthorized();

        var result = await _admin.AddToolAsync(req.ClientId, req.ToolName, user.AssociateId);
        return CreatedAtAction(nameof(AddTool), result);
    }
}
