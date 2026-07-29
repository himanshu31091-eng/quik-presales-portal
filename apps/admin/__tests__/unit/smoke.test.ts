import { describe, it, expect } from "vitest";
import { slugify, getInitials, formatRelativeDate } from "@/lib/utils";

describe("utils", () => {
  it("slugify converts to lowercase-hyphenated", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("  My Team  ")).toBe("my-team");
  });

  it("getInitials returns up to 2 chars", () => {
    expect(getInitials("John Doe")).toBe("JD");
    expect(getInitials("Alice")).toBe("A");
  });

  it("formatRelativeDate returns 'Never' for null", () => {
    expect(formatRelativeDate(null)).toBe("Never");
  });
});
