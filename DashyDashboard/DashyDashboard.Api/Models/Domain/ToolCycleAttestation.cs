using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace DashyDashboard.Api.Models.Domain;

[Table("ToolCycleAttestation")]
public class ToolCycleAttestation
{
    public int CycleID { get; set; }

    [Column("AssociateID", TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string AssociateId { get; set; } = "";

    [Column(TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string ClientID { get; set; } = "";

    public int ToolID { get; set; }

    public bool? UsedThisCycle { get; set; }

    public bool HadAccess { get; set; } = true;

    [MaxLength(50)]
    public string AttestationStatus { get; set; } = "Pending";

    [MaxLength(500)]
    public string? Remarks { get; set; }

    public DateTime? SubmittedAt { get; set; }

    // ── Screenshot evidence (Feature 2) ──────────────────────────────────────
    // All nullable: an attestation may have no screenshot. No-access rows are exempt.

    /// <summary>Path RELATIVE to the configured Screenshots root (never an absolute path).</summary>
    [MaxLength(500)]
    public string? ScreenshotPath { get; set; }

    /// <summary>SHA-256 (hex) of the stored screenshot bytes. Used as an ETag for caching.</summary>
    [MaxLength(64)]
    public string? ScreenshotHash { get; set; }

    public DateTime? ScreenshotUploadedAt { get; set; }

    /// <summary>NULL (none) / Pending / Approved / Rejected.</summary>
    [MaxLength(20)]
    public string? ScreenshotStatus { get; set; }

    /// <summary>AssociateId of the reviewer (varchar(50) — AssociateIds can be alphanumeric, e.g. PRV001).</summary>
    [Column(TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string? ScreenshotReviewedBy { get; set; }

    public DateTime? ScreenshotReviewedAt { get; set; }

    [MaxLength(500)]
    public string? ScreenshotRejectReason { get; set; }

    public Cycle Cycle { get; set; } = null!;
    public User User { get; set; } = null!;
}
