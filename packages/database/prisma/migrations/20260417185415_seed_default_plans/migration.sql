-- SA-B seed: default Plan rows matching the three slugs hardcoded across the
-- codebase (startup, growth, enterprise). Idempotent — uses ON CONFLICT DO
-- NOTHING so re-running the migration never errors and never overwrites
-- edits made via the super admin UI.
--
-- Values chosen as reasonable placeholders that map to existing tenants.
-- Edit through /pricing after deploy to adjust.

INSERT INTO "Plan" (
  "id", "slug", "name", "description",
  "priceMonthly", "priceYearly", "currency",
  "features", "limits",
  "isActive", "sortOrder",
  "createdAt", "updatedAt"
)
VALUES
  (
    'plan_seed_startup',
    'startup',
    'Startup',
    'Small teams getting started',
    0, 0, 'USD',
    ARRAY['basic_kpis', 'email_support']::text[],
    '{"maxUsers": 5, "maxKPIs": 20, "maxApps": 1}'::jsonb,
    true, 0,
    NOW(), NOW()
  ),
  (
    'plan_seed_growth',
    'growth',
    'Growth',
    'Scaling organizations with multi-app access',
    9900, 99000, 'USD',
    ARRAY['unlimited_kpis', 'priority_support', 'analytics']::text[],
    '{"maxUsers": 50, "maxKPIs": 500, "maxApps": 3}'::jsonb,
    true, 10,
    NOW(), NOW()
  ),
  (
    'plan_seed_enterprise',
    'enterprise',
    'Enterprise',
    'Large organizations with compliance requirements',
    49900, 499000, 'USD',
    ARRAY['unlimited_kpis', 'priority_support', 'analytics', 'sso', 'audit_export']::text[],
    '{"maxUsers": -1, "maxKPIs": -1, "maxApps": -1}'::jsonb,
    true, 20,
    NOW(), NOW()
  )
ON CONFLICT ("slug") DO NOTHING;
