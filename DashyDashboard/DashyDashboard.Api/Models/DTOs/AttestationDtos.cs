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
    string? Remarks,
    string? ScreenshotStatus,
    string? ScreenshotRejectReason,
    DateTime? ScreenshotUploadedAt
);

public record ToggleUsedRequest(bool? Used);

public record SubmitAllRequest(string? Remarks);

public record UpdateRemarkRequest([MaxLength(500)] string? Text);

public record ToggleHadAccessRequest(bool? HadAccess);

// ── Screenshots (Feature 2) ───────────────────────────────────────────────

/// <summary>One offending attestation row that blocks submission (missing/rejected screenshot).</summary>
public record ScreenshotGateRow(string ClientID, int ToolID);
