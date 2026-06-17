using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace DashyDashboard.Api.Models.Domain;

[Table("ClientTools")]
public class ClientTool
{
    [Key]
    [Column("ToolID")]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int ToolID { get; set; }

    [Column(TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string? ClientID { get; set; }

    [Column("ToolName", TypeName = "varchar(255)")]
    [MaxLength(255)]
    public string? ToolName { get; set; }

    public bool ScreenshotRequired { get; set; }

    public int? DepartmentID { get; set; }

    [ForeignKey(nameof(DepartmentID))]
    public Department? Department { get; set; }

    [ForeignKey(nameof(ClientID))]
    public Client? Client { get; set; }

    public ICollection<UserToolAccess> UserAccess { get; set; } = new List<UserToolAccess>();
}
