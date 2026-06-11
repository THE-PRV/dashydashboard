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
    // ~10 MB per-file backstop (browser-compressed screenshots are ~100-200 KB).
    private const long MaxScreenshotBytes = 10L * 1024 * 1024;

    private readonly AttestationService _svc;
    private readonly ManagerService _manager;
    public AttestationsController(AttestationService svc, ManagerService manager)
    {
        _svc = svc;
        _manager = manager;
    }

    private User? CurrentUser => HttpContext.Items["CurrentUser"] as User;
    private SuperUser? CurrentSuperUser => HttpContext.Items["SuperUser"] as SuperUser;
    private IReadOnlyList<SuperUser> CurrentSuperUsers =>
        (HttpContext.Items["SuperUsers"] as IList<SuperUser>)?.ToList()
        ?? (CurrentSuperUser is null ? new List<SuperUser>() : new List<SuperUser> { CurrentSuperUser });

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
        catch (ScreenshotGateException ex)
        {
            return BadRequest(new { status = 400, title = ex.Message, offendingRows = ex.OffendingRows });
        }
        catch (InvalidOperationException ex) { return BadRequest(new { status = 400, title = ex.Message }); }
    }

    // ── Screenshot upload (§4) ────────────────────────────────────────────────

    [HttpPost("{cycleId}/{clientId}/{toolId}/screenshot")]
    [RequestSizeLimit(MaxScreenshotBytes)]
    public async Task<IActionResult> UploadScreenshot(int cycleId, string clientId, int toolId, IFormFile? file)
    {
        if (CurrentUser is null) return Unauthorized();
        if (file is null || file.Length == 0)
            return BadRequest(new { status = 400, title = "No file uploaded.", error = "invalidImage" });
        if (file.Length > MaxScreenshotBytes)
            return BadRequest(new { status = 400, title = "File exceeds the 10 MB limit." });

        var bytes = await ReadAllBytesAsync(file);
        try
        {
            await _svc.UploadScreenshotAsync(CurrentUser.AssociateId, cycleId, clientId, toolId, bytes);
            return Ok(new { status = "Pending" });
        }
        catch (ArgumentException) { return BadRequest(new { status = 400, title = "File is not a valid image.", error = "invalidImage" }); }
        catch (KeyNotFoundException ex) { return NotFound(new { status = 404, title = ex.Message }); }
        catch (UnauthorizedAccessException) { return Forbid(); }
        catch (InvalidOperationException ex) { return BadRequest(new { status = 400, title = ex.Message }); }
    }

    [HttpPost("{cycleId}/screenshots/batch")]
    [RequestSizeLimit(50L * 1024 * 1024)] // many small files in one request
    public async Task<IActionResult> UploadScreenshotsBatch(int cycleId)
    {
        if (CurrentUser is null) return Unauthorized();
        if (!Request.HasFormContentType) return BadRequest(new { status = 400, title = "Expected multipart form data." });

        var form = await Request.ReadFormAsync();
        var files = new List<(string, byte[])>();
        foreach (var f in form.Files)
        {
            if (f.Length == 0) continue;
            if (f.Length > MaxScreenshotBytes) continue; // skip oversize files silently; backstop only
            files.Add((f.FileName, await ReadAllBytesAsync(f)));
        }

        try
        {
            var result = await _svc.UploadBatchAsync(CurrentUser.AssociateId, cycleId, files);
            return Ok(result);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { status = 404, title = ex.Message }); }
    }

    // ── Screenshot serving (§5) ───────────────────────────────────────────────

    [HttpGet("{cycleId}/{associateId}/{clientId}/{toolId}/screenshot")]
    public Task<IActionResult> GetScreenshot(int cycleId, string associateId, string clientId, int toolId)
        => ServeScreenshot(cycleId, associateId, clientId, toolId, thumb: false);

    [HttpGet("{cycleId}/{associateId}/{clientId}/{toolId}/thumb")]
    public Task<IActionResult> GetScreenshotThumb(int cycleId, string associateId, string clientId, int toolId)
        => ServeScreenshot(cycleId, associateId, clientId, toolId, thumb: true);

    [NonAction]
    private async Task<IActionResult> ServeScreenshot(int cycleId, string associateId, string clientId, int toolId, bool thumb)
    {
        if (CurrentUser is null) return Unauthorized();

        var result = await _manager.GetScreenshotForServingAsync(
            CurrentUser.AssociateId, CurrentSuperUsers, cycleId, associateId, clientId, toolId, thumb);
        if (result is null) return NotFound(); // not authorized OR missing — never leak 403

        var (file, hash) = result.Value;

        // ETag keyed by hash → long-lived cache, honour If-None-Match → 304.
        if (!string.IsNullOrEmpty(hash))
        {
            var etag = $"\"{hash}\"";
            if (Request.Headers.IfNoneMatch.Any(v => v == etag))
            {
                file.Content.Dispose();
                Response.Headers.ETag = etag;
                return StatusCode(StatusCodes.Status304NotModified);
            }
            Response.Headers.ETag = etag;
            Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        }

        return File(file.Content, file.ContentType);
    }

    [NonAction]
    private static async Task<byte[]> ReadAllBytesAsync(IFormFile file)
    {
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        return ms.ToArray();
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
