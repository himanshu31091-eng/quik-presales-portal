import { describe, it, expect } from "vitest";
import {
  computeLineAmount,
  formatPaise,
  paiseToMajorNumber,
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

  it("converts paise to major units for spreadsheet cells", () => {
    expect(paiseToMajorNumber(123_456n)).toBe(1234.56);
  });

  it("formats paise with grouping and two decimals", () => {
    expect(formatPaise(123_456_789n)).toBe("1,234,567.89");
    expect(formatPaise(5n)).toBe("0.05");
    expect(formatPaise(0n)).toBe("0.00");
  });
});
