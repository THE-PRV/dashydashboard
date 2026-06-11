using System.ComponentModel.DataAnnotations;

namespace DashyDashboard.Api.Models.DTOs;

public record TeamDto(
    int TotalMembers,
    int TotalTools,
    int TotalAttested,
    int Submitted,
    int InProgress,
    int NotStarted,
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
    double ProgressPct
);

public record MemberDetailDto(
    string AssociateId,
    string FullName,
    string AttestationStatus,
    int TotalTools,
    int AttestedTools,
    double ProgressPct,
    List<ClientProgressDto> ByClient,
    List<MismatchDto> Mismatches
);

public record MismatchDto(string ClientName, string ToolName, string? Remarks);

public record ClientProgressDto(
    string ClientID,
    string ClientName,
    int TotalTools,
    int AttestedTools
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
