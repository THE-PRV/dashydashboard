using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace DashyDashboard.Api.Models.Domain;

[Table("UsersToolAccess")]
public class UserToolAccess
{
    [Column("AssociateID", TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string? AssociateId { get; set; }

    [Column(TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string? ClientID { get; set; }

    public int ToolID { get; set; }

    public bool Access { get; set; }

    public DateOnly GivenDate { get; set; }

    public DateOnly? ToDate { get; set; }

    public int? DepartmentID { get; set; }

    [ForeignKey(nameof(DepartmentID))]
    public Department? Department { get; set; }

    [ForeignKey(nameof(AssociateId))]
    public User? User { get; set; }

    [ForeignKey(nameof(ToolID))]
    public ClientTool? ClientTool { get; set; }
}
