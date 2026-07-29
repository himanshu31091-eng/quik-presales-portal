import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { requirePermission, getQuikPreSalesAppId } from "@/lib/api/rbac";
import { okSerialized, notFound, fail, validationError } from "@/lib/api/responses";
import { writeAudit } from "@/lib/api/audit";
import { db } from "@/lib/db";
import {
  APP_ADMIN_ROLE_NAME,
  SEEDED_ROLE_NAMES,
  isValidPair,
} from "@/lib/api/permissionsRegistry";

const withSettingsAuth = withOrgAuthForModule("settings");

const updateSchema = z
  .object({
    name: z
      .string()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits and underscores only")
      .optional(),
    description: z.string().max(500).nullable().optional(),
    isDefault: z.boolean().optional(),
    /** Full replacement of the role's grants. */
    grants: z.array(z.object({ resource: z.string(), action: z.string() })).max(200).optional(),
  })
  .strict("Unknown field");

/**
 * PATCH /api/roles/[id]
 *
 * Grants stay editable on every role — an org may legitimately want its
 * `sales_exec` to also create demos. Names are what's frozen, and only for
 * seeded roles: `admin` is matched by name in the admin-bypass check, and
 * `packages/auth/assign-app-roles.ts` resolves roles by name when the Admin
 * Portal assigns one, so a rename would silently break both.
 */
export const PATCH = withSettingsAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const denied = await requirePermission(userId, orgId, "settings", "manage");
    if (denied) return denied;

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error);
    if (Object.keys(parsed.data).length === 0) return fail(400, "No fields to update");

    const appId = await getQuikPreSalesAppId();
    if (!appId) return fail(503, "QuikPreSales is not registered in the App registry yet");

    const role = await db.psAppRole.findFirst({
      where: { id: params.id, orgId, appId },
      select: { id: true, name: true, isSystem: true },
    });
    if (!role) return notFound("Role");

    if (parsed.data.name && parsed.data.name !== role.name) {
      if (role.isSystem || SEEDED_ROLE_NAMES.includes(role.name)) {
        return fail(
          409,
          `"${role.name}" is a seeded role and cannot be renamed. Create a new role instead.`,
        );
      }
      const clash = await db.psAppRole.findFirst({
        where: { orgId, appId, name: parsed.data.name, NOT: { id: role.id } },
        select: { id: true },
      });
      if (clash) return fail(409, `A role named "${parsed.data.name}" already exists`);
    }

    if (parsed.data.grants) {
      // Stripping the admin role's grants would lock every non-org-admin out
      // of app administration with no in-app way back.
      if (role.name === APP_ADMIN_ROLE_NAME && parsed.data.grants.length === 0) {
        return fail(409, "Cannot remove all permissions from the admin role");
      }
      const invalid = parsed.data.grants.filter((g) => !isValidPair(g.resource, g.action));
      if (invalid.length > 0) {
        return fail(
          400,
          `Unknown permissions: ${invalid.map((g) => `${g.resource}:${g.action}`).join(", ")}`,
        );
      }
    }

    const { grants, ...fields } = parsed.data;

    const updated = await db.$transaction(async (tx) => {
      // Only one role can be the default new-user role.
      if (fields.isDefault === true) {
        await tx.psAppRole.updateMany({
          where: { orgId, appId, isDefault: true, NOT: { id: role.id } },
          data: { isDefault: false },
        });
      }

      const row = await tx.psAppRole.update({
        where: { id: role.id },
        data: fields,
        select: { id: true, name: true, description: true, isSystem: true, isDefault: true },
      });

      if (grants) {
        await tx.psRolePermission.deleteMany({ where: { roleId: role.id } });
        if (grants.length > 0) {
          await tx.psRolePermission.createMany({
            data: grants.map((g) => ({
              orgId,
              roleId: role.id,
              resource: g.resource,
              action: g.action,
            })),
            skipDuplicates: true,
          });
        }
      }

      await writeAudit(tx, {
        orgId,
        userId,
        action: "role.update",
        resource: role.id,
        metadata: { fields: Object.keys(parsed.data), grantCount: grants?.length },
      });

      return row;
    });

    return okSerialized(updated);
  },
);

/** DELETE /api/roles/[id] — custom roles only. */
export const DELETE = withSettingsAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const denied = await requirePermission(userId, orgId, "settings", "manage");
    if (denied) return denied;

    const appId = await getQuikPreSalesAppId();
    if (!appId) return fail(503, "QuikPreSales is not registered in the App registry yet");

    const role = await db.psAppRole.findFirst({
      where: { id: params.id, orgId, appId },
      select: { id: true, name: true, isSystem: true, _count: { select: { members: true } } },
    });
    if (!role) return notFound("Role");

    if (role.isSystem) {
      return fail(409, `"${role.name}" is a system role and cannot be deleted`);
    }
    // Seeded custom roles would simply be recreated on the next boot, so
    // deleting one is a no-op that looks like it worked.
    if (SEEDED_ROLE_NAMES.includes(role.name)) {
      return fail(
        409,
        `"${role.name}" is a seeded role and would be recreated automatically. Remove its permissions instead.`,
      );
    }
    if (role._count.members > 0) {
      return fail(
        409,
        `${role._count.members} user(s) still hold this role. Reassign them before deleting it.`,
      );
    }

    await db.$transaction(async (tx) => {
      await tx.psAppRole.delete({ where: { id: role.id } });
      await writeAudit(tx, {
        orgId,
        userId,
        action: "role.delete",
        resource: role.id,
        metadata: { name: role.name },
      });
    });

    return okSerialized({ id: role.id, deleted: true });
  },
);
