using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace DashyDashboard.Api.Models.Domain;

[Table("SuperUsers")]
public class SuperUser
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int SuperUserID { get; set; }

    [Column("AssociateID", TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string AssociateId { get; set; } = "";

    [Column(TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string RoleName { get; set; } = "";

    public int? DepartmentID { get; set; }

    [ForeignKey(nameof(DepartmentID))]
    public Department? Department { get; set; }

    [Column(TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string? AccessLevel { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedOn { get; set; } = DateTime.UtcNow;

    [Column(TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string? CreatedBy { get; set; }
}
