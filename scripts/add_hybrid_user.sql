-- Idempotent: adds Morgan Drake (hybrid manager+analyst) and Quinn Adams (Morgan's report).
-- Morgan reports to Diana Prince, owns tools of their own, and manages Quinn.
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM Users WHERE UserName = 'Morgan Drake')
BEGIN
    DECLARE @DianaId INT = (SELECT UserID FROM Users WHERE UserName = 'Diana Prince');

    INSERT INTO Users (UserName, ManagerID, WindowsID)
    VALUES ('Morgan Drake', @DianaId, 'DOMAIN\mdrake');
    DECLARE @MorganId INT = SCOPE_IDENTITY();

    INSERT INTO Users (UserName, ManagerID, WindowsID)
    VALUES ('Quinn Adams', @MorganId, 'DOMAIN\qadams');
    DECLARE @QuinnId INT = SCOPE_IDENTITY();

    -- Morgan's own tool access (so the Agent view has rows for them).
    INSERT INTO UserToolAccess (UserID, ClientID, ToolID, Tier, AccessStatus)
    VALUES
      (@MorganId, 'ACME',   'AC-RISK',  'Elevated', 'Active'),
      (@MorganId, 'ACME',   'AC-AUDIT', 'Standard', 'Active'),
      (@MorganId, 'GLOBEX', 'GX-TRADE', 'Standard', 'Active'),
      (@MorganId, 'GLOBEX', 'GX-PRICE', 'ReadOnly', 'Active'),
      (@MorganId, 'UMBRLA', 'UM-COMPL', 'Elevated', 'Active');

    -- Quinn's tool access.
    INSERT INTO UserToolAccess (UserID, ClientID, ToolID, Tier, AccessStatus)
    VALUES
      (@QuinnId, 'INITEC', 'IN-PRINT',  'Standard', 'Active'),
      (@QuinnId, 'INITEC', 'IN-PAYRL',  'Standard', 'Active'),
      (@QuinnId, 'WAYNE',  'WN-RNDDB',  'ReadOnly', 'Active');

    DECLARE @ActiveCycle INT = (SELECT TOP 1 CycleID FROM Cycles WHERE CycleName = 'Q1 2026 Attestation');

    -- Morgan: mixed attestation state for active cycle so the dashboard shows variety.
    INSERT INTO ToolCycleAttestation (CycleID, UserID, ClientID, ToolID, UsedThisCycle, AttestationStatus, SubmittedAt)
    VALUES
      (@ActiveCycle, @MorganId, 'ACME',   'AC-RISK',  1, 'Submitted',  SYSUTCDATETIME()),
      (@ActiveCycle, @MorganId, 'ACME',   'AC-AUDIT', 0, 'InProgress', NULL),
      (@ActiveCycle, @MorganId, 'GLOBEX', 'GX-TRADE', 1, 'InProgress', NULL);

    -- Quinn: one submitted.
    INSERT INTO ToolCycleAttestation (CycleID, UserID, ClientID, ToolID, UsedThisCycle, AttestationStatus, SubmittedAt)
    VALUES
      (@ActiveCycle, @QuinnId, 'INITEC', 'IN-PRINT', 1, 'Submitted', SYSUTCDATETIME());

    SELECT 'Inserted' AS Result, @MorganId AS MorganId, @QuinnId AS QuinnId;
END
ELSE
BEGIN
    SELECT 'Already exists' AS Result,
           (SELECT UserID FROM Users WHERE UserName = 'Morgan Drake') AS MorganId,
           (SELECT UserID FROM Users WHERE UserName = 'Quinn Adams')  AS QuinnId;
END
