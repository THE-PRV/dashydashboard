using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DashyDashboard.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Clients",
                columns: table => new
                {
                    ClientID = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ClientName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    ClientDesc = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    CurrentState = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Tier = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Clients", x => x.ClientID);
                });

            migrationBuilder.CreateTable(
                name: "Cycles",
                columns: table => new
                {
                    CycleID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CycleName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    StartDate = table.Column<DateTime>(type: "date", nullable: false),
                    EndDate = table.Column<DateTime>(type: "date", nullable: false),
                    DueDate = table.Column<DateTime>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Cycles", x => x.CycleID);
                });

            migrationBuilder.CreateTable(
                name: "IFHGFHMapping",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Area = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    IFH = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    GFH = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IFHGFHMapping", x => x.ID);
                });

            migrationBuilder.CreateTable(
                name: "LoginLogs",
                columns: table => new
                {
                    LoginLogID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AssociateID = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    LoginTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LoginLogs", x => x.LoginLogID);
                });

            migrationBuilder.CreateTable(
                name: "SuperUsers",
                columns: table => new
                {
                    SuperUserID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AssociateID = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    RoleName = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    Department = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    AccessLevel = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    IsActive = table.Column<string>(type: "varchar(10)", maxLength: 10, nullable: false, defaultValue: "TRUE"),
                    CreatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SuperUsers", x => x.SuperUserID);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    AssociateID = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FirstName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    LastName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    EMailAddr = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    PrimaryLocationId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    UserName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    ManagerId = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    Department = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.AssociateID);
                    table.ForeignKey(
                        name: "FK_Users_Users_ManagerId",
                        column: x => x.ManagerId,
                        principalTable: "Users",
                        principalColumn: "AssociateID");
                });

            migrationBuilder.CreateTable(
                name: "ClientTools",
                columns: table => new
                {
                    UserID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ClientID = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    ApplicationName = table.Column<string>(name: "Application Name", type: "varchar(255)", maxLength: 255, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClientTools", x => x.UserID);
                    table.UniqueConstraint("AK_ClientTools_ClientID_Application Name", x => new { x.ClientID, x.ApplicationName });
                    table.ForeignKey(
                        name: "FK_ClientTools_Clients_ClientID",
                        column: x => x.ClientID,
                        principalTable: "Clients",
                        principalColumn: "ClientID");
                });

            migrationBuilder.CreateTable(
                name: "AttestationLogs",
                columns: table => new
                {
                    LogID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CycleID = table.Column<int>(type: "int", nullable: false),
                    AssociateID = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ToolCount = table.Column<int>(type: "int", nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AttestationLogs", x => x.LogID);
                    table.ForeignKey(
                        name: "FK_AttestationLogs_Cycles_CycleID",
                        column: x => x.CycleID,
                        principalTable: "Cycles",
                        principalColumn: "CycleID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ToolCycleAttestation",
                columns: table => new
                {
                    CycleID = table.Column<int>(type: "int", nullable: false),
                    AssociateID = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    ClientID = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    ToolID = table.Column<int>(type: "int", nullable: false),
                    UsedThisCycle = table.Column<bool>(type: "bit", nullable: true),
                    AttestationStatus = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false, defaultValue: "Pending"),
                    Remarks = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    SubmittedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ToolCycleAttestation", x => new { x.CycleID, x.AssociateID, x.ClientID, x.ToolID });
                    table.ForeignKey(
                        name: "FK_ToolCycleAttestation_Cycles_CycleID",
                        column: x => x.CycleID,
                        principalTable: "Cycles",
                        principalColumn: "CycleID",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ToolCycleAttestation_Users_AssociateID",
                        column: x => x.AssociateID,
                        principalTable: "Users",
                        principalColumn: "AssociateID");
                });

            migrationBuilder.CreateTable(
                name: "UsersToolAccess",
                columns: table => new
                {
                    UserID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AssociateID = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    ClientID = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    ApplicationName = table.Column<string>(name: "Application Name", type: "varchar(255)", maxLength: 255, nullable: true),
                    Access = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    FromDate = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    ToDate = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    ClientToolToolID = table.Column<int>(type: "int", nullable: true),
                    UserAssociateId = table.Column<string>(type: "varchar(50)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UsersToolAccess", x => x.UserID);
                    table.ForeignKey(
                        name: "FK_UsersToolAccess_ClientTools_ClientID_Application Name",
                        columns: x => new { x.ClientID, x.ApplicationName },
                        principalTable: "ClientTools",
                        principalColumns: new[] { "ClientID", "Application Name" });
                    table.ForeignKey(
                        name: "FK_UsersToolAccess_ClientTools_ClientToolToolID",
                        column: x => x.ClientToolToolID,
                        principalTable: "ClientTools",
                        principalColumn: "UserID");
                    table.ForeignKey(
                        name: "FK_UsersToolAccess_Users_AssociateID",
                        column: x => x.AssociateID,
                        principalTable: "Users",
                        principalColumn: "AssociateID");
                    table.ForeignKey(
                        name: "FK_UsersToolAccess_Users_UserAssociateId",
                        column: x => x.UserAssociateId,
                        principalTable: "Users",
                        principalColumn: "AssociateID");
                });

            migrationBuilder.CreateIndex(
                name: "IX_AttestationLogs_CycleID",
                table: "AttestationLogs",
                column: "CycleID");

            migrationBuilder.CreateIndex(
                name: "IX_Clients_ID",
                table: "Clients",
                column: "ID",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SuperUsers_AssociateID_RoleName_Department",
                table: "SuperUsers",
                columns: new[] { "AssociateID", "RoleName", "Department" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ToolCycleAttestation_AssociateID",
                table: "ToolCycleAttestation",
                column: "AssociateID");

            migrationBuilder.CreateIndex(
                name: "IX_Users_ID",
                table: "Users",
                column: "ID",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_ManagerId",
                table: "Users",
                column: "ManagerId");

            migrationBuilder.CreateIndex(
                name: "IX_UsersToolAccess_AssociateID",
                table: "UsersToolAccess",
                column: "AssociateID");

            migrationBuilder.CreateIndex(
                name: "IX_UsersToolAccess_ClientID_Application Name",
                table: "UsersToolAccess",
                columns: new[] { "ClientID", "Application Name" });

            migrationBuilder.CreateIndex(
                name: "IX_UsersToolAccess_ClientToolToolID",
                table: "UsersToolAccess",
                column: "ClientToolToolID");

            migrationBuilder.CreateIndex(
                name: "IX_UsersToolAccess_UserAssociateId",
                table: "UsersToolAccess",
                column: "UserAssociateId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AttestationLogs");

            migrationBuilder.DropTable(
                name: "IFHGFHMapping");

            migrationBuilder.DropTable(
                name: "LoginLogs");

            migrationBuilder.DropTable(
                name: "SuperUsers");

            migrationBuilder.DropTable(
                name: "ToolCycleAttestation");

            migrationBuilder.DropTable(
                name: "UsersToolAccess");

            migrationBuilder.DropTable(
                name: "Cycles");

            migrationBuilder.DropTable(
                name: "ClientTools");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "Clients");
        }
    }
}
