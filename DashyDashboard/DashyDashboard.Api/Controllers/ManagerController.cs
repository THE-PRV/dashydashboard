using DashyDashboard.Api.Common;
using DashyDashboard.Api.Data;
using DashyDashboard.Api.Models.Domain;
using DashyDashboard.Api.Models.DTOs;
using DashyDashboard.Api.Services;
using Microsoft.AspNetCore.Http.Features;
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
    private IReadOnlyList<SuperUser> CurrentSuperUsers =>
        (HttpContext.Items["SuperUsers"] as IList<SuperUser>)?.ToList()
        ?? (CurrentSuperUser is null ? new List<SuperUser>() : new List<SuperUser> { CurrentSuperUser });

    [NonAction]
    private async Task<bool> IsManagerAsync()
    {
        if (CurrentUser is null) return false;
        return await _db.Users.AnyAsync(u => u.ManagerId == CurrentUser.AssociateId);
    }

    [NonAction]
    private bool IsAdminSuperUser() =>
        SuperUserRoles.Is(CurrentSuperUser?.RoleName, SuperUserRoles.Admin) && (CurrentSuperUser?.IsActive ?? false);

    [HttpGet("team")]
    public async Task<IActionResult> GetTeam([FromQuery] int cycleId, [FromQuery] bool includeEmpty = false)
    {
        if (CurrentUser is null) return Unauthorized();
        if (!await IsManagerAsync()) return Forbid();
        var team = await _svc.GetTeamAsync(CurrentUser.AssociateId, cycleId, includeEmpty);
        return Ok(team);
    }

    [HttpGet("disputes")]
    public async Task<IActionResult> GetDisputes([FromQuery] int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        if (!await IsManagerAsync()) return Forbid();
        var result = await _svc.GetDisputesAsync(CurrentUser.AssociateId, cycleId);
        return Ok(result);
    }

    [HttpGet("disputes/export")]
    public async Task<IActionResult> GetDisputesExport([FromQuery] int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        if (!await IsManagerAsync()) return Forbid();

        var rows = await _svc.GetDisputesAsync(CurrentUser.AssociateId, cycleId);
        var headers = new[] { "Associate ID", "Name", "Tool", "Client Name", "Client ID", "Reason", "Email", "Reports To" };
        var bytes = XlsxExporter.Build("Access Disputes", headers,
            rows.Select(d => new object?[] { d.AssociateId, d.Name, d.ToolName, d.ClientName, d.ClientId, d.Reason, d.Email, d.ManagerName }));
        const string xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(bytes, xlsxMime, $"access-disputes-cycle{cycleId}.xlsx");
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
        try
        {
            await _svc.GrantAccessAsync(CurrentUser.AssociateId, memberId, req);
            return NoContent();
        }
        catch (InvalidOperationException ex) { return BadRequest(new { status = 400, title = ex.Message }); }
        catch (KeyNotFoundException ex) { return NotFound(new { status = 404, title = ex.Message }); }
        catch (UnauthorizedAccessException ex) { return BadRequest(new { status = 400, title = ex.Message }); }
    }

    [HttpPut("team/{memberId}/access/{clientId}/{toolId}/user-id")]
    public async Task<IActionResult> UpdateAccessUserId(string memberId, string clientId, int toolId,
        [FromBody] UpdateToolUserIdRequest req)
    {
        if (CurrentUser is null) return Unauthorized();
        if (!await IsManagerAsync()) return Forbid();
        try
        {
            await _svc.UpdateToolUserIdAsync(CurrentUser.AssociateId, memberId, clientId, toolId, req.ToolUserId);
            return NoContent();
        }
        catch (KeyNotFoundException ex) { return NotFound(new { status = 404, title = ex.Message }); }
        catch (UnauthorizedAccessException ex) { return BadRequest(new { status = 400, title = ex.Message }); }
    }

    // Export all visible accesses as .xlsx. Honours the Access page's on-screen filters
    // (member / client) and the caller's visibility: managers see their direct reports,
    // an Admin SuperUser sees everyone. Built with the shared XlsxExporter helper.
    [HttpGet("access/export")]
    public async Task<IActionResult> ExportAccesses([FromQuery] int cycleId,
        [FromQuery] string? memberId = null, [FromQuery] string? clientId = null)
    {
        if (CurrentUser is null) return Unauthorized();

        var isAdmin = IsAdminSuperUser();
        if (!isAdmin && !await IsManagerAsync()) return Forbid();

        var rows = await _svc.GetAccessExportAsync(CurrentUser.AssociateId, isAdmin, memberId, clientId);

        var headers = new[]
        {
            "Associate Name", "Associate ID", "Client", "Tool ID", "Tool Name",
            "Tier", "Access From", "Access To", "User ID"
        };
        var bytes = XlsxExporter.Build("Accesses", headers, rows.Select(r => new object?[]
        {
            r.AssociateName,
            r.AssociateId,
            $"{r.ClientName} ({r.ClientId})",
            r.ToolID,
            r.ToolName,
            r.Tier,
            r.GivenDate.ToString("yyyy-MM-dd"),
            r.AccessTo?.ToString("yyyy-MM-dd"),
            r.ToolUserId
        }));

        const string xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(bytes, xlsxMime, $"accesses-cycle{cycleId}.xlsx");
    }

    [HttpPut("team/{memberId}/access/{clientId}/{toolId}/open")]
    public async Task<IActionResult> SetOpenAccess(string memberId, string clientId, int toolId,
        [FromBody] SetOpenAccessRequest req)
    {
        if (CurrentUser is null) return Unauthorized();
        if (!await IsManagerAsync()) return Forbid();
        try
        {
            await _svc.SetOpenAccessAsync(CurrentUser.AssociateId, memberId, clientId, toolId, req.Open);
            return Ok();
        }
        catch (KeyNotFoundException ex) { return NotFound(new { status = 404, title = ex.Message }); }
        catch (UnauthorizedAccessException ex) { return BadRequest(new { status = 400, title = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { status = 400, title = ex.Message }); }
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

    [HttpGet("grantable-clients-tools")]
    public async Task<IActionResult> GetGrantableClientsAndTools()
    {
        if (CurrentUser is null) return Unauthorized();
        if (!await IsManagerAsync()) return Forbid();
        var data = await _svc.GetGrantableClientsAndToolsAsync(CurrentUser.AssociateId);
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

    // ── Screenshot review (§6) ────────────────────────────────────────────────
    // Authorization (manager-of-associate / GFH-of-dept / GFHDelegate / Admin) is enforced inside
    // the service via the caller's SuperUser rows; an UnauthorizedAccessException maps to 403.

    [HttpPut("screenshots/{cycleId}/{associateId}/{clientId}/{toolId}/review")]
    public async Task<IActionResult> ReviewScreenshot(int cycleId, string associateId, string clientId, int toolId,
        [FromBody] ReviewScreenshotRequest req)
    {
        if (CurrentUser is null) return Unauthorized();
        try
        {
            await _svc.ReviewScreenshotAsync(CurrentUser.AssociateId, CurrentSuperUsers,
                cycleId, associateId, clientId, toolId, req.Approve, req.Reason);
            return Ok(new { status = req.Approve ? "Approved" : "Rejected" });
        }
        catch (UnauthorizedAccessException) { return Forbid(); }
        catch (KeyNotFoundException ex) { return NotFound(new { status = 404, title = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { status = 400, title = ex.Message }); }
    }

    [HttpPut("screenshots/{cycleId}/{associateId}/approve-all")]
    public async Task<IActionResult> ApproveAllScreenshots(int cycleId, string associateId)
    {
        if (CurrentUser is null) return Unauthorized();
        try
        {
            var count = await _svc.ApproveAllScreenshotsAsync(CurrentUser.AssociateId, CurrentSuperUsers, cycleId, associateId);
            return Ok(new { approved = count });
        }
        catch (UnauthorizedAccessException) { return Forbid(); }
    }

    // WI-9: in-app cycle gallery listing — same authorization + scoping as the zip export below,
    // so the gallery's contents always match the zip for the same caller.
    [HttpGet("cycles/{cycleId}/screenshots")]
    public async Task<IActionResult> GetCycleScreenshots(int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        if (!await IsManagerAsync()
            && !CurrentSuperUsers.Any(s => SuperUserRoles.IsAny(s.RoleName,
                    SuperUserRoles.Admin, SuperUserRoles.GFH, SuperUserRoles.GFHDelegate)))
            return Forbid();

        var items = await _svc.GetCycleScreenshotsAsync(CurrentUser.AssociateId, CurrentSuperUsers, cycleId);
        return Ok(items);
    }

    [HttpGet("cycles/{cycleId}/screenshots.zip")]
    public async Task<IActionResult> DownloadScreenshotsZip(int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        // Only managers, GFH/GFHDelegate or Admin may export. Anyone with no review scope gets nothing.
        if (!await IsManagerAsync()
            && !CurrentSuperUsers.Any(s => SuperUserRoles.IsAny(s.RoleName,
                    SuperUserRoles.Admin, SuperUserRoles.GFH, SuperUserRoles.GFHDelegate)))
            return Forbid();

        Response.ContentType = "application/zip";
        Response.Headers.ContentDisposition = $"attachment; filename=\"screenshots-cycle{cycleId}.zip\"";
        Response.Headers["X-Content-Type-Options"] = "nosniff";

        // ZipArchive writes synchronously to the response stream. Kestrel disallows synchronous IO
        // by default, so enable it just for this streamed response (avoids buffering many images).
        var syncIo = HttpContext.Features.Get<IHttpBodyControlFeature>();
        if (syncIo is not null) syncIo.AllowSynchronousIO = true;

        await _svc.WriteScreenshotsZipAsync(CurrentUser.AssociateId, CurrentSuperUsers, cycleId, Response.Body);
        return new EmptyResult();
    }
}
