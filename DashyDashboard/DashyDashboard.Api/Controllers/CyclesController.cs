using DashyDashboard.Api.Models.Domain;
using DashyDashboard.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace DashyDashboard.Api.Controllers;

[ApiController]
[Route("api/cycles")]
public class CyclesController : ControllerBase
{
    private readonly AttestationService _svc;
    public CyclesController(AttestationService svc) { _svc = svc; }

    private bool IsAuthenticated => HttpContext.Items["CurrentUser"] is User;

    [HttpGet("current")]
    public async Task<IActionResult> Current()
    {
        if (!IsAuthenticated) return Unauthorized();
        var cycle = await _svc.GetCurrentCycleAsync();
        if (cycle is null) return NotFound("No active cycle found.");
        return Ok(cycle);
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        if (!IsAuthenticated) return Unauthorized();
        return Ok(await _svc.GetAllCyclesAsync());
    }
}
