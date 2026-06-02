using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace DashyDashboard.Api.Models.Domain;

[Table("Clients")]
public class Client
{
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int ID { get; set; }

    [Key]
    [Column(TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string ClientID { get; set; } = "";

    [MaxLength(255)]
    public string? ClientName { get; set; }

    [MaxLength(255)]
    public string? ClientDesc { get; set; }

    [MaxLength(100)]
    public string? CurrentState { get; set; }

    [Column(TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string? Tier { get; set; }

    public int? DepartmentID { get; set; }

    [ForeignKey(nameof(DepartmentID))]
    public Department? Department { get; set; }

    public bool IsActive { get; set; } = true;

    public ICollection<ClientTool> Tools { get; set; } = new List<ClientTool>();
}
