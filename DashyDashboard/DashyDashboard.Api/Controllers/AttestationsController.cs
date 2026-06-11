using DashyDashboard.Api.Common;
using DashyDashboard.Api.Models.Domain;
using DashyDashboard.Api.Models.DTOs;
using DashyDashboard.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace DashyDashboard.Api.Controllers;

[ApiController]
[Route("api/attestations")]
public class AttestationsController : ControllerBase
{
    private readonly AttestationService _svc;
    public AttestationsController(AttestationService svc) { _svc = svc; }

    private User? CurrentUser => HttpContext.Items["CurrentUser"] as User;
    private SuperUser? CurrentSuperUser => HttpContext.Items["SuperUser"] as SuperUser;

    [HttpGet]
    public async Task<IActionResult> GetMyAttestations([FromQuery] int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        var result = await _svc.GetUserAttestationsAsync(CurrentUser.AssociateId, cycleId);
        return Ok(result);
    }

    [HttpPut("{cycleId}/{clientId}/{toolId}/used")]
    public async Task<IActionResult> ToggleUsed(int cycleId, string clientId, int toolId,
        [FromBody] ToggleUsedRequest req)
    {
        if (CurrentUser is null) return Unauthorized();
        await _svc.ToggleUsedAsync(CurrentUser.AssociateId, cycleId, clientId, toolId, req.Used);
        return NoContent();
    }

    [HttpPut("{cycleId}/{clientId}/{toolId}/had-access")]
    public async Task<IActionResult> ToggleHadAccess(int cycleId, string clientId, int toolId,
        [FromBody] ToggleHadAccessRequest req)
    {
        if (CurrentUser is null) return Unauthorized();
        try
        {
            await _svc.ToggleHadAccessAsync(CurrentUser.AssociateId, cycleId, clientId, toolId, req.HadAccess);
            return NoContent();
        }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
        catch (UnauthorizedAccessException) { return Forbid(); }
    }

    [HttpPut("{cycleId}/{clientId}/{toolId}/remark")]
    public async Task<IActionResult> UpdateRemark(int cycleId, string clientId, int toolId,
        [FromBody] UpdateRemarkRequest req)
    {
        if (CurrentUser is null) return Unauthorized();
        await _svc.UpdateRemarkAsync(CurrentUser.AssociateId, cycleId, clientId, toolId, req.Text);
        return NoContent();
    }

    [HttpPost("{cycleId}/submit-all")]
    public async Task<IActionResult> SubmitAll(int cycleId, [FromBody] SubmitAllRequest? req)
    {
        if (CurrentUser is null) return Unauthorized();
        try
        {
            var summary = await _svc.SubmitAllAsync(CurrentUser.AssociateId, cycleId, req?.Remarks);
            return Ok(new { summary });
        }
        catch (InvalidOperationException ex) { return BadRequest(new { status = 400, title = ex.Message }); }
    }

    [HttpPost("{cycleId}/{associateId}/reopen")]
    public async Task<IActionResult> Reopen(int cycleId, string associateId)
    {
        if (CurrentUser is null) return Unauthorized();
        var isAdmin = CurrentSuperUser != null && SuperUserRoles.Is(CurrentSuperUser.RoleName, SuperUserRoles.Admin);
        try
        {
            await _svc.ReopenAsync(CurrentUser.AssociateId, isAdmin, associateId, cycleId);
            return Ok(new { reopened = true });
        }
        catch (UnauthorizedAccessException) { return Forbid(); }
        catch (InvalidOperationException ex) { return BadRequest(new { status = 400, title = ex.Message }); }
    }
}
