using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DashyDashboard.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddScreenshotRequiredToClientTools : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "ScreenshotRequired",
                table: "ClientTools",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ScreenshotRequired",
                table: "ClientTools");
        }
    }
}
