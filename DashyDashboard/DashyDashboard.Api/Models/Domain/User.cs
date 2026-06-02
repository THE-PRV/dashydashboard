using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace DashyDashboard.Api.Models.Domain;

[Table("Users")]
public class User
{
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int ID { get; set; }

    [Key]
    [Column("AssociateID", TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string AssociateId { get; set; } = "";

    [MaxLength(100)]
    public string? FirstName { get; set; }

    [MaxLength(100)]
    public string? LastName { get; set; }

    [Column("EMailAddr")]
    [MaxLength(255)]
    public string? EmailAddr { get; set; }

    [MaxLength(100)]
    public string? PrimaryLocationId { get; set; }

    [MaxLength(100)]
    public string? UserName { get; set; }

    [Column(TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string? ManagerId { get; set; }

    [MaxLength(150)]
    public string? Department { get; set; }

    public bool IsActive { get; set; } = true;

    [ForeignKey(nameof(ManagerId))]
    public User? Manager { get; set; }

    [InverseProperty(nameof(Manager))]
    public ICollection<User> DirectReports { get; set; } = new List<User>();

    public ICollection<UserToolAccess> ToolAccess { get; set; } = new List<UserToolAccess>();

    [NotMapped]
    public string FullName => $"{FirstName} {LastName}".Trim();
}
