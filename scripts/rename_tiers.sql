-- Reframe Tier as the user's role for that client (Primary or Secondary),
-- consistent across every tool the user has at the same client.
SET NOCOUNT ON;

WITH per_uc AS (
    SELECT DISTINCT UserID, ClientID,
        CASE WHEN ABS(CHECKSUM(CAST(UserID AS NVARCHAR(10)) + ClientID)) % 2 = 0
             THEN 'Primary' ELSE 'Secondary' END AS NewTier
    FROM UserToolAccess
)
UPDATE u SET Tier = per_uc.NewTier
FROM UserToolAccess u
JOIN per_uc ON u.UserID = per_uc.UserID AND u.ClientID = per_uc.ClientID;

SELECT Tier, COUNT(*) AS Grants FROM UserToolAccess GROUP BY Tier;
