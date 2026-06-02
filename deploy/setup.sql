-- =============================================================================
-- DashyDashboard  --  ClientsAppAttestation  --  Schema Setup (v456)
-- Run this script ONCE on the SQL Server after dropping existing tables.
-- Drop order matters (children before parents).
-- =============================================================================

-- ── Drop existing tables (children first) ────────────────────────────────────
DROP TABLE IF EXISTS dbo.ToolCycleAttestation;
DROP TABLE IF EXISTS dbo.AttestationLogs;
DROP TABLE IF EXISTS dbo.LoginLogs;
DROP TABLE IF EXISTS dbo.UsersToolAccess;
DROP TABLE IF EXISTS dbo.SuperUsers;
DROP TABLE IF EXISTS dbo.ClientTools;
DROP TABLE IF EXISTS dbo.Clients;
DROP TABLE IF EXISTS dbo.Cycles;
DROP TABLE IF EXISTS dbo.Users;
DROP TABLE IF EXISTS dbo.Departments;
GO

-- =============================================================================
-- 1. Departments
--    PK:  DepartmentID (int identity)
--    Master list of organisational areas referenced by Clients, ClientTools,
--    UsersToolAccess and SuperUsers.
-- =============================================================================
CREATE TABLE dbo.Departments (
    DepartmentID   INT          IDENTITY(1,1) NOT NULL,
    DepartmentName VARCHAR(150) NOT NULL,

    CONSTRAINT PK_Departments PRIMARY KEY (DepartmentID)
);
GO

-- =============================================================================
-- 2. Users
--    PK:  AssociateID (varchar, business key — preserves leading zeros)
--    UK:  ID (identity surrogate for internal joins)
--    FK:  ManagerID → Users.AssociateID (self-reference, nullable)
--    IsActive BIT — TRUE = active user
-- =============================================================================
CREATE TABLE dbo.Users (
    ID                INT           IDENTITY(1,1) NOT NULL,
    AssociateID       VARCHAR(50)   NOT NULL,
    FirstName         NVARCHAR(100) NULL,
    LastName          NVARCHAR(100) NULL,
    EMailAddr         VARCHAR(255)  NULL,
    PrimaryLocationId NVARCHAR(100) NULL,
    UserName          NVARCHAR(100) NULL,
    ManagerId         VARCHAR(50)   NULL,
    Department        NVARCHAR(150) NULL,
    IsActive          BIT           NOT NULL DEFAULT 1,

    CONSTRAINT PK_Users          PRIMARY KEY (AssociateID),
    CONSTRAINT UQ_Users_ID       UNIQUE      (ID),
    CONSTRAINT FK_Users_Manager  FOREIGN KEY (ManagerId) REFERENCES dbo.Users(AssociateID) ON DELETE NO ACTION
);
GO

-- =============================================================================
-- 3. Clients
--    PK:  ClientID (varchar — preserves leading zeros e.g. 0039, 0010)
--    UK:  ID (identity surrogate)
--    FK:  DepartmentID → Departments (nullable)
--    IsActive BIT — TRUE = active client
-- =============================================================================
CREATE TABLE dbo.Clients (
    ID           INT           IDENTITY(1,1) NOT NULL,
    ClientID     VARCHAR(50)   NOT NULL,
    ClientName   NVARCHAR(255) NULL,
    ClientDesc   NVARCHAR(255) NULL,
    CurrentState VARCHAR(100)  NULL,
    Tier         VARCHAR(50)   NULL,
    DepartmentID INT           NULL,
    IsActive     BIT           NOT NULL DEFAULT 1,

    CONSTRAINT PK_Clients         PRIMARY KEY (ClientID),
    CONSTRAINT UQ_Clients_ID      UNIQUE      (ID),
    CONSTRAINT FK_Clients_Dept    FOREIGN KEY (DepartmentID) REFERENCES dbo.Departments(DepartmentID) ON DELETE NO ACTION
);
GO

