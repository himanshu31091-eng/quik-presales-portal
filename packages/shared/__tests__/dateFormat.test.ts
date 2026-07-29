/**
 * Tests for the shared formatDate helper.
 *
 * These are locale-insensitive where possible — we assert parts of the
 * output (e.g. the year) rather than exact strings for styles that depend
 * on `toLocaleDateString`, which in theory could shift between Node
 * versions. For the ISO style we pin exact output.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatDate } from "../lib/dateFormat";

describe("formatDate", () => {
  it("returns empty string for nullish / invalid inputs", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
    expect(formatDate("not a date")).toBe("");
  });

  it("default 'short' style renders month, day, year", () => {
    const out = formatDate(new Date(2026, 2, 14)); // Mar 14 2026
    expect(out).toContain("2026");
    expect(out).toMatch(/Mar/i);
    expect(out).toContain("14");
  });

  it("'long' style renders full month name", () => {
    const out = formatDate(new Date(2026, 2, 14), "long");
    expect(out).toContain("March");
    expect(out).toContain("2026");
  });

  it("'datetime' style includes time component", () => {
    const d = new Date(2026, 2, 14, 15, 45);
    const out = formatDate(d, "datetime");
    expect(out).toContain("2026");
    expect(out).toMatch(/3:45|15:45/); // 12h or 24h locale
  });

  it("'iso' style is stable and YYYY-MM-DD", () => {
    const d = new Date(2026, 2, 14);
    expect(formatDate(d, "iso")).toBe("2026-03-14");
  });

  it("'iso' pads single-digit month and day", () => {
    const d = new Date(2026, 0, 5); // Jan 5
    expect(formatDate(d, "iso")).toBe("2026-01-05");
  });

  it("accepts ISO strings as input", () => {
    expect(formatDate("2026-03-14T12:00:00Z", "iso")).toMatch(/2026-03-1[34]/);
  });

  it("accepts numeric timestamps as input", () => {
    const d = new Date(2026, 2, 14);
    expect(formatDate(d.getTime(), "iso")).toBe("2026-03-14");
  });
});

describe("formatDate — relative style", () => {
  const fixedNow = new Date(2026, 2, 14, 12, 0, 0); // Mar 14 2026 12:00:00

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' within 45s window", () => {
    const d = new Date(fixedNow.getTime() - 10 * 1000);
    expect(formatDate(d, "relative")).toBe("just now");
  });

  it("returns 'a minute ago' at 60s", () => {
    const d = new Date(fixedNow.getTime() - 60 * 1000);
    expect(formatDate(d, "relative")).toBe("a minute ago");
  });

  it("returns 'Xm ago' for minutes < 60", () => {
    const d = new Date(fixedNow.getTime() - 5 * 60 * 1000);
    expect(formatDate(d, "relative")).toBe("5m ago");
  });

  it("returns 'Xh ago' for hours < 24", () => {
    const d = new Date(fixedNow.getTime() - 3 * 60 * 60 * 1000);
    expect(formatDate(d, "relative")).toBe("3h ago");
  });

  it("returns 'Xd ago' for days < 7", () => {
    const d = new Date(fixedNow.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(formatDate(d, "relative")).toBe("3d ago");
  });

  it("falls back to absolute date past 7d", () => {
    const d = new Date(fixedNow.getTime() - 10 * 24 * 60 * 60 * 1000);
    const out = formatDate(d, "relative");
    expect(out).toContain("2026");
  });

  it("handles future dates with 'in X' prefix", () => {
    const d = new Date(fixedNow.getTime() + 5 * 60 * 1000);
    expect(formatDate(d, "relative")).toBe("in 5m");
  });

  it("returns 'in a few seconds' for near-future", () => {
    const d = new Date(fixedNow.getTime() + 10 * 1000);
    expect(formatDate(d, "relative")).toBe("in a few seconds");
  });
});
