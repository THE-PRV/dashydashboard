namespace DashyDashboard.Api.Common;

/// <summary>
/// Screenshot completion semantics (Feature 2, §7) and the single source of truth for a member's
/// five-state attestation status (UI-overhaul WI-6).
///
/// A member's attestation is COMPLETE only when it is submitted AND every non-exempt screenshot
/// is Approved. Exempt rows never require a screenshot:
///   • no-access rows   (HadAccess == false), and
///   • not-used rows    (HadAccess == true && UsedThisCycle == false)   — WI-1.
/// Only USED rows (HadAccess == true && UsedThisCycle == true) require a screenshot.
///
/// These helpers classify a member's screenshot state from a set of (HadAccess, UsedThisCycle,
/// ScreenshotStatus[, AttestationStatus]) tuples so the team view, member detail, department
/// rollups and the incomplete export all agree on what "done" means and on the status label shown.
/// </summary>
public static class ScreenshotCompletion
{
    public const string StatusPending = "Pending";
    public const string StatusApproved = "Approved";
    public const string StatusRejected = "Rejected";

    // ── Five-state member status (WI-6) ────────────────────────────────────────
    // PascalCase string enum values; these exact strings are sent verbatim in JSON and the
    // frontend maps state -> chip. Never re-derive this logic elsewhere.
    public const string MemberNotStarted = "NotStarted";
    public const string MemberInProgress = "InProgress";
    public const string MemberAwaitingApproval = "AwaitingApproval";
    public const string MemberActionNeeded = "ActionNeeded";
    public const string MemberComplete = "Complete";

    /// <summary>Human label for a five-state status value (for exports / server-side text).</summary>
    public static string MemberStatusLabel(string status) => status switch
    {
        MemberNotStarted => "Not started",
        MemberInProgress => "In progress",
        MemberAwaitingApproval => "Awaiting approval",
        MemberActionNeeded => "Action needed",
        MemberComplete => "Complete",
        _ => status
    };

    /// <summary>
    /// A row requires a screenshot when the associate had access AND actually USED the tool this
    /// cycle. No-access rows and not-used rows are exempt (WI-1).
    /// </summary>
    public static bool RequiresScreenshot(bool hadAccess, bool? usedThisCycle)
        => hadAccess && usedThisCycle == true;

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

    /// <summary>
    /// Computes a member's single five-state status for the cycle from their attestation rows
    /// (UI-overhaul WI-6 — the one place this is decided). Rules:
    ///   • submitted   = any row AttestationStatus == "Submitted"
    ///   • answered(r) = UsedThisCycle.HasValue || HadAccess == false
    ///   • not submitted: no answered rows (or no rows) -> NotStarted; else InProgress
    ///   • submitted: any required-screenshot row Rejected -> ActionNeeded (Rejected beats Pending);
    ///                else any required-screenshot row not Approved (Pending/NULL) -> AwaitingApproval;
    ///                else Complete.
    /// </summary>
    public static string ComputeMemberStatus(
        IEnumerable<(bool HadAccess, bool? UsedThisCycle, string? ScreenshotStatus, string AttestationStatus)> rows)
    {
        var submitted = false;
        var anyAnswered = false;
        var anyRows = false;
        var anyAwaiting = false;
        var anyRejected = false;

        foreach (var r in rows)
        {
            anyRows = true;
            if (r.AttestationStatus == "Submitted") submitted = true;
            if (r.UsedThisCycle.HasValue || r.HadAccess == false) anyAnswered = true;

            if (RequiresScreenshot(r.HadAccess, r.UsedThisCycle))
            {
                if (r.ScreenshotStatus == StatusRejected) anyRejected = true;
                else if (r.ScreenshotStatus != StatusApproved) anyAwaiting = true; // Pending or NULL
            }
        }

        if (!submitted)
            return (!anyRows || !anyAnswered) ? MemberNotStarted : MemberInProgress;

        if (anyRejected) return MemberActionNeeded;   // Rejected beats Pending (spec precedence)
        if (anyAwaiting) return MemberAwaitingApproval;
        return MemberComplete;
    }
}
