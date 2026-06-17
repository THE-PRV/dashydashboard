using DashyDashboard.Api.Models.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace DashyDashboard.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Client> Clients => Set<Client>();
    public DbSet<ClientTool> ClientTools => Set<ClientTool>();
    public DbSet<UserToolAccess> UserToolAccess => Set<UserToolAccess>();
    public DbSet<Cycle> Cycles => Set<Cycle>();
    public DbSet<ToolCycleAttestation> ToolCycleAttestations => Set<ToolCycleAttestation>();
    public DbSet<AttestationLog> AttestationLogs => Set<AttestationLog>();
    public DbSet<LoginLog> LoginLogs => Set<LoginLog>();
    public DbSet<SuperUser> SuperUsers => Set<SuperUser>();
    public DbSet<Department> Departments => Set<Department>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        var dateOnlyConverter = new ValueConverter<DateOnly, DateTime>(
            d => d.ToDateTime(TimeOnly.MinValue),
            d => DateOnly.FromDateTime(d));

        var nullableDateOnlyConverter = new ValueConverter<DateOnly?, DateTime?>(
            d => d.HasValue ? d.Value.ToDateTime(TimeOnly.MinValue) : null,
            d => d.HasValue ? DateOnly.FromDateTime(d.Value) : null);

        // ── Users ────────────────────────────────────────────────────────────
        mb.Entity<User>(e =>
        {
            e.ToTable("Users");
            e.HasKey(u => u.AssociateId);
            e.Property(u => u.AssociateId).HasColumnType("varchar(50)");
            e.Property(u => u.ID).ValueGeneratedOnAdd();
            e.HasIndex(u => u.ID).IsUnique();
            e.Property(u => u.ManagerId).HasColumnType("varchar(50)");
            e.Property(u => u.Department).HasMaxLength(150);
            e.Property(u => u.IsActive).HasDefaultValue(true);
        });

        // ── Clients ──────────────────────────────────────────────────────────
        mb.Entity<Client>(e =>
        {
            e.ToTable("Clients");
            e.HasKey(c => c.ClientID);
            e.Property(c => c.ClientID).HasColumnType("varchar(50)");
            e.Property(c => c.ID).ValueGeneratedOnAdd();
            e.HasIndex(c => c.ID).IsUnique();
            e.Property(c => c.IsActive).HasDefaultValue(true);
        });

        // ── ClientTools ──────────────────────────────────────────────────────
        mb.Entity<ClientTool>(e =>
        {
            e.ToTable("ClientTools");
            e.HasKey(ct => ct.ToolID);
            e.Property(ct => ct.ToolID)
                .HasColumnName("ToolID")
                .ValueGeneratedOnAdd();
            e.Property(ct => ct.ClientID).HasColumnType("varchar(50)");
            e.Property(ct => ct.ToolName)
                .HasColumnName("ToolName")
                .HasColumnType("varchar(255)");
            e.Property(ct => ct.ScreenshotRequired).HasDefaultValue(false);
            e.HasOne(ct => ct.Client)
                .WithMany(c => c.Tools)
                .HasForeignKey(ct => ct.ClientID)
                .IsRequired(false);
            e.HasOne(ct => ct.Department).WithMany().HasForeignKey(ct => ct.DepartmentID).IsRequired(false);
        });

        // ── UsersToolAccess ──────────────────────────────────────────────────
        mb.Entity<UserToolAccess>(e =>
        {
            e.ToTable("UsersToolAccess");
            e.HasKey(u => new { u.AssociateId, u.ClientID, u.ToolID });
            e.Property(uta => uta.AssociateId)
                .HasColumnName("AssociateID")
                .HasColumnType("varchar(50)");
            e.Property(uta => uta.ClientID).HasColumnType("varchar(50)");
            e.Property(uta => uta.Access).HasColumnType("bit");
            e.Property(uta => uta.GivenDate).HasConversion(dateOnlyConverter).HasColumnType("date").HasColumnName("GivenDate");
            e.Property(uta => uta.ToDate).HasConversion(nullableDateOnlyConverter).HasColumnType("date");
            e.Property(uta => uta.ToolUserId).HasColumnType("nvarchar(100)");
            e.HasOne(uta => uta.User)
                .WithMany(u => u.ToolAccess)
                .HasForeignKey(uta => uta.AssociateId)
                .IsRequired(false);
            e.HasOne(uta => uta.ClientTool)
                .WithMany(ct => ct.UserAccess)
                .HasForeignKey(uta => uta.ToolID);
            e.HasOne(u => u.Department).WithMany().HasForeignKey(u => u.DepartmentID).IsRequired(false);
        });

        // ── Cycles ───────────────────────────────────────────────────────────
        mb.Entity<Cycle>(e =>
        {
            e.ToTable("Cycles");
            e.HasKey(c => c.CycleID);
            e.Property(c => c.CycleID).ValueGeneratedOnAdd();
            e.Property(c => c.CycleName).HasMaxLength(100).IsRequired();
            e.Property(c => c.StartDate).HasConversion(dateOnlyConverter).HasColumnType("date");
            e.Property(c => c.EndDate).HasConversion(dateOnlyConverter).HasColumnType("date");
            e.Property(c => c.DueDate).HasConversion(dateOnlyConverter).HasColumnType("date");
        });

        // ── ToolCycleAttestation ─────────────────────────────────────────────
        mb.Entity<ToolCycleAttestation>(e =>
        {
            e.ToTable("ToolCycleAttestation");
            e.HasKey(tca => new { tca.CycleID, tca.AssociateId, tca.ClientID, tca.ToolID });
            e.Property(tca => tca.AssociateId)
                .HasColumnName("AssociateID")
                .HasColumnType("varchar(50)");
            e.Property(tca => tca.ClientID).HasColumnType("varchar(50)");
            e.Property(tca => tca.AttestationStatus)
                .HasMaxLength(50)
                .HasDefaultValue("Pending");
            e.Property(tca => tca.Remarks).HasMaxLength(500);
            // HadAccess: intentionally NO store default. HasDefaultValue(true) on a non-nullable
            // bool makes EF drop an explicit "false" on INSERT (warning 20601), silently losing a
            // first-touch "no access" declaration. The domain initializer (= true) keeps new rows true.
            e.HasOne(tca => tca.Cycle)
                .WithMany(c => c.Attestations)
                .HasForeignKey(tca => tca.CycleID);
            e.HasOne(tca => tca.User)
                .WithMany()
                .HasForeignKey(tca => tca.AssociateId)
                .IsRequired(false);
        });

        // ── AttestationLogs ──────────────────────────────────────────────────
        mb.Entity<AttestationLog>(e =>
        {
            e.ToTable("AttestationLogs");
            e.HasKey(a => a.LogID);
            e.Property(a => a.LogID).ValueGeneratedOnAdd();
            e.Property(a => a.AssociateId)
                .HasColumnName("AssociateID")
                .HasColumnType("varchar(50)");
            e.Property(a => a.Summary).HasMaxLength(100);
            e.HasOne(a => a.Cycle)
                .WithMany()
                .HasForeignKey(a => a.CycleID);
        });

        // ── LoginLogs ────────────────────────────────────────────────────────
        mb.Entity<LoginLog>(e =>
        {
            e.ToTable("LoginLogs");
            e.HasKey(l => l.LoginLogID);
            e.Property(l => l.LoginLogID).ValueGeneratedOnAdd();
            e.Property(l => l.AssociateId)
                .HasColumnName("AssociateID")
                .HasColumnType("varchar(50)");
            e.Property(l => l.Status).HasMaxLength(50).IsRequired();
        });

        // ── SuperUsers ───────────────────────────────────────────────────────
        mb.Entity<SuperUser>(e =>
        {
            e.ToTable("SuperUsers");
            e.HasKey(s => s.SuperUserID);
            e.Property(s => s.SuperUserID).ValueGeneratedOnAdd();
            e.Property(s => s.AssociateId)
                .HasColumnName("AssociateID")
                .HasColumnType("varchar(50)");
            e.Property(s => s.RoleName).HasColumnType("varchar(50)");
            e.HasOne(s => s.Department).WithMany(d => d.SuperUsers).HasForeignKey(s => s.DepartmentID).IsRequired(false);
            e.Property(s => s.AccessLevel).HasColumnType("varchar(50)");
            e.Property(s => s.IsActive).HasDefaultValue(true);
            e.Property(s => s.CreatedBy).HasColumnType("varchar(50)");
            e.HasIndex(s => new { s.AssociateId, s.RoleName, s.DepartmentID }).IsUnique();
        });

        // ── Departments ──────────────────────────────────────────────────────
        mb.Entity<Department>(e =>
        {
            e.ToTable("Departments");
            e.HasKey(d => d.DepartmentID);
            e.Property(d => d.DepartmentName).HasColumnType("varchar(150)").IsRequired();
        });
    }
}
