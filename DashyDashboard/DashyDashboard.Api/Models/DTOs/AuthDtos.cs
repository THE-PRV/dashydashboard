using System.ComponentModel.DataAnnotations;

namespace DashyDashboard.Api.Models.DTOs;

public record LoginRequest(
    [Required][MaxLength(200)] string Username,
    [Required][MaxLength(200)] string Password
);

public record LoginResponse(
    string AssociateId,
    string FirstName,
    string LastName,
    bool IsManager,
    string? SuperUserRole,
    string? SuperUserDepartment
);
