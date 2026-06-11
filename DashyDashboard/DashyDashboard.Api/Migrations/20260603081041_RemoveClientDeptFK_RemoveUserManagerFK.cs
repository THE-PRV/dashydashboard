using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DashyDashboard.Api.Migrations
{
    /// <inheritdoc />
    public partial class RemoveClientDeptFK_RemoveUserManagerFK : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Users_Users_ManagerId",
                table: "Users");

            migrationBuilder.DropForeignKey(
                name: "FK_UsersToolAccess_ClientTools_ClientID_Application Name",
                table: "UsersToolAccess");

            migrationBuilder.DropForeignKey(
                name: "FK_UsersToolAccess_ClientTools_ClientToolToolID",
                table: "UsersToolAccess");

            migrationBuilder.DropForeignKey(
                name: "FK_UsersToolAccess_Users_UserAssociateId",
                table: "UsersToolAccess");

            migrationBuilder.DropTable(
                name: "IFHGFHMapping");

            migrationBuilder.DropPrimaryKey(
                name: "PK_UsersToolAccess",
                table: "UsersToolAccess");

            migrationBuilder.DropIndex(
                name: "IX_UsersToolAccess_AssociateID",
                table: "UsersToolAccess");

            migrationBuilder.DropIndex(
                name: "IX_UsersToolAccess_ClientID_Application Name",
                table: "UsersToolAccess");

            migrationBuilder.DropIndex(
                name: "IX_UsersToolAccess_UserAssociateId",
                table: "UsersToolAccess");

            migrationBuilder.DropIndex(
                name: "IX_Users_ManagerId",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_SuperUsers_AssociateID_RoleName_Department",
                table: "SuperUsers");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_ClientTools_ClientID_Application Name",
                table: "ClientTools");

            migrationBuilder.DropColumn(
                name: "Application Name",
                table: "UsersToolAccess");

            migrationBuilder.DropColumn(
                name: "FromDate",
                table: "UsersToolAccess");

            migrationBuilder.DropColumn(
                name: "UserAssociateId",
                table: "UsersToolAccess");

            migrationBuilder.DropColumn(
                name: "Department",
                table: "SuperUsers");

            migrationBuilder.RenameColumn(
                name: "ClientToolToolID",
                table: "UsersToolAccess",
                newName: "DepartmentID");

            migrationBuilder.RenameColumn(
                name: "UserID",
                table: "UsersToolAccess",
                newName: "ToolID");

            migrationBuilder.RenameIndex(
                name: "IX_UsersToolAccess_ClientToolToolID",
                table: "UsersToolAccess",
                newName: "IX_UsersToolAccess_DepartmentID");

            migrationBuilder.RenameColumn(
                name: "Application Name",
                table: "ClientTools",
                newName: "ToolName");

            migrationBuilder.RenameColumn(
                name: "UserID",
                table: "ClientTools",
                newName: "ToolID");

            migrationBuilder.AlterColumn<DateTime>(
                name: "ToDate",
                table: "UsersToolAccess",
                type: "date",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "varchar(50)",
                oldMaxLength: 50,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ClientID",
                table: "UsersToolAccess",
                type: "varchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "varchar(50)",
                oldMaxLength: 50,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "AssociateID",
                table: "UsersToolAccess",
                type: "varchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "varchar(50)",
                oldMaxLength: 50,
                oldNullable: true);

            migrationBuilder.AlterColumn<bool>(
                name: "Access",
                table: "UsersToolAccess",
                type: "bit",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(string),
                oldType: "varchar(50)",
                oldMaxLength: 50,
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "ToolID",
                table: "UsersToolAccess",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int")
                .OldAnnotation("SqlServer:Identity", "1, 1");

            migrationBuilder.AddColumn<DateTime>(
                name: "GivenDate",
                table: "UsersToolAccess",
                type: "date",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Users",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "HadAccess",
                table: "ToolCycleAttestation",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AlterColumn<bool>(
                name: "IsActive",
                table: "SuperUsers",
                type: "bit",
                nullable: false,
                defaultValue: true,
                oldClrType: typeof(string),
                oldType: "varchar(10)",
                oldMaxLength: 10,
                oldDefaultValue: "TRUE");

            migrationBuilder.AddColumn<int>(
                name: "DepartmentID",
                table: "SuperUsers",
                type: "int",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ClientID",
                table: "ClientTools",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "varchar(50)",
                oldMaxLength: 50);

            migrationBuilder.AlterColumn<string>(
                name: "ToolName",
                table: "ClientTools",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "varchar(255)",
                oldMaxLength: 255);

            migrationBuilder.AddColumn<int>(
                name: "DepartmentID",
                table: "ClientTools",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Clients",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddPrimaryKey(
                name: "PK_UsersToolAccess",
                table: "UsersToolAccess",
                columns: new[] { "AssociateID", "ClientID", "ToolID" });

            migrationBuilder.CreateTable(
                name: "Departments",
                columns: table => new
                {
                    DepartmentID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    DepartmentName = table.Column<string>(type: "varchar(150)", maxLength: 150, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Departments", x => x.DepartmentID);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UsersToolAccess_ToolID",
                table: "UsersToolAccess",
                column: "ToolID");

            migrationBuilder.CreateIndex(
                name: "IX_SuperUsers_AssociateID_RoleName_DepartmentID",
                table: "SuperUsers",
                columns: new[] { "AssociateID", "RoleName", "DepartmentID" },
                unique: true,
                filter: "[DepartmentID] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SuperUsers_DepartmentID",
                table: "SuperUsers",
                column: "DepartmentID");

            migrationBuilder.CreateIndex(
                name: "IX_ClientTools_ClientID",
                table: "ClientTools",
                column: "ClientID");

            migrationBuilder.CreateIndex(
                name: "IX_ClientTools_DepartmentID",
                table: "ClientTools",
                column: "DepartmentID");

            migrationBuilder.AddForeignKey(
                name: "FK_ClientTools_Departments_DepartmentID",
                table: "ClientTools",
                column: "DepartmentID",
                principalTable: "Departments",
                principalColumn: "DepartmentID");

            migrationBuilder.AddForeignKey(
                name: "FK_SuperUsers_Departments_DepartmentID",
                table: "SuperUsers",
                column: "DepartmentID",
                principalTable: "Departments",
                principalColumn: "DepartmentID");

            migrationBuilder.AddForeignKey(
                name: "FK_UsersToolAccess_ClientTools_ToolID",
                table: "UsersToolAccess",
                column: "ToolID",
                principalTable: "ClientTools",
                principalColumn: "ToolID",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_UsersToolAccess_Departments_DepartmentID",
                table: "UsersToolAccess",
                column: "DepartmentID",
                principalTable: "Departments",
                principalColumn: "DepartmentID");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ClientTools_Departments_DepartmentID",
                table: "ClientTools");

            migrationBuilder.DropForeignKey(
                name: "FK_SuperUsers_Departments_DepartmentID",
                table: "SuperUsers");

            migrationBuilder.DropForeignKey(
                name: "FK_UsersToolAccess_ClientTools_ToolID",
                table: "UsersToolAccess");

            migrationBuilder.DropForeignKey(
                name: "FK_UsersToolAccess_Departments_DepartmentID",
                table: "UsersToolAccess");

            migrationBuilder.DropTable(
                name: "Departments");

            migrationBuilder.DropPrimaryKey(
                name: "PK_UsersToolAccess",
                table: "UsersToolAccess");

            migrationBuilder.DropIndex(
                name: "IX_UsersToolAccess_ToolID",
                table: "UsersToolAccess");

            migrationBuilder.DropIndex(
                name: "IX_SuperUsers_AssociateID_RoleName_DepartmentID",
                table: "SuperUsers");

            migrationBuilder.DropIndex(
                name: "IX_SuperUsers_DepartmentID",
                table: "SuperUsers");

            migrationBuilder.DropIndex(
                name: "IX_ClientTools_ClientID",
                table: "ClientTools");

            migrationBuilder.DropIndex(
                name: "IX_ClientTools_DepartmentID",
                table: "ClientTools");

            migrationBuilder.DropColumn(
                name: "GivenDate",
                table: "UsersToolAccess");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "HadAccess",
                table: "ToolCycleAttestation");

            migrationBuilder.DropColumn(
                name: "DepartmentID",
                table: "SuperUsers");

            migrationBuilder.DropColumn(
                name: "DepartmentID",
                table: "ClientTools");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Clients");

            migrationBuilder.RenameColumn(
                name: "DepartmentID",
                table: "UsersToolAccess",
                newName: "ClientToolToolID");

            migrationBuilder.RenameColumn(
                name: "ToolID",
                table: "UsersToolAccess",
                newName: "UserID");

            migrationBuilder.RenameIndex(
                name: "IX_UsersToolAccess_DepartmentID",
                table: "UsersToolAccess",
                newName: "IX_UsersToolAccess_ClientToolToolID");

            migrationBuilder.RenameColumn(
                name: "ToolName",
                table: "ClientTools",
                newName: "Application Name");

            migrationBuilder.RenameColumn(
                name: "ToolID",
                table: "ClientTools",
                newName: "UserID");

            migrationBuilder.AlterColumn<string>(
                name: "ToDate",
                table: "UsersToolAccess",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "date",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Access",
                table: "UsersToolAccess",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true,
                oldClrType: typeof(bool),
                oldType: "bit");

            migrationBuilder.AlterColumn<string>(
                name: "ClientID",
                table: "UsersToolAccess",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "varchar(50)",
                oldMaxLength: 50);

            migrationBuilder.AlterColumn<string>(
                name: "AssociateID",
                table: "UsersToolAccess",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "varchar(50)",
                oldMaxLength: 50);

            migrationBuilder.AlterColumn<int>(
                name: "UserID",
                table: "UsersToolAccess",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int")
                .Annotation("SqlServer:Identity", "1, 1");

            migrationBuilder.AddColumn<string>(
                name: "Application Name",
                table: "UsersToolAccess",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FromDate",
                table: "UsersToolAccess",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UserAssociateId",
                table: "UsersToolAccess",
                type: "varchar(50)",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "IsActive",
                table: "SuperUsers",
                type: "varchar(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "TRUE",
                oldClrType: typeof(bool),
                oldType: "bit",
                oldDefaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "Department",
                table: "SuperUsers",
                type: "nvarchar(150)",
                maxLength: 150,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AlterColumn<string>(
                name: "ClientID",
                table: "ClientTools",
                type: "varchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "varchar(50)",
                oldMaxLength: 50,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Application Name",
                table: "ClientTools",
                type: "varchar(255)",
                maxLength: 255,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "varchar(255)",
                oldMaxLength: 255,
                oldNullable: true);

            migrationBuilder.AddPrimaryKey(
                name: "PK_UsersToolAccess",
                table: "UsersToolAccess",
                column: "UserID");

            migrationBuilder.AddUniqueConstraint(
                name: "AK_ClientTools_ClientID_Application Name",
                table: "ClientTools",
                columns: new[] { "ClientID", "Application Name" });

            migrationBuilder.CreateTable(
                name: "IFHGFHMapping",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Area = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    GFH = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    IFH = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IFHGFHMapping", x => x.ID);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UsersToolAccess_AssociateID",
                table: "UsersToolAccess",
                column: "AssociateID");

            migrationBuilder.CreateIndex(
                name: "IX_UsersToolAccess_ClientID_Application Name",
                table: "UsersToolAccess",
                columns: new[] { "ClientID", "Application Name" });

            migrationBuilder.CreateIndex(
                name: "IX_UsersToolAccess_UserAssociateId",
                table: "UsersToolAccess",
                column: "UserAssociateId");

            migrationBuilder.CreateIndex(
                name: "IX_Users_ManagerId",
                table: "Users",
                column: "ManagerId");

            migrationBuilder.CreateIndex(
                name: "IX_SuperUsers_AssociateID_RoleName_Department",
                table: "SuperUsers",
                columns: new[] { "AssociateID", "RoleName", "Department" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Users_Users_ManagerId",
                table: "Users",
                column: "ManagerId",
                principalTable: "Users",
                principalColumn: "AssociateID");

            migrationBuilder.AddForeignKey(
                name: "FK_UsersToolAccess_ClientTools_ClientID_Application Name",
                table: "UsersToolAccess",
                columns: new[] { "ClientID", "Application Name" },
                principalTable: "ClientTools",
                principalColumns: new[] { "ClientID", "Application Name" });

            migrationBuilder.AddForeignKey(
                name: "FK_UsersToolAccess_ClientTools_ClientToolToolID",
                table: "UsersToolAccess",
                column: "ClientToolToolID",
                principalTable: "ClientTools",
                principalColumn: "UserID");

            migrationBuilder.AddForeignKey(
                name: "FK_UsersToolAccess_Users_UserAssociateId",
                table: "UsersToolAccess",
                column: "UserAssociateId",
                principalTable: "Users",
                principalColumn: "AssociateID");
        }
    }
}