-- =============================================================================
-- 4. ClientTools
--    PK:  ToolID (int identity)
--    FK:  ClientID → Clients
--    FK:  DepartmentID → Departments (nullable)
--    UK:  (ClientID, ToolName) — a tool name is unique per client
-- =============================================================================
CREATE TABLE dbo.ClientTools (
    ToolID       INT          IDENTITY(1,1) NOT NULL,
    ClientID     VARCHAR(50)  NULL,
    ToolName     VARCHAR(255) NULL,
    DepartmentID INT          NULL,

    CONSTRAINT PK_ClientTools          PRIMARY KEY (ToolID),
    CONSTRAINT FK_ClientTools_Client   FOREIGN KEY (ClientID)     REFERENCES dbo.Clients(ClientID)         ON DELETE NO ACTION,
    CONSTRAINT FK_ClientTools_Dept     FOREIGN KEY (DepartmentID) REFERENCES dbo.Departments(DepartmentID) ON DELETE NO ACTION,
    CONSTRAINT UQ_ClientTools_Name     UNIQUE      (ClientID, ToolName)
);
GO

-- =============================================================================
-- 5. Cycles
--    PK:  CycleID (int identity)
--    One row per attestation period (typically one calendar month).
-- =============================================================================
CREATE TABLE dbo.Cycles (
    CycleID   INT           IDENTITY(1,1) NOT NULL,
    CycleName NVARCHAR(100) NOT NULL,
    StartDate DATE          NOT NULL,
    EndDate   DATE          NOT NULL,
    DueDate   DATE          NOT NULL,

    CONSTRAINT PK_Cycles PRIMARY KEY (CycleID)
);
GO

-- =============================================================================
-- 6. UsersToolAccess
--    PK:  Composite (AssociateID, ClientID, ToolID)
--    FK:  AssociateID → Users
--    FK:  ToolID → ClientTools  (integer — no fragile string match)
--    FK:  DepartmentID → Departments (nullable)
--    Access BIT  — TRUE = active grant
--    GivenDate / ToDate DATE — proper date types (not varchar)
--    ToDate NULL means access is still active (no end date set)
-- =============================================================================
CREATE TABLE dbo.UsersToolAccess (
    AssociateID  VARCHAR(50)  NOT NULL,
    ClientID     VARCHAR(50)  NOT NULL,
    ToolID       INT          NOT NULL,
    DepartmentID INT          NULL,
    Access       BIT          NOT NULL DEFAULT 1,
    GivenDate    DATE         NOT NULL,
    ToDate       DATE         NULL,

    CONSTRAINT PK_UsersToolAccess  PRIMARY KEY (AssociateID, ClientID, ToolID),
    CONSTRAINT FK_UTA_User         FOREIGN KEY (AssociateID)  REFERENCES dbo.Users(AssociateID)        ON DELETE NO ACTION,
    CONSTRAINT FK_UTA_Client       FOREIGN KEY (ClientID)     REFERENCES dbo.Clients(ClientID)         ON DELETE NO ACTION,
    CONSTRAINT FK_UTA_Tool         FOREIGN KEY (ToolID)       REFERENCES dbo.ClientTools(ToolID)       ON DELETE NO ACTION,
    CONSTRAINT FK_UTA_Dept         FOREIGN KEY (DepartmentID) REFERENCES dbo.Departments(DepartmentID) ON DELETE NO ACTION
);
GO

-- =============================================================================
-- 7. ToolCycleAttestation
--    PK:  Composite (CycleID, AssociateID, ClientID, ToolID)
--    FK:  CycleID → Cycles
--    FK:  AssociateID → Users
--    UsedThisCycle BIT NULL — NULL = not yet answered
--    HadAccess BIT — TRUE = the user had access to the tool during this cycle
--    AttestationStatus: Pending | InProgress | Submitted
-- =============================================================================
CREATE TABLE dbo.ToolCycleAttestation (
    CycleID           INT           NOT NULL,
    AssociateID       VARCHAR(50)   NOT NULL,
    ClientID          VARCHAR(50)   NOT NULL,
    ToolID            INT           NOT NULL,
    UsedThisCycle     BIT           NULL,
    HadAccess         BIT           NOT NULL DEFAULT 1,
    AttestationStatus NVARCHAR(50)  NOT NULL DEFAULT 'Pending',
    Remarks           NVARCHAR(500) NULL,
    SubmittedAt       DATETIME      NULL,

    CONSTRAINT PK_TCA PRIMARY KEY (CycleID, AssociateID, ClientID, ToolID),
    CONSTRAINT FK_TCA_Cycle FOREIGN KEY (CycleID)     REFERENCES dbo.Cycles(CycleID)    ON DELETE NO ACTION,
    CONSTRAINT FK_TCA_User  FOREIGN KEY (AssociateID) REFERENCES dbo.Users(AssociateID) ON DELETE NO ACTION
);
GO

