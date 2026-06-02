namespace DashyDashboard.Api.Models.DTOs;

public record CycleDto(
    int CycleID,
    string CycleName,
    DateOnly StartDate,
    DateOnly EndDate,
    DateOnly DueDate,
    int DaysLeft
);
