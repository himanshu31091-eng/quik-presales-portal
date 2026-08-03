import { describe, it, expect } from "vitest";
import {
  computeLineAmount,
  formatMinor,
  minorToMajorNumber,
  parsePaise,
  sumAmounts,
} from "@/lib/estimates/money";

describe("estimate money maths", () => {
  it("multiplies a whole-number quantity exactly", () => {
    // ₹1,000.00 × 3
    expect(computeLineAmount(100_000n, 3)).toBe(300_000n);
  });

  it("handles fractional quantities without float drift", () => {
    // ₹1,234.56 × 1.5 = ₹1,851.84
    expect(computeLineAmount(123_456n, 1.5)).toBe(185_184n);
  });

  it("rounds half up on the final division", () => {
    // ₹0.01 × 0.5 = ₹0.005 → rounds to 1 paisa
    expect(computeLineAmount(1n, 0.5)).toBe(1n);
  });

  it("treats zero and negative quantities as zero", () => {
    expect(computeLineAmount(100_000n, 0)).toBe(0n);
    expect(computeLineAmount(100_000n, -5)).toBe(0n);
  });

  it("survives quantities that would lose precision as plain floats", () => {
    // 0.1 + 0.2 style inputs: 3 × 0.1 days at ₹10,000/day
    const perTenth = computeLineAmount(1_000_000n, 0.1);
    expect(sumAmounts([perTenth, perTenth, perTenth])).toBe(300_000n);
  });

  it("sums line amounts", () => {
    expect(sumAmounts([100n, 250n, 3n])).toBe(353n);
    expect(sumAmounts([])).toBe(0n);
  });

  it("rejects non-integral paise strings", () => {
    expect(parsePaise("1234")).toBe(1234n);
    expect(parsePaise("12.34")).toBeNull();
    expect(parsePaise("-5")).toBeNull();
    expect(parsePaise("abc")).toBeNull();
    expect(parsePaise("")).toBeNull();
  });

  it("converts minor to major units for spreadsheet cells", () => {
    expect(minorToMajorNumber(123_456n, "INR")).toBe(1234.56);
    expect(minorToMajorNumber(123_456n)).toBe(1234.56);
  });

  it("uses the currency's exponent, not a hardcoded 100", () => {
    // The bug: exporting a ¥1,000,000 estimate as ¥10,000, and a KWD one 10x out.
    expect(minorToMajorNumber(1_000_000n, "JPY")).toBe(1_000_000);
    expect(minorToMajorNumber(1_234n, "KWD")).toBe(1.234);
  });

  it("formats with grouping and the currency's decimals", () => {
    expect(formatMinor(123_456_789n, "INR")).toBe("1,234,567.89");
    expect(formatMinor(5n, "INR")).toBe("0.05");
    expect(formatMinor(0n, "INR")).toBe("0.00");
  });

  it("omits the decimal point for a currency with no minor unit", () => {
    expect(formatMinor(1_000_000n, "JPY")).toBe("1,000,000");
    expect(formatMinor(0n, "JPY")).toBe("0");
  });

  it("keeps three decimals for the Gulf dinars", () => {
    expect(formatMinor(1_234n, "KWD")).toBe("1.234");
    expect(formatMinor(7n, "KWD")).toBe("0.007");
  });

  it("formats negatives with the sign outside the grouping", () => {
    expect(formatMinor(-123_456n, "INR")).toBe("-1,234.56");
    expect(formatMinor(-1_000n, "JPY")).toBe("-1,000");
  });

  it("stays exact for amounts beyond Number.MAX_SAFE_INTEGER", () => {
    // formatMinor is BigInt-only precisely so a very large estimate cannot drift.
    expect(formatMinor(9_007_199_254_740_993_00n, "INR")).toBe("9,007,199,254,740,993.00");
  });
});
