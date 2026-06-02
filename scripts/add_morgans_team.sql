-- Idempotent: adds 5 more direct reports under Morgan Drake.
SET NOCOUNT ON;

DECLARE @MorganId INT = (SELECT UserID FROM Users WHERE UserName = 'Morgan Drake');
IF @MorganId IS NULL
BEGIN
    RAISERROR('Morgan Drake not found. Run add_hybrid_user.sql first.', 16, 1);
    RETURN;
END

DECLARE @ActiveCycle INT = (SELECT TOP 1 CycleID FROM Cycles WHERE CycleName = 'Q1 2026 Attestation');

DECLARE @newUsers TABLE (UserName NVARCHAR(200), WindowsID NVARCHAR(200));
INSERT INTO @newUsers VALUES
    ('Raj Mehta',      'DOMAIN\rmehta'),
    ('Sophie Laurent', 'DOMAIN\slaurent'),
    ('Tariq Aziz',     'DOMAIN\taziz'),
    ('Uma Singh',      'DOMAIN\usingh'),
    ('Victor Lange',   'DOMAIN\vlange');

DECLARE @inserted TABLE (UserID INT, UserName NVARCHAR(200));

INSERT INTO Users (UserName, ManagerID, WindowsID)
OUTPUT inserted.UserID, inserted.UserName INTO @inserted
SELECT n.UserName, @MorganId, n.WindowsID
FROM @newUsers n
WHERE NOT EXISTS (SELECT 1 FROM Users WHERE UserName = n.UserName);

-- Tool access (deterministic per user so the demo is stable across re-seeds).
INSERT INTO UserToolAccess (UserID, ClientID, ToolID, Tier, AccessStatus)
SELECT i.UserID, v.ClientID, v.ToolID, v.Tier, 'Active'
FROM @inserted i
CROSS APPLY (VALUES
    ('Raj Mehta',      'ACME',   'AC-LEDGR', 'Standard'),
    ('Raj Mehta',      'ACME',   'AC-REPRT', 'Standard'),
    ('Raj Mehta',      'GLOBEX', 'GX-RECON', 'Elevated'),
    ('Raj Mehta',      'GLOBEX', 'GX-PRICE', 'ReadOnly'),

    ('Sophie Laurent', 'INITEC', 'IN-PAYRL', 'Elevated'),
    ('Sophie Laurent', 'INITEC', 'IN-PRINT', 'Standard'),
    ('Sophie Laurent', 'UMBRLA', 'UM-LIMS',  'Standard'),
    ('Sophie Laurent', 'UMBRLA', 'UM-INVEN', 'ReadOnly'),
    ('Sophie Laurent', 'UMBRLA', 'UM-COMPL', 'Standard'),

    ('Tariq Aziz',     'ACME',   'AC-RISK',  'ReadOnly'),
    ('Tariq Aziz',     'ACME',   'AC-AUDIT', 'Elevated'),
    ('Tariq Aziz',     'WAYNE',  'WN-RNDDB', 'Standard'),
    ('Tariq Aziz',     'WAYNE',  'WN-SECCAM','ReadOnly'),

    ('Uma Singh',      'GLOBEX', 'GX-TRADE', 'Elevated'),
    ('Uma Singh',      'GLOBEX', 'GX-RECON', 'Standard'),
    ('Uma Singh',      'INITEC', 'IN-PAYRL', 'ReadOnly'),
    ('Uma Singh',      'INITEC', 'IN-PRINT', 'Standard'),

    ('Victor Lange',   'UMBRLA', 'UM-LIMS',  'Elevated'),
    ('Victor Lange',   'UMBRLA', 'UM-COMPL', 'Standard'),
    ('Victor Lange',   'ACME',   'AC-REPRT', 'ReadOnly'),
    ('Victor Lange',   'ACME',   'AC-LEDGR', 'Standard'),
    ('Victor Lange',   'GLOBEX', 'GX-PRICE', 'Standard')
) AS v(UserName, ClientID, ToolID, Tier)
WHERE v.UserName = i.UserName;

-- Mixed attestation states so the team dashboard shows variety.
INSERT INTO ToolCycleAttestation (CycleID, UserID, ClientID, ToolID, UsedThisCycle, AttestationStatus, SubmittedAt)
SELECT @ActiveCycle, uta.UserID, uta.ClientID, uta.ToolID,
       CASE WHEN ABS(CHECKSUM(NEWID())) % 10 < 6 THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END,
       CASE
         WHEN i.UserName = 'Raj Mehta'      THEN 'Submitted'
         WHEN i.UserName = 'Sophie Laurent' THEN 'InProgress'
         WHEN i.UserName = 'Tariq Aziz'     THEN 'InProgress'
         WHEN i.UserName = 'Uma Singh'      THEN 'Submitted'
         ELSE 'InProgress'
       END,
       CASE
         WHEN i.UserName IN ('Raj Mehta', 'Uma Singh') THEN SYSUTCDATETIME()
         ELSE NULL
       END
FROM @inserted i
JOIN UserToolAccess uta ON uta.UserID = i.UserID
WHERE NOT (i.UserName = 'Victor Lange');  -- Victor: NotStarted (no attestation rows)

SELECT i.UserID, i.UserName FROM @inserted i ORDER BY i.UserID;
