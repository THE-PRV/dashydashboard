using System.ComponentModel.DataAnnotations;

namespace DashyDashboard.Api.Models.DTOs;

public record ClientAttestationDto(
    string ClientID,
    string ClientName,
    int TotalTools,
    int AttestedTools,
    int UsedTools,
    List<ToolAttestationDto> Tools
);

public record ToolAttestationDto(
    int ToolID,
    string ToolName,
    bool? UsedThisCycle,
    bool HadAccess,
    string AttestationStatus,
    string? Remarks
);

public record ToggleUsedRequest(bool? Used);

public record SubmitAllRequest(string? Remarks);

public record UpdateRemarkRequest([MaxLength(500)] string? Text);

public record ToggleHadAccessRequest(bool? HadAccess);

// ── Screenshots (Feature 2) ───────────────────────────────────────────────

/// <summary>Per-file outcome of a batch screenshot upload.</summary>
/// <param name="Status">saved | unmatched | invalidImage | notAllowed</param>
public record BatchScreenshotItemResult(string FileName, string Status, string? Detail);

public record BatchScreenshotResult(List<BatchScreenshotItemResult> Results);

/// <summary>One offending attestation row that blocks submission (missing/rejected screenshot).</summary>
public record ScreenshotGateRow(string ClientID, int ToolID);
