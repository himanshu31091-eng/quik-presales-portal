import { describe, it, expect } from "vitest";
import {
  APP_ADMIN_ROLE_NAME,
  DEFAULT_ROLES,
  DEFAULT_ROLE_NAME,
  NAV_KEYS,
  NAV_TO_ENTITY,
  SEEDED_ROLE_NAMES,
  allPermissionPairs,
  isNavKey,
  isValidPair,
} from "@/lib/api/permissionsRegistry";

/**
 * These lock the platform RBAC contract that this app got wrong once already:
 * every QuikIT app seeds exactly ONE system role literally named `admin`, and
 * every domain role is custom. The Admin Portal's Roles screen splits purely
 * on `isSystem`, so drifting here silently empties its "Custom Roles" section.
 */
describe("platform role contract", () => {
  it("names the system role exactly `admin`", () => {
    // isPreSalesAppAdmin matches on this string, and so does every sibling app.
    expect(APP_ADMIN_ROLE_NAME).toBe("admin");
  });

  it("declares no domain role as the admin role", () => {
    expect(DEFAULT_ROLES.some((r) => r.name === APP_ADMIN_ROLE_NAME)).toBe(false);
  });

  it("has exactly one default role", () => {
    const defaults = DEFAULT_ROLES.filter((r) => r.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe(DEFAULT_ROLE_NAME);
  });

  it("lists every seeded role, admin included", () => {
    expect(SEEDED_ROLE_NAMES).toContain(APP_ADMIN_ROLE_NAME);
    for (const r of DEFAULT_ROLES) expect(SEEDED_ROLE_NAMES).toContain(r.name);
    expect(SEEDED_ROLE_NAMES).toHaveLength(DEFAULT_ROLES.length + 1);
  });

  it("gives every role a nav list", () => {
    for (const r of DEFAULT_ROLES) expect(r.nav.length).toBeGreaterThan(0);
  });

  it("only grants nav keys that exist", () => {
    for (const r of DEFAULT_ROLES) {
      for (const k of r.nav) expect(isNavKey(k)).toBe(true);
    }
  });

  it("only grants permission pairs that exist in the tree", () => {
    for (const r of DEFAULT_ROLES) {
      if (r.grants === null) continue; // expanded from allPermissionPairs()
      for (const [resource, actions] of Object.entries(r.grants)) {
        for (const a of actions ?? []) {
          expect(isValidPair(resource, a)).toBe(true);
        }
      }
    }
  });
});

describe("navigation resolution", () => {
  it("keeps NAV_KEYS and NAV_TO_ENTITY disjoint", () => {
    // A key in both would be ambiguous: resource-backed keys are satisfied by a
    // view grant, pure-nav keys need a RoleNavigation row. It can't be both.
    for (const k of NAV_KEYS) {
      expect(NAV_TO_ENTITY[k]).toBeUndefined();
    }
  });

  it("maps every resource-backed nav key to a real resource", () => {
    const resources = new Set(allPermissionPairs().map((p) => p.resource));
    for (const target of Object.values(NAV_TO_ENTITY)) {
      expect(resources.has(target)).toBe(true);
    }
  });
});

describe("permission tree", () => {
  it("expands to the full pair set for the admin role", () => {
    const pairs = allPermissionPairs();
    // 9 CRUD-ish resources + proposals' extra `approve` + dashboard view-only
    // + settings view/manage. Pinned so adding a resource is a deliberate act.
    expect(pairs).toHaveLength(36);
    expect(new Set(pairs.map((p) => `${p.resource}:${p.action}`)).size).toBe(36);
  });

  it("rejects unknown resources and actions", () => {
    expect(isValidPair("engagements", "view")).toBe(true);
    expect(isValidPair("engagements", "approve")).toBe(false); // only proposals
    expect(isValidPair("nonsense", "view")).toBe(false);
    expect(isValidPair("dashboard", "delete")).toBe(false); // view-only
  });
});
