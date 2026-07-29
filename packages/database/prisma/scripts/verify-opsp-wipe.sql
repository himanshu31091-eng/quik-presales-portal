SELECT 'OPSPData' AS table_name, COUNT(*) AS row_count FROM "app_quikscale"."OPSPData"
UNION ALL
SELECT 'OPSPReviewEntry', COUNT(*) FROM "app_quikscale"."OPSPReviewEntry";
