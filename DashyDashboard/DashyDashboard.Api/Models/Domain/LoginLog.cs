using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace DashyDashboard.Api.Models.Domain;

[Table("LoginLogs")]
public class LoginLog
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int LoginLogID { get; set; }

    [Column("AssociateID", TypeName = "varchar(50)")]
    [MaxLength(50)]
    public string? AssociateId { get; set; }

    public DateTime LoginTime { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string Status { get; set; } = "";
}
