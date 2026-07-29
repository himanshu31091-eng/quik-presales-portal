import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

/**
 * Sample unit test. Pattern:
 *   describe(unit-under-test) → it(observable behavior) → arrange/act/assert.
 *
 * No DB, no React, no async — pure functions only. See /docs/07-testing.md for
 * permission tests, API route tests, and DOM tests.
 */
describe("cn()", () => {
  it("merges static classes", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("dedupes conflicting tailwind classes (later wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("filters falsy values", () => {
    expect(cn("a", false && "b", null, undefined, "c")).toBe("a c");
  });
});
