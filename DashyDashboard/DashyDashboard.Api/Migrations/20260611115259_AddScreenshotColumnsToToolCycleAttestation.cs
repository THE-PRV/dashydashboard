using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DashyDashboard.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddScreenshotColumnsToToolCycleAttestation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ScreenshotHash",
                table: "ToolCycleAttestation",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScreenshotPath",
                table: "ToolCycleAttestation",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScreenshotRejectReason",
                table: "ToolCycleAttestation",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ScreenshotReviewedAt",
                table: "ToolCycleAttestation",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScreenshotReviewedBy",
                table: "ToolCycleAttestation",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScreenshotStatus",
                table: "ToolCycleAttestation",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ScreenshotUploadedAt",
                table: "ToolCycleAttestation",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ScreenshotHash",
                table: "ToolCycleAttestation");

            migrationBuilder.DropColumn(
                name: "ScreenshotPath",
                table: "ToolCycleAttestation");

            migrationBuilder.DropColumn(
                name: "ScreenshotRejectReason",
                table: "ToolCycleAttestation");

            migrationBuilder.DropColumn(
                name: "ScreenshotReviewedAt",
                table: "ToolCycleAttestation");

            migrationBuilder.DropColumn(
                name: "ScreenshotReviewedBy",
                table: "ToolCycleAttestation");

            migrationBuilder.DropColumn(
                name: "ScreenshotStatus",
                table: "ToolCycleAttestation");

            migrationBuilder.DropColumn(
                name: "ScreenshotUploadedAt",
                table: "ToolCycleAttestation");
        }
    }
}
