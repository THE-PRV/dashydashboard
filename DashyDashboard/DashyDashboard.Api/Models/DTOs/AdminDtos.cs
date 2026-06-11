using System.ComponentModel.DataAnnotations;

namespace DashyDashboard.Api.Models.DTOs;

public record ClientSummaryDto(string ClientId, string ClientName, int Total, int Submitted);

public record DeptSummaryDto(
    int DepartmentID,
    string DepartmentName,
    string GfhName,
    string GfhEmail,
    string Office,
    int TotalUsers,
    int TotalAssociates,
    int SubmittedCount,
    List<ClientSummaryDto> ClientBreakdown
);

public record ManagerSummaryDto(
    string AssociateId,
    string FullName,
    string Email,
    int TotalAssociates,
    int TotalTools,
    int SubmittedCount
);

public record ClientOptionDto(string ClientId, string ClientName);

public record DeptManagersDto(
    string DeptName,
    string GfhName,
    int TotalUsers,
    int TotalAssociates,
    int SubmittedCount,
    List<ManagerSummaryDto> Managers,
    List<ClientOptionDto> AvailableClients,
    int IncompleteCount,
    int DisputeCount
);

public record AddToolRequest(
    [Required][MaxLength(50)] string ClientId,
    [Required][MaxLength(100)] string ToolName,
    int DepartmentId
);

public record AddToolResponse(
    string ClientId,
    int ToolId,
    string ToolName
);

public record AddClientRequest(
    [Required][MaxLength(50)] string ClientId,
    [Required][MaxLength(255)] string ClientName
);

public record AddClientResponse(
    string ClientId,
    string ClientName
);

public record NonSubmittedDto(
    string AssociateId,
    string Name,
    int CompletionPct,
    string Email,
    string ManagerName,
    // §7: "Not submitted" / "Awaiting approval" / "Has rejected screenshots"
    string Status
);

public record DisputeExportDto(
    string AssociateId,
    string Name,
    string ToolName,
    string ClientName,
    string ClientId,
    string Reason,
    string Email,
    string ManagerName
);

public record UpdateUserRequest(
    string? FirstName,
    string? LastName,
    string? UserName,
    string? Department,
    string? ManagerId,
    string? Email
);
