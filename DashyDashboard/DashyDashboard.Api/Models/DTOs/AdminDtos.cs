using System.ComponentModel.DataAnnotations;

namespace DashyDashboard.Api.Models.DTOs;

public record ClientSummaryDto(string ClientId, string ClientName, int Total, int Submitted);

public record DeptSummaryDto(
    int DepartmentID,
    string DepartmentName,
    string GfhName,
    string GfhEmail,
    string Office,
    int TotalAssociates,
    int SubmittedCount,
    List<ClientSummaryDto> ClientBreakdown
);

public record ManagerSummaryDto(
    string AssociateId,
    string FullName,
    string Email,
    int TotalAssociates,
    int SubmittedCount
);

public record ClientOptionDto(string ClientId, string ClientName);

public record DeptManagersDto(
    string DeptName,
    string GfhName,
    int TotalAssociates,
    int SubmittedCount,
    List<ManagerSummaryDto> Managers,
    List<ClientOptionDto> AvailableClients
);

public record AddToolRequest(
    [Required][MaxLength(50)] string ClientId,
    [Required][MaxLength(100)] string ToolName
);

public record AddToolResponse(
    string ClientId,
    int ToolId,
    string ToolName
);
