-- Re-seed the default Plan rows (startup/growth/enterprise). The original
-- 20260417185415_seed_default_plans migration targeted the unqualified "Plan"
-- table before the multi-schema move; the rows are absent from the current
-- public."Plan" table. This schema-qualified, idempotent insert restores them.
-- ON CONFLICT DO NOTHING: never overwrites edits made via the super-admin UI.

INSERT INTO "public"."Plan" (
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
