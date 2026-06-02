using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace DashyDashboard.Api.Models.Domain;

[Table("AttestationLogs")]
public class AttestationLog
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int LogID { get; set; }

    public int CycleID { get; set; }

    [Column("AssociateID", TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string AssociateId { get; set; } = "";

    public DateTime SubmittedAt { get; set; }

    public int ToolCount { get; set; }

    [MaxLength(100)]
    public string? Summary { get; set; }

    public Cycle Cycle { get; set; } = null!;
}
