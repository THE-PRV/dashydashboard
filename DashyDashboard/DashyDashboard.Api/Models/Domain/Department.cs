using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
namespace DashyDashboard.Api.Models.Domain;
public class Department
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int DepartmentID { get; set; }
    [Required]
    [Column(TypeName = "varchar(150)")]
    [MaxLength(150)]
    public string DepartmentName { get; set; } = string.Empty;
    public ICollection<Client> Clients { get; set; } = new List<Client>();
    public ICollection<SuperUser> SuperUsers { get; set; } = new List<SuperUser>();
}
