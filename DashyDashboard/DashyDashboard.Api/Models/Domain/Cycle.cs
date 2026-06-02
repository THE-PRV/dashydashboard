using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace DashyDashboard.Api.Models.Domain;

[Table("Cycles")]
public class Cycle
{
    [Key]
    public int CycleID { get; set; }

    [MaxLength(100)]
    public string CycleName { get; set; } = "";

    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public DateOnly DueDate { get; set; }

    public ICollection<ToolCycleAttestation> Attestations { get; set; } = new List<ToolCycleAttestation>();
}
