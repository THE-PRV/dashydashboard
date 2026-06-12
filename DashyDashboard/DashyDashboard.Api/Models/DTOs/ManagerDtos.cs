using System.ComponentModel.DataAnnotations;

namespace DashyDashboard.Api.Models.DTOs;

public record TeamDto(
    int TotalMembers,
    int TotalTools,
    int TotalAttested,
    // ── Five-state status counts (WI-6) — one bucket per ScreenshotCompletion member status ──
    int NotStarted,
    int InProgress,
    int AwaitingApproval,
    int ActionNeeded,
    int Complete,
    int MismatchCount,
    List<TeamMemberDto> Members
);

public record TeamMemberDto(
    string AssociateId,
    string FullName,
    string Email,
    string AttestationStatus,
    int TotalTools,
    int AttestedTools,
    double ProgressPct,
    // ── Screenshot review (Feature 2 §B1) ─────────────────────────────────
    // Counts of this member's required screenshots that are still Pending /
    // Rejected for the cycle. Drive the "Awaiting approval (n)" / "Rejected (n)"
    // status chips on the team list and admin/GFH rollups.
    int PendingScreenshots,
    int RejectedScreenshots
);

public record MemberDetailDto(
    string AssociateId,
    string FullName,
    string AttestationStatus,
    int TotalTools,
    int AttestedTools,
    double ProgressPct,
    List<ClientProgressDto> ByClient,
    List<MismatchDto> Mismatches,
    // ── Screenshot review (Feature 2 §B1/§B2) ─────────────────────────────
    int PendingScreenshots,
    int RejectedScreenshots
);

// WI-4: a single access dispute (HadAccess == false) shown in the manager overlay / exports.
// SubmittedAt is the best-available "date answered" for the dispute row.
public record MismatchDto(
    string ClientID,
    string ClientName,
    string ToolName,
    string? Remarks,
    DateTime? SubmittedAt);

public record ClientProgressDto(
    string ClientID,
    string ClientName,
    int TotalTools,
    int AttestedTools,
    // ── Screenshot review (Feature 2 §B2) ─────────────────────────────────
    // Per-tool rows for this client, used to render the reviewer's screenshot
    // gallery (grouped by client). Tools with HadAccess == false (exempt) are
    // included so the gallery can show a muted "no screenshot required" tile.
    List<MemberToolDto> Tools
);

/// <summary>One tool row for the reviewer gallery — mirrors the screenshot fields of
/// <see cref="ToolAttestationDto"/> plus the tool's display name.</summary>
public record MemberToolDto(
    int ToolID,
    string ToolName,
    bool? UsedThisCycle,
    bool HadAccess,
    string? ScreenshotStatus,
    string? ScreenshotRejectReason,
    DateTime? ScreenshotUploadedAt
);

public record GrantAccessRequest(
    [Required][MaxLength(50)] string ClientID,
    [Required] int ToolID,
    DateOnly? GivenDate = null,
    DateOnly? AccessTo = null,
    bool Open = false,
    [MaxLength(100)] string? ToolUserId = null
);

public record UpdateAccessEndDateRequest(DateOnly? AccessTo);

public record UpdateToolUserIdRequest([MaxLength(100)] string? ToolUserId);

public record SetOpenAccessRequest(bool Open);

public record MemberAccessDto(
    string ClientID,
    string ClientName,
    List<AccessRowDto> Tools
);

public record AccessRowDto(
    int ToolID,
    string ToolName,
    DateOnly GivenDate,
    DateOnly? AccessTo,
    bool IsOpen,
    string? ToolUserId
);

public record AccessExportRowDto(
    string AssociateName,
    string AssociateId,
    string ClientName,
    string ClientId,
    int ToolID,
    string ToolName,
    string? Tier,
    DateOnly GivenDate,
    DateOnly? AccessTo,
    string? ToolUserId
);

// ── Screenshot review (Feature 2) ─────────────────────────────────────────

public record ReviewScreenshotRequest(bool Approve, [MaxLength(500)] string? Reason = null);

public record UserListItem(
    string AssociateId,
    string FirstName,
    string LastName,
    string FullName,
    string? UserName,
    string? Department,
    string? ManagerId,
    string? ManagerName,
    string? Email
);
