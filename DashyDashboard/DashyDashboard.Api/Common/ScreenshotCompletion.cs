namespace DashyDashboard.Api.Common;

/// <summary>
/// Screenshot completion semantics (Feature 2, §7).
///
/// A member's attestation is COMPLETE only when it is submitted AND every non-exempt screenshot
/// is Approved. No-access rows (HadAccess == false) are exempt and never require a screenshot.
///
/// These helpers classify a member's screenshot state from a set of (HadAccess, UsedThisCycle,
/// ScreenshotStatus) tuples so the team view, department rollups and the incomplete export all
/// agree on what "done" means.
/// </summary>
public static class ScreenshotCompletion
{
    public const string StatusPending = "Pending";
    public const string StatusApproved = "Approved";
    public const string StatusRejected = "Rejected";

    /// <summary>
    /// A row requires a screenshot when the associate had access (not a no-access row) and has
    /// decided usage for it. No-access rows are exempt.
    /// </summary>
    public static bool RequiresScreenshot(bool hadAccess, bool? usedThisCycle)
        => hadAccess && usedThisCycle.HasValue;

    /// <summary>
    /// Classifies the screenshot state of a member's attestation rows.
    /// Returns whether any required screenshot is still awaiting approval (Pending or NULL),
    /// and whether any required screenshot is Rejected. A member with neither is screenshot-complete.
    /// </summary>
    public static (bool AnyAwaiting, bool AnyRejected) Classify(
        IEnumerable<(bool HadAccess, bool? UsedThisCycle, string? ScreenshotStatus)> rows)
    {
        var anyAwaiting = false;
        var anyRejected = false;
        foreach (var r in rows)
        {
            if (!RequiresScreenshot(r.HadAccess, r.UsedThisCycle)) continue;
            if (r.ScreenshotStatus == StatusRejected) anyRejected = true;
            else if (r.ScreenshotStatus != StatusApproved) anyAwaiting = true; // Pending or NULL
        }
        return (anyAwaiting, anyRejected);
    }

    /// <summary>True if every required screenshot in the set is Approved (no awaiting, none rejected).</summary>
    public static bool AllApproved(
        IEnumerable<(bool HadAccess, bool? UsedThisCycle, string? ScreenshotStatus)> rows)
    {
        var (anyAwaiting, anyRejected) = Classify(rows);
        return !anyAwaiting && !anyRejected;
    }
}
