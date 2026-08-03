import { describe, it, expect } from "vitest";
import {
  exponentOf,
  toMinorUnits,
  fromMinorUnits,
  formatMinorUnits,
  convert,
  sumInCurrency,
  isKnownCurrency,
  DEFAULT_CURRENCY,
} from "@/lib/currency/currencies";

/** Rates quoted against USD, as the feed supplies them. */
const RATES = { USD: 1, INR: 95.48, EUR: 0.8667, GBP: 0.7417, JPY: 158.02 };

describe("minor-unit exponents", () => {
  it("uses 2 decimals for the common currencies", () => {
    expect(exponentOf("INR")).toBe(2);
    expect(exponentOf("USD")).toBe(2);
    expect(exponentOf("EUR")).toBe(2);
  });

  it("uses 0 for currencies with no minor unit", () => {
    // The bug this guards: dividing by 100 unconditionally reported ¥1000 as ¥10.
    expect(exponentOf("JPY")).toBe(0);
    expect(exponentOf("KRW")).toBe(0);
  });

  it("uses 3 for the Gulf dinars", () => {
    expect(exponentOf("KWD")).toBe(3);
    expect(exponentOf("BHD")).toBe(3);
  });

  it("falls back to 2 for an unknown code and for null", () => {
    expect(exponentOf("ZZZ")).toBe(2);
    expect(exponentOf(null)).toBe(exponentOf(DEFAULT_CURRENCY));
  });
});

describe("round trip through minor units", () => {
  it("stores rupees as paise", () => {
    expect(toMinorUnits(4500, "INR")).toBe(4500_00n);
    expect(fromMinorUnits("450000", "INR")).toBe(4500);
  });

  it("stores yen as yen, not as hundredths", () => {
    expect(toMinorUnits(1000, "JPY")).toBe(1000n);
    expect(fromMinorUnits("1000", "JPY")).toBe(1000);
  });

  it("keeps three decimals for KWD", () => {
    expect(toMinorUnits(1.234, "KWD")).toBe(1234n);
    expect(fromMinorUnits("1234", "KWD")).toBe(1.234);
  });

  it("rounds rather than truncating fractional minor units", () => {
    // 10.005 -> 1001 paise, not 1000.
    expect(toMinorUnits(10.005, "INR")).toBe(1001n);
  });

  it("treats missing and unparseable amounts as zero, never NaN", () => {
    // A NaN here would poison a whole pipeline total.
    expect(fromMinorUnits(null, "INR")).toBe(0);
    expect(fromMinorUnits(undefined, "INR")).toBe(0);
    expect(fromMinorUnits("", "INR")).toBe(0);
    expect(fromMinorUnits("not-a-number", "INR")).toBe(0);
  });
});

describe("formatMinorUnits", () => {
  it("renders a dash for a missing amount", () => {
    expect(formatMinorUnits(null, "INR")).toBe("—");
  });

  it("includes the right currency symbol and divides by the exponent", () => {
    // 450000 paise is ₹4,500 — not ₹4,50,000.
    expect(formatMinorUnits("450000", "INR")).toContain("4,500");
    expect(formatMinorUnits("450000", "INR")).toContain("₹");
    expect(formatMinorUnits("100000", "USD")).toContain("1,000");
  });

  it("groups Indian amounts in the lakh/crore convention", () => {
    // 45,000,000 paise = ₹4,50,000 — the en-IN grouping, not ₹450,000.
    expect(formatMinorUnits("45000000", "INR")).toContain("4,50,000");
  });

  it("does not divide zero-decimal currencies by 100", () => {
    expect(formatMinorUnits("1000", "JPY")).toContain("1,000");
  });

  it("falls back to a plain number for a code Intl rejects", () => {
    const out = formatMinorUnits("10000", "ZZZ");
    expect(out).toContain("ZZZ");
    expect(out).toContain("100");
  });
});

describe("convert", () => {
  it("returns the amount unchanged for the same currency", () => {
    expect(convert(100, "INR", "INR", RATES)).toBe(100);
  });

  it("crosses through the base correctly", () => {
    // 9548 INR / 95.48 = 100 USD
    expect(convert(9548, "INR", "USD", RATES)).toBeCloseTo(100, 6);
    expect(convert(100, "USD", "INR", RATES)).toBeCloseTo(9548, 6);
  });

  it("crosses two non-base currencies", () => {
    const viaUsd = (100 / RATES.EUR) * RATES.GBP;
    expect(convert(100, "EUR", "GBP", RATES)).toBeCloseTo(viaUsd, 6);
  });

  it("is case-insensitive about codes", () => {
    expect(convert(100, "usd", "inr", RATES)).toBeCloseTo(9548, 6);
  });

  it("returns null when a rate is missing rather than guessing", () => {
    // Silently returning the unconverted number would misreport the figure.
    expect(convert(100, "XYZ", "USD", RATES)).toBeNull();
    expect(convert(100, "USD", "XYZ", RATES)).toBeNull();
  });
});

describe("sumInCurrency", () => {
  it("totals a single-currency pipeline", () => {
    const { totalMajor, unconverted } = sumInCurrency(
      [{ currency: "INR", minorUnits: "450000" }],
      "INR",
      RATES,
    );
    expect(totalMajor).toBe(4500);
    expect(unconverted).toEqual([]);
  });

  it("converts before adding, instead of summing raw minor units", () => {
    // The bug this exists to prevent: the dashboard used to sum the estRevenue
    // column across currencies, adding paise to cents.
    const { totalMajor } = sumInCurrency(
      [
        { currency: "INR", minorUnits: "954800" }, // 9548 INR = 100 USD
        { currency: "USD", minorUnits: "10000" }, //   100 USD
      ],
      "USD",
      RATES,
    );
    expect(totalMajor).toBeCloseTo(200, 4);
  });

  it("handles a zero-decimal currency in the mix", () => {
    // 15802 JPY = 100 USD at 158.02
    const { totalMajor } = sumInCurrency([{ currency: "JPY", minorUnits: "15802" }], "USD", RATES);
    expect(totalMajor).toBeCloseTo(100, 4);
  });

  it("treats a null currency as the default rather than dropping the money", () => {
    const { totalMajor } = sumInCurrency([{ currency: null, minorUnits: "450000" }], "INR", RATES);
    expect(totalMajor).toBe(4500);
  });

  it("reports currencies it could not convert instead of under-reporting", () => {
    const { totalMajor, unconverted } = sumInCurrency(
      [
        { currency: "USD", minorUnits: "10000" },
        { currency: "XYZ", minorUnits: "500000" },
      ],
      "USD",
      RATES,
    );
    expect(totalMajor).toBeCloseTo(100, 4);
    expect(unconverted).toEqual(["XYZ"]);
  });

  it("returns zero for an empty pipeline", () => {
    expect(sumInCurrency([], "INR", RATES).totalMajor).toBe(0);
  });

  it("skips zero and null amounts without marking them unconverted", () => {
    const { totalMajor, unconverted } = sumInCurrency(
      [
        { currency: "XYZ", minorUnits: "0" },
        { currency: "XYZ", minorUnits: null },
      ],
      "USD",
      RATES,
    );
    expect(totalMajor).toBe(0);
    expect(unconverted).toEqual([]);
  });
});

describe("isKnownCurrency", () => {
  it("recognises offered codes case-insensitively", () => {
    expect(isKnownCurrency("inr")).toBe(true);
    expect(isKnownCurrency("JPY")).toBe(true);
    expect(isKnownCurrency("ZZZ")).toBe(false);
  });
});
