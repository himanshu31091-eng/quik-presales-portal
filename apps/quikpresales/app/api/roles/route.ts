import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission, getQuikPreSalesAppId, seedAllDefaultRoles } from "@/lib/api/rbac";
import { okSerialized, createdSerialized, fail, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import { isValidPair } from "@/lib/api/permissionsRegistry";

const withSettingsAuth = withOrgAuthForModule("settings");

const createSchema = z.object({
  name: z
    .string()
    .min(2, "Role name must be at least 2 characters")
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits and underscores only"),
  description: z.string().max(500).optional(),
  grants: z
    .array(z.object({ resource: z.string(), action: z.string() }))
    .max(200)
    .default([]),
});

/** GET /api/roles — roles with grants and member counts. */
export const GET = withSettingsAuth(async ({ orgId, userId }) => {
  const denied = await requirePermission(userId, orgId, "settings", "manage");
  if (denied) return denied;

  await seedAllDefaultRoles(orgId);

  const appId = await getQuikPreSalesAppId();
  if (!appId) {
    return fail(503, "QuikPreSales is not registered in the App registry yet");
  }

  const roles = await db.psAppRole.findMany({
    where: { orgId, appId },
    select: {
      id: true,
      name: true,
      description: true,
      isSystem: true,
      isDefault: true,
      createdAt: true,
      permissions: { select: { resource: true, action: true } },
      _count: { select: { members: true } },
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return okSerialized(
    roles.map((r) => ({
      ...r,
      permissions: r.permissions.map((p) => `${p.resource}:${p.action}`),
      memberCount: r._count.members,
    })),
  );
});

/** POST /api/roles — create a custom role. */
export const POST = withSettingsAuth(async ({ orgId, userId }, req) => {
  const denied = await requirePermission(userId, orgId, "settings", "manage");
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const appId = await getQuikPreSalesAppId();
  if (!appId) return fail(503, "QuikPreSales is not registered in the App registry yet");

  // Reject unknown (resource, action) pairs outright rather than silently
  // dropping them — a role that quietly has fewer grants than the admin
  // selected is a security surprise.
  const invalid = parsed.data.grants.filter((g) => !isValidPair(g.resource, g.action));
  if (invalid.length > 0) {
    return fail(
      400,
      `Unknown permissions: ${invalid.map((g) => `${g.resource}:${g.action}`).join(", ")}`,
    );
  }

  const clash = await db.psAppRole.findFirst({
    where: { orgId, appId, name: parsed.data.name },
    select: { id: true },
  });
  if (clash) return fail(409, `A role named "${parsed.data.name}" already exists`);

  const role = await db.$transaction(async (tx) => {
    const row = await tx.psAppRole.create({
      data: {
        orgId,
        appId,
        name: parsed.data.name,
        description: parsed.data.description,
        isSystem: false,
        isDefault: false,
        createdBy: userId,
      },
      select: { id: true, name: true, description: true, isSystem: true, isDefault: true },
    });

    if (parsed.data.grants.length > 0) {
      await tx.psRolePermission.createMany({
        data: parsed.data.grants.map((g) => ({
          orgId,
          roleId: row.id,
          resource: g.resource,
          action: g.action,
        })),
        skipDuplicates: true,
      });
    }

    await writeAudit(tx, {
      orgId,
      userId,
      action: "role.create",
      resource: row.id,
      metadata: { name: row.name, grantCount: parsed.data.grants.length },
    });

    return row;
  });

  return createdSerialized(role);
});