-- =============================================================================
-- 8. SuperUsers
--    PK:  SuperUserID (int identity)
--    FK:  DepartmentID → Departments (nullable)
--    UK:  (AssociateID, RoleName, DepartmentID) — a person can hold multiple
--         roles across different departments but not the same role twice in
--         one dept
--    RoleName:   Admin | GFH | IFH
--    AccessLevel: Full | Dept | ReadOnly
--    IsActive BIT — TRUE = active super user
-- =============================================================================
CREATE TABLE dbo.SuperUsers (
    SuperUserID  INT          IDENTITY(1,1) NOT NULL,
    AssociateID  VARCHAR(50)  NOT NULL,
    RoleName     VARCHAR(50)  NOT NULL,        -- Admin | GFH | IFH
    DepartmentID INT          NULL,
    AccessLevel  VARCHAR(50)  NULL,            -- Full | Dept | ReadOnly
    IsActive     BIT          NOT NULL DEFAULT 1,
    CreatedOn    DATETIME     NOT NULL DEFAULT GETDATE(),
    CreatedBy    VARCHAR(50)  NULL,

    CONSTRAINT PK_SuperUsers      PRIMARY KEY (SuperUserID),
    CONSTRAINT FK_SuperUsers_Dept FOREIGN KEY (DepartmentID) REFERENCES dbo.Departments(DepartmentID) ON DELETE NO ACTION,
    CONSTRAINT UQ_SuperUsers_Role UNIQUE      (AssociateID, RoleName, DepartmentID)
);
GO

-- =============================================================================
-- 9. LoginLogs
--    PK:  LoginLogID (int identity)
--    AssociateID is NULLABLE — captures failed logins where no user matched
--    Status: 'Success' | 'UserNotFound'
-- =============================================================================
CREATE TABLE dbo.LoginLogs (
    LoginLogID  INT          IDENTITY(1,1) NOT NULL,
    AssociateID VARCHAR(50)  NULL,
    LoginTime   DATETIME     NOT NULL DEFAULT GETDATE(),
    Status      NVARCHAR(50) NOT NULL,

    CONSTRAINT PK_LoginLogs PRIMARY KEY (LoginLogID)
);
GO

-- =============================================================================
-- 10. AttestationLogs
--    PK:  LogID (int identity)
--    FK:  CycleID → Cycles
--    One row per Submit action — audit trail of who submitted what and when.
-- =============================================================================
CREATE TABLE dbo.AttestationLogs (
    LogID       INT           IDENTITY(1,1) NOT NULL,
    CycleID     INT           NOT NULL,
    AssociateID VARCHAR(50)   NOT NULL,
    SubmittedAt DATETIME      NOT NULL DEFAULT GETDATE(),
    ToolCount   INT           NOT NULL DEFAULT 0,
    Summary     NVARCHAR(100) NULL,

    CONSTRAINT PK_AttestationLogs PRIMARY KEY (LogID),
    CONSTRAINT FK_AttLogs_Cycle   FOREIGN KEY (CycleID) REFERENCES dbo.Cycles(CycleID) ON DELETE NO ACTION
);
GO

-- =============================================================================
-- Indexes for foreign keys and common query patterns
-- =============================================================================
CREATE INDEX IX_Users_Department        ON dbo.Users(Department);
CREATE INDEX IX_Users_ManagerId         ON dbo.Users(ManagerId);
CREATE INDEX IX_Clients_DepartmentID    ON dbo.Clients(DepartmentID);
CREATE INDEX IX_ClientTools_ClientID    ON dbo.ClientTools(ClientID);
CREATE INDEX IX_ClientTools_DepartmentID ON dbo.ClientTools(DepartmentID);
CREATE INDEX IX_UTA_AssociateID         ON dbo.UsersToolAccess(AssociateID);
CREATE INDEX IX_UTA_ClientID            ON dbo.UsersToolAccess(ClientID);
CREATE INDEX IX_UTA_ToolID              ON dbo.UsersToolAccess(ToolID);
CREATE INDEX IX_UTA_DepartmentID        ON dbo.UsersToolAccess(DepartmentID);
CREATE INDEX IX_TCA_AssociateID_CycleID ON dbo.ToolCycleAttestation(AssociateID, CycleID);
CREATE INDEX IX_SuperUsers_DepartmentID ON dbo.SuperUsers(DepartmentID);
CREATE INDEX IX_AttLogs_CycleID         ON dbo.AttestationLogs(CycleID);
GO

PRINT 'Schema created. All tables ready.';
GO
