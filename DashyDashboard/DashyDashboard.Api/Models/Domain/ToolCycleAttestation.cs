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

    public Cycle Cycle { get; set; } = null!;
    public User User { get; set; } = null!;
}
