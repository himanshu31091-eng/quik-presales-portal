import { describe, it, expect } from "vitest";
import { generateTempPassword } from "../lib/temp-password";

const CONFUSABLES = ["0", "O", "o", "I", "l", "1", "|"];
const BAD_SPECIALS = ["\\", "'", '"', "`", ";", "<", ">", "&"];

describe("generateTempPassword", () => {
  it("generates a 12-char string by default", () => {
    const pw = generateTempPassword();
    expect(pw).toHaveLength(12);
  });

  it("respects the length parameter", () => {
    expect(generateTempPassword(16)).toHaveLength(16);
    expect(generateTempPassword(20)).toHaveLength(20);
  });

  it("throws when length < 4", () => {
    expect(() => generateTempPassword(3)).toThrow();
  });

  it("contains ≥1 of each character class", () => {
    for (let i = 0; i < 100; i++) {
      const pw = generateTempPassword();
      expect(/[A-Z]/.test(pw)).toBe(true);
      expect(/[a-z]/.test(pw)).toBe(true);
      expect(/[0-9]/.test(pw)).toBe(true);
      expect(/[^A-Za-z0-9]/.test(pw)).toBe(true);
    }
  });

  it("never includes confusable characters (1000 runs)", () => {
    for (let i = 0; i < 1000; i++) {
      const pw = generateTempPassword();
      for (const c of CONFUSABLES) {
        expect(pw).not.toContain(c);
      }
      for (const c of BAD_SPECIALS) {
        expect(pw).not.toContain(c);
      }
    }
  });

  it("produces (effectively) unique values across runs", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(generateTempPassword());
    // Allow a single collision (astronomically unlikely but math is math).
    expect(set.size).toBeGreaterThanOrEqual(99);
  });
});
