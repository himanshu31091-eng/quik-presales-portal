import { describe, it, expect } from "vitest";
import {
  INTERNAL_SERVICE_ALLOWLIST,
  isAllowedInternalService,
} from "../lib/internal-services";

describe("INTERNAL_SERVICE_ALLOWLIST", () => {
  it("contains the four phase-1 services", () => {
    expect(INTERNAL_SERVICE_ALLOWLIST.has("ai-runtime")).toBe(true);
    expect(INTERNAL_SERVICE_ALLOWLIST.has("search")).toBe(true);
    expect(INTERNAL_SERVICE_ALLOWLIST.has("comms")).toBe(true);
    expect(INTERNAL_SERVICE_ALLOWLIST.has("launcher")).toBe(true);
  });

  it("rejects unknown services", () => {
    expect(isAllowedInternalService("attacker")).toBe(false);
    expect(isAllowedInternalService("")).toBe(false);
    expect(isAllowedInternalService("AI-RUNTIME")).toBe(false); // case sensitive
    expect(isAllowedInternalService("ai_runtime")).toBe(false); // underscore vs hyphen
  });

  it("allows every member of the allowlist round-trip", () => {
    for (const service of INTERNAL_SERVICE_ALLOWLIST) {
      expect(isAllowedInternalService(service)).toBe(true);
    }
  });
});
