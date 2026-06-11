using System.Linq;

namespace DashyDashboard.Api.Common;

/// <summary>
/// Central, case-insensitive handling of SuperUser role names.
/// The database may store roles in any casing (e.g. "admin", "Admin", "ADMIN");
/// all role decisions in the app go through these helpers so casing never matters.
/// </summary>
public static class SuperUserRoles
{
    public const string Admin = "Admin";
    public const string GFH = "GFH";
    public const string GFHDelegate = "GFHDelegate";
    public const string IFH = "IFH";

    private static string Norm(string? s) =>
        new string((s ?? string.Empty).Where(c => !char.IsWhiteSpace(c)).ToArray()).ToLowerInvariant();

    /// <summary>True if <paramref name="role"/> equals <paramref name="target"/> ignoring case and all whitespace.</summary>
    public static bool Is(string? role, string target) => Norm(role) == Norm(target);

    /// <summary>True if <paramref name="role"/> matches any of <paramref name="targets"/> ignoring case.</summary>
    public static bool IsAny(string? role, params string[] targets) =>
        targets.Any(t => Is(role, t));

    /// <summary>Returns the canonical casing for a known role; unknown roles are returned trimmed as-is.</summary>
    public static string? Canonical(string? role)
    {
        if (string.IsNullOrWhiteSpace(role)) return role;
        var r = role.Trim();
        if (Is(r, Admin)) return Admin;
        if (Is(r, GFHDelegate)) return GFHDelegate;
        if (Is(r, GFH)) return GFH;
        if (Is(r, IFH)) return IFH;
        return r;
    }
}
