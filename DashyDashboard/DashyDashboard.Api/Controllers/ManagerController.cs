using DashyDashboard.Api.Data;
using DashyDashboard.Api.Models.Domain;
using DashyDashboard.Api.Models.DTOs;
using DashyDashboard.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DashyDashboard.Api.Controllers;

[ApiController]
[Route("api/manager")]
public class ManagerController : ControllerBase
{
    private readonly ManagerService _svc;
    private readonly AppDbContext _db;
    public ManagerController(ManagerService svc, AppDbContext db) { _svc = svc; _db = db; }

    private User? CurrentUser => HttpContext.Items["CurrentUser"] as User;
    private SuperUser? CurrentSuperUser => HttpContext.Items["SuperUser"] as SuperUser;

    [NonAction]
    private async Task<bool> IsManagerAsync()
    {
        if (CurrentUser is null) return false;
        return await _db.Users.AnyAsync(u => u.ManagerId == CurrentUser.AssociateId);
    }

    [NonAction]
    private bool IsAdminSuperUser() =>
        CurrentSuperUser?.RoleName == "Admin" && CurrentSuperUser.IsActive;

    [HttpGet("team")]
    public async Task<IActionResult> GetTeam([FromQuery] int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        if (!await IsManagerAsync()) return Forbid();
        var team = await _svc.GetTeamAsync(CurrentUser.AssociateId, cycleId);
        return Ok(team);
    }

    [HttpGet("team/{memberId}")]
    public async Task<IActionResult> GetMember(string memberId, [FromQuery] int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        if (!await IsManagerAsync()) return Forbid();
        var detail = await _svc.GetMemberDetailAsync(CurrentUser.AssociateId, memberId, cycleId);
        if (detail is null) return NotFound();
        return Ok(detail);
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetAllUsers()
    {
        if (CurrentUser is null) return Unauthorized();
        if (!IsAdminSuperUser()) return Forbid();
        var users = await _svc.GetAllUsersAsync();
        return Ok(users);
    }

    [HttpGet("team/{memberId}/access")]
    public async Task<IActionResult> GetMemberAccess(string memberId)
    {
        if (CurrentUser is null) return Unauthorized();
        if (!await IsManagerAsync()) return Forbid();
        var access = await _svc.GetMemberAccessAsync(CurrentUser.AssociateId, memberId);
        return Ok(access);
    }

    [HttpPost("team/{memberId}/access")]
    public async Task<IActionResult> GrantAccess(string memberId, [FromBody] GrantAccessRequest req)
    {
        if (CurrentUser is null) return Unauthorized();
        if (!await IsManagerAsync()) return Forbid();
        if (!ModelState.IsValid) return BadRequest(ModelState);
        await _svc.GrantAccessAsync(CurrentUser.AssociateId, memberId, req);
        return NoContent();
    }

    [HttpPut("team/{memberId}/access/{clientId}/{toolId}/revoke")]
    public async Task<IActionResult> RevokeAccess(string memberId, string clientId, int toolId)
    {
        if (CurrentUser is null) return Unauthorized();
        if (!await IsManagerAsync()) return Forbid();
        await _svc.RevokeAccessAsync(CurrentUser.AssociateId, memberId, clientId, toolId);
        return NoContent();
    }

    [HttpPut("team/{memberId}/access/{clientId}/{toolId}/end-date")]
    public async Task<IActionResult> UpdateAccessEndDate(string memberId, string clientId, int toolId,
        [FromBody] UpdateAccessEndDateRequest req)
    {
        if (CurrentUser is null) return Unauthorized();
        if (!await IsManagerAsync()) return Forbid();
        await _svc.UpdateAccessEndDateAsync(CurrentUser.AssociateId, memberId, clientId, toolId, req.AccessTo);
        return NoContent();
    }

    [HttpGet("clients-tools")]
    public async Task<IActionResult> GetClientsAndTools()
    {
        if (CurrentUser is null) return Unauthorized();
        if (!await IsManagerAsync()) return Forbid();
        var data = await _svc.GetClientsAndToolsAsync();
        return Ok(data);
    }

    [HttpPost("cycles/generate-next")]
    public async Task<IActionResult> GenerateNextCycle()
    {
        if (CurrentUser is null) return Unauthorized();
        if (!IsAdminSuperUser()) return Forbid();
        var cycle = await _svc.GenerateNextCycleAsync(CurrentUser.AssociateId);
        return Created("", cycle);
    }
}
