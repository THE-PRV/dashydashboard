using DashyDashboard.Api.Models.DTOs;

namespace DashyDashboard.Api.Services;

/// <summary>
/// Thrown when a submit attempt is blocked because one or more non-exempt attestation rows
/// are missing an acceptable screenshot (status NULL or Rejected). Carries the offending
/// (clientId, toolId) pairs so the UI can highlight the rows.
/// </summary>
public sealed class ScreenshotGateException : Exception
{
    public IReadOnlyList<ScreenshotGateRow> OffendingRows { get; }

    public ScreenshotGateException(IReadOnlyList<ScreenshotGateRow> offendingRows)
        : base("Upload an approved or pending screenshot for every tool you used before submitting.")
    {
        OffendingRows = offendingRows;
    }
}
