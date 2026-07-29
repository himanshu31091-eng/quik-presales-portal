import { globallyDisabledModules } from "@quikit/shared/moduleRegistry";

/**
 * Minimal structural shape so this helper works with both the base Prisma
 * client (`db`) and a `$transaction` client (`tx`).
 */
interface ModuleFlagSeedClient {
  appModuleFlag: {
    createMany: (args: {
      data: {
        orgId: string;
        appId: string;
        moduleKey: string;
        enabled: boolean;
        updatedBy: string;
      }[];
      skipDuplicates?: boolean;
    }) => Promise<{ count: number }>;
  };
}

/**
 * Persist the "off by default" state for an app's `defaultDisabled` modules
 * (e.g. QuikScale's Survey + Cash) as explicit per-org `AppModuleFlag` rows
 * with `enabled: false`.
 *
 * Called when an app is assigned to an org (org creation or a later grant) so
 * the disabled state is stored organization-wise from initial setup — visible
 * in the DB and the App Feature Flags UI — rather than living only as a
 * registry default. A super admin can later flip a module on, which the toggle
 * route stores as an `enabled: true` override (see `computeDisabledModules`).
 *
 * `skipDuplicates` makes this idempotent and non-destructive: re-assigning an
 * app never clobbers a super admin's earlier per-module choice.
 *
 * Returns the moduleKeys it seeded (empty when the app has none). Safe to call
 * for any app — apps with no `defaultDisabled` modules are a no-op.
 */
export async function seedDefaultDisabledModuleFlags(
  client: ModuleFlagSeedClient,
  params: { orgId: string; appId: string; appSlug: string; actorId: string },
): Promise<string[]> {
  const keys = Array.from(globallyDisabledModules(params.appSlug));
  if (keys.length === 0) return [];
  await client.appModuleFlag.createMany({
    data: keys.map((moduleKey) => ({
      orgId: params.orgId,
      appId: params.appId,
      moduleKey,
      enabled: false,
      updatedBy: params.actorId,
    })),
    skipDuplicates: true,
  });
  return keys;
}
