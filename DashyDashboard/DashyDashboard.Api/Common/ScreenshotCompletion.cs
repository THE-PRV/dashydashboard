namespace DashyDashboard.Api.Common;

/// <summary>
/// Screenshot completion semantics (Feature 2, §7) and the single source of truth for a member's
/// five-state attestation status (UI-overhaul WI-6).
///
/// A member's attestation is COMPLETE only when every currently active tool is answered and
/// submitted, AND every non-exempt screenshot is Approved. Exempt rows never require a screenshot:
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
    /// A tool is answered when usage was selected, or the associate declared that they did not
    /// have access. This definition is shared by submission gating and member status computation.
    /// </summary>
    public static bool IsAnswered(bool hadAccess, bool? usedThisCycle)
        => usedThisCycle.HasValue || !hadAccess;

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
    /// Computes a member's single five-state status for the cycle from rows belonging to their
    /// currently active tool accesses (UI-overhaul WI-6 — the one place this is decided). Complete
    /// requires every active tool to be answered and Submitted. This prevents an older submission
    /// from remaining Complete when a new active access is granted.
    /// </summary>
    public static string ComputeMemberStatus(
        int activeToolCount,
        IEnumerable<(bool HadAccess, bool? UsedThisCycle, string? ScreenshotStatus, string AttestationStatus)> rows)
    {
        var anyAnswered = false;
        var rowCount = 0;
        var answeredCount = 0;
        var submittedAnsweredCount = 0;
        var anyAwaiting = false;
        var anyRejected = false;

        foreach (var r in rows)
        {
            rowCount++;
            if (IsAnswered(r.HadAccess, r.UsedThisCycle))
            {
                anyAnswered = true;
                answeredCount++;
                if (r.AttestationStatus == "Submitted")
                    submittedAnsweredCount++;
            }

            if (RequiresScreenshot(r.HadAccess, r.UsedThisCycle))
            {
                if (r.ScreenshotStatus == StatusRejected) anyRejected = true;
                else if (r.ScreenshotStatus != StatusApproved) anyAwaiting = true; // Pending or NULL
            }
        }

        var fullySubmitted = activeToolCount > 0
            && rowCount == activeToolCount
            && answeredCount == activeToolCount
            && submittedAnsweredCount == activeToolCount;

        if (!fullySubmitted)
            return anyAnswered ? MemberInProgress : MemberNotStarted;

        if (anyRejected) return MemberActionNeeded;   // Rejected beats Pending (spec precedence)
        if (anyAwaiting) return MemberAwaitingApproval;
        return MemberComplete;
    }

    /// <summary>
    /// Compatibility overload for callers whose row set itself defines the active tool set.
    /// Operational views should pass the current active-tool count explicitly.
    /// </summary>
    public static string ComputeMemberStatus(
        IEnumerable<(bool HadAccess, bool? UsedThisCycle, string? ScreenshotStatus, string AttestationStatus)> rows)
    {
        var materialized = rows.ToList();
        return ComputeMemberStatus(materialized.Count, materialized);
    }
}
