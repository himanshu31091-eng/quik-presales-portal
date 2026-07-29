import { describe, it, expect, vi } from "vitest";
import { seedDefaultDisabledModuleFlags } from "@/lib/seedDefaultModuleFlags";

function fakeClient() {
  const createMany = vi.fn().mockResolvedValue({ count: 0 });
  return { client: { appModuleFlag: { createMany } }, createMany };
}

describe("seedDefaultDisabledModuleFlags", () => {
  it("writes an enabled:false row per default-off module for QuikScale", async () => {
    const { client, createMany } = fakeClient();
    const keys = await seedDefaultDisabledModuleFlags(client, {
      orgId: "o-1",
      appId: "app-qs",
      appSlug: "quikscale",
      actorId: "sa-1",
    });

    expect(keys.sort()).toEqual(["cash", "survey"]);
    expect(createMany).toHaveBeenCalledTimes(1);
    const arg = createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    for (const row of arg.data) {
      expect(row).toMatchObject({ orgId: "o-1", appId: "app-qs", enabled: false, updatedBy: "sa-1" });
    }
  });

  it("is a no-op for an app with no default-off modules", async () => {
    const { client, createMany } = fakeClient();
    const keys = await seedDefaultDisabledModuleFlags(client, {
      orgId: "o-1",
      appId: "app-admin",
      appSlug: "admin",
      actorId: "sa-1",
    });

    expect(keys).toEqual([]);
    expect(createMany).not.toHaveBeenCalled();
  });
});
