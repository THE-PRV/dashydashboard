using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DashyDashboard.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddToolUserIdToUsersToolAccess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ToolUserId",
                table: "UsersToolAccess",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "HadAccess",
                table: "ToolCycleAttestation",
                type: "bit",
                nullable: false,
                oldClrType: typeof(bool),
                oldType: "bit",
                oldDefaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ToolUserId",
                table: "UsersToolAccess");

            migrationBuilder.AlterColumn<bool>(
                name: "HadAccess",
                table: "ToolCycleAttestation",
                type: "bit",
                nullable: false,
                defaultValue: true,
                oldClrType: typeof(bool),
                oldType: "bit");
        }
    }
}
